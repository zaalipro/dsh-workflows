import { chmod, mkdir, open, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import type { WorkflowStorageAnchor, WorkflowStorageLease } from './lease.js'
import { BoundedFileError } from './bounded-file.js'

export interface PrivateDirectory {
  readonly path: string
  openDirectory(name: string, signal?: AbortSignal): Promise<PrivateDirectory>
  readBytes(name: string, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
  writeText(name: string, content: string, expected: { readonly kind: 'createIfAbsent' | 'replaceIfVersion'; readonly version?: unknown }, signal?: AbortSignal): Promise<{ readonly operation: string; readonly version: unknown; readonly before: null; readonly after: string }>
  assertIdentity(signal?: AbortSignal): Promise<void>
  close(): Promise<void>
}
export type FsPrivateDirectory = PrivateDirectory
export interface WorkflowStorageLayout { readonly anchor: WorkflowStorageAnchor; readonly lease: WorkflowStorageLease; readonly sessions: PrivateDirectory; readonly runs: PrivateDirectory; readonly staging: PrivateDirectory; readonly quarantine: PrivateDirectory }

function component(name: string): void { if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(name) || name === '.' || name === '..' || name.includes('/')) throw new BoundedFileError(`unsafe private path component "${name}"`) }

class LocalPrivateDirectory implements PrivateDirectory {
  private closed = false
  constructor(readonly path: string, private readonly identity: { dev: bigint | number; ino: bigint | number }) {}
  async assertIdentity(): Promise<void> { if (this.closed) throw new BoundedFileError('private directory is closed'); const current=await stat(this.path); if(!current.isDirectory()||current.dev!==this.identity.dev||current.ino!==this.identity.ino)throw new BoundedFileError(`workflow storage path "${this.path}" is unsafe: directory identity changed`) }
  async openDirectory(name: string, signal?: AbortSignal): Promise<PrivateDirectory> { component(name); signal?.throwIfAborted(); await this.assertIdentity(); const p=join(this.path,name);await mkdir(p,{recursive:true,mode:0o700});await chmod(p,0o700);const s=await stat(p);if(!s.isDirectory())throw new BoundedFileError(`workflow storage path "${p}" is unsafe`);return new LocalPrivateDirectory(p,{dev:s.dev,ino:s.ino}) }
  async readBytes(name:string,signal:AbortSignal|undefined,maxBytes:number):Promise<Uint8Array>{component(name);signal?.throwIfAborted();await this.assertIdentity();const fh=await open(join(this.path,name),constants.O_RDONLY|((constants as Record<string,number>).O_NOFOLLOW??0));try{const s=await fh.stat();if(!s.isFile()||s.nlink!==1)throw new BoundedFileError('private file is not a regular single-link file');if(s.size>maxBytes)throw new BoundedFileError('private file exceeds configured limit','WORKFLOW_STORAGE_LIMIT');const chunks:Buffer[]=[];let total=0;while(total<=maxBytes){signal?.throwIfAborted();const b=Buffer.alloc(Math.min(65536,maxBytes+1-total));const r=await fh.read(b,0,b.length,null);if(!r.bytesRead)break;chunks.push(b.subarray(0,r.bytesRead));total+=r.bytesRead;if(total>maxBytes)throw new BoundedFileError('private file exceeds configured limit','WORKFLOW_STORAGE_LIMIT')}return new Uint8Array(Buffer.concat(chunks))}finally{await fh.close()}}
  async writeText(name:string,content:string,expected:{kind:'createIfAbsent'|'replaceIfVersion';version?:unknown},signal?:AbortSignal){component(name);signal?.throwIfAborted();await this.assertIdentity();if(expected.kind!=='createIfAbsent'&&expected.kind!=='replaceIfVersion')throw new BoundedFileError('unguarded private write');const p=join(this.path,name);const temp=join(this.path,`.${name}.${Math.random().toString(16).slice(2)}.tmp`);const bytes=new TextEncoder().encode(content);await import('node:fs/promises').then(m=>m.writeFile(temp,bytes,{flag:'wx',mode:0o600}));try{if(expected.kind==='createIfAbsent'){try{await stat(p);throw new BoundedFileError(`private file "${name}" already exists`)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}}await import('node:fs/promises').then(m=>m.rename(temp,p));const s=await stat(p);return {operation:expected.kind,version:{dev:s.dev,ino:s.ino,mtimeMs:s.mtimeMs},before:null,after:content}}finally{await import('node:fs/promises').then(m=>m.unlink(temp)).catch(()=>{})}}
  async close(){this.closed=true}
}
export async function openPrivateDirectory(path:string,create=true):Promise<PrivateDirectory>{if(create)await mkdir(path,{recursive:true,mode:0o700});const s=await stat(path);if(!s.isDirectory())throw new BoundedFileError(`workflow storage path "${path}" is unsafe`);return new LocalPrivateDirectory(path,{dev:s.dev,ino:s.ino})}
export async function openVerifiedRunDirectory(layout:WorkflowStorageLayout,runDirectory:string):Promise<{readonly id:string;readonly directory:PrivateDirectory;readonly scriptPath:string;assertIdentity():Promise<void>}>{component(runDirectory);const directory=await layout.runs.openDirectory(runDirectory);return {id:runDirectory,directory,scriptPath:join(layout.runs.path,runDirectory,'script.js'),assertIdentity:()=>directory.assertIdentity()}}
export async function initializePrivateLayout(anchor:WorkflowStorageAnchor,lease:WorkflowStorageLease):Promise<WorkflowStorageLayout>{const root=await openPrivateDirectory(anchor.root);const sessions=await root.openDirectory('sessions');const runs=await root.openDirectory('runs');const staging=await root.openDirectory('staging');const quarantine=await root.openDirectory('quarantine');return {anchor,lease,sessions,runs,staging,quarantine}}
