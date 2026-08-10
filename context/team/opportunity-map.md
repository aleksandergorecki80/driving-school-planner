# Opportunity Map

## Context

- **Project / context**: 10xDevs Module 5 (AI Internal Builders), first useful-version exploration. Signals drawn from the author's own dev workflow across course repos (`driving-school-planner`, `tldraw`) and `~/.claude`. Real target later: Ottobock team.
- **Data constraint**: mock / local / read-only / non-sensitive — first version runs on prepared JSON/CSV exports, not live company data.
- **Date**: 2026-08-10

## Map

| Signal | Existing / default response | Thin complement | First useful version | Data risk | Direction if valuable |
|---|---|---|---|---|---|
| **A. AI artifacts copied by hand** — prompts + skills copied between repos (`m4l*`/`m5l*`, `~/.claude`); no single source of truth; globals don't auto-update | `skills.sh` (`npx skills add`), git submodule/subtree, npm package, wiki — exist but unused; done manually | One registry repo for AI artifacts + a sync command (`10x-sync-global`) | Repo/folder + copy script, manual install in one project | mock/local | Shared artifact registry → **M5L4** (10xChampion track B) |
| **B. Document ↔ code drift** — PRD/plan claims X, code does Y (e.g. FR-013) | No native tool; **`/10x-research` / domain distillation already surfaces it on demand** | Check listing PRD claims with no code reference — but semantic, LLM-dependent, unreliable | Report of drifts ≈ what distillation already produces | mock/local | **Wait / no build** — mostly covered by `/10x-research`; weak value-to-reliability |
| **C. Board ↔ plan.md drift + unclear PR/MR merge status** *(selected)* | GitHub Projects automates board↔issue/PR, but **NOT board↔`plan.md`** (markdown is invisible to it) — real gap | Read-only digest: read Progress from `plan.md` + query GitHub/GitLab for PR/MR status → flag drifts | Script reading `plan.md` + GitHub export/API → Markdown digest; fully mockable | mock/local | Internal tool / status digest → **M5L2/L3** (10xChampion track A) |

## Recommended First Candidate

```text
Helper:
plan-status-digest (working name)

Reads:
- context/changes/<id>/plan.md — Progress section (- [ ] / - [x] checkboxes)
- GitHub (or GitLab) export/API: PR/MR status, age, merged?
- (mock first: prepared JSON/CSV instead of live API)

Returns:
Short Markdown digest of drifts, e.g.:
- "plan: phase 2 marked done — no merged PR"
- "PR #14 open 3 days, no review"
- "MR merged, but plan.md checkbox still empty"
+ a "To do today" section

Does not do (intentionally):
- does not write back to plan or board (read-only)
- does not replace GitHub Projects / the board
- no login, DB, deployment, or scheduling
- does not decide who is right (plan vs board) — only shows the drift

Data risk:
mock / local / read-only — starts on prepared exports, no live company data

Direction if it proves valuable:
Internal tool → status digest / team agent (M5L2), then review/CI gate (M5L3) = 10xChampion track A
```

## Why This Candidate

Chosen over A and B because it is the most canonical *complement* per the lesson: its value comes from **joining three sources no single SaaS sees together** (`plan.md` + board + PR/MR). It resolves two of the five raw signals at once (#4 board drift + #5 MR merge status), GitHub does not natively bridge `plan.md`↔board, and it is mockable + read-only so it is cheap to validate and easy to throw away.

- **A (artifact registry)** — strong runner-up and *is* the M5L4 project, but leans toward "build" (single source of truth) rather than "complement", and joins fewer sources.
- **B (doc↔code drift)** — deferred as **wait**: semantic and unreliable as a thin helper, and `/10x-research` already surfaces it on demand.

## Next Direction If Valuable

Candidate C is narrow, has a clear first version, and runs on mock data → per the lesson, go **straight to building**: `/10x-new` → `/10x-research` → `/10x-plan` → `/10x-implement` (it maps onto the M5L2 "team agent" build). `/10x-mom-test` is optional here because the author is also the user of the tool; it becomes worthwhile if this is taken to the Ottobock team, where the manager/team should be interviewed first.

**Open item before the first *real* (non-mock) version:** confirm platform — GitHub vs GitLab (the raw signals mixed "board on GitHub" with "MR" = GitLab terminology). Irrelevant while on mock exports.
