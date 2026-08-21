import { lstat as nodeLstat } from 'node:fs/promises';
import { posix, win32 } from 'node:path';
/** Select path operations from execution-world spelling, not the Host OS. */
export function workflowPathApi(path) {
    return path.includes('\\') ? win32 : posix;
}
function normalizeAbsolute(path, label) {
    if (typeof path !== 'string' || path.length === 0)
        throw new TypeError(`${label} must be a non-empty absolute path`);
    const api = workflowPathApi(path);
    if (!api.isAbsolute(path))
        throw new TypeError(`${label} must be an absolute path`);
    return { value: api.normalize(path), api };
}
/**
 * Walk upward in the execution filesystem to the nearest regular `.git` file
 * or directory. When no marker exists, return the original normalized cwd.
 */
export async function findWorkflowProjectRoot(fileSystem, cwd, signal) {
    const { value: initial, api } = normalizeAbsolute(cwd, 'workflow cwd');
    let current = initial;
    while (true) {
        signal?.throwIfAborted();
        const marker = await fileSystem.lstat(api.join(current, '.git'), {}, signal);
        if (marker?.type === 'directory' || marker?.type === 'file')
            return current;
        const parent = api.dirname(current);
        if (parent === current) {
            signal?.throwIfAborted();
            return initial;
        }
        current = parent;
    }
}
/**
 * Compatibility helper which uses the local process only for `.git` marker
 * discovery. Registry I/O itself never uses this adapter; it always supplies
 * the compatible Host filesystem capability.
 */
export async function findProjectRoot(cwd, signal) {
    const adapter = {
        async lstat(path, _options, operationSignal) {
            operationSignal?.throwIfAborted();
            try {
                const info = await nodeLstat(path);
                return { type: info.isFile() ? 'file' : info.isDirectory() ? 'directory' : info.isSymbolicLink() ? 'symlink' : 'other' };
            }
            catch (error) {
                if (error.code === 'ENOENT')
                    return undefined;
                /* c8 ignore start -- unexpected local lstat faults stay loud */
                throw error;
                /* c8 ignore stop */
            }
        },
    };
    return findWorkflowProjectRoot(adapter, cwd, signal);
}
function localContains(base, child) {
    const api = workflowPathApi(base);
    const rel = api.relative(api.normalize(base), api.normalize(child));
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${api.sep}`) && !api.isAbsolute(rel));
}
async function assertBundledRoot(bundled, fileSystem, signal) {
    const api = workflowPathApi(bundled);
    const basePath = api.dirname(bundled);
    /* c8 ignore start -- dirname of an absolute path is always a lexical parent */
    if (!localContains(basePath, bundled)) {
        throw new TypeError(`${bundled}: workflow root escapes its bundled scope through a symbolic-link ancestor`);
    }
    /* c8 ignore stop */
    if (fileSystem?.resolve !== undefined && fileSystem.contains !== undefined) {
        signal?.throwIfAborted();
        const resolveOptions = signal === undefined ? {} : { signal };
        const [baseTarget, rootTarget] = await Promise.all([
            fileSystem.resolve(basePath, resolveOptions),
            fileSystem.resolve(bundled, resolveOptions),
        ]);
        if (!fileSystem.contains(baseTarget, rootTarget)) {
            throw new TypeError(`${bundled}: workflow root escapes its bundled scope through a symbolic-link ancestor`);
        }
    }
    return { scope: 'bundled', path: bundled, basePath };
}
/** Resolve bundled, project, and user roots in fixed first-wins order. */
export async function resolveWorkflowRoots(options) {
    // Host list/get/save and Remote listing all require an explicit Session cwd.
    // Never substitute $DSH_HOME or process.cwd() as a fake project root.
    if (typeof options.cwd !== 'string' || options.cwd.length === 0) {
        throw new TypeError('workflow definition listing requires a session cwd');
    }
    const { value: normalizedCwd } = normalizeAbsolute(options.cwd, 'workflow cwd');
    const fileSystem = options.fileSystem;
    const projectRoot = fileSystem === undefined
        ? await findProjectRoot(normalizedCwd, options.signal)
        : await findWorkflowProjectRoot(fileSystem, normalizedCwd, options.signal);
    const { value: dshHome, api: homePath } = normalizeAbsolute(options.dshHome, 'dshHome');
    const roots = [];
    if (options.bundledDefinitionsDir !== undefined) {
        const { value: bundled } = normalizeAbsolute(options.bundledDefinitionsDir, 'bundledDefinitionsDir');
        roots.push(await assertBundledRoot(bundled, fileSystem, options.signal));
    }
    const projectPath = workflowPathApi(projectRoot);
    roots.push({
        scope: 'project',
        path: projectPath.join(projectRoot, '.dsh', 'workflows'),
        basePath: projectRoot,
        projectRoot,
    });
    roots.push({
        scope: 'user',
        path: homePath.join(dshHome, 'workflows'),
        basePath: dshHome,
    });
    options.signal?.throwIfAborted();
    return roots;
}
//# sourceMappingURL=roots.js.map