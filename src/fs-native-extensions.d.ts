declare module 'fs-native-extensions' {
  /** Atomically exchange two filesystem entries on Linux and macOS. */
  export function swap(from: string, to: string): Promise<void>;
  export function waitForLock(fd: number, offset?: number, length?: number, options?: { readonly shared?: boolean }): Promise<void>;
  export function tryLock(fd: number, offset?: number, length?: number, options?: { readonly shared?: boolean }): boolean;
  export function unlock(fd: number, offset?: number, length?: number): void;
}
