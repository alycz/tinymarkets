# Contributing / Workflow

One integrator (you) owns `main`. Agents work on branches and open PRs.

## Flow
1. Pick a ticket from `TICKETS.md`; open a GitHub issue for it.
2. Branch off `main`: `feat/<package>-<short-desc>` (e.g. `feat/api-thin-slice`).
3. Implement against `@jet/shared` contracts; follow `CLAUDE.md`.
4. Open a PR. CI (`pnpm typecheck` + `pnpm test`) must be green.
5. Optional automated review: comment `@claude review` on the PR.
6. Integrator reviews and squash-merges.

## Rules
- Green CI is required to merge. No exceptions.
- One ticket ~= one PR ~= one package where possible (keeps reviews small).
- Contract changes (`@jet/shared`) are reviewed by the integrator first —
  they ripple across every package.
