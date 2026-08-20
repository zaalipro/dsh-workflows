import { parseWorkflowCommand, WORKFLOW_COMMAND_HELP } from './parser.js'
import type { WorkflowRegistry } from '../registry/index.js'
import type { WorkflowSupervisor } from '../supervisor/index.js'
export * from './parser.js'; export * from './aliases.js'
export const name='commands';
export interface CommandResult { readonly content:string; readonly isError?:boolean }
export const COMMAND_SUCCESS={
  pause:(display:string)=>`Paused workflow "${display}". Open /workflows to resume or stop it.`,
  resume:(display:string)=>`Resumed workflow "${display}". Open /workflows to watch it.`,
  stop:(display:string)=>`Stopped workflow "${display}".`,
}
/** Execute a parsed command against registry/supervisor services. */
export async function executeWorkflowCommand(input:string,services:{registry:WorkflowRegistry;supervisor:WorkflowSupervisor;agent:any;recorder?:{launch(session:any,start:()=>Promise<any>):Promise<any>};cwd?:string}):Promise<CommandResult>{const command=parseWorkflowCommand(input);if(command.kind==='empty')return {content:WORKFLOW_COMMAND_HELP};if(command.kind==='malformed')return {content:command.error,isError:true};try{if(command.kind==='launch'){const definition=await services.registry.get(command.name,{cwd:services.cwd});if(!definition)return {content:`no saved workflow named "${command.name}"`,isError:true};const start=()=>services.supervisor.start({definition,args:command.args,parent:services.agent});const launched=services.recorder?await services.recorder.launch(services.agent?.session,start):await start();return {content:`Started workflow "${launched.displayName}" in the background. Open /workflows to watch it.`}}if(command.kind==='pause'){await services.supervisor.pause(command.displayName,services.agent);return {content:COMMAND_SUCCESS.pause(command.displayName)}}if(command.kind==='resume'){await services.supervisor.resume(command.displayName,services.agent);return {content:COMMAND_SUCCESS.resume(command.displayName)}}if(command.kind==='stop'){await services.supervisor.stop(command.displayName,services.agent);return {content:COMMAND_SUCCESS.stop(command.displayName)}}if(command.kind==='save'){const path=await services.supervisor.save(command.displayName,services.agent);return {content:`Saved workflow "${command.displayName}" to ${path}.`}}return {content:WORKFLOW_COMMAND_HELP}}catch(error){return {content:error instanceof Error?error.message:String(error),isError:true}}}
export function packagedSkillPath():URL{return new URL('../../skills/create-workflow/SKILL.md',import.meta.url)}
export async function readPackagedSkill():Promise<string>{const fs=await import('node:fs/promises');const text=await fs.readFile(packagedSkillPath(),'utf8');if(!/^---\n[\s\S]*?name:\s*create-workflow/mu.test(text))throw new Error('packaged create-workflow skill is missing or invalid');return text}
