/**
 * Models often write `{ a: 1; b: 2 }` (JSON/Rhai/TS muscle memory). That is a
 * SyntaxError in JavaScript. Only rewrite a semicolon that is clearly sitting
 * between object/array fields (`ident:` or `"key":` follows). Leave
 * `for (;;)` and ordinary statement separators alone.
 */
export declare function repairObjectLiteralSemicolons(script: string): string;
/** Stock engines have no canned `validate()`. Run one path with stub hooks, never children. */
export declare function cannedStockValidate(script: string, args?: unknown, options?: {
    readonly timeoutMs?: number;
    readonly filename?: string;
}): Promise<{
    readonly ok: true;
    readonly status: 'completed';
    readonly value: unknown;
} | {
    readonly ok: true;
    readonly status: 'would-pause';
    readonly value: string;
} | {
    readonly ok: false;
    readonly status: 'error';
    readonly error: string;
}>;
//# sourceMappingURL=canned-validate.d.ts.map