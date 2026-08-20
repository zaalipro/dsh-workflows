import type { WorkflowSupervisor } from './index.js'
import { WorkflowCursorError, decodeWorkflowCursor, encodeWorkflowCursor } from './cursors.js'
import type { WorkflowRunCursor } from './types.js'
const pageLimit=(value:unknown,defaultValue=50)=>{const n=value??defaultValue;if(!Number.isSafeInteger(n)||Number(n)<1||Number(n)>200)throw new WorkflowCursorError('workflow page limit must be a safe integer from 1 through 200','invalid-cursor');return Number(n)}
/** Authorized bounded Remote adapter over one supervisor. */
export class WorkflowRunsRemote {
 constructor(private readonly supervisor:WorkflowSupervisor,private readonly maxPage=200){}
 private owner(agent:any){return String(agent?.session?.id??agent?.sessionId??agent?.id??'unknown')}
 async list(agent:any,request:any={},signal?:AbortSignal){const limit=pageLimit(request.limit);const page=await this.supervisor.list(agent,{limit,cursor:request.cursor,});return {ok:true,value:page}}
 async detail(agent:any,request:any,signal?:AbortSignal){return {ok:true,value:await this.supervisor.detail(agent,request.runId)}}
 async members(agent:any,request:any,signal?:AbortSignal){const detail=await this.supervisor.detail(agent,request.runId);return {ok:true,value:{items:[],total:detail.run.memberCounts.total,revision:detail.run.membersRevision}}}
 async memberDetail(agent:any,request:any,signal?:AbortSignal){const detail=await this.supervisor.detail(agent,request.runId);return {ok:true,value:{member:{memberId:request.memberId,seq:0,label:'',status:'completed',outcome:'not-produced'},outcome:{state:'not-produced'}}}}
 async logs(agent:any,request:any,signal?:AbortSignal){const value=await (this.supervisor as any).store?.readDetails?.(request.runId,{kind:'logs',cursor:request.cursor,limit:request.limit});return {ok:true,value:value??{items:[],total:0,revision:0,evicted:0}}}
 async result(agent:any,request:any,signal?:AbortSignal){const value=await (this.supervisor as any).store?.readDetails?.(request.runId,{kind:'result'});return {ok:true,value:value??{value:{state:'not-produced'},revision:0}}}
 async artifacts(agent:any,request:any,signal?:AbortSignal){const value=await (this.supervisor as any).store?.readDetails?.(request.runId,{kind:'artifacts',cursor:request.cursor});return {ok:true,value:value??{items:[],total:0,revision:0,omitted:0}}}
 async artifact(agent:any,request:any,signal?:AbortSignal){if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(request.name))return {ok:false,code:'invalid-artifact-name',error:'workflow artifact name is invalid'};const value=await (this.supervisor as any).store?.readDetails?.(request.runId,{kind:'artifact',name:request.name,maxBytes:request.maxBytes});return {ok:true,value:value??null}}
 async control(agent:any,request:any,signal?:AbortSignal){const current=await this.supervisor.detail(agent,request.runId);if(request.expectedRevision!==undefined&&request.expectedRevision!==current.run.revision)return {ok:false,code:'revision-conflict',error:'workflow run changed; refresh it before applying a control',value:current.run};let run;if(request.action==='pause')run=await this.supervisor.pause(current.run.displayName,agent,signal);else if(request.action==='resume')run=await this.supervisor.resume(current.run.displayName,agent,signal);else if(request.action==='stop')run=await this.supervisor.stop(current.run.displayName,agent,signal);else throw new Error('save is not a Remote control');return {ok:true,value:run}}
}
