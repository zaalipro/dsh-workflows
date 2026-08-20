import { basename } from 'node:path';
import { assertWorkflowDefinitionName } from './names.js';
import type { WorkflowDefinitionEnvelope, WorkflowMeta, WorkflowPhase, WorkflowDefinition } from './types.js';
const META_KEYS = new Set(['name','description','whenToUse','phases']);
const PHASE_KEYS = new Set(['title','detail','provider','model']);
function own(o: object, k: string): boolean { return Object.prototype.hasOwnProperty.call(o,k); }
function record(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function text(v: unknown, label: string, path: string): string { if (typeof v !== 'string') throw new Error(`${path}: ${label} must be a string`); return v; }
function validateMeta(value: unknown, path: string): WorkflowMeta {
  if (!record(value)) throw new Error(`${path}: meta must be an object`);
  for (const key of Object.keys(value)) if (!META_KEYS.has(key)) throw new Error(`${path}: unknown metadata field "${key}"`);
  const name = text(value.name,'meta.name',path); assertWorkflowDefinitionName(name,path);
  const description = text(value.description,'meta.description',path);
  const result: {name:string;description:string;whenToUse?:string;phases?:WorkflowPhase[]} = {name,description};
  if (own(value,'whenToUse')) result.whenToUse = text(value.whenToUse,'meta.whenToUse',path);
  if (own(value,'phases')) {
    if (!Array.isArray(value.phases)) throw new Error(`${path}: meta.phases must be an array`);
    result.phases = value.phases.map((phase,index) => {
      if (!record(phase)) throw new Error(`${path}: meta.phases[${index}] must be an object`);
      for (const key of Object.keys(phase)) if (!PHASE_KEYS.has(key)) throw new Error(`${path}: unknown phase field "${key}"`);
      const out: { title: string; detail?: string; provider?: string; model?: string } = { title: text(phase.title,`meta.phases[${index}].title`,path) };
      for (const key of ['detail','provider','model'] as const) if (own(phase,key)) out[key] = text(phase[key],`meta.phases[${index}].${key}`,path);
      return out;
    });
  }
  return result;
}
/** Parse a strict JSON envelope and verify filename/meta identity. */
export function parseDefinitionFile(raw: string, path: string, expectedName: string): Omit<WorkflowDefinition,'scope'> {
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch (e) { throw new Error(`${path}: invalid JSON`,{cause:e}); }
  if (!record(parsed)) throw new Error(`${path}: workflow envelope must be an object`);
  for (const key of Object.keys(parsed)) if (key !== 'meta' && key !== 'script') throw new Error(`${path}: unknown envelope field "${key}"`);
  if (!own(parsed,'meta') || !own(parsed,'script')) throw new Error(`${path}: envelope must contain exactly meta and script`);
  const script = text(parsed.script,'script',path);
  const meta = validateMeta(parsed.meta, path);
  assertWorkflowDefinitionName(expectedName,path);
  if (meta.name !== expectedName) throw new Error(`${path}: filename stem "${expectedName}" does not match meta.name "${meta.name}"`);
  return { name: meta.name, description: meta.description, ...(meta.whenToUse === undefined ? {} : {whenToUse:meta.whenToUse}), ...(meta.phases === undefined ? {} : {phases:meta.phases}), path, script };
}
/** Parse and validate an envelope object before serialization. */
export function validateDefinitionEnvelope(envelope: WorkflowDefinitionEnvelope, source = 'workflow definition'): WorkflowDefinitionEnvelope {
  const parsed = parseDefinitionFile(JSON.stringify(envelope), source, envelope.meta.name);
  return { meta: {name: parsed.name,description: parsed.description,...(parsed.whenToUse===undefined?{}:{whenToUse:parsed.whenToUse}),...(parsed.phases===undefined?{}:{phases:parsed.phases})}, script: parsed.script };
}
/** Canonical bytes used for guarded publication. */
export function serializeDefinition(envelope: WorkflowDefinitionEnvelope): string { const clean = validateDefinitionEnvelope(envelope); return JSON.stringify(clean,null,2)+'\n'; }
export function filenameStem(path: string): string { const b=basename(path); return b.endsWith('.workflow.json') ? b.slice(0,-'.workflow.json'.length) : b; }
