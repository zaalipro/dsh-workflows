# AGENTS.md

Instructions for AI assistants working in `dsh-workflows`.

## Overview

`@zaalipro/dsh-workflows`: Installable DeepSeek Harness bundle for saved JavaScript workflows, background runs, and web dashboard.

## Tooling & Verification

- **Package Manager**: `pnpm@11.7.0` (Node `>=22.19.0`)
- **Commands**:
  ```bash
  pnpm test         # Run unit tests (vitest)
  pnpm typecheck    # TypeScript compiler check
  pnpm build        # Build package bundle
  ```
- Always ensure `pnpm typecheck` and `pnpm test` pass when modifying source files.
