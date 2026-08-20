import React from 'react'
import { WorkflowMemberInspector } from './WorkflowMemberInspector.js'
export function WorkflowRunPanel({run,onControl,onSelectMember}:{run:any;onControl?:(action:string)=>void;onSelectMember?:(member:any)=>void}){return <section aria-label={`Workflow ${run.displayName}`}><header><h2>{run.displayName}</h2><span>{run.status}</span></header>{run.phase&&<p aria-label="Current phase">{run.phase}</p>}<progress max={run.budget?.total??1} value={run.budget?.spent??0}/><div>{(run.members??[]).map((m:any)=><button key={m.memberId} onClick={()=>onSelectMember?.(m)}>{m.label}</button>)}</div><nav>{(run.allowedActions??[]).map((a:string)=><button key={a} onClick={()=>onControl?.(a)}>{a}</button>)}</nav></section>}
export default WorkflowRunPanel
