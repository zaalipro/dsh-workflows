import { posix } from 'node:path';
import { assertWorkflowDefinitionName, isWorkflowDefinitionName } from './names.js';
import type {
  WorkflowDefinition,
  WorkflowDefinitionEnvelope,
  WorkflowMeta,
  WorkflowPhase,
  WorkflowScope,
} from './types.js';

const ENVELOPE_KEYS = new Set(['meta', 'script']);
const META_KEYS = new Set(['name', 'description', 'whenToUse', 'phases']);
const PHASE_KEYS = new Set(['title', 'detail', 'provider', 'model']);
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const utf8Encoder = new TextEncoder();

function own(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(path: string, message: string, cause?: unknown): never {
  throw new Error(`${path}: ${message}`, cause === undefined ? undefined : { cause });
}

function renderThrown(error: unknown): string {
  try {
    return String(error);
    /* c8 ignore start -- JSON.parse never throws an unrenderable value */
  } catch {
    return '[unrenderable thrown value]';
  }
  /* c8 ignore stop */
}

function requireString(value: unknown, field: string, path: string, nonEmpty = false): string {
  if (typeof value !== 'string' || (nonEmpty && value.length === 0)) {
    fail(path, `${field} must be ${nonEmpty ? 'a non-empty' : 'a'} string`);
  }
  return value;
}

function unknownFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): string[] {
  return Object.keys(value).filter(key => !allowed.has(key));
}

/** Validate the official workflow metadata data shape and return a detached copy. */
function validateMeta(value: unknown, path: string): WorkflowMeta {
  if (!record(value)) fail(path, 'meta must be a plain object');
  const extraMeta = unknownFields(value, META_KEYS);
  if (extraMeta.length > 0) fail(path, `unknown metadata field(s) ${extraMeta.join(', ')}`);

  const name = requireString(value.name, 'meta.name', path, true);
  assertWorkflowDefinitionName(name, path);
  const description = requireString(value.description, 'meta.description', path, true);
  const result: {
    name: string;
    description: string;
    whenToUse?: string;
    phases?: WorkflowPhase[];
  } = { name, description };

  // Official validateMeta treats explicit undefined optional values as absent.
  if (value.whenToUse !== undefined) {
    result.whenToUse = requireString(value.whenToUse, 'meta.whenToUse', path);
  }

  if (value.phases !== undefined) {
    if (!Array.isArray(value.phases)) fail(path, 'meta.phases must be an array');
    result.phases = value.phases.map((phase, index): WorkflowPhase => {
      const label = `meta.phases[${index}]`;
      if (!record(phase)) fail(path, `${label} must be a plain object`);
      const extraPhase = unknownFields(phase, PHASE_KEYS);
      if (extraPhase.length > 0) fail(path, `unknown phase field(s) ${extraPhase.join(', ')}`);
      const normalized: { title: string; detail?: string; provider?: string; model?: string } = {
        title: requireString(phase.title, `${label}.title`, path, true),
      };
      for (const key of ['detail', 'provider', 'model'] as const) {
        if (phase[key] !== undefined) normalized[key] = requireString(phase[key], `${label}.${key}`, path);
      }
      return normalized;
    });
  }
  return result;
}

function parseEnvelope(value: unknown, path: string, expectedName: string): Omit<WorkflowDefinition, 'scope'> {
  if (!record(value)) fail(path, 'a workflow envelope must be a JSON object with { meta, script }');
  const extra = unknownFields(value, ENVELOPE_KEYS);
  if (extra.length > 0) fail(path, `unknown envelope field(s) ${extra.join(', ')} (expected { meta, script })`);
  if (!own(value, 'meta') || !own(value, 'script')) {
    fail(path, 'a workflow envelope must be a JSON object with { meta, script }');
  }
  if (typeof value.script !== 'string') fail(path, 'envelope "script" must be a string');
  if (!isWorkflowDefinitionName(expectedName)) {
    fail(path, `filename stem "${expectedName}" is not a valid workflow name`);
  }
  const expected = assertWorkflowDefinitionName(expectedName, path);
  const meta = validateMeta(value.meta, path);
  if (meta.name !== expected) {
    fail(path, `filename "${expected}.workflow.json" must match meta.name "${meta.name}"`);
  }

  return {
    name: meta.name,
    description: meta.description,
    ...(meta.whenToUse === undefined ? {} : { whenToUse: meta.whenToUse }),
    ...(meta.phases === undefined ? {} : { phases: meta.phases }),
    path,
    script: value.script,
  };
}

/**
 * Parse a byte-bounded, fatal-UTF-8 workflow envelope and verify that its
 * metadata name equals the filename-derived expected name.
 */
export function parseWorkflowDefinition(
  bytes: Uint8Array,
  path: string,
  scope: WorkflowScope,
  expectedName: string,
  maxBytes: number,
): WorkflowDefinition {
  if (!(bytes instanceof Uint8Array)) fail(path, 'workflow definition bytes must be a Uint8Array');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) fail(path, 'definition byte limit must be a positive safe integer');
  if (bytes.byteLength > maxBytes) fail(path, `definition exceeds the ${maxBytes}-byte limit`);

  let raw: string;
  try {
    raw = utf8Decoder.decode(bytes);
  } catch (error) {
    fail(path, 'definition is not valid UTF-8', error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(path, `not valid JSON — ${renderThrown(error)}`, error);
  }
  return { ...parseEnvelope(parsed, path, expectedName), scope };
}

/**
 * Compatibility parser for already-decoded definition text. Filesystem
 * callers should prefer {@link parseWorkflowDefinition} so the byte cap and
 * fatal UTF-8 decoding occur at the same boundary.
 */
export function parseDefinitionFile(raw: string, path: string, expectedName: string): Omit<WorkflowDefinition, 'scope'> {
  if (typeof raw !== 'string') fail(path, 'workflow definition text must be a string');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(path, `not valid JSON — ${renderThrown(error)}`, error);
  }
  return parseEnvelope(parsed, path, expectedName);
}

/** Validate an in-memory envelope and return a normalized detached copy. */
export function validateDefinitionEnvelope(
  envelope: WorkflowDefinitionEnvelope,
  source = 'workflow definition',
): WorkflowDefinitionEnvelope {
  if (!record(envelope)) fail(source, 'a workflow envelope must be a JSON object with { meta, script }');
  const extra = unknownFields(envelope, ENVELOPE_KEYS);
  if (extra.length > 0) fail(source, `unknown envelope field(s) ${extra.join(', ')} (expected { meta, script })`);
  if (!own(envelope, 'meta') || !own(envelope, 'script')) {
    fail(source, 'a workflow envelope must be a JSON object with { meta, script }');
  }
  if (typeof envelope.script !== 'string') fail(source, 'envelope "script" must be a string');
  const meta = validateMeta(envelope.meta, source);
  const script = envelope.script;
  return {
    meta: {
      name: meta.name,
      description: meta.description,
      ...(meta.whenToUse === undefined ? {} : { whenToUse: meta.whenToUse }),
      ...(meta.phases === undefined ? {} : { phases: meta.phases }),
    },
    script,
  };
}

/**
 * Serialize a revalidated envelope to canonical UTF-8 bytes. Key order is
 * `meta`, then `script`, indentation is two spaces, and exactly one LF follows.
 */
export function serializeWorkflowDefinition(envelope: WorkflowDefinitionEnvelope): Uint8Array {
  const normalized = validateDefinitionEnvelope(envelope);
  return utf8Encoder.encode(`${JSON.stringify({ meta: normalized.meta, script: normalized.script }, null, 2)}\n`);
}

/** Legacy string serializer retained for source compatibility. */
export function serializeDefinition(envelope: WorkflowDefinitionEnvelope): string {
  return utf8Decoder.decode(serializeWorkflowDefinition(envelope));
}

/** Extract the name candidate from one direct definition entry. */
export function filenameStem(path: string): string {
  const value = posix.basename(path.replaceAll('\\', '/'));
  return value.endsWith('.workflow.json') ? value.slice(0, -'.workflow.json'.length) : value;
}
