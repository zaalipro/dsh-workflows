#!/usr/bin/env node

/**
 * Build the external package in its four contractual phases:
 * Host TSC -> copied-workspace Typert -> Client TSC -> lazy CJS.
 *
 * The Typert phase intentionally has no fallback. If decorated Remote classes
 * are not reachable from the Host package face, generation fails rather than
 * publishing a hand-maintained descriptor.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { transform } from 'lightningcss'
import { build as tsdown } from 'tsdown'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const PACKAGE_NAME = '@zaalipro/dsh-workflows'
const LIB = resolve(ROOT, 'lib')
const TYPESCRIPT = resolve(ROOT, 'node_modules/typescript/bin/tsc')
const CSS_VIRTUAL_PREFIX = '\0dsh-workflows-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'
const TYPES_MARKER = `${sep}lib${sep}client-types${sep}`
const BASELINE_EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
])

const children = new Set()
let interrupted

/** Build every published artifact in dependency order. */
export async function build() {
  installSignalForwarding()
  try {
    await Promise.all([
      rm(LIB, { recursive: true, force: true }),
      rm(resolve(ROOT, 'tsconfig.host.tsbuildinfo'), { force: true }),
      rm(resolve(ROOT, 'tsconfig.client.tsbuildinfo'), { force: true }),
    ])
    await mkdir(LIB, { recursive: true })

    await runTsc('tsconfig.host.json')
    await runTsc('tsconfig.compat-engine.json')
    await buildCompatibilityEngine()

    const staging = await mkdtemp(resolve(ROOT, '.dsh-workflows-build-'))
    try {
      await generateTypert(staging)
    } finally {
      await rm(staging, { recursive: true, force: true })
    }

    await runTsc('tsconfig.client.json')
    await buildClient()
    console.log('build completed')
  } finally {
    removeSignalForwarding()
  }
}

/** Bundle the plugin-owned enhanced workflow engine and its isolated worker. */
async function buildCompatibilityEngine() {
  const outDir = resolve(LIB, 'compat-engine')
  const common = {
    config: false,
    cwd: ROOT,
    outDir,
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
    failOnWarn: true,
  }
  await tsdown({
    ...common,
    entry: { index: resolve(ROOT, 'vendor/workflow-engine/index.ts') },
    format: 'esm',
  })
  await tsdown({
    ...common,
    entry: { worker: resolve(ROOT, 'vendor/workflow-engine/worker.ts') },
    format: 'cjs',
  })
}

/**
 * Analyze a copied package from a staging-root Host aggregate and write only
 * the generator's returned Host and Remote artifacts.
 */
export async function generateTypert(stagingRoot) {
  const packageRoot = resolve(stagingRoot, 'packages/dsh-workflows')
  await mkdir(packageRoot, { recursive: true })
  await cp(resolve(ROOT, 'src'), resolve(packageRoot, 'src'), {
    recursive: true,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: true,
  })
  await prepareTypertSourceOverlay(packageRoot)

  const manifest = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'))
  // Typert discovery can mistake this Markdown data export for a source face.
  delete manifest.exports['./skills/create-workflow/SKILL.md']
  await writeJson(resolve(packageRoot, 'package.json'), manifest)

  const hostConfig = JSON.parse(await readFile(resolve(ROOT, 'tsconfig.host.json'), 'utf8'))
  const compilerOptions = { ...hostConfig.compilerOptions }
  const analysisDependencies = await copyTypertAnalysisDependencies(stagingRoot)
  const analysisPaths = Object.fromEntries(analysisDependencies.map(dependency => [
    dependency.name,
    [`./packages/${dependency.directory}/analysis/index.d.ts`],
  ]))
  await writeJson(resolve(packageRoot, 'tsconfig.json'), {
    compilerOptions: {
      ...compilerOptions,
      baseUrl: '../..',
      paths: { ...(compilerOptions.paths ?? {}), ...analysisPaths },
    },
    include: [...hostConfig.include],
    exclude: [...hostConfig.exclude],
  })
  const aggregateOptions = {
    ...aggregateCompilerOptions(compilerOptions),
    // Typert identifies cancellation against TypeScript's standard global.
    // Host runtime compilation remains ES-only; DOM exists in analysis only.
    lib: [...new Set([...(compilerOptions.lib ?? []), 'DOM'])],
    baseUrl: '.',
    paths: { ...(compilerOptions.paths ?? {}), ...analysisPaths },
  }
  for (const dependency of analysisDependencies) {
    await writeJson(resolve(stagingRoot, `packages/${dependency.directory}/tsconfig.json`), {
      compilerOptions: { ...aggregateOptions, baseUrl: '../..' },
      include: ['analysis/**/*.d.ts'],
    })
  }
  await writeJson(resolve(stagingRoot, 'tsconfig.host.json'), {
    compilerOptions: aggregateOptions,
    files: [],
    references: [
      ...analysisDependencies.map(dependency => ({
        path: `./packages/${dependency.directory}/tsconfig.json`,
      })),
      { path: './packages/dsh-workflows/tsconfig.json' },
    ],
  })

  const artifacts = new WorkspaceTypertGenerator(stagingRoot).generate(
    ['@zaalipro/dsh-workflows'],
    ['host'],
  )
  const artifact = artifacts.find(item => item.package === PACKAGE_NAME && item.face === 'host')
  if (artifact === undefined) {
    throw new Error(
      'Typert did not discover @zaalipro/dsh-workflows on the Host face; '
      + 'the public Host entry must reach WorkflowDefinitionsRemote and WorkflowRunsRemote',
    )
  }
  if (artifacts.length !== 1) {
    throw new Error(`Typert returned ${String(artifacts.length)} artifacts; expected exactly one Host artifact`)
  }
  if (artifact.remote === undefined) {
    throw new Error('Typert Host analysis returned no Remote projection for the ten workflow methods')
  }
  assertTypertRemote(artifact.js, artifact.remote.js)

  await Promise.all([
    writeFile(resolve(LIB, 'typert.host.js'), artifact.js, 'utf8'),
    writeFile(resolve(LIB, 'typert.host.d.ts'), artifact.dts, 'utf8'),
    writeFile(resolve(LIB, 'typert.remote-client.js'), artifact.remote.js, 'utf8'),
    writeFile(resolve(LIB, 'typert.remote-client.d.ts'), artifact.remote.dts, 'utf8'),
    artifact.remote.dtsMap === undefined
      ? rm(resolve(LIB, 'typert.remote-client.d.ts.map'), { force: true })
      : writeFile(resolve(LIB, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap, 'utf8'),
  ])
}

/**
 * Make the copied Host face reach the real decorated classes. The Typert
 * generator also needs a permissive local helper parameter while it analyzes
 * the discriminated public failure union.  That narrow analysis-only edit
 * never reaches the source tree or the packed package.
 */
async function prepareTypertSourceOverlay(packageRoot) {
  void packageRoot
}

/**
 * Register only the type owners Typert needs to recognize decorators and the
 * Agent lookup when analyzing an external package. Their installed declaration
 * trees are copied; no checkout path or runtime implementation is consulted.
 */
async function copyTypertAnalysisDependencies(stagingRoot) {
  const sessionManifest = require.resolve('@deepseek-ai/dsh-session/package.json')
  const dependencies = [
    ['@deepseek-ai/dsh-typert-protocol', 'dsh-typert-protocol', require.resolve('@deepseek-ai/dsh-typert-protocol/package.json')],
    ['@deepseek-ai/dsh-session', 'dsh-session', sessionManifest],
    ['@deepseek-ai/dsh-agent', 'dsh-agent', require.resolve('@deepseek-ai/dsh-agent/package.json')],
    ['@deepseek-ai/dsh-brand', 'dsh-brand', createRequire(sessionManifest).resolve('@deepseek-ai/dsh-brand/package.json')],
  ].map(([name, directory, manifestPath]) => ({ name, directory, manifestPath }))

  for (const dependency of dependencies) {
    const root = dirname(dependency.manifestPath)
    const target = resolve(stagingRoot, `packages/${dependency.directory}`)
    await mkdir(target, { recursive: true })
    await cp(resolve(root, 'lib/types'), resolve(target, 'analysis'), {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    })
    const manifest = JSON.parse(await readFile(dependency.manifestPath, 'utf8'))
    manifest.types = retargetTypeArtifact(manifest.types)
    manifest.exports = retargetTypeArtifact(manifest.exports)
    await writeJson(resolve(target, 'package.json'), manifest)
  }
  return dependencies
}

function retargetTypeArtifact(value) {
  if (typeof value === 'string') return value.replace(/^\.\/lib\/types\//u, './analysis/')
  if (Array.isArray(value)) return value.map(retargetTypeArtifact)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, retargetTypeArtifact(item)]))
}

function replaceExactly(source, search, replacement, file) {
  const first = source.indexOf(search)
  if (first < 0 || source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Typert analysis overlay expected exactly one match in ${relative(ROOT, file)}`)
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`
}

/** Bundle the emitted Client program as one classic Harness loader factory. */
export async function buildClient() {
  const isExternal = specifier => BASELINE_EXTERNALS.has(specifier)
  await tsdown({
    config: false,
    cwd: ROOT,
    name: `${PACKAGE_NAME}/client`,
    entry: { client: resolve(LIB, 'client-types/index.js') },
    outDir: LIB,
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    sourcemap: true,
    clean: false,
    failOnWarn: true,
    deps: {
      neverBundle: isExternal,
      alwaysBundle: specifier => !isExternal(specifier),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [clientPurityPlugin(), cssModulesPlugin()],
    outputOptions: {
      entryFileNames: 'client.js',
      sourcemapPathTransform: portableSourcePath,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  })
  await assertClientBundle(await readFile(resolve(LIB, 'client.js'), 'utf8'))
}

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

function assertTypertRemote(hostJs, remoteJs) {
  const combined = `${hostJs}\n${remoteJs}`
  if (!combined.includes('workflowDefinitions') || !combined.includes('workflowRuns')) {
    throw new Error('Typert Remote projection is missing workflowDefinitions/workflowRuns')
  }
  for (const method of TYPERT_REMOTE_METHODS) {
    if (!combined.includes(method)) {
      throw new Error(`Typert Remote projection is missing ${method}`)
    }
  }
}

function assertClientBundle(text) {
  if (text.includes('?.load')) {
    throw new Error('lib/client.js uses optional-chaining ModuleLoader')
  }
  if (/factory:\s*\(\s*\)\s*=>\s*\(\s*\{\s*\}\s*\)/u.test(text)) {
    throw new Error('lib/client.js is an empty placeholder factory')
  }
  if (!text.includes('window.__ModuleLoader__.load({')
    || !text.includes(JSON.stringify(PACKAGE_NAME))
    || !/factory:\s*\(\s*require\s*\)/u.test(text)) {
    throw new Error('lib/client.js is not the lazy-CJS require factory')
  }
}

function aggregateCompilerOptions(options) {
  const result = { ...options, noEmit: true }
  for (const key of [
    'rootDir', 'outDir', 'declaration', 'declarationMap', 'sourceMap',
    'composite', 'incremental', 'tsBuildInfoFile',
  ]) delete result[key]
  return result
}

function clientPurityPlugin() {
  return {
    name: 'dsh-workflows-client-purity',
    resolveId(source) {
      if (BASELINE_EXTERNALS.has(source)) return { id: source, external: true }
      if (!source.startsWith('@deepseek-ai/')) return null
      throw new Error(
        `client bundle imports non-baseline shared runtime ${JSON.stringify(source)}; `
        + 'use a Cordis service, a type-only import, or declare an intentional loader external',
      )
    },
  }
}

function cssModulesPlugin() {
  return {
    name: 'dsh-workflows-lightning-css-modules',
    resolveId(source, importer) {
      if (!source.endsWith('.module.css')) return null
      const file = importer === undefined ? source : sourceAssetPath(source, importer)
      // Keep the virtual id portable: Rolldown includes ids in region
      // comments, and an absolute checkout path would make the tarball
      // machine-specific.
      const relativeFile = relative(ROOT, file).split(sep).join('/')
      return `${CSS_VIRTUAL_PREFIX}${relativeFile}${CSS_VIRTUAL_SUFFIX}`
    },
    async load(id) {
      if (!id.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const relativeFile = id.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      const file = resolve(ROOT, relativeFile)
      this.addWatchFile(file)
      const { code, exports: cssExports } = transform({
        filename: file,
        code: await readFile(file),
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classes = Object.fromEntries(
        Object.entries(cssExports ?? {})
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([local, value]) => [local, value.name]),
      )
      return styleInjectionModule(relativeFile, code.toString(), classes)
    },
  }
}

function styleInjectionModule(file, css, classes) {
  const tagId = `${PACKAGE_NAME}/${basename(file)}`
  return [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(PACKAGE_NAME)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classes)};`,
  ].join('\n')
}

function sourceAssetPath(source, importer) {
  const emitted = resolve(dirname(importer), source)
  const boundary = emitted.indexOf(TYPES_MARKER)
  return boundary < 0
    ? emitted
    : resolve(emitted.slice(0, boundary), 'src/client', emitted.slice(boundary + TYPES_MARKER.length))
}

function portableSourcePath(source, mapPath) {
  const absolute = isAbsolute(source) ? source : resolve(dirname(mapPath), source)
  const path = relative(LIB, absolute).split(sep).join('/')
  return path.startsWith('.') ? path : `./${path}`
}

async function runTsc(config) {
  await runChild(process.execPath, [TYPESCRIPT, '-p', resolve(ROOT, config), '--pretty', 'false'])
}

function runChild(file, args) {
  return new Promise((accept, reject) => {
    if (interrupted !== undefined) {
      reject(new Error(`build interrupted by ${interrupted}`))
      return
    }
    const child = spawn(file, args, { cwd: ROOT, stdio: 'inherit' })
    children.add(child)
    child.once('error', error => {
      children.delete(child)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      children.delete(child)
      if (code === 0) accept()
      else reject(new Error(`${basename(file)} exited ${code ?? `by ${signal}`}`))
    })
  })
}

function installSignalForwarding() {
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, forwardSignal)
}

function removeSignalForwarding() {
  for (const signal of ['SIGINT', 'SIGTERM']) process.off(signal, forwardSignal)
}

function forwardSignal(signal) {
  if (interrupted !== undefined) return
  interrupted = signal
  for (const child of children) child.kill(signal)
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    await build()
  } catch (error) {
    console.error(`build failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : 1
  }
}
