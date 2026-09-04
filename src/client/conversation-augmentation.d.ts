export {}

/**
 * The official Web conversation package is a peer of the installed bundle.
 * Keep a minimal ambient contract so the package's standalone client face can
 * be typechecked before a host profile has materialized that peer's symlink.
 * The real package declaration merges with this interface at installation.
 */
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {}
}
