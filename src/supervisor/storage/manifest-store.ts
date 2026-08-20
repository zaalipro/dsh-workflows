import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  DetailReadRequest,
  DetailReadResult,
  RecoveredRun,
  WorkflowCompletionNoticeFinalization,
  WorkflowRunCommitRequest,
  WorkflowRunDetailPayloadV2,
  WorkflowRunHeadRecord,
  WorkflowRunIdentity,
  WorkflowRunInsertRequest,
  WorkflowRunStore,
  WorkflowRunDetailSnapshotV2,
  WorkflowSessionManifest,
  WorkflowStoreOptions,
  WorkflowTerminalCommitRequest,
} from './manifest-types.js'
import { encodeWorkflowSessionManifest, decodeWorkflowSessionManifest } from './manifest-codec.js'
import { compactWorkflowRunDetails, decodeWorkflowRunDetails, encodeWorkflowRunDetails } from './details-codec.js'
import { BoundedFileError, assertSafeComponent } from './bounded-file.js'

const now = (): number => Date.now()
const id = (): string => randomBytes(16).toString('hex')
const sessionAddress = (sessionId: string): string => createHash('sha256').update(sessionId).digest('hex')
const encoder = new TextEncoder()

function clone<T>(value: T): T { return structuredClone(value) }
function terminal(status: string): boolean { return ['completed', 'failed', 'cancelled', 'interrupted'].includes(status) }
function defaultDetail(): WorkflowRunDetailPayloadV2 { return { members: [], logs: [], phases: [], artifacts: [] } }

/** File-backed version-2 retained run store. */
export class FileWorkflowRunStore implements WorkflowRunStore {
  private readonly options: WorkflowStoreOptions
  private readonly sessions = new Map<string, WorkflowSessionManifest>()
  private readonly details = new Map<string, WorkflowRunDetailSnapshotV2>()
  private readonly queues = new Map<string, Promise<void>>()
  private disposed = false
  private initialized = false
  constructor(options: WorkflowStoreOptions, private readonly lease?: { assertCurrent(): Promise<void> }) { this.options = options }

  private async guard(): Promise<void> {
    if (this.disposed) throw new BoundedFileError('workflow run store is disposed')
    await this.lease?.assertCurrent()
  }
  private manifestPath(sessionId: string): string { return join(this.options.runsRoot, 'sessions', sessionAddress(sessionId), 'manifest.json') }
  private runPath(runDirectory: string): string { assertSafeComponent(runDirectory, 'run directory'); return join(this.options.runsRoot, 'runs', runDirectory) }
  private async withSession<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(sessionId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    this.queues.set(sessionId, current)
    await previous
    try { return await operation() } finally { release(); if (this.queues.get(sessionId) === current) this.queues.delete(sessionId) }
  }
  private async persist(manifest: WorkflowSessionManifest): Promise<void> {
    const path = this.manifestPath(manifest.sessionId)
    await mkdir(join(this.options.runsRoot, 'sessions', sessionAddress(manifest.sessionId)), { recursive: true, mode: 0o700 })
    const bytes = encodeWorkflowSessionManifest(manifest, this.options.maxManifestBytes)
    await writeFile(path, bytes, { mode: 0o600 })
    this.sessions.set(manifest.sessionId, clone(manifest))
  }
  private async load(sessionId: string): Promise<WorkflowSessionManifest> {
    const cached = this.sessions.get(sessionId)
    if (cached) return clone(cached)
    try {
      const bytes = await readFile(this.manifestPath(sessionId))
      const manifest = decodeWorkflowSessionManifest(bytes, this.manifestPath(sessionId), this.options.maxManifestBytes)
      if (manifest.sessionId !== sessionId) throw new BoundedFileError('Session manifest identity mismatch', 'WORKFLOW_STORAGE_CORRUPT')
      this.sessions.set(sessionId, clone(manifest)); return clone(manifest)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const empty: WorkflowSessionManifest = { version: 2, sessionId, revision: 0, nextOrdinal: 1, ordinals: [], heads: [] }
        this.sessions.set(sessionId, empty); return clone(empty)
      }
      throw error
    }
  }
  async initialize(): Promise<readonly RecoveredRun[]> {
    await this.guard(); await mkdir(join(this.options.runsRoot, 'sessions'), { recursive: true, mode: 0o700 }); await mkdir(join(this.options.runsRoot, 'runs'), { recursive: true, mode: 0o700 });
    this.initialized = true
    const recovered: RecoveredRun[] = []
    let entries: string[] = []
    try { entries = await readdir(join(this.options.runsRoot, 'sessions')) } catch { return recovered }
    if (entries.length > this.options.maxRecoveryEntries) throw new BoundedFileError(`workflow storage path "${this.options.runsRoot}" is unsafe: recovery scan exceeds ${this.options.maxRecoveryEntries} entries`)
    for (const address of entries) {
      if (!/^[a-f0-9]{64}$/u.test(address)) throw new BoundedFileError(`workflow storage path "${this.options.runsRoot}" is unsafe: invalid Session directory`)
      const manifestPath = join(this.options.runsRoot, 'sessions', address, 'manifest.json')
      const bytes = await readFile(manifestPath)
      const manifest = decodeWorkflowSessionManifest(bytes, manifestPath, this.options.maxManifestBytes)
      this.sessions.set(manifest.sessionId, clone(manifest))
      let changed = false
      const heads = manifest.heads.map(head => {
        if (!terminal(head.status)) { changed = true; const recoveredHead: RecoveredRun = { ...head, status: 'interrupted' as const, stopReason: 'interrupted' as const, error: 'Process exited before workflow settlement.', executionAvailable: false, saveAvailable: false, completionNotice: head.completionNotice.state === 'none' ? { state: 'abandoned' as const, finalizedAt: now(), reason: 'process-lost' as const } : head.completionNotice }; recovered.push(recoveredHead); return recoveredHead }
        return head
      })
      if (changed) await this.persist({ ...manifest, revision: manifest.revision + 1, heads })
    }
    return recovered
  }
  async insertWithNextDisplayName(request: WorkflowRunInsertRequest, create: (identity: WorkflowRunIdentity) => { readonly head: any; readonly detail: WorkflowRunDetailPayloadV2 }): Promise<WorkflowRunHeadRecord> {
    await this.guard(); if (!this.initialized) await this.initialize()
    return this.withSession(request.sessionId, async () => {
      const manifest = await this.load(request.sessionId); const same = manifest.heads.filter(head => head.name === request.name); const ordinal = same.length === 0 ? 1 : Math.max(...same.map(head => Number(head.displayName.match(/-(\d+)$/u)?.[1] ?? 1))) + 1; const displayName = ordinal === 1 ? request.name : `${request.name}-${ordinal}`; const runDirectory = id(); const identity={displayName,numberedHandle:ordinal!==1,runDirectory}; const draft=create(identity); const detailId=id(); const detail:WorkflowRunDetailSnapshotV2={version:2,sessionId:request.sessionId,runId:request.runId,runDirectory,detailId,snapshotRevision:1,payload:compactWorkflowRunDetails(draft.detail,{memberOutcomeMaxBytes:this.options.memberOutcomeMaxBytes??131072,maxTerminalResultBytes:this.options.maxTerminalResultBytes??1048576,maxLogLineBytes:this.options.maxLogLineBytes??65536,maxRunDetailsBytes:this.options.maxRunDetailsBytes})}; const detailBytes=encodeWorkflowRunDetails(detail,{memberOutcomeMaxBytes:this.options.memberOutcomeMaxBytes??131072,maxTerminalResultBytes:this.options.maxTerminalResultBytes??1048576,maxLogLineBytes:this.options.maxLogLineBytes??65536,maxRunDetailsBytes:this.options.maxRunDetailsBytes}); await mkdir(join(this.options.runsRoot,'runs',runDirectory,'details'),{recursive:true,mode:0o700}); await mkdir(join(this.options.runsRoot,'runs',runDirectory,'scratch'),{recursive:true,mode:0o700}); await writeFile(join(this.options.runsRoot,'runs',runDirectory,'script.js'),request.script,{mode:0o600,flag:'wx'}); await writeFile(join(this.options.runsRoot,'runs',runDirectory,'details',`${detailId}.json`),detailBytes,{mode:0o600,flag:'wx'}); this.details.set(request.runId,detail); const base:any={...draft.head,runId:request.runId,name:request.name,displayName,numberedHandle:ordinal!==1,runDirectory,revision:manifest.revision+1,detail:{id:detailId,bytes:detailBytes.byteLength,sha256:createHash('sha256').update(detailBytes).digest('hex'),snapshotRevision:1},completionNotice:{state:'none'},executionAvailable:true,scriptPath:join(this.options.runsRoot,'runs',runDirectory,'script.js')}; const next={...manifest,revision:manifest.revision+1,nextOrdinal:Math.max(manifest.nextOrdinal,ordinal+1),ordinals:[...manifest.ordinals,{name:request.name,next:ordinal+1}],heads:[...manifest.heads,base]}; await this.persist(next); return clone(base)
    })
  }
  async commitRun(request: WorkflowRunCommitRequest): Promise<WorkflowRunHeadRecord> { await this.guard(); return this.withSession(request.sessionId,async()=>{const manifest=await this.load(request.sessionId);const index=manifest.heads.findIndex(h=>h.runId===request.runId);if(index<0)throw new BoundedFileError('workflow run not found','WORKFLOW_RUN_NOT_FOUND');const old=manifest.heads[index];if(old.revision!==request.expectedRevision)throw new BoundedFileError('workflow run changed; refresh it before applying a control','WORKFLOW_STALE_REVISION');let detailRef=old.detail;if(request.detail!==undefined){const snapshot:WorkflowRunDetailSnapshotV2={version:2,sessionId:request.sessionId,runId:request.runId,runDirectory:old.runDirectory,detailId:id(),snapshotRevision:old.detail.snapshotRevision+1,payload:request.detail};const bytes=encodeWorkflowRunDetails(snapshot,{memberOutcomeMaxBytes:this.options.memberOutcomeMaxBytes??131072,maxTerminalResultBytes:this.options.maxTerminalResultBytes??1048576,maxLogLineBytes:this.options.maxLogLineBytes??65536,maxRunDetailsBytes:this.options.maxRunDetailsBytes});await writeFile(join(this.options.runsRoot,'runs',old.runDirectory,'details',`${snapshot.detailId}.json`),bytes,{flag:'wx',mode:0o600});detailRef={id:snapshot.detailId,bytes:bytes.byteLength,sha256:createHash('sha256').update(bytes).digest('hex'),snapshotRevision:snapshot.snapshotRevision};this.details.set(request.runId,snapshot)}const head:any={...request.head,runId:request.runId,runDirectory:old.runDirectory,displayName:old.displayName,numberedHandle:old.numberedHandle,revision:old.revision+1,detail:detailRef,completionNotice:old.completionNotice};const next={...manifest,revision:manifest.revision+1,heads:manifest.heads.toSpliced(index,1,head)};await this.persist(next);return clone(head)}) }
  async commitTerminalAndClaimNotice(request:WorkflowTerminalCommitRequest):Promise<WorkflowRunHeadRecord>{return this.withSession(request.sessionId,async()=>{const manifest=await this.load(request.sessionId);const old=manifest.heads.find(h=>h.runId===request.runId);if(!old)throw new BoundedFileError('workflow run not found','WORKFLOW_RUN_NOT_FOUND');if(old.revision!==request.expectedRevision)throw new BoundedFileError('workflow run changed; refresh it before applying a control','WORKFLOW_STALE_REVISION');if(!terminal(request.head.status))throw new BoundedFileError('terminal commit requires a terminal status');const head:any={...request.head,runId:request.runId,runDirectory:old.runDirectory,displayName:old.displayName,numberedHandle:old.numberedHandle,revision:old.revision+1,detail:old.detail,completionNotice:{state:'claimed',claimId:id(),processEpoch:id(),claimedAt:now()}};const next={...manifest,revision:manifest.revision+1,heads:manifest.heads.map(h=>h.runId===request.runId?head:h)};await this.persist(next);return clone(head)})}
  async finalizeCompletionNotice(sessionId:string,runId:string,expectedRevision:number,finalization:WorkflowCompletionNoticeFinalization):Promise<WorkflowRunHeadRecord>{return this.withSession(sessionId,async()=>{const manifest=await this.load(sessionId);const old=manifest.heads.find(h=>h.runId===runId);if(!old)throw new BoundedFileError('workflow run not found','WORKFLOW_RUN_NOT_FOUND');if(old.revision!==expectedRevision)throw new BoundedFileError('workflow run changed; refresh it before applying a control','WORKFLOW_STALE_REVISION');if(old.completionNotice.state!=='claimed')throw new BoundedFileError('completion notice is not claimable');const head:any={...old,revision:old.revision+1,completionNotice:finalization};await this.persist({...manifest,revision:manifest.revision+1,heads:manifest.heads.map(h=>h.runId===runId?head:h)});return clone(head)})}
  async readSession(sessionId:string):Promise<readonly WorkflowRunHeadRecord[]>{await this.guard();return (await this.load(sessionId)).heads.map(clone)}
  async readDetails(runId:string,request:DetailReadRequest):Promise<DetailReadResult>{await this.guard();const snapshot=this.details.get(runId);if(!snapshot)throw new BoundedFileError('workflow run details not found','WORKFLOW_RUN_NOT_FOUND');const payload:any=snapshot.payload;const value=request.kind==='members'?payload.members??[]:request.kind==='logs'?payload.logs??[]:request.kind==='result'?payload.result??{state:'not-produced'}:request.kind==='artifacts'?payload.artifacts??[]:((payload.artifacts??[]).find((a:any)=>a.name===request.name)??null);return {value,revision:snapshot.snapshotRevision}}
  async dispose():Promise<void>{this.disposed=true;this.sessions.clear();this.details.clear()}
}
