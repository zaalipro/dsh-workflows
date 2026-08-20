import { useSyncExternalStore } from 'react'
import type { WorkflowRunsController } from './controller.js'
export function useWorkflowRuns(controller:WorkflowRunsController,sessionId:string){return useSyncExternalStore(listener=>controller.subscribe(sessionId,()=>listener()),()=>controller.get(sessionId),()=>controller.get(sessionId))}
