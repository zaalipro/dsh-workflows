/**
 * The build writes this module from Typert's returned artifact.  Keeping the
 * declaration here lets the repository-root client typecheck run before the
 * generated files exist; the package self-reference is resolved to the real
 * artifact by the packed build.
 */
declare module '@zaalipro/dsh-workflows/remote' {
  import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
  const contribution: TypertRemoteContribution
  export default contribution
}
