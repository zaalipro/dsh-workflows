import { watch as chokidarWatch } from 'chokidar';
import { posix, win32 } from 'node:path';
import type { WorkflowRoot } from './roots.js';

const EVENTS = new Set(['add', 'change', 'unlink', 'addDir', 'unlinkDir']);
export interface ChokidarHandle { on(event: 'all', listener: (event: string, path: string) => void): this; close(): void | Promise<void> }
export type ChokidarWatchOptions = {
  readonly ignoreInitial: boolean;
  readonly usePolling: boolean;
  readonly interval: number;
  readonly depth: 0;
  readonly followSymlinks: false;
};
export type ChokidarFactory = (paths: string | readonly string[], options: ChokidarWatchOptions) => ChokidarHandle;
export interface WorkflowWatcherScheduler { schedule(callback: () => void, delayMs: number): unknown; cancel(handle: unknown): void }
export interface WorkflowDefinitionWatcherOptions {
  readonly maxProjects?: number; readonly usePolling?: boolean; readonly stabilityThresholdMs?: number; readonly pollIntervalMs?: number;
  readonly watchFactory?: ChokidarFactory; readonly scheduler?: WorkflowWatcherScheduler; readonly logger?: { warn(...args: unknown[]): void };
}
interface Owned { readonly key: string; readonly paths: readonly string[]; readonly handle: ChokidarHandle; readonly identity: symbol; lastObserved: number; closed: boolean }
const scheduler: WorkflowWatcherScheduler = { schedule: (cb, ms) => setTimeout(cb, ms), cancel: h => clearTimeout(h as NodeJS.Timeout) };
function norm(path: string): string { return (path.includes('\\') ? win32 : posix).normalize(path) }
function cmp(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }
function same(a: readonly string[], b: readonly string[]): boolean { return a.length === b.length && a.every((v, i) => v === b[i]) }

/** Bounded, generation-fenced chokidar ownership for workflow roots. */
export class WorkflowDefinitionWatchers {
  private readonly onChange: () => void; private readonly options: Required<Pick<WorkflowDefinitionWatcherOptions, 'maxProjects' | 'usePolling' | 'stabilityThresholdMs' | 'pollIntervalMs'>>;
  private readonly factory: ChokidarFactory; private readonly clock: WorkflowWatcherScheduler; private readonly logger?: { warn(...args: unknown[]): void };
  private readonly permanent = new Map<string, Owned>(); private readonly projects = new Map<string, Owned>(); private readonly pending = new Set<Owned>();
  private chain: Promise<void> = Promise.resolve(); private timer: unknown; private ticks = 0; private generationValue = 0; private dead = false; private ending?: Promise<void>;
  constructor(onChange: () => void, options?: WorkflowDefinitionWatcherOptions);
  constructor(options: WorkflowDefinitionWatcherOptions & { onChange: () => void });
  constructor(first: (() => void) | (WorkflowDefinitionWatcherOptions & { onChange: () => void }), supplied: WorkflowDefinitionWatcherOptions = {}) {
    const opts = typeof first === 'function' ? supplied : first; this.onChange = typeof first === 'function' ? first : first.onChange;
    this.options = { maxProjects: opts.maxProjects ?? 128, usePolling: opts.usePolling ?? false, stabilityThresholdMs: opts.stabilityThresholdMs ?? 200, pollIntervalMs: opts.pollIntervalMs ?? 100 };
    for (const name of ['maxProjects', 'stabilityThresholdMs', 'pollIntervalMs'] as const) {
      const value = this.options[name];
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive safe integer`);
    }
    this.factory = opts.watchFactory ?? (chokidarWatch as unknown as ChokidarFactory);
    const candidate = opts.scheduler as (WorkflowWatcherScheduler & { setTimeout?: typeof setTimeout; clearTimeout?: typeof clearTimeout }) | undefined;
    this.clock = candidate?.schedule !== undefined && candidate.cancel !== undefined
      ? candidate
      : candidate?.setTimeout !== undefined && candidate.clearTimeout !== undefined
        ? { schedule: candidate.setTimeout.bind(candidate), cancel: candidate.clearTimeout.bind(candidate) }
        : scheduler;
    this.logger = opts.logger;
  }
  get generation(): number { return this.generationValue }
  get projectCount(): number { return this.projects.size }
  observeProject(projectRoot: string, roots: readonly WorkflowRoot[]): Promise<void> {
    if (this.dead) return Promise.resolve();
    return this.enqueue(async () => {
      if (this.dead) return;
      for (const root of roots) {
        if (root.scope === 'project') continue;
        const key = `${root.scope}\0${norm(root.path)}`;
        if (!this.permanent.has(key)) { const watcher = this.create(key, [norm(root.path)]); if (watcher) this.permanent.set(key, watcher) }
      }
      const key = norm(projectRoot); const paths = roots.filter(r => r.scope === 'project').map(r => norm(r.path)).sort(cmp); const old = this.projects.get(key);
      if (old && same(old.paths, paths)) { old.lastObserved = ++this.ticks; return }
      if (old) { this.projects.delete(key); this.pending.delete(old); this.generationValue++; await this.close(old) }
      while (this.projects.size >= this.options.maxProjects) {
        const victim = [...this.projects.values()].sort((a, b) => a.lastObserved - b.lastObserved || cmp(a.key, b.key))[0];
        /* c8 ignore start -- the while condition proves a retained project exists */
        if (!victim) break;
        /* c8 ignore stop */
        this.projects.delete(victim.key); this.pending.delete(victim); this.generationValue++; await this.close(victim);
      }
      if (paths.length) { const watcher = this.create(key, paths); if (watcher) { watcher.lastObserved = ++this.ticks; this.projects.set(key, watcher) } }
    });
  }
  dispose(): Promise<void> {
    if (this.ending) return this.ending; this.dead = true; if (this.timer !== undefined) { this.clock.cancel(this.timer); this.timer = undefined }
    this.pending.clear(); this.ending = (async () => { await this.chain.catch(() => undefined); const all = [...this.permanent.values(), ...this.projects.values()]; this.permanent.clear(); this.projects.clear(); await Promise.all(all.map(w => this.close(w))) })(); return this.ending;
  }
  private enqueue(fn: () => Promise<void>): Promise<void> { const run = this.chain.then(fn, fn); this.chain = run.catch(e => this.logger?.warn('workflow watcher operation failed', e)); return run }
  private create(key: string, paths: readonly string[]): Owned | undefined {
    /* c8 ignore next -- dispose waits the queue before create can run after death */
    if (this.dead) return undefined; let handle: ChokidarHandle;
    try { handle = this.factory(paths.length === 1 ? paths[0]! : paths, { ignoreInitial: true, usePolling: this.options.usePolling, interval: this.options.pollIntervalMs, depth: 0, followSymlinks: false }) }
    catch (e) { this.logger?.warn(`could not watch workflow definition root ${paths.join(', ')}`, e); return undefined }
    const watcher: Owned = { key, paths: [...paths], handle, identity: Symbol(key), lastObserved: ++this.ticks, closed: false };
    handle.on('all', event => { if (EVENTS.has(event) && this.live(watcher)) { this.pending.add(watcher); this.coalesce() } }); return watcher;
  }
  private live(w: Owned): boolean { return !this.dead && !w.closed && (this.permanent.get(w.key)?.identity === w.identity || this.projects.get(w.key)?.identity === w.identity) }
  private coalesce(): void { if (this.dead) return; if (this.timer !== undefined) this.clock.cancel(this.timer); this.timer = this.clock.schedule(() => { this.timer = undefined; if (this.dead) return; const valid = [...this.pending].some(w => this.live(w)); this.pending.clear(); if (!valid) return; this.generationValue++; try { this.onChange() } catch (e) { this.logger?.warn('workflow watcher callback failed', e) } }, this.options.stabilityThresholdMs) }
  private async close(w: Owned): Promise<void> { if (w.closed) return; w.closed = true; this.pending.delete(w); try { await w.handle.close() } catch (e) { this.logger?.warn(`could not close workflow watcher ${w.key}`, e) } }
}

export interface DefinitionWatcher { readonly roots: readonly WorkflowRoot[]; readonly generation: number; dispose(): Promise<void> }
export function createDefinitionWatcher(roots: readonly WorkflowRoot[], onChange: () => void, options: { maxProjects?: number; polling?: boolean; stabilityThresholdMs?: number; pollIntervalMs?: number } = {}): DefinitionWatcher {
  const owner = new WorkflowDefinitionWatchers(onChange, { maxProjects: options.maxProjects, usePolling: options.polling, stabilityThresholdMs: options.stabilityThresholdMs, pollIntervalMs: options.pollIntervalMs });
  const projectRoot = roots.find(r => r.scope === 'project')?.projectRoot
    ?? roots.find(r => r.scope === 'project')?.basePath;
  if (projectRoot !== undefined) void owner.observeProject(projectRoot, roots);
  return { roots, get generation() { return owner.generation }, dispose: () => owner.dispose() };
}
