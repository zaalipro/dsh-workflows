import React from 'react'
export function WorkflowMemberInspector({member,onClose}:{member:any;onClose?:()=>void}){return <section aria-label="Workflow member inspector"><header><h2>{member?.label??'Member'}</h2>{onClose&&<button onClick={onClose}>Close</button>}</header><p>{member?.phase??''}</p><pre>{member?.outcome?.content?.kind==='value'?JSON.stringify(member.outcome.content.value,null,2):member?.outcome?.content?.text??''}</pre></section>}
export default WorkflowMemberInspector
