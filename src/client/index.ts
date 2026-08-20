import { WorkflowRunsController } from './controller.js'
import { DashboardWorkflowRunsAdapter } from './adapter.js'
import { workflowRunDefinition } from './workflow-definition.js'
export * from './contract.js';export * from './controller.js';export * from './adapter.js';export * from './store.js';export * from './locales.js';export * from './WorkflowsDashboard.js';export * from './WorkflowRunPanel.js';export * from './WorkflowMemberInspector.js'
export const inject=['connection','remote','sessions','slots','conversationEvents','commandUi','locale'] as const
export function apply(ctx:any):void{const remote=ctx.remote?.workflows??ctx.remote;const controller=new WorkflowRunsController(remote);const adapter=new DashboardWorkflowRunsAdapter(controller);ctx.workflowRunsController=controller;ctx.workflowRunsAdapter=adapter;ctx.workflowRunDefinition=workflowRunDefinition;ctx.effect?.(()=>()=>{adapter.dispose();controller.dispose()})}
