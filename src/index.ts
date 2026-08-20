import { resolveWorkflowPackageConfig, Config, type Config as WorkflowConfig } from './config.js'
import { WorkflowPackageError, type WorkflowPackageErrorCode, applyInvariant } from './invariant.js'
import { WorkflowRegistry } from './registry/index.js'
import { WorkflowSupervisor } from './supervisor/index.js'
export { Config, resolveWorkflowPackageConfig, WorkflowPackageError, applyInvariant }
export type { WorkflowConfig, WorkflowPackageErrorCode }
export const name = 'dsh-workflows'
export const version = '0.1.0-rc.1'
export function assertCompatibleHost(ctx: any): void {
  const marker = ctx?.workflowPrerequisites ?? ctx?.workflowEngine?.prerequisites ?? ctx?.dshWorkflowPrerequisites
  if (!marker || marker.release !== 'H' || marker.version === '0.1.0-rc.8') {
    throw new WorkflowPackageError('workflow package requires official Harness release H with external-workflow prerequisites; stock 0.1.0-rc.8 is unsupported', 'WORKFLOW_INCOMPATIBLE_HOST')
  }
}
export function apply(ctx: any, input: WorkflowConfig = {}): void {
  assertCompatibleHost(ctx)
  const dshHome = input.dshHome ?? ctx?.dshHome ?? process.env.DSH_HOME ?? process.cwd()
  const config = resolveWorkflowPackageConfig(input, dshHome)
  if (config.enabled === false) return
  const registry = new WorkflowRegistry(ctx, config)
  ctx.workflows = registry
  const supervisor = new WorkflowSupervisor(ctx, config, ctx?.workflowStore)
  ctx.workflowSupervisor = supervisor
  ctx.effect?.(() => async () => { await supervisor.dispose(); await registry.dispose() }, 'dsh-workflows dispose')
}
export * from './types.js'
export * from './registry/index.js'
export { WorkflowSupervisor } from './supervisor/index.js'
export type { SupervisorConfig, WorkflowLaunchSpec, WorkflowValidateSpec } from './supervisor/index.js'
