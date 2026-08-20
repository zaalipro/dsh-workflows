import { dirname, join, parse, resolve } from 'node:path';
import { access, lstat } from 'node:fs/promises';
import type { WorkflowScope } from './types.js';
export interface WorkflowRoot { readonly scope: WorkflowScope; readonly path: string; readonly basePath: string }
/** Find nearest Git project root, treating a .git file as a valid marker. */
export async function findProjectRoot(cwd: string, signal?: AbortSignal): Promise<string> {
  const initial = resolve(cwd); let current = initial;
  while (true) {
    signal?.throwIfAborted();
    try { const s=await lstat(join(current,'.git')); if (s.isDirectory()||s.isFile()) return current; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    const parent=dirname(current); if (parent===current) return initial; current=parent;
  }
}
/** Resolve roots in the fixed bundled, project, user precedence order. */
export async function resolveWorkflowRoots(options: { cwd?: string; dshHome: string; bundledDefinitionsDir?: string; signal?: AbortSignal }): Promise<readonly WorkflowRoot[]> {
  const cwd=resolve(options.cwd ?? process.cwd()); const project=await findProjectRoot(cwd,options.signal);
  return [
    ...(options.bundledDefinitionsDir ? [{scope:'bundled' as const,path:resolve(options.bundledDefinitionsDir),basePath:resolve(options.bundledDefinitionsDir)}] : []),
    {scope:'project' as const,path:join(project,'.dsh','workflows'),basePath:project},
    {scope:'user' as const,path:join(resolve(options.dshHome),'workflows'),basePath:resolve(options.dshHome)},
  ];
}
