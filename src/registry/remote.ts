import type { WorkflowRegistry } from './index.js'
export class WorkflowDefinitionsRemote {constructor(private readonly registry:WorkflowRegistry){}list(agent:any,request:any,signal:AbortSignal){return this.registry.listPage(agent,request,{cwd:agent?.session?.header?.cwd,signal})}}
