# TypeScript toolchain

Date: 2026-10-23. Status: accepted.

## Context

The repository holds two programs that share types: a Chrome extension and a Node.js MCP server. Agents write most of
the code, so the toolchain has to catch their mistakes mechanically, run the same way on a laptop and in CI, and stay
small enough to learn.

## Decision

- **npm workspaces** hold `extension/` and `mcp-server/` in one repository with one lockfile. npm ships with Node, so
  there is nothing extra to install; pnpm was the alternative, faster but one more tool.
- **TypeScript 6.0** in strict mode, with `noUncheckedIndexedAccess`. TypeScript 7.0 is out, but typescript-eslint
  8.72 supports TypeScript below 6.1 only, and the type-aware lint rules matter more than the newer compiler.
- **`tsc` alone builds both packages**, with no bundler. Neither imports a browser dependency yet, and the extension's
  service worker loads ES modules directly. A bundler (esbuild or Vite) comes when the extension imports shared code.
- **ESLint with typescript-eslint's `strictTypeChecked` and `stylisticTypeChecked`**, which use the type checker to
  catch what agents often get wrong, such as an unawaited promise. **Prettier** formats code at 120 columns;
  `eslint-config-prettier` turns off the lint rules that would fight it. Markdown is left to hand-wrapping. Biome, one
  tool for both, was the alternative; ESLint and Prettier are what most repositories use.
- **Vitest** runs the tests. It reads TypeScript and ES modules through Vite's transform with no configuration file,
  where Jest would need one for both.
- **Node.js 24** (`.nvmrc`), the current long-term-support line, locally and in CI.
- **One version for the repository**, written in the root and both workspace `package.json` files and in the
  extension's `manifest.json`. `scripts/check-versions.mjs` fails when they disagree.
- Dependencies are pinned to exact versions, so an install never picks up a release nobody reviewed.

## Consequences

- `npm run check` runs every check CI runs, in the same order.
- Moving to TypeScript 7 waits for typescript-eslint to support it.
- Pinned versions need deliberate updates; Dependabot can propose them.
