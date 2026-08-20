import { AsyncLocalStorage } from 'node:async_hooks'
export const name='workflow-run-recorder'
export class WorkflowRunRecorder {
  private readonly attribution=new AsyncLocalStorage<{session:any}>()
  constructor(private readonly ctx?:any){}
  /** Attribute exactly one top-level launch and append its official durable prefix. */
  async launch<T extends {runId:string;displayName:string}>(session:any,start:()=>Promise<T>):Promise<T>{return this.attribution.run({session},async()=>{const launched=await start();session?.append?.('tool-workflow/run-start',{runId:launched.runId,name:launched.displayName});return launched})}
  async reconcile(_agent:any):Promise<void>{}
  async dispose():Promise<void>{this.attribution.disable()}
}
