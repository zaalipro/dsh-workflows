#!/usr/bin/env node

/**
 * Validate the source manifest or the exact npm tarball for
 * @zaalipro/dsh-workflows.  The tar reader intentionally uses only Node
 * primitives: every member is validated before anything is written, and the
 * fresh extraction directory never accepts links or special files.
 */

import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, posix, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { gunzipSync } from 'node:zlib'

const PACKAGE_NAME = '@zaalipro/dsh-workflows'
const PACKAGE_VERSION = '0.1.0-rc.1'
const PACKAGE_LICENSE = 'MIT'
const NODE_RANGE = '^22.19.0 || >=24.0.0'
const PACKAGE_MANAGER = 'pnpm@11.7.0'
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
const MAX_ARCHIVE_MEMBERS = 100_000

const PUBLIC_EXPORTS = Object.freeze([
  '.',
  './registry',
  './supervisor',
  './run-recorder',
  './user-questions',
  './commands',
  './tool',
  './client',
  './types',
  './invariant',
  './typert',
  './remote',
  './cordis.patch.yml',
  './skills/create-workflow/SKILL.md',
  './package.json',
])

const CODE_EXPORTS = PUBLIC_EXPORTS.slice(0, 12)
const REQUIRED_PEERS = Object.freeze([
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-workflow',
  '@deepseek-ai/dsh-workflow-worker-thread',
  'react',
])
const REQUIRED_RUNTIME_DEPENDENCIES = Object.freeze([
  'chokidar',
  'clsx',
  'fs-native-extensions',
])
const REQUIRED_GENERATED_ASSETS = Object.freeze([
  'lib/typert.host.js',
  'lib/typert.host.d.ts',
  'lib/typert.remote-client.js',
  'lib/typert.remote-client.d.ts',
])
const TYPERT_REMOTE_METHODS = Object.freeze([
  'workflowDefinitions_list',
  'workflowRuns_list',
  'workflowRuns_detail',
  'workflowRuns_members',
  'workflowRuns_memberDetail',
  'workflowRuns_logs',
  'workflowRuns_result',
  'workflowRuns_artifacts',
  'workflowRuns_artifact',
  'workflowRuns_control',
])
const EXPECTED_CODE_EXPORTS = Object.freeze({
  '.': ['./lib/types/index.d.ts', './lib/types/index.js'],
  './registry': ['./lib/types/registry/index.d.ts', './lib/types/registry/index.js'],
  './supervisor': ['./lib/types/supervisor/index.d.ts', './lib/types/supervisor/index.js'],
  './run-recorder': ['./lib/types/run-recorder.d.ts', './lib/types/run-recorder.js'],
  './user-questions': ['./lib/types/user-questions.d.ts', './lib/types/user-questions.js'],
  './commands': ['./lib/types/commands/index.d.ts', './lib/types/commands/index.js'],
  './tool': ['./lib/types/tool/index.d.ts', './lib/types/tool/index.js'],
  './client': ['./lib/client-types/index.d.ts', './lib/client.js'],
  './types': ['./lib/types/types.d.ts', './lib/types/types.js'],
  './invariant': ['./lib/types/invariant.d.ts', './lib/types/invariant.js'],
  './typert': ['./lib/typert.host.d.ts', './lib/typert.host.js'],
  './remote': ['./lib/typert.remote-client.d.ts', './lib/typert.remote-client.js'],
})
const DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
])
const decoder = new TextDecoder('utf-8', { fatal: true })

let extractionDirectory
try {
  const mode = parseCommandLine(process.argv.slice(2))
  if (mode.kind === 'source') {
    verifySource(resolve(mode.path))
  } else {
    extractionDirectory = mkdtempSync(resolve(tmpdir(), 'dsh-workflows-package-'))
    verifyTarball(resolve(mode.path), extractionDirectory)
  }
  console.log('package verification passed')
} catch (error) {
  const reason = oneLine(error instanceof Error ? error.message : String(error))
  console.error(`package verification failed: ${reason}`)
  process.exitCode = 1
} finally {
  if (extractionDirectory !== undefined) {
    try {
      rmSync(extractionDirectory, { recursive: true, force: true })
    } catch (error) {
      if (process.exitCode !== 1) {
        const reason = oneLine(error instanceof Error ? error.message : String(error))
        console.error(`package verification failed: could not remove temporary extraction directory: ${reason}`)
        process.exitCode = 1
      }
    }
  }
}

function parseCommandLine(args) {
  if (args.length !== 2 || (args[0] !== '--source' && args[0] !== '--tarball')) {
    throw new Error('expected exactly one of --source <directory> or --tarball <file>')
  }
  if (args[1].length === 0 || args[1] === '--source' || args[1] === '--tarball') {
    throw new Error(`${args[0]} requires a path`)
  }
  return { kind: args[0] === '--source' ? 'source' : 'tarball', path: args[1] }
}

function verifySource(root) {
  assertPathType(root, 'directory', 'source directory')
  const manifest = readJsonFile(resolve(root, 'package.json'), 'package.json')
  const policy = verifyManifest(manifest)
  verifySourcePublicationList(manifest.files, policy.exportTargets)
  for (const target of policy.exportTargets) {
    assertPathType(resolve(root, target), 'file', `export target ${JSON.stringify(target)}`)
  }
  verifyLegalFiles(root)
  verifyGeneratedProduct(root)
  assertPathType(resolve(root, 'cordis.patch.yml'), 'file', 'bundle patch')
  assertPathType(
    resolve(root, 'skills/create-workflow/SKILL.md'),
    'file',
    'packaged create-workflow skill',
  )
  scanSourceText(root, policy.exportTargets)
}

function verifyTarball(tarballPath, extractionRoot) {
  assertPathType(tarballPath, 'file', 'tarball')
  const archive = readFileSync(tarballPath)
  let tarBytes
  try {
    tarBytes = archive[0] === 0x1f && archive[1] === 0x8b
      ? gunzipSync(archive, { maxOutputLength: MAX_ARCHIVE_BYTES })
      : archive
  } catch (error) {
    throw new Error(`could not decompress tarball: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (tarBytes.length > MAX_ARCHIVE_BYTES) throw new Error('tarball expands beyond 512 MiB')

  const entries = readTarEntries(tarBytes)
  validateArchiveEntries(entries)
  extractArchiveEntries(entries, extractionRoot)

  const packageRoot = resolve(extractionRoot, 'package')
  const manifest = readJsonFile(resolve(packageRoot, 'package.json'), 'package/package.json')
  const policy = verifyManifest(manifest)
  const files = new Map(
    entries
      .filter(entry => entry.kind === 'file')
      .map(entry => [stripPackagePrefix(entry.path), entry]),
  )

  verifyPackedFiles(files, policy.exportTargets)
  verifyLegalFiles(packageRoot)
  scanPackedText(files)
  verifyGeneratedProduct(packageRoot)
}

function verifyManifest(manifest) {
  if (!isRecord(manifest)) throw new Error('package.json must contain a JSON object')
  expectEqual(manifest.name, PACKAGE_NAME, 'package name')
  expectEqual(manifest.version, PACKAGE_VERSION, 'package version')
  expectEqual(manifest.license, PACKAGE_LICENSE, 'package license')
  expectEqual(manifest.type, 'module', 'package type')
  if ('private' in manifest) throw new Error('package.json must not declare private')
  expectEqual(manifest.engines?.node, NODE_RANGE, 'engines.node')
  expectEqual(manifest.packageManager, PACKAGE_MANAGER, 'packageManager')
  expectEqual(manifest.publishConfig?.access, 'public', 'publishConfig.access')
  expectEqual(manifest.main, './lib/types/index.js', 'main')
  expectEqual(manifest.types, './lib/types/index.d.ts', 'types')

  if (!isRecord(manifest.dsh)) throw new Error('package.json must declare dsh metadata')
  const dshKeys = Object.keys(manifest.dsh)
  for (const key of ['bundle', 'client']) {
    if (!dshKeys.includes(key)) throw new Error(`dsh metadata must declare ${key}`)
  }
  if (!isRecord(manifest.dsh.bundle)) throw new Error('dsh.bundle must be an object')
  expectStringArrayEqual(Object.keys(manifest.dsh.bundle), ['patch'], 'dsh.bundle keys')
  expectEqual(manifest.dsh.bundle.patch, './cordis.patch.yml', 'dsh.bundle.patch')
  verifyClientDeclaration(manifest.dsh.client)

  const exportTargets = verifyExports(manifest.exports)
  verifyDependencies(manifest, manifest.dsh.client)
  verifyInstallLifecycle(manifest.scripts)

  return { exportTargets }
}

function verifyClientDeclaration(client) {
  if (!isRecord(client)) throw new Error('dsh.client must be an object')
  const allowed = new Set(['inject', 'platform', 'immediately', 'external'])
  for (const key of Object.keys(client)) {
    if (!allowed.has(key)) throw new Error(`dsh.client contains unsupported field ${JSON.stringify(key)}`)
  }
  expectEqual(client.platform, 'web', 'dsh.client.platform')
  const inject = requireUniqueStringArray(client.inject, 'dsh.client.inject')
  if (inject.length === 0) throw new Error('dsh.client.inject must not be empty')
  if (client.immediately !== undefined && typeof client.immediately !== 'boolean') {
    throw new Error('dsh.client.immediately must be a boolean when present')
  }
  if (client.external !== undefined) {
    const external = requireUniqueStringArray(client.external, 'dsh.client.external')
    if (external.includes(PACKAGE_NAME)) {
      throw new Error('dsh.client.external must not contain the package itself')
    }
  }
}

function verifyExports(exportsField) {
  if (!isRecord(exportsField)) throw new Error('package exports must be an object')
  expectStringArrayEqual(Object.keys(exportsField), PUBLIC_EXPORTS, 'public export set')
  const targets = new Set()

  for (const key of PUBLIC_EXPORTS) {
    const value = exportsField[key]
    const leaves = collectExportTargets(value, `exports[${JSON.stringify(key)}]`)
    if (leaves.length === 0) throw new Error(`export ${JSON.stringify(key)} has no target`)
    for (const target of leaves) {
      validatePackageRelativeTarget(target, `export ${JSON.stringify(key)}`)
      targets.add(target.slice(2))
    }
  }

  for (const key of CODE_EXPORTS) {
    const value = exportsField[key]
    if (!isRecord(value)) throw new Error(`code export ${JSON.stringify(key)} must be conditional`)
    if (typeof value.types !== 'string' || !value.types.endsWith('.d.ts')) {
      throw new Error(`code export ${JSON.stringify(key)} must declare a .d.ts types target`)
    }
    const runtimeTarget = typeof value.default === 'string' ? value.default : value.import
    if (typeof runtimeTarget !== 'string' || !runtimeTarget.endsWith('.js')) {
      throw new Error(`code export ${JSON.stringify(key)} must declare a .js runtime target`)
    }
    const [expectedTypes, expectedRuntime] = EXPECTED_CODE_EXPORTS[key]
    expectEqual(value.types, expectedTypes, `exports[${JSON.stringify(key)}].types`)
    expectEqual(runtimeTarget, expectedRuntime, `exports[${JSON.stringify(key)}] runtime`)
  }

  expectEqual(exportsField['./cordis.patch.yml'], './cordis.patch.yml', 'patch export target')
  expectEqual(
    exportsField['./skills/create-workflow/SKILL.md'],
    './skills/create-workflow/SKILL.md',
    'skill export target',
  )
  expectEqual(exportsField['./package.json'], './package.json', 'package.json export target')
  return targets
}

function collectExportTargets(value, where, seen = new Set()) {
  if (typeof value === 'string') return [value]
  if (!isRecord(value) || seen.has(value)) throw new Error(`${where} must contain string targets`)
  seen.add(value)
  const targets = []
  for (const [condition, nested] of Object.entries(value)) {
    if (condition.startsWith('.')) throw new Error(`${where} contains a nested subpath export`)
    targets.push(...collectExportTargets(nested, `${where}.${condition}`, seen))
  }
  seen.delete(value)
  return targets
}

function validatePackageRelativeTarget(target, where) {
  if (!target.startsWith('./')) throw new Error(`${where} target must start with ./`)
  const relative = target.slice(2).replaceAll('\\', '/')
  if (relative.length === 0 || relative.includes('*')) throw new Error(`${where} target is not a concrete file`)
  if (relative.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`${where} target points outside its packed files`)
  }
  if (isAbsoluteLike(relative)) throw new Error(`${where} target is absolute`)
}

function verifyDependencies(manifest, clientDeclaration) {
  const sections = Object.create(null)
  for (const field of DEPENDENCY_FIELDS) {
    const value = manifest[field] ?? {}
    if (!isRecord(value)) throw new Error(`${field} must be an object when present`)
    sections[field] = value
    for (const [name, range] of Object.entries(value)) {
      if (typeof range !== 'string' || range.length === 0) {
        throw new Error(`${field}.${name} must be a non-empty version string`)
      }
      verifyDependencyName(name, field)
      if (/^(?:workspace|link|file):/iu.test(range)) {
        throw new Error(`${field}.${name} uses forbidden local dependency range ${JSON.stringify(range)}`)
      }
      if (isLocalDependencyRange(range)) {
        throw new Error(`${field}.${name} uses a local file checkout`)
      }
    }
  }

  if ('proper-lockfile' in sections.dependencies
    || 'proper-lockfile' in sections.optionalDependencies
    || 'proper-lockfile' in sections.peerDependencies
    || 'proper-lockfile' in sections.devDependencies) {
    throw new Error('proper-lockfile is forbidden; fs-native-extensions owns the lifetime lease')
  }

  expectEqual(
    sections.dependencies['fs-native-extensions'],
    '1.5.0',
    'dependencies.fs-native-extensions',
  )
  if ('fs-native-extensions' in sections.optionalDependencies
    || 'fs-native-extensions' in sections.peerDependencies) {
    throw new Error('fs-native-extensions must be an ordinary dependency only')
  }

  for (const name of REQUIRED_RUNTIME_DEPENDENCIES) {
    if (!(name in sections.dependencies)) throw new Error(`${name} must be an ordinary dependency`)
    if (name in sections.peerDependencies || name in sections.optionalDependencies) {
      throw new Error(`${name} must not be a peer or optional dependency`)
    }
  }

  const peersToCheck = new Set(REQUIRED_PEERS)
  for (const name of Object.keys(sections.peerDependencies)) peersToCheck.add(name)
  for (const name of clientDeclaration.inject) peersToCheck.add(name)
  for (const name of Object.keys(sections.dependencies)) {
    if (isIdentityDependency(name)) {
      throw new Error(`${name} is identity-bearing and must be a peer dependency`)
    }
  }
  for (const name of Object.keys(sections.optionalDependencies)) {
    if (isIdentityDependency(name)) {
      throw new Error(`${name} is identity-bearing and must be a peer dependency`)
    }
  }
  for (const name of peersToCheck) {
    if (!(name in sections.peerDependencies)) throw new Error(`${name} must be a peer dependency`)
    if (!(name in sections.devDependencies)) throw new Error(`${name} peer must also be a development dependency`)
  }

  if (manifest.peerDependenciesMeta !== undefined) {
    if (!isRecord(manifest.peerDependenciesMeta)) throw new Error('peerDependenciesMeta must be an object')
    for (const [name, meta] of Object.entries(manifest.peerDependenciesMeta)) {
      if (!(name in sections.peerDependencies)) throw new Error(`peerDependenciesMeta names undeclared peer ${name}`)
      if (!isRecord(meta) || Object.keys(meta).some(key => key !== 'optional')
        || (meta.optional !== undefined && typeof meta.optional !== 'boolean')) {
        throw new Error(`peerDependenciesMeta.${name} is invalid`)
      }
    }
  }
  if (Array.isArray(manifest.bundleDependencies) && manifest.bundleDependencies.length > 0) {
    throw new Error('bundleDependencies must be empty')
  }
  if (Array.isArray(manifest.bundledDependencies) && manifest.bundledDependencies.length > 0) {
    throw new Error('bundledDependencies must be empty')
  }
}

function verifyDependencyName(name, field) {
  const lower = name.toLowerCase()
  if (lower.includes('grok')) throw new Error(`${field} contains a Grok dependency: ${name}`)
  if (lower.includes('rhai')) throw new Error(`${field} contains a Rhai dependency: ${name}`)
  if (lower === 'proper-lockfile') throw new Error(`${field} contains forbidden dependency proper-lockfile`)
}

function isIdentityDependency(name) {
  if (name === 'react' || name === 'react-dom') return true
  if (name === '@deepseek-ai/cordis' || name.startsWith('@deepseek-ai/cordis-')) return true
  // dsh-typert-protocol is a pure wire library in the official manifests.
  if (name === '@deepseek-ai/dsh-typert-protocol') return false
  return name.startsWith('@deepseek-ai/dsh-')
}

function verifyInstallLifecycle(scripts) {
  if (scripts === undefined) return
  if (!isRecord(scripts)) throw new Error('scripts must be an object')
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack']) {
    if (hook in scripts) throw new Error(`${hook} is forbidden; dsh plugin add must not build at install time`)
  }
}

function verifySourcePublicationList(filesField, exportTargets) {
  const files = requireUniqueStringArray(filesField, 'files')
  if (files.length === 0) throw new Error('files must not be empty')
  for (const pattern of files) {
    const normalized = pattern.replaceAll('\\', '/').replace(/^\.\//u, '')
    if (isForbiddenPackedPath(normalized)) throw new Error(`files publishes forbidden path ${JSON.stringify(pattern)}`)
    if (isAbsoluteLike(normalized) || normalized.split('/').includes('..')) {
      throw new Error(`files contains unsafe pattern ${JSON.stringify(pattern)}`)
    }
  }
  const required = new Set([
    ...[...exportTargets].filter(path => path !== 'package.json'),
    ...REQUIRED_GENERATED_ASSETS,
    'lib/client.js.map',
    'cordis.patch.yml',
    'skills/create-workflow/SKILL.md',
    'NOTICE.md',
    'README.md',
    'docs/user-guide.md',
    'docs/architecture.md',
    'docs/testing.md',
  ])
  for (const path of required) {
    if (!files.some(pattern => npmFilesPatternCovers(pattern, path))) {
      throw new Error(`files does not publish required asset ${JSON.stringify(path)}`)
    }
  }
  for (const generated of REQUIRED_GENERATED_ASSETS) {
    if (!files.includes(generated)) {
      throw new Error(`files must explicitly list generated Typert asset ${JSON.stringify(generated)}`)
    }
  }
}

function verifyPackedFiles(files, exportTargets) {
  for (const path of files.keys()) {
    if (isForbiddenPackedPath(path)) throw new Error(`tarball contains forbidden asset ${JSON.stringify(path)}`)
    if (isCredentialFile(path)) throw new Error(`tarball contains credential-bearing file ${JSON.stringify(path)}`)
  }

  const required = new Set([
    ...exportTargets,
    ...REQUIRED_GENERATED_ASSETS,
    'lib/client.js',
    'lib/client.js.map',
    'LICENSE',
    'NOTICE.md',
    'package.json',
    'cordis.patch.yml',
    'skills/create-workflow/SKILL.md',
    'README.md',
    'docs/user-guide.md',
    'docs/architecture.md',
    'docs/testing.md',
  ])
  for (const path of required) {
    if (!files.has(path)) throw new Error(`tarball is missing required asset ${JSON.stringify(path)}`)
  }

  for (const path of exportTargets) {
    const entry = files.get(path)
    if (entry === undefined || entry.kind !== 'file') {
      throw new Error(`export target ${JSON.stringify(path)} is not a packed regular file`)
    }
  }
  for (const [path, entry] of files) {
    if (!path.endsWith('.js')) continue
    const text = decodeTarText(entry.data, path)
    const match = text.match(/(?:^|\n)\s*\/\/[#@]\s*sourceMappingURL=([^\s]+)\s*$/mu)
    if (match === null) continue
    const mapPath = posix.normalize(posix.join(posix.dirname(path), match[1]))
    if (mapPath === '..' || mapPath.startsWith('../') || isAbsoluteLike(match[1])) {
      throw new Error(`${path} has an unsafe sourceMappingURL`)
    }
    if (!files.has(mapPath)) throw new Error(`${path} references missing source map ${JSON.stringify(mapPath)}`)
  }
}

function verifyLegalFiles(root) {
  const license = readUtf8File(resolve(root, 'LICENSE'), 'LICENSE')
  if (!license.startsWith('MIT License\n')) throw new Error('LICENSE is not the canonical MIT license text')
  if (!license.includes('Copyright (c) 2026 Zaali')) throw new Error('LICENSE has the wrong package copyright')
  requireSingleFinalLf(license, 'LICENSE')

  const notice = readUtf8File(resolve(root, 'NOTICE.md'), 'NOTICE.md')
  for (const text of [
    '@zaalipro/dsh-workflows',
    'fs-native-extensions',
    '1.5.0',
    'https://github.com/holepunchto/fs-native-extensions',
    'Apache License 2.0',
    'Kasper Isager Dalsgarð',
  ]) {
    if (!notice.includes(text)) throw new Error(`NOTICE.md is missing ${JSON.stringify(text)}`)
  }
  if (/proper-lockfile/iu.test(notice)) throw new Error('NOTICE.md must not attribute proper-lockfile')
  requireSingleFinalLf(notice, 'NOTICE.md')
}

function scanPackedText(files) {
  for (const [path, entry] of files) {
    if (!isTextAsset(path, entry.data)) continue
    let text
    try {
      text = decoder.decode(entry.data)
    } catch {
      throw new Error(`text asset ${JSON.stringify(path)} is not valid UTF-8`)
    }
    scanText(path, text)
    if (path.endsWith('.map')) verifySourceMap(path, text)
  }
}

function scanSourceText(root, exportTargets) {
  const paths = new Set(exportTargets)
  for (const target of REQUIRED_GENERATED_ASSETS) paths.add(target)
  paths.add('lib/client.js')
  for (const path of paths) {
    const absolute = resolve(root, path)
    if (!lstatSync(absolute).isFile()) continue
    const data = readFileSync(absolute)
    if (!isTextAsset(path, data)) continue
    scanText(path, decoder.decode(data))
    if (path.endsWith('.map')) verifySourceMap(path, decoder.decode(data))
  }
}

function verifyGeneratedProduct(root) {
  const client = decoder.decode(readFileSync(resolve(root, 'lib/client.js')))
  if (client.includes('?.load')) throw new Error('lib/client.js uses optional-chaining ModuleLoader')
  if (/factory:\s*\(\s*\)\s*=>\s*\(\s*\{\s*\}\s*\)/u.test(client)) {
    throw new Error('lib/client.js is an empty placeholder factory')
  }
  if (!client.includes('window.__ModuleLoader__.load({')
    || !client.includes('"@zaalipro/dsh-workflows"')
    || !/factory:\s*\(\s*require\s*\)/u.test(client)) {
    throw new Error('lib/client.js is not the lazy-CJS require factory')
  }
  const typert = `${decoder.decode(readFileSync(resolve(root, 'lib/typert.host.js')))}\n${decoder.decode(readFileSync(resolve(root, 'lib/typert.remote-client.js')))}`
  if (!typert.includes('workflowDefinitions') || !typert.includes('workflowRuns')) {
    throw new Error('Typert artifacts are missing workflowDefinitions/workflowRuns')
  }
  for (const method of TYPERT_REMOTE_METHODS) {
    if (!typert.includes(method)) throw new Error(`Typert artifacts are missing ${method}`)
  }
}

function scanText(path, text) {
  const checks = [
    [/(?:from\s*|import\s*\(|require\s*\(|spawn\s*\(|execFile\s*\()\s*["'][^"']*grok[^"']*["']/iu,
      'Grok CLI import or call'],
    [/\b(?:GROK_[A-Z0-9_]*|XAI_API_KEY)\b/u, 'Grok environment-variable dependency'],
    [/\b(?:api\.x\.ai|grok-cli)\b/iu, 'Grok wire or executable dependency'],
    [/(?:from\s*|import\s*\(|require\s*\()\s*["'][^"']*rhai[^"']*["']/iu, 'Rhai import'],
    [/\b(?:eval(?:uate)?Rhai|RhaiEngine|rhai_eval)\s*\(/iu, 'Rhai evaluation'],
    [/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u, 'private credential'],
    [/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/u, 'GitHub credential'],
    [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/u, 'provider credential'],
    [/\bAKIA[0-9A-Z]{16}\b/u, 'AWS credential'],
    [/\b(?:npm_[A-Za-z0-9]{30,})\b/u, 'npm credential'],
    [/[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s/]+@/iu, 'URL credential'],
    [/(?:\/Users\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\)/u, 'developer-machine path'],
  ]
  const documentation = /\.(?:md|txt)$/iu.test(path)
  for (const [pattern, label] of checks) {
    if (documentation && /Grok|Rhai/iu.test(label)) continue
    if (pattern.test(text)) throw new Error(`${path} contains ${label}`)
  }
  if (!documentation && !path.endsWith('.map') && /(?:^|["'`])(?:\.\.\/)*src\//mu.test(text)) {
    throw new Error(`${path} contains source-tree runtime reference`)
  }
  if (/\bprocess\.cwd\s*\(\s*\)/u.test(text) && /(?:worker|client|skill|patch|asset)/iu.test(text)) {
    throw new Error(`${path} resolves a packaged asset through process.cwd()`)
  }
}

function verifySourceMap(path, text) {
  let map
  try {
    map = JSON.parse(text)
  } catch {
    throw new Error(`${path} is not valid source-map JSON`)
  }
  if (!isRecord(map) || map.version !== 3 || !Array.isArray(map.sources)) {
    throw new Error(`${path} is not a version-3 source map`)
  }
  if (typeof map.sourceRoot === 'string' && isAbsoluteLike(map.sourceRoot)) {
    throw new Error(`${path} contains an absolute sourceRoot`)
  }
  for (const source of map.sources) {
    if (typeof source !== 'string') throw new Error(`${path} contains a non-string source path`)
    if (isAbsoluteLike(source) || /(?:\/Users\/|[A-Za-z]:\\Users\\)/u.test(source)) {
      throw new Error(`${path} contains an absolute source path`)
    }
  }
}

function readTarEntries(tar) {
  const entries = []
  let offset = 0
  let pendingPax = {}
  let globalPax = {}
  let pendingLongPath
  let pendingLongLink
  let zeroBlocks = 0

  while (offset < tar.length) {
    if (offset + 512 > tar.length) throw new Error('tarball has a truncated header')
    const header = tar.subarray(offset, offset + 512)
    offset += 512
    if (header.every(byte => byte === 0)) {
      zeroBlocks += 1
      if (zeroBlocks >= 2) {
        if (!tar.subarray(offset).every(byte => byte === 0)) {
          throw new Error('tarball contains data after its end marker')
        }
        return entries
      }
      continue
    }
    if (zeroBlocks !== 0) throw new Error('tarball contains an isolated zero header')
    verifyTarChecksum(header)
    const size = parseTarNumber(header.subarray(124, 136), 'member size')
    if (size > MAX_ARCHIVE_BYTES) throw new Error('tarball member is larger than 512 MiB')
    if (offset + size > tar.length) throw new Error('tarball has truncated member data')
    const data = Buffer.from(tar.subarray(offset, offset + size))
    offset += Math.ceil(size / 512) * 512
    if (offset > tar.length) throw new Error('tarball has truncated member padding')

    const type = String.fromCharCode(header[156] || 0)
    const headerName = tarHeaderPath(header)
    const headerLink = readTarString(header.subarray(157, 257), 'link name')
    if (type === 'x' || type === 'g') {
      const pax = parsePax(data)
      if (type === 'g') globalPax = { ...globalPax, ...pax }
      else pendingPax = pax
      continue
    }
    if (type === 'L' || type === 'K') {
      const longValue = decodeTarText(data, `GNU long ${type === 'L' ? 'path' : 'link'}`).replace(/\0.*$/su, '')
      if (type === 'L') pendingLongPath = longValue
      else pendingLongLink = longValue
      continue
    }

    const pax = { ...globalPax, ...pendingPax }
    const rawPath = pax.path ?? pendingLongPath ?? headerName
    const linkPath = pax.linkpath ?? pendingLongLink ?? headerLink
    pendingPax = {}
    pendingLongPath = undefined
    pendingLongLink = undefined
    const path = validateArchiveMemberPath(rawPath)
    const kind = type === '\0' || type === '0' || type === '7'
      ? 'file'
      : type === '5'
        ? 'directory'
        : type === '1'
          ? 'hard-link'
          : type === '2'
            ? 'symbolic-link'
            : 'special'
    entries.push({ path, kind, linkPath, data })
    if (entries.length > MAX_ARCHIVE_MEMBERS) throw new Error('tarball contains more than 100000 members')
  }
  if (entries.length === 0) throw new Error('tarball is empty')
  return entries
}

function validateArchiveEntries(entries) {
  const paths = new Set()
  let packageManifestCount = 0
  for (const entry of entries) {
    if (paths.has(entry.path)) throw new Error(`tarball contains duplicate member ${JSON.stringify(entry.path)}`)
    paths.add(entry.path)
    if (entry.path === 'package/package.json') packageManifestCount += 1
    if (entry.kind === 'symbolic-link' || entry.kind === 'hard-link') {
      throw new Error(`tarball contains forbidden repository link ${JSON.stringify(entry.path)}`)
    }
    if (entry.kind === 'special') throw new Error(`tarball contains special member ${JSON.stringify(entry.path)}`)
  }
  if (packageManifestCount !== 1) throw new Error('tarball must contain exactly one package/package.json')
}

function extractArchiveEntries(entries, extractionRoot) {
  const rootPrefix = `${resolve(extractionRoot)}${sep}`
  for (const entry of entries) {
    const target = resolve(extractionRoot, ...entry.path.split('/'))
    if (!target.startsWith(rootPrefix)) throw new Error(`archive member escapes extraction root: ${entry.path}`)
    if (entry.kind === 'directory') {
      mkdirSync(target, { recursive: true, mode: 0o700 })
      continue
    }
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    writeFileSync(target, entry.data, { flag: 'wx', mode: 0o600 })
  }
}

function validateArchiveMemberPath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) throw new Error('tarball contains an empty member path')
  if (rawPath.includes('\0')) throw new Error('tarball member path contains NUL')
  const slashPath = rawPath.replaceAll('\\', '/').replace(/\/+$/u, '')
  if (isAbsoluteLike(slashPath)) throw new Error(`tarball contains absolute member ${JSON.stringify(rawPath)}`)
  const parts = slashPath.split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`tarball contains parent-traversing member ${JSON.stringify(rawPath)}`)
  }
  const normalized = posix.normalize(slashPath)
  if (normalized !== slashPath || parts[0] !== 'package') {
    throw new Error(`tarball member is outside package/: ${JSON.stringify(rawPath)}`)
  }
  return normalized
}

function tarHeaderPath(header) {
  const name = readTarString(header.subarray(0, 100), 'member name')
  const prefix = readTarString(header.subarray(345, 500), 'member prefix')
  return prefix.length === 0 ? name : `${prefix}/${name}`
}

function verifyTarChecksum(header) {
  const expected = parseTarNumber(header.subarray(148, 156), 'header checksum')
  let actual = 0
  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index]
  }
  if (expected !== actual) throw new Error('tarball member has an invalid header checksum')
}

function parseTarNumber(field, name) {
  if ((field[0] & 0x80) !== 0) {
    const bytes = Buffer.from(field)
    const negative = (bytes[0] & 0x40) !== 0
    if (negative) throw new Error(`tar ${name} must not be negative`)
    bytes[0] &= 0x7f
    let value = 0n
    for (const byte of bytes) value = (value << 8n) | BigInt(byte)
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`tar ${name} is too large`)
    return Number(value)
  }
  const text = Buffer.from(field).toString('ascii').replace(/\0.*$/su, '').trim()
  if (text.length === 0) return 0
  if (!/^[0-7]+$/u.test(text)) throw new Error(`tar ${name} is not octal`)
  const value = Number.parseInt(text, 8)
  if (!Number.isSafeInteger(value)) throw new Error(`tar ${name} is too large`)
  return value
}

function parsePax(data) {
  const result = {}
  let offset = 0
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset)
    if (space === -1) throw new Error('tarball contains malformed PAX data')
    const lengthText = data.subarray(offset, space).toString('ascii')
    if (!/^[1-9][0-9]*$/u.test(lengthText)) throw new Error('tarball contains malformed PAX length')
    const length = Number(lengthText)
    if (!Number.isSafeInteger(length) || length <= space - offset + 1 || offset + length > data.length) {
      throw new Error('tarball contains invalid PAX record length')
    }
    const record = data.subarray(space + 1, offset + length)
    if (record.at(-1) !== 0x0a) throw new Error('tarball PAX record is missing LF')
    const text = decodeTarText(record.subarray(0, -1), 'PAX record')
    const equals = text.indexOf('=')
    if (equals <= 0) throw new Error('tarball contains malformed PAX record')
    const key = text.slice(0, equals)
    const value = text.slice(equals + 1)
    if (key === 'path' || key === 'linkpath') result[key] = value
    offset += length
  }
  return result
}

function readTarString(field, name) {
  const nul = field.indexOf(0)
  return decodeTarText(nul === -1 ? field : field.subarray(0, nul), `tar ${name}`)
}

function decodeTarText(buffer, name) {
  try {
    return decoder.decode(buffer)
  } catch {
    throw new Error(`${name} is not valid UTF-8`)
  }
}

function isForbiddenPackedPath(path) {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//u, '')
  const parts = normalized.toLowerCase().split('/')
  if (parts.some(part => [
    'src', 'test', 'tests', '__tests__', 'fixture', 'fixtures', '__fixtures__',
    '.git', '.github', '.specs', 'node_modules', 'coverage', '.cache', '.turbo',
    '.pnpm', '.yarn', '.idea', '.vscode',
  ].includes(part))) return true
  return parts.some(part => part.endsWith('.tsbuildinfo') || part === '.ds_store')
}

function isCredentialFile(path) {
  const basename = path.replaceAll('\\', '/').split('/').at(-1).toLowerCase()
  return /^\.env(?:\.|$)/u.test(basename)
    || ['.npmrc', '.netrc', 'id_rsa', 'id_dsa', 'credentials'].includes(basename)
    || /\.(?:pem|p12|pfx|key)$/u.test(basename)
}

function isTextAsset(path, data) {
  if (data.includes(0)) return false
  const basename = path.split('/').at(-1)
  if (basename === 'LICENSE' || basename === 'NOTICE') return true
  return /\.(?:[cm]?js|json|map|md|txt|ya?ml|css|html|svg|d\.ts)$/iu.test(path)
}

function stripPackagePrefix(path) {
  return path === 'package' ? '' : path.slice('package/'.length)
}

function npmFilesPatternCovers(pattern, path) {
  const normalized = pattern.replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/$/u, '')
  if (normalized === path) return true
  if (!normalized.includes('*')) return path.startsWith(`${normalized}/`)
  let source = '^'
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]
    if (character === '*' && normalized[index + 1] === '*') {
      index += 1
      if (normalized[index + 1] === '/') {
        index += 1
        source += '(?:.*/)?'
      } else {
        source += '.*'
      }
    } else if (character === '*') {
      source += '[^/]*'
    } else if (character === '?') {
      source += '[^/]'
    } else {
      source += character.replace(/[|\\{}()[\]^$+*.]/gu, '\\$&')
    }
  }
  const regex = new RegExp(`${source}$`, 'u')
  return regex.test(path)
}

function isLocalDependencyRange(range) {
  const value = range.trim()
  return value.startsWith('/')
    || value.startsWith('./')
    || value.startsWith('../')
    || /^[A-Za-z]:[\\/]/u.test(value)
}

function isAbsoluteLike(path) {
  return isAbsolute(path)
    || path.startsWith('/')
    || path.startsWith('\\')
    || /^[A-Za-z]:[\\/]/u.test(path)
    || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(path)
}

function assertPathType(path, expected, label) {
  let stat
  try {
    stat = lstatSync(path)
  } catch (error) {
    throw new Error(`${label} is unavailable at ${JSON.stringify(path)}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`)
  if (expected === 'file' ? !stat.isFile() : !stat.isDirectory()) {
    throw new Error(`${label} must be a ${expected}`)
  }
}

function readJsonFile(path, label) {
  const text = readUtf8File(path, label)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function readUtf8File(path, label) {
  assertPathType(path, 'file', label)
  try {
    return decoder.decode(readFileSync(path))
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function requireSingleFinalLf(text, label) {
  if (!text.endsWith('\n') || text.endsWith('\n\n')) {
    throw new Error(`${label} must end with exactly one LF`)
  }
}

function requireUniqueStringArray(value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`)
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates`)
  return value
}

function expectStringArrayEqual(actual, expected, label) {
  if (!Array.isArray(actual)) throw new Error(`${label} is not an array`)
  const actualSorted = [...actual].sort()
  const expectedSorted = [...expected].sort()
  if (actualSorted.length !== expectedSorted.length
    || actualSorted.some((value, index) => value !== expectedSorted[index])) {
    throw new Error(`${label} must be exactly ${expected.join(', ')}`)
  }
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} must be ${JSON.stringify(expected)}`)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function oneLine(value) {
  return value.replace(/[\r\n\u2028\u2029]+/gu, ' ').replace(/\s+/gu, ' ').trim() || 'unknown error'
}
