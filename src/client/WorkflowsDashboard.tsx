import React,{useEffect,useState} from 'react'
import type { WorkflowRunsController } from './controller.js'
import { WorkflowRunPanel } from './WorkflowRunPanel.js'
import { workflowLocales } from './locales.js'
export function WorkflowsDashboard({controller,sessionId,onClose}:{controller:WorkflowRunsController;sessionId:string;onClose?:()=>void}){const source=(()=>{const [value,setValue]=useState(controller.get(sessionId));useEffect(()=>controller.subscribe(sessionId,setValue),[controller,sessionId]);useEffect(()=>{void controller.refresh(sessionId)},[controller,sessionId]);return value})();return <div role="dialog" aria-label="Workflows" className="dsh-workflows-dashboard"><header><h1>{workflowLocales.en.title}</h1><button aria-label="Close workflows" onClick={onClose}>×</button></header>{source.runs.length===0?<div><h2>{workflowLocales.en.emptyTitle}</h2><p>{workflowLocales.en.emptyBody}</p></div>:<main>{source.runs.map((run:any)=><WorkflowRunPanel key={run.runId} run={run} onControl={action=>void controller.control(sessionId,run.runId,action,run.revision)}/>)}</main>}</div>}
export default WorkflowsDashboard
