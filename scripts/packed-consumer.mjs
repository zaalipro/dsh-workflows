#!/usr/bin/env node
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))

let workspace
let keep = false
let stage = 'arguments'
try {
  const options = parseArgs(process.argv.slice(2))
  keep = options.keep
  await requireFile(options.tarball, '--tarball')
  await requireFile(join(options.official, 'package.json'), '--official')
  workspace = await mkdtemp(join(tmpdir(), 'dsh-workflows-consumer-'))
  const home = join(workspace, 'home')
  const cache = join(workspace, 'cache')
  const store = join(workspace, 'store')
  await mkdir(home, { recursive: true })
  await mkdir(cache, { recursive: true })
  await mkdir(store, { recursive: true })
  const env = { ...process.env, HOME: home, DSH_HOME: home, npm_config_cache: cache, PNPM_HOME: join(workspace, 'pnpm-home'), PNPM_STORE_DIR: store, COREPACK_HOME: join(workspace, 'corepack') }
  await writeFile(join(workspace, 'package.json'), JSON.stringify({ name: 'dsh-workflows-packed-consumer', private: true, type: 'module' }, null, 2) + '\n')
  report('workspace', { path: keep ? workspace : '<temporary>' })

  stage = 'install'
  await command('pnpm', ['add', '--ignore-scripts', '--config.auto-install-peers=true', options.tarball], { cwd: workspace, env })
  report(stage)

  stage = 'plain-node-imports'
  const codeExports = ['.', './registry', './supervisor', './run-recorder', './user-questions', './commands', './tool', './types', './invariant', './typert', './remote']
  for (const subpath of codeExports) {
    const specifier = subpath === '.' ? '@zaalipro/dsh-workflows' : `@zaalipro/dsh-workflows${subpath.slice(1)}`
    await command(process.execPath, ['--input-type=module', '--eval', `await import(${JSON.stringify(specifier)})`], { cwd: workspace, env })
  }
  report(stage, { exports: codeExports.length })

  stage = 'strict-nodenext-types'
  const imports = codeExports.filter(item => item !== './client').map((item, index) => {
    const specifier = item === '.' ? '@zaalipro/dsh-workflows' : `@zaalipro/dsh-workflows${item.slice(1)}`
    return `import type * as T${index} from ${JSON.stringify(specifier)}; type V${index} = keyof typeof T${index};`
  }).join('\n')
  await writeFile(join(workspace, 'consumer.ts'), `${imports}\nexport {};\n`)
  await writeFile(join(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2024', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, skipLibCheck: false }, files: ['consumer.ts'] }, null, 2) + '\n')
  const tsc = resolve(HERE, '../node_modules/typescript/bin/tsc')
  await command(process.execPath, [tsc, '-p', 'tsconfig.json', '--pretty', 'false'], { cwd: workspace, env })
  report(stage)

  stage = 'client-artifact'
  const manifestPath = join(workspace, 'node_modules/@zaalipro/dsh-workflows/package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const clientTarget = typeof manifest.exports?.['./client'] === 'string' ? manifest.exports['./client'] : manifest.exports?.['./client']?.default
  if (typeof clientTarget !== 'string') throw new Error('installed package has no client runtime export')
  const clientFile = resolve(dirname(manifestPath), clientTarget)
  const client = await readFile(clientFile, 'utf8')
  const registrations = []
  vm.runInNewContext(client, { window: { __ModuleLoader__: { load(value) { registrations.push(value) } } } }, { filename: clientFile })
  if (registrations.length !== 1 || registrations[0]?.id !== '@zaalipro/dsh-workflows' || typeof registrations[0]?.factory !== 'function') throw new Error('client artifact did not register one lazy module')
  const map = JSON.parse(await readFile(`${clientFile}.map`, 'utf8'))
  if (map.version !== 3) throw new Error('client source map is invalid')
  report(stage)

  stage = 'package-policy'
  const verifier = resolve(HERE, 'verify-package.mjs')
  await command(process.execPath, [verifier, '--tarball', options.tarball], { cwd: workspace, env })
  report(stage)

  // Release H profile boot is intentionally attempted only once the official
  // checkout advertises its completed prerequisite marker.  Development
  // checkouts containing only U1-U6 are not silently treated as compatible.
  stage = 'official-h-probe'
  const officialManifest = JSON.parse(await readFile(join(options.official, 'package.json'), 'utf8'))
  report(stage, { version: officialManifest.version, activation: officialManifest.dsh?.workflowPrerequisites?.release === 'H' ? 'available' : 'not-advertised' })
  console.log('packed consumer passed')
} catch (error) {
  console.error(JSON.stringify({ kind: 'packed-consumer-error', stage, error: error instanceof Error ? error.message : String(error) }))
  process.exitCode = stage === 'arguments' ? 2 : 1
} finally {
  if (workspace && !keep) await rm(workspace, { recursive: true, force: true }).catch(() => {})
  else if (workspace && keep) console.error(`packed consumer workspace kept at ${workspace}`)
}

function parseArgs(args) {
  let tarball; let official; let foundKeep = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--keep') { if (foundKeep) usage(); foundKeep = true; continue }
    if (arg !== '--tarball' && arg !== '--official') usage()
    const value = args[++index]
    if (!value || !isAbsolute(value)) usage()
    if (arg === '--tarball') { if (tarball) usage(); tarball = value }
    else { if (official) usage(); official = value }
  }
  if (!tarball || !official) usage()
  return { tarball: resolve(tarball), official: resolve(official), keep: foundKeep }
}
function usage() { throw new Error('usage: packed-consumer.mjs --tarball <absolute-file> --official <absolute-checkout> [--keep]') }
async function requireFile(path, flag) { try { await access(path, constants.R_OK) } catch { throw new Error(`${flag} is not readable: ${path}`) } }
function report(name, detail = {}) { console.log(JSON.stringify({ kind: 'stage', stage: name, ...detail })) }
function command(file, args, options) {
  return new Promise((accept, reject) => {
    const child = spawn(file, args, { ...options, shell: process.platform === 'win32' && file === 'pnpm', stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? accept({ stdout, stderr }) : reject(new Error(`${file} exited ${code}: ${(stderr || stdout).trim().slice(-2000)}`)))
  })
}
