/** Command words which cannot also be dynamic saved-workflow aliases. */
const RESERVED_WORKFLOW_NAMES = new Set([
  'pause',
  'resume',
  'save',
  'stop',
  'workflow',
  'workflows',
  'create-workflow',
]);

/** Basenames which are devices rather than ordinary files on Windows. */
const WINDOWS_DEVICE_BASENAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

const WORKFLOW_DEFINITION_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const WORKFLOW_NAME_RULE =
  'expected 1–64 UTF-16 code units, lowercase kebab-case beginning with a letter, excluding reserved command and Windows device names';

/**
 * Return whether `value` is a safe saved-workflow definition name.
 *
 * The check does not coerce, normalize, or truncate its input. In particular,
 * the length is JavaScript string length (UTF-16 code units), matching the
 * durable filename contract.
 */
export function isWorkflowDefinitionName(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 64
    && WORKFLOW_DEFINITION_NAME.test(value)
    && !RESERVED_WORKFLOW_NAMES.has(value)
    && !WINDOWS_DEVICE_BASENAMES.has(value.toLowerCase());
}

/** Official workflow vocabulary alias retained for package consumers. */
export const isWorkflowName = isWorkflowDefinitionName;

/**
 * Assert that `value` is a saved-workflow definition name and return the exact
 * input string. The diagnostic contains only the caller-supplied source; this
 * helper never invents or discloses a filesystem path.
 */
export function assertWorkflowDefinitionName(value: unknown, source: string): string {
  if (!isWorkflowDefinitionName(value)) {
    throw new TypeError(`${source}: invalid workflow name ${renderRejectedValue(value)}; ${WORKFLOW_NAME_RULE}`);
  }
  return value;
}

/** Official workflow vocabulary alias retained for package consumers. */
export const assertWorkflowName = assertWorkflowDefinitionName;

/** Render without invoking object coercion, getters, or a caller's `toJSON`. */
function renderRejectedValue(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string': return JSON.stringify(value);
    case 'number': return Number.isNaN(value) ? 'NaN' : String(value);
    case 'boolean': return String(value);
    case 'undefined': return 'undefined';
    case 'bigint': return `${value}n`;
    case 'symbol': return '<symbol>';
    case 'function': return '<function>';
    case 'object': return '<object>';
  }
  /* c8 ignore next -- the switch is exhaustive for JavaScript typeof values */
  return '<unknown>';
}
