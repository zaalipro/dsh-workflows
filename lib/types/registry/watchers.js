import { watch as chokidarWatch } from 'chokidar';
import { posix, win32 } from 'node:path';
const EVENTS = new Set(['add', 'change', 'unlink', 'addDir', 'unlinkDir']);
const scheduler = { schedule: (cb, ms) => setTimeout(cb, ms), cancel: h => clearTimeout(h) };
function norm(path) { return (path.includes('\\') ? win32 : posix).normalize(path); }
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function same(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }
/** Bounded, generation-fenced chokidar ownership for workflow roots. */
export class WorkflowDefinitionWatchers {
    onChange;
    options;
    factory;
    clock;
    logger;
    permanent = new Map();
    projects = new Map();
    pending = new Set();
    chain = Promise.resolve();
    timer;
    ticks = 0;
    generationValue = 0;
    dead = false;
    ending;
    constructor(first, supplied = {}) {
        const opts = typeof first === 'function' ? supplied : first;
        this.onChange = typeof first === 'function' ? first : first.onChange;
        this.options = { maxProjects: opts.maxProjects ?? 128, usePolling: opts.usePolling ?? false, stabilityThresholdMs: opts.stabilityThresholdMs ?? 200, pollIntervalMs: opts.pollIntervalMs ?? 100 };
        for (const name of ['maxProjects', 'stabilityThresholdMs', 'pollIntervalMs']) {
            const value = this.options[name];
            if (!Number.isSafeInteger(value) || value < 1)
                throw new TypeError(`${name} must be a positive safe integer`);
        }
        this.factory = opts.watchFactory ?? chokidarWatch;
        const candidate = opts.scheduler;
        this.clock = candidate?.schedule !== undefined && candidate.cancel !== undefined
            ? candidate
            : candidate?.setTimeout !== undefined && candidate.clearTimeout !== undefined
                ? { schedule: candidate.setTimeout.bind(candidate), cancel: candidate.clearTimeout.bind(candidate) }
                : scheduler;
        this.logger = opts.logger;
    }
    get generation() { return this.generationValue; }
    get projectCount() { return this.projects.size; }
    observeProject(projectRoot, roots) {
        if (this.dead)
            return Promise.resolve();
        return this.enqueue(async () => {
            if (this.dead)
                return;
            for (const root of roots) {
                if (root.scope === 'project')
                    continue;
                const key = `${root.scope}\0${norm(root.path)}`;
                if (!this.permanent.has(key)) {
                    const watcher = this.create(key, [norm(root.path)]);
                    if (watcher)
                        this.permanent.set(key, watcher);
                }
            }
            const key = norm(projectRoot);
            const paths = roots.filter(r => r.scope === 'project').map(r => norm(r.path)).sort(cmp);
            const old = this.projects.get(key);
            if (old && same(old.paths, paths)) {
                old.lastObserved = ++this.ticks;
                return;
            }
            if (old) {
                this.projects.delete(key);
                this.pending.delete(old);
                this.generationValue++;
                await this.close(old);
            }
            while (this.projects.size >= this.options.maxProjects) {
                const victim = [...this.projects.values()].sort((a, b) => a.lastObserved - b.lastObserved || cmp(a.key, b.key))[0];
                /* c8 ignore start -- the while condition proves a retained project exists */
                if (!victim)
                    break;
                /* c8 ignore stop */
                this.projects.delete(victim.key);
                this.pending.delete(victim);
                this.generationValue++;
                await this.close(victim);
            }
            if (paths.length) {
                const watcher = this.create(key, paths);
                if (watcher) {
                    watcher.lastObserved = ++this.ticks;
                    this.projects.set(key, watcher);
                }
            }
        });
    }
    dispose() {
        if (this.ending)
            return this.ending;
        this.dead = true;
        if (this.timer !== undefined) {
            this.clock.cancel(this.timer);
            this.timer = undefined;
        }
        this.pending.clear();
        this.ending = (async () => { await this.chain.catch(() => undefined); const all = [...this.permanent.values(), ...this.projects.values()]; this.permanent.clear(); this.projects.clear(); await Promise.all(all.map(w => this.close(w))); })();
        return this.ending;
    }
    enqueue(fn) { const run = this.chain.then(fn, fn); this.chain = run.catch(e => this.logger?.warn('workflow watcher operation failed', e)); return run; }
    create(key, paths) {
        /* c8 ignore next -- dispose waits the queue before create can run after death */
        if (this.dead)
            return undefined;
        let handle;
        try {
            handle = this.factory(paths.length === 1 ? paths[0] : paths, { ignoreInitial: true, usePolling: this.options.usePolling, interval: this.options.pollIntervalMs, depth: 0, followSymlinks: false });
        }
        catch (e) {
            this.logger?.warn(`could not watch workflow definition root ${paths.join(', ')}`, e);
            return undefined;
        }
        const watcher = { key, paths: [...paths], handle, identity: Symbol(key), lastObserved: ++this.ticks, closed: false };
        handle.on('all', event => { if (EVENTS.has(event) && this.live(watcher)) {
            this.pending.add(watcher);
            this.coalesce();
        } });
        return watcher;
    }
    live(w) { return !this.dead && !w.closed && (this.permanent.get(w.key)?.identity === w.identity || this.projects.get(w.key)?.identity === w.identity); }
    coalesce() { if (this.dead)
        return; if (this.timer !== undefined)
        this.clock.cancel(this.timer); this.timer = this.clock.schedule(() => { this.timer = undefined; if (this.dead)
        return; const valid = [...this.pending].some(w => this.live(w)); this.pending.clear(); if (!valid)
        return; this.generationValue++; try {
        this.onChange();
    }
    catch (e) {
        this.logger?.warn('workflow watcher callback failed', e);
    } }, this.options.stabilityThresholdMs); }
    async close(w) { if (w.closed)
        return; w.closed = true; this.pending.delete(w); try {
        await w.handle.close();
    }
    catch (e) {
        this.logger?.warn(`could not close workflow watcher ${w.key}`, e);
    } }
}
export function createDefinitionWatcher(roots, onChange, options = {}) {
    const owner = new WorkflowDefinitionWatchers(onChange, { maxProjects: options.maxProjects, usePolling: options.polling, stabilityThresholdMs: options.stabilityThresholdMs, pollIntervalMs: options.pollIntervalMs });
    const projectRoot = roots.find(r => r.scope === 'project')?.projectRoot
        ?? roots.find(r => r.scope === 'project')?.basePath;
    if (projectRoot !== undefined)
        void owner.observeProject(projectRoot, roots);
    return { roots, get generation() { return owner.generation; }, dispose: () => owner.dispose() };
}
//# sourceMappingURL=watchers.js.map