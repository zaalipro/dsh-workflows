import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BoundedFileError, assertSafeComponent } from './bounded-file.js'
import type { PrivateDirectory, WorkflowStorageLayout } from './private-root.js'

export interface ScratchStoreOptions { readonly maxOperations: number; readonly maxPendingOperations: number; readonly maxFiles: number; readonly maxFileBytes: number; readonly maxTotalBytes: number }
export interface WorkflowScratchStore { read(name: string, signal?: AbortSignal): Promise<string | undefined>; write(name: string, content: string, signal?: AbortSignal): Promise<void>; list(signal?: AbortSignal): Promise<readonly string[]>; dispose(): Promise<void> }
export interface WorkflowRunFiles { readonly runDirectory: string; readonly scriptPath: string; readonly script: Uint8Array; readonly scratch: WorkflowScratchStore; readonly detailsPath: string; dispose(): Promise<void> }

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u
function checkName(name: string): void { if (!NAME.test(name) || name === '.' || name === '..' || name.includes('/')) throw new BoundedFileError(`scratch name "${name}" is invalid`) }

class Scratch implements WorkflowScratchStore {
  private operations = 0; private pending = 0; private closed = false; private files = new Map<string, number>(); private total = 0; private readonly inflight = new Set<Promise<unknown>>()
  constructor(private readonly path: string, private readonly limits: ScratchStoreOptions) {}
  private begin(name: string, signal?: AbortSignal): void { if (this.closed) throw new BoundedFileError('scratch store is disposed'); checkName(name); signal?.throwIfAborted(); if (++this.operations > this.limits.maxOperations) throw new BoundedFileError('scratch operation quota exceeded','WORKFLOW_STORAGE_LIMIT'); if (++this.pending > this.limits.maxPendingOperations){this.pending--;throw new BoundedFileError('scratch pending-operation quota exceeded','WORKFLOW_STORAGE_LIMIT')} }
  private end(): void { this.pending-- }
  async read(name:string,signal?:AbortSignal):Promise<string|undefined>{this.begin(name,signal);const p=(async()=>{try{const b=await readFile(join(this.path,name));if(b.byteLength>this.limits.maxFileBytes)throw new BoundedFileError('scratch file exceeds per-file quota','WORKFLOW_STORAGE_LIMIT');return new TextDecoder('utf8',{fatal:true}).decode(b)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e}finally{this.end()}})();this.inflight.add(p);try{return await p}finally{this.inflight.delete(p)}}
  async write(name:string,content:string,signal?:AbortSignal):Promise<void>{this.begin(name,signal);const p=(async()=>{try{const bytes=new TextEncoder().encode(content);if(bytes.byteLength>this.limits.maxFileBytes)throw new BoundedFileError('scratch file exceeds per-file quota','WORKFLOW_STORAGE_LIMIT');const previous=this.files.get(name)??0;const nextTotal=this.total-previous+bytes.byteLength;if(nextTotal>this.limits.maxTotalBytes)throw new BoundedFileError('scratch total quota exceeded','WORKFLOW_STORAGE_LIMIT');if(!this.files.has(name)&&this.files.size>=this.limits.maxFiles)throw new BoundedFileError('scratch file quota exceeded','WORKFLOW_STORAGE_LIMIT');await mkdir(this.path,{recursive:true,mode:0o700});const temp=join(this.path,`.${name}.${randomBytes(8).toString('hex')}.tmp`);await writeFile(temp,bytes,{flag:'wx',mode:0o600});try{await rename(temp,join(this.path,name))}finally{await unlink(temp).catch(()=>{})}this.files.set(name,bytes.byteLength);this.total=nextTotal}catch(e){throw e}finally{this.end()}})();this.inflight.add(p);try{await p}finally{this.inflight.delete(p)}}
  async list(signal?:AbortSignal):Promise<readonly string[]>{signal?.throwIfAborted();if(this.closed)throw new BoundedFileError('scratch store is disposed');try{return (await readdir(this.path)).filter(name=>NAME.test(name)).sort()}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e}}
  async dispose(){if(this.closed)return;this.closed=true;await Promise.allSettled([...this.inflight])}
}

/** Create immutable run projection and run-scoped scratch authority. */
export async function createRunFiles(layout: WorkflowStorageLayout, runDirectory: string, scriptBytes: Uint8Array, limits: ScratchStoreOptions & { readonly maxScriptBytes?: number }): Promise<WorkflowRunFiles> {
  assertSafeComponent(runDirectory,'run directory'); if (scriptBytes.byteLength>(limits.maxScriptBytes??1_048_576)) throw new BoundedFileError('workflow script exceeds configured limit','WORKFLOW_STORAGE_LIMIT'); await layout.lease.assertCurrent(); const path=join(layout.runs.path,runDirectory);await mkdir(join(path,'scratch'),{recursive:true,mode:0o700});await mkdir(join(path,'details'),{recursive:true,mode:0o700});await writeFile(join(path,'script.js'),scriptBytes,{flag:'wx',mode:0o600});const scratch=new Scratch(join(path,'scratch'),limits);let disposed=false;return {runDirectory,scriptPath:join(path,'script.js'),script:new Uint8Array(scriptBytes),scratch,detailsPath:join(path,'details'),async dispose(){if(disposed)return;disposed=true;await scratch.dispose()}}
}

export { Scratch as RunScratchStore }
