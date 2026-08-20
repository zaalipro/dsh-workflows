import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { WorkflowRoot } from './roots.js';
export interface DefinitionWatcher { readonly roots: readonly WorkflowRoot[]; readonly generation: number; dispose(): Promise<void> }
/** Coalesced, generation-fenced native watcher set. */
export function createDefinitionWatcher(roots: readonly WorkflowRoot[], onChange: () => void, options: { maxProjects?: number; polling?: boolean; stabilityThresholdMs?: number; pollIntervalMs?: number } = {}): DefinitionWatcher {
  const generation=Symbol(); let disposed=false; let timer: NodeJS.Timeout|undefined; const handles: FSWatcher[]=[];
  const notify=()=>{ if(disposed)return; if(timer)clearTimeout(timer); timer=setTimeout(()=>{if(!disposed&&generation)onChange()}, options.stabilityThresholdMs ?? 200); };
  for (const root of roots.slice(0, options.maxProjects ?? 128)) {
    try { const h=fsWatch(root.path,{recursive:false},notify); handles.push(h); } catch { /* absent roots are watched after creation by registry refresh */ }
  }
  return { roots, generation: Number(Date.now()), async dispose(){if(disposed)return;disposed=true;if(timer)clearTimeout(timer);for(const h of handles)h.close();} };
}
