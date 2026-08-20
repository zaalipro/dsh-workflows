import type { WorkflowRunValueView } from './types.js'
import type { WorkflowCompletionNoticeFinalization, WorkflowRunStore } from './storage/manifest-types.js'

export interface WorkflowCompletionNoticeInput { readonly runId: string; readonly displayName: string; readonly status: 'completed'|'failed'|'cancelled'|'interrupted'; readonly report?: string; readonly result?: WorkflowRunValueView; readonly error?: string }
export interface CompletionNoticeOptions { readonly maxBytes?: number; readonly maxItems?: number; readonly maxCohortBytes?: number; readonly maxConsecutiveWakes?: number }

const encoder = new TextEncoder()
function truncate(text:string,max:number):string { let result='';for(const point of text){if(encoder.encode(result+point).byteLength>max)break;result+=point}return result }
/** Render the one owner-visible terminal notice with a stable final footer. */
export function renderWorkflowCompletionNotice(input: WorkflowCompletionNoticeInput, maxBytes=16_384, report?: string): string {
  const body=report ?? input.report ?? (input.result?.state==='available' ? input.result.content.kind==='value' ? JSON.stringify(input.result.content.value,null,2) : input.result.content.text : input.error ?? 'No workflow result was retained.')
  const prefix=input.status==='completed' ? `Workflow "${input.displayName}" completed.` : input.status==='cancelled' ? `Workflow "${input.displayName}" was cancelled.` : input.status==='interrupted' ? `Workflow "${input.displayName}" was interrupted.` : `Workflow "${input.displayName}" failed.`
  const footer='Open /workflows to inspect the run.'
  const available=maxBytes-encoder.encode(`${prefix}\n\n${footer}`).byteLength-2
  return `${prefix}\n\n${truncate(body,Math.max(0,available))}\n\n${footer}`
}

/** At-most-once completion claim coordinator. */
export class WorkflowCompletionNotifier {
  private readonly claimed = new Set<string>(); private readonly delivered = new Set<string>(); private disposed=false
  constructor(private readonly ctx:any, private readonly store?:WorkflowRunStore, private readonly options:CompletionNoticeOptions={}) {}
  reserve(runId:string,_parent:any):void {if(!this.disposed)this.claimed.add(runId)}
  async notify(input:WorkflowCompletionNoticeInput):Promise<boolean>{if(this.disposed||this.delivered.has(input.runId)||!this.claimed.has(input.runId))return false;const text=renderWorkflowCompletionNotice(input,this.options.maxBytes??16_384);try{const owner=this.ctx?.agent??this.ctx?.parent;if(owner?.steer)await owner.steer(text);else if(this.ctx?.send)await this.ctx.send(text);else if(this.ctx?.inbox?.append)await this.ctx.inbox.append(text);this.delivered.add(input.runId);return true}catch{this.claimed.delete(input.runId);return false}}
  humanInput(_agent:any):void {}
  async whenOwnerQuiescent(_agent:any,_signal?:AbortSignal):Promise<void>{}
  async dispose():Promise<void>{this.disposed=true;this.claimed.clear()}
}
