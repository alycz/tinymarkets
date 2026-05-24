# Setup Guide — from scaffold to a working multi-agent repo

Follow these phases in order. Commands assume macOS/Linux (on Windows, use WSL).
Everything you need is already in this repo; this guide just wires it up.

---

## Phase 0 — Install prerequisites (one-time)

You need: Node 20+, pnpm, Git, the GitHub CLI, and Claude Code.

```bash
node -v                       # need >= 20  (install via nvm or nodejs.org if missing)
corepack enable               # turns on pnpm (version is pinned in package.json)
pnpm -v                       # should print 9.x
git --version
gh --version                  # GitHub CLI — https://cli.github.com  (recommended)
npm install -g @anthropic-ai/claude-code   # Claude Code
claude --version
```

You also need: a GitHub account, and for Claude Code an Anthropic login (a Claude
subscription or an API key). The GitHub Action below uses an **API key**, which
is billed per use — keep that in mind for automated reviews.

> Latest Claude Code install/usage details: https://docs.claude.com/en/docs/claude-code/overview

---

## Phase 1 — Get the scaffold onto your machine

Download `jet-prediction-market.zip` (presented in chat), unzip it, and enter it:

```bash
unzip jet-prediction-market.zip
cd jet-prediction-market
```

Also copy `BUILD_PLAN.md` (the design plan) into the repo root so it lives with
the code — agents read it.

---

## Phase 2 — Install & verify locally

```bash
pnpm install        # generates pnpm-lock.yaml; installs workspace deps
pnpm typecheck      # @jet/shared and @jet/config must pass clean
pnpm test           # passes (no tests yet — the gate is wired and green)
```

If `pnpm typecheck` is green, the contract spine is sound and you're ready to push.

---

## Phase 3 — Create the GitHub repo and push

```bash
git init -b main
git add -A
git commit -m "chore: scaffold monorepo + @jet/shared contracts + guardrails"

# Option A — GitHub CLI (one command, creates + pushes):
gh auth login                 # if you haven't already
gh repo create jet-prediction-market --private --source=. --remote=origin --push

# Option B — manually: create an empty repo on github.com, then:
# git remote add origin git@github.com:<you>/jet-prediction-market.git
# git push -u origin main
```

Open the repo's **Actions** tab — the CI workflow (`.github/workflows/ci.yml`)
should run `typecheck` + `test` and go green.

---

## Phase 4 — Wire up Claude Code on the repo

From inside the repo:

```bash
claude                        # launches Claude Code in this directory
```

Then inside Claude Code:

```
/install-github-app
```

Follow the prompts — it installs the GitHub app and helps add the
`ANTHROPIC_API_KEY` secret to your repo. (Or set it yourself:)

```bash
gh secret set ANTHROPIC_API_KEY   # paste your key when prompted
```

This lets you mention `@claude` on issues/PRs to have it implement or review.
Reviews default to Sonnet; to use Opus for reviews, set the model to
`claude-opus-4-7` in the generated workflow.

> Optional: add an automated PR-review workflow `.github/workflows/claude-review.yml`:
> ```yaml
> name: Claude Review
> on: { pull_request: { types: [opened, synchronize] } }
> jobs:
>   review:
>     runs-on: ubuntu-latest
>     steps:
>       - uses: anthropics/claude-code-action@v1
>         with:
>           anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
>           prompt: "/review"
> ```

---

## Phase 5 — The guardrails (already in the repo)

These are what keep multiple agents/models coordinated:

- **`CLAUDE.md`** — the non-negotiable rules every agent follows (no floats,
  contracts-first, server-authoritative, the locked RAMP_V1 decisions). Claude
  Code reads this automatically on every invocation.
- **`.github/workflows/ci.yml`** — the hard gate: every PR must pass
  `typecheck` + `test`. This is your real cross-check (objective, not opinion).
- **`CONTRIBUTING.md`** — branch-per-package + PR flow.
- **`TICKETS.md`** — the work, broken into ordered, package-scoped units.
- **`BUILD_PLAN.md`** — the full design rationale.

For agents that aren't Claude (e.g. Codex), paste the contents of `CLAUDE.md`
into their context — the rules are tool-agnostic.

---

## Phase 6 — Build it, ticket by ticket

Turn `TICKETS.md` into GitHub issues, then work them in order:

```bash
# example for the first ticket
git checkout -b feat/api-thin-slice
# ...assign the work to an agent (Claude Code, Codex, etc.) or write it yourself,
#    building strictly against @jet/shared...
git push -u origin feat/api-thin-slice
gh pr create --fill
# CI must go green; optionally comment "@claude review" on the PR; then merge.
```

Suggested model assignment:
- **Opus 4.7** → the oracle (T6, T9) and PR reviews — the judgment-heavy parts.
- **Sonnet 4.6** → CLOB, settlement, api plumbing, bots (T2–T5, T7).
- **Anything** → frontend (T1, T8), with the frontend-design skill in mind.

**Start with T1 (the thin vertical slice).** Getting a live, ticking,
self-resolving market on screen over WebSocket on day one de-risks the
highest-graded "real-time feel" before you deepen the CLOB or the oracle.

---

## Phase 7 — Stay the integrator

You own `main`, the merges, the design doc, and the through-line. This is a work
trial: Jet is judging *your* judgment, and you'll defend the tradeoffs (the
oracle especially) in the writeup. So:

- Never let an agent merge unreviewed — green CI is necessary, not sufficient.
- Keep `CLAUDE.md` and `BUILD_PLAN.md` updated as decisions evolve.
- If two agents/models disagree, you decide — don't let them thrash.

---

## Quick reference

| Thing | Command / location |
|---|---|
| Install deps | `pnpm install` |
| Type-check all | `pnpm typecheck` |
| Test all | `pnpm test` |
| Launch agent | `claude` |
| Wire GitHub app | `/install-github-app` (inside Claude Code) |
| The rules | `CLAUDE.md` |
| The gate | `.github/workflows/ci.yml` |
| The work | `TICKETS.md` |
| The plan | `BUILD_PLAN.md` |
