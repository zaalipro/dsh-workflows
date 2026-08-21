#!/usr/bin/env node

/**
 * Verify package-owned bilingual Markdown without depending on a Harness
 * checkout. Translation manifests contain the Git blob SHA-1 of both
 * authoritative sides; links and fragments are checked against this tree.
 */
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REQUIRED_DOCUMENTS = Object.freeze([
  'README.md',
  'docs/architecture.md',
  'docs/testing.md',
  'docs/user-guide.md',
  '.agents/notes/implemented/architecture/2026-08-20-installable-workflows-package.md',
])

const REQUIRED_CONTENT = Object.freeze({
  'README.md': {
    english: [
      '## Compatibility', '## Installation', '## Removal',
      '## Saved definitions and authoring', '## Launch and operate',
      '## Replay, recovery, and security', '## Limitations',
      'symbolic official DeepSeek Harness release **H**',
      'Stock `0.1.0-rc.8`', '**not compatible**',
      'dsh plugin --profile web add github:zaalipro/dsh-workflows',
      'dsh plugin --profile web add @zaalipro/dsh-workflows',
      'dsh plugin --profile headless remove @zaalipro/dsh-workflows',
      'same-process only', '.workflow-storage.lock', 'Interrupted',
      'no Grok CLI', 'no Rhai',
    ],
    chinese: [
      '## 兼容性', '## 安装', '## 移除', '## 已保存定义与创作',
      '## 启动与操作', '## Replay、恢复与安全', '## 限制',
      '官方版本 **H**', '原版 `0.1.0-rc.8`', '**与本包不兼容**',
      'dsh plugin --profile web add github:zaalipro/dsh-workflows',
      'dsh plugin --profile web add @zaalipro/dsh-workflows',
      'dsh plugin --profile headless remove @zaalipro/dsh-workflows',
      'same-process only', '.workflow-storage.lock', 'Interrupted',
      'Grok CLI', 'Rhai',
    ],
  },
  'docs/architecture.md': {
    english: [
      '## Package topology', '## Component and event ownership',
      '## Public subpaths and build faces', '## Lifecycle authority',
      '### Durable-before-visible launch', '### Fixed-point teardown',
      '## Manifest version 2 and secure storage',
      '## Replay and script containment', '## Bounded Remote',
      'temporary copied mini-workspace', 'fs-native-extensions',
      'not a security sandbox for hostile code', 'not a compatible installed release',
      'have not shipped', 'fail-closes',
    ],
    chinese: [
      '## 包拓扑', '## 组件与事件归属',
      '## Public subpath 与 build face', '## Lifecycle authority',
      '### Durable-before-visible launch', '### Fixed-point teardown',
      '## Manifest version 2 与安全存储', '## Replay 与 script containment',
      '## Bounded Remote', 'mini-workspace',
      'fs-native-extensions', 'hostile-code security sandbox',
      '不是兼容的 installed release',
      '尚未', 'fail-close',
    ],
  },
  'docs/testing.md': {
    english: [
      '## Automated gates', '## Coverage policy', '## CI platform matrix',
      '## Real-provider secret and cleanup policy',
      '## Final manual Web acceptance', '100%',
      '22.19.0', 'Node 24', '`26`', 'macOS 14', 'Windows Server 2022',
      'DEEPSEEK_API_KEY is not set', 'Ego Lite',
      'never wipe or reset any user session', 'only the Ego Lite task space',
      'real PR server/model flow', 'GIF', 'pnpm run check:release',
      'official-h-probe', 'does not apply an H prerequisite patch',
      'ConversationNodeAssembler', 'coverage-all',
    ],
    chinese: [
      '## 自动化 gate', '## Coverage policy', '## CI platform matrix',
      '## Real-provider secret 与 cleanup policy',
      '## Final manual Web acceptance', '100%',
      '22.19.0', 'Node 24', '`26`', 'macOS 14', 'Windows Server 2022',
      'DEEPSEEK_API_KEY is not set', 'Ego Lite',
      '绝不 wipe 或 reset 任何 user session', '只关闭 Ego Lite task space',
      'real PR server/model flow', 'GIF', 'pnpm run check:release',
      'official-h-probe', '不应用 H prerequisite patch',
      'ConversationNodeAssembler', 'coverage-all',
    ],
  },
  'docs/user-guide.md': {
    english: [
      '## 1. Install on a compatible Harness', '## 2. Create a project definition',
      '## 3. Understand the validation smoke', '## 4. Launch a background run',
      '## 5. Open the run dashboard', '## 6. Inspect execution and members',
      '## 7. Respond to gates', '## 8. Pause, resume, stop, and save',
      '## 12. Troubleshooting', '/create-workflow', '/workflow', '/workflows',
      'validate_only', 'Inspect · N members', 'JSON outcome',
      'await_user', 'Budget limited', 'Interrupted', 'nested workflow',
    ],
    chinese: [
      '## 1. 安装到兼容 Harness', '## 2. 创建 project definition',
      '## 3. 理解 validation smoke', '## 4. 启动 background run',
      '## 5. 打开 run dashboard', '## 6. 检查 execution 与 member',
      '## 7. 回应 gate', '## 8. Pause、resume、stop 与 save',
      '## 12. 故障排查', '/create-workflow', '/workflow', '/workflows',
      'validate_only', 'Inspect · N members', 'JSON outcome',
      'await_user', 'Budget limited', 'Interrupted', 'nested workflow',
    ],
  },
  '.agents/notes/implemented/architecture/2026-08-20-installable-workflows-package.md': {
    english: [
      'Status: implemented', '## Summary', '## Context', '## Decision',
      '## Rejected alternatives', '## Consequences', '## References',
      '141eb6f', 'dsh-v0.1.0-rc.8', '391c829',
      'Exact-Agent', 'quiescent checkpoint', 'fs-native-extensions@1.5.0',
      'invalidation-only', 'tarball-first',
      'has not shipped',
    ],
    chinese: [
      'Status: implemented', '## Summary', '## Context', '## Decision',
      '## Rejected alternatives', '## Consequences', '## References',
      '141eb6f', 'dsh-v0.1.0-rc.8', '391c829',
      'Exact-Agent', 'quiescent checkpoint', 'fs-native-extensions@1.5.0',
      'invalidation-only', 'tarball-first',
      '尚未发布',
    ],
  },
})

try {
  await verifyDocumentation()
  console.log('documentation verification passed')
} catch (error) {
  console.error(`documentation verification failed: ${oneLine(error instanceof Error ? error.message : String(error))}`)
  process.exitCode = 1
}

async function verifyDocumentation() {
  const englishFiles = await discoverEnglishDocuments()
  const relativeFiles = englishFiles.map(repositoryPath)
  for (const required of REQUIRED_DOCUMENTS) {
    if (!relativeFiles.includes(required)) fail(`${required}: required document is missing`)
  }

  await rejectOrphanCompanions(englishFiles)
  const documents = new Map()
  for (const englishPath of englishFiles) {
    const englishRelative = repositoryPath(englishPath)
    const chinesePath = englishPath.replace(/\.md$/u, '.zh.md')
    const mappingPath = englishPath.replace(/\.md$/u, '.i18n.yaml')
    await requireRegularFile(chinesePath, `${englishRelative}: missing Chinese companion ${repositoryPath(chinesePath)}`)
    await requireRegularFile(mappingPath, `${englishRelative}: missing translation mapping ${repositoryPath(mappingPath)}`)

    const english = await readText(englishPath)
    const chinese = await readText(chinesePath)
    const chineseRelative = repositoryPath(chinesePath)
    validateProse(englishRelative, english)
    validateProse(chineseRelative, chinese)
    await verifyMapping(mappingPath, englishPath, chinesePath)
    documents.set(englishRelative, { path: englishPath, text: english })
    documents.set(chineseRelative, { path: chinesePath, text: chinese })
    verifyRequiredContent(englishRelative, english, chineseRelative, chinese)
  }

  for (const document of documents.values()) await verifyLinks(document.path, document.text, documents)
}

async function discoverEnglishDocuments() {
  const files = []
  const readme = resolve(ROOT, 'README.md')
  if (await isRegularFile(readme)) files.push(readme)
  files.push(...await markdownFiles(resolve(ROOT, 'docs')))
  files.push(...await markdownFiles(resolve(ROOT, '.agents/notes/implemented')))
  return [...new Set(files)]
    .filter(path => !path.endsWith('.zh.md'))
    .sort((left, right) => repositoryPath(left).localeCompare(repositoryPath(right)))
}

async function markdownFiles(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return []
    throw error
  }
  const result = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await markdownFiles(path))
    else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.endsWith('.zh.md')) result.push(path)
  }
  return result
}

async function rejectOrphanCompanions(englishFiles) {
  const english = new Set(englishFiles.map(path => resolve(path)))
  const companions = []
  companions.push(...await companionFiles(resolve(ROOT), false))
  companions.push(...await companionFiles(resolve(ROOT, 'docs'), true))
  companions.push(...await companionFiles(resolve(ROOT, '.agents/notes/implemented'), true))
  for (const path of companions) {
    const expectedEnglish = path.endsWith('.zh.md')
      ? path.replace(/\.zh\.md$/u, '.md')
      : path.replace(/\.i18n\.yaml$/u, '.md')
    if (!english.has(resolve(expectedEnglish))) fail(`${repositoryPath(path)}: orphan translation companion has no English document`)
  }
}

async function companionFiles(directory, recursive) {
  let entries
  try { entries = await readdir(directory, { withFileTypes: true }) } catch { return [] }
  const result = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory() && recursive) {
      result.push(...await companionFiles(path, true))
    } else if (entry.isFile() && (entry.name.endsWith('.zh.md') || entry.name.endsWith('.i18n.yaml'))) {
      result.push(path)
    }
  }
  return result
}

async function verifyMapping(mappingPath, englishPath, chinesePath) {
  const mappingRelative = repositoryPath(mappingPath)
  const text = await readText(mappingPath)
  validateTextFile(mappingRelative, text)
  const rows = []
  const keys = new Set()
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const match = rawLine.match(/^([^:#][^:]*):\s*([0-9a-f]{40})\s*$/u)
    if (match === null) fail(`${mappingRelative}: malformed mapping line ${JSON.stringify(rawLine)}`)
    const key = match[1].trim().replaceAll('\\', '/')
    if (keys.has(key)) fail(`${mappingRelative}: duplicate mapping key ${JSON.stringify(key)}`)
    keys.add(key)
    rows.push([key, match[2]])
  }
  const expectedKeys = [basename(englishPath), basename(chinesePath)].sort()
  const actualKeys = rows.map(([key]) => key).sort()
  if (rows.length !== 2 || JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    fail(`${mappingRelative}: mapping must contain exactly ${expectedKeys.join(' and ')}`)
  }
  const mapping = new Map(rows)
  for (const path of [englishPath, chinesePath]) {
    const expected = await gitBlobHash(path)
    if (mapping.get(basename(path)) !== expected) fail(`${mappingRelative}: hash for ${basename(path)} does not match current file`)
  }
}

function validateProse(relativePath, text) {
  validateTextFile(relativePath, text)
  if (/(?:^|[\s(`'"])(?:\/Users\/[^\s)`'"]+|\/home\/[^\s/]+\/|[A-Za-z]:[\\/]Users[\\/])/mu.test(text)) {
    fail(`${relativePath}: contains an absolute developer-machine path`)
  }
  if (/(?:\b0\.1\.0-rc\.9\b|\brc[\s._-]*9\b)/iu.test(text)) {
    fail(`${relativePath}: names rc9 even though symbolic H is the only future compatibility floor`)
  }
  if (/stock\s+(?:Harness\s+)?(?:version\s+)?0\.1\.0-rc\.8\s+(?:is|as)\s+compatible/iu.test(text)) {
    fail(`${relativePath}: claims unmodified 0.1.0-rc.8 compatibility`)
  }
}

function validateTextFile(relativePath, text) {
  if (text.length === 0) fail(`${relativePath}: file is empty`)
  if (text.includes('\r')) fail(`${relativePath}: must use LF line endings`)
  if (!text.endsWith('\n') || text.endsWith('\n\n')) fail(`${relativePath}: must end with exactly one LF`)
}

function verifyRequiredContent(englishRelative, english, chineseRelative, chinese) {
  const requirements = REQUIRED_CONTENT[englishRelative]
  if (requirements === undefined) return
  for (const required of requirements.english) {
    if (!containsRequired(english, required)) fail(`${englishRelative}: missing required section/content ${JSON.stringify(required)}`)
  }
  for (const required of requirements.chinese) {
    if (!containsRequired(chinese, required)) fail(`${chineseRelative}: missing required section/content ${JSON.stringify(required)}`)
  }
}

function containsRequired(text, required) {
  return text.toLocaleLowerCase('en-US').includes(required.toLocaleLowerCase('en-US'))
}

async function verifyLinks(sourcePath, text, documents) {
  const sourceRelative = repositoryPath(sourcePath)
  for (const rawTarget of markdownLinkTargets(text)) {
    if (rawTarget.length === 0 || /^(?:https?:|mailto:|data:|javascript:|\/\/)/iu.test(rawTarget)) continue
    const target = decodeLink(rawTarget, sourceRelative)
    const hashIndex = target.indexOf('#')
    const pathPart = (hashIndex < 0 ? target : target.slice(0, hashIndex)).split('?')[0]
    const fragment = hashIndex < 0 ? '' : target.slice(hashIndex + 1)
    const absolute = pathPart.length === 0 ? sourcePath : resolve(dirname(sourcePath), pathPart)
    if (isAbsolute(pathPart) || !isInsideRoot(absolute)) fail(`${sourceRelative}: local link escapes the package: ${rawTarget}`)
    if (!(await isRegularFile(absolute))) fail(`${sourceRelative}: broken local link ${rawTarget}`)
    if (fragment.length === 0) continue
    if (!absolute.endsWith('.md')) fail(`${sourceRelative}: fragment targets non-Markdown file ${rawTarget}`)
    const targetRelative = repositoryPath(absolute)
    const targetText = documents.get(targetRelative)?.text ?? await readText(absolute)
    if (!headingFragments(targetText).has(decodeLink(fragment, sourceRelative))) fail(`${sourceRelative}: broken Markdown fragment ${rawTarget}`)
  }
}

function markdownLinkTargets(text) {
  const withoutFences = text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gmu, '')
  const targets = []
  for (const match of withoutFences.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu)) targets.push(stripAngleBrackets(match[1]))
  for (const match of withoutFences.matchAll(/^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gmu)) targets.push(stripAngleBrackets(match[1]))
  return targets
}

function headingFragments(text) {
  const result = new Set()
  const occurrences = new Map()
  for (const match of text.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gmu)) {
    const base = githubSlug(match[1])
    if (base.length === 0) continue
    const count = occurrences.get(base) ?? 0
    occurrences.set(base, count + 1)
    result.add(count === 0 ? base : `${base}-${count}`)
  }
  return result
}

function githubSlug(heading) {
  return heading.trim().toLowerCase().replace(/<[^>]*>/gu, '').replace(/[`*_~]/gu, '')
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\- _]/gu, '').replace(/\s+/gu, '-')
}

function decodeLink(value, relativePath) {
  try { return decodeURIComponent(value) } catch { fail(`${relativePath}: malformed percent escape in link ${value}`) }
}

async function gitBlobHash(path) {
  const bytes = await readFile(path)
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex')
}

function repositoryPath(path) { return relative(ROOT, path).split(sep).join('/') }

function isInsideRoot(path) {
  const rel = relative(ROOT, resolve(path))
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

function stripAngleBrackets(value) { return value.startsWith('<') && value.endsWith('>') ? value.slice(1, -1) : value }
async function requireRegularFile(path, message) { if (!(await isRegularFile(path))) fail(message) }
async function isRegularFile(path) { try { return (await stat(path)).isFile() } catch { return false } }
async function readText(path) { return readFile(path, 'utf8') }
function oneLine(value) { return value.replace(/[\r\n]+/gu, ' ').trim() }
function fail(message) { throw new Error(message) }
