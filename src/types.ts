/** Public package types and branded durable identities. */
export type Branded<T extends string> = string & { readonly __brand: T };
export type SupervisedWorkflowRunId = Branded<'SupervisedWorkflowRunId'>;
export type WorkflowMemberId = Branded<'WorkflowMemberId'>;
export type WorkflowGateId = Branded<'WorkflowGateId'>;
export const SupervisedWorkflowRunId = (value:string) => value as SupervisedWorkflowRunId;
export const WorkflowMemberId = (value:string) => value as WorkflowMemberId;
export const WorkflowGateId = (value:string) => value as WorkflowGateId;
export * from './registry/types.js';
export * from './supervisor/storage/manifest-types.js';
