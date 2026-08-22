import { Script, createContext } from 'node:vm';
import { scriptWithJobMapParallel } from './parallel-compat.js';
const DEFAULT_TIMEOUT_MS = 2_500;
/**
 * Models often write `{ a: 1; b: 2 }` (JSON/Rhai/TS muscle memory). That is a
 * SyntaxError in JavaScript. Only rewrite a semicolon that is clearly sitting
 * between object/array fields (`ident:` or `"key":` follows). Leave
 * `for (;;)` and ordinary statement separators alone.
 */
export function repairObjectLiteralSemicolons(script) {
    return script.replace(/;\s*(?=(?:["'][^"']*["']|[A-Za-z_$][\w$]*)\s*:)/gu, ', ');
}
function isWouldPause(error) {
    return error instanceof Error && error.name === 'WorkflowWouldPause';
}
function gate(_kind, message) {
    const error = new Error(String(message ?? ''));
    error.name = 'WorkflowWouldPause';
    throw error;
}
function asErrorText(error) {
    try {
        if (error instanceof Error && error.message) {
            /* c8 ignore next -- Node always populates Error#stack */
            return error.stack ?? error.message;
        }
        return String(error);
        /* c8 ignore start -- String() of a hostile throwable */
    }
    catch {
        return '[unrenderable canned validation failure]';
    }
    /* c8 ignore stop */
}
/** vm context objects use a different Object.prototype; snapshot as host JSON. */
function hostJson(value) {
    if (value === undefined)
        return null;
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return String(value);
    }
}
/** Stock engines have no canned `validate()`. Run one path with stub hooks, never children. */
export async function cannedStockValidate(script, args = {}, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const filename = options.filename ?? 'workflow:canned';
    const body = scriptWithJobMapParallel(script);
    let compiled;
    try {
        compiled = new Script(`(async () => {\n${body}\n})()`, { filename, lineOffset: -1 });
    }
    catch (error) {
        return { ok: false, status: 'error', error: asErrorText(error) };
    }
    const context = createContext({
        agent: async () => null,
        parallel: async (items) => {
            if (!Array.isArray(items))
                return items;
            const output = [];
            for (const item of items) {
                try {
                    if (typeof item === 'function')
                        output.push(await item());
                    /* c8 ignore start -- job-map prelude converts objects to thunks */
                    else
                        output.push(item);
                    /* c8 ignore stop */
                }
                catch {
                    output.push(null);
                }
            }
            return output;
        },
        pipeline: async (items, ...stages) => {
            const list = Array.isArray(items) ? items : [];
            const output = [];
            for (let index = 0; index < list.length; index += 1) {
                let value = list[index];
                try {
                    for (const stage of stages)
                        value = await stage(value, list[index], index);
                    output.push(value);
                }
                catch {
                    output.push(null);
                }
            }
            return output;
        },
        phase: () => undefined,
        log: () => undefined,
        args: args ?? {},
        pause: gate,
        await_user: gate,
        budget: () => ({ total: 128, spent: 0, reserved: 0, remaining: 128 }),
        write_scratch_file: async () => undefined,
        read_scratch_file: async () => '',
    });
    try {
        const pending = Promise.resolve(compiled.runInContext(context, { timeout: timeoutMs }));
        const value = await Promise.race([
            pending,
            new Promise((_, reject) => {
                const timer = setTimeout(() => reject(new Error('canned workflow validation timed out')), timeoutMs);
                /* c8 ignore next -- unref is always present in Node */
                timer.unref?.();
            }),
        ]);
        return { ok: true, status: 'completed', value: hostJson(value) };
    }
    catch (error) {
        if (isWouldPause(error))
            return { ok: true, status: 'would-pause', value: error.message };
        return { ok: false, status: 'error', error: asErrorText(error) };
    }
}
//# sourceMappingURL=canned-validate.js.map