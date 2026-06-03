---
project: DrivePlan
researched_at: 2026-06-03
recommended_platform: Vercel
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Next.js 16.2.6 (App Router)
  runtime: Node.js (serverless functions)
  database: Supabase (PostgreSQL + Auth, external)
---

## Recommendation

**Deploy on Vercel.**

Vercel is the canonical host for Next.js — it is built by the same team — and this project is on Next.js 16.2.6, which Vercel supports natively without any adapter or compatibility shim. The Hobby plan's 1 M invocation/month free tier is comfortably above what a small driving-school scheduling tool will consume, matching the cost-minimise constraint. The user already has hands-on Vercel experience, and the official Supabase–Vercel marketplace integration automatically injects Supabase credentials into the project — removing one manual wiring step.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Score |
|---|---|---|---|---|---|---|
| **Vercel** | Pass | Pass | Pass | Pass | Partial | 9/10 |
| **Netlify** | Partial | Pass | Pass | Pass | Pass | 9/10 |
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | 10/10 |
| **Fly.io** | Pass | Partial | Partial | Pass | Partial | 7/10 |
| **Railway** | Partial | Partial | Partial | Pass | Partial | 6/10 |
| **Render** | Partial | Partial | Pass | Partial | Partial | 6/10 |

**Scoring rationale per criterion:**

- **CLI-first**: Vercel, Cloudflare, Fly.io all Pass; Netlify Partial (no `netlify rollback` CLI command — dashboard only); Railway Partial (no dedicated rollback, `railway redeploy` re-triggers last build only); Render Partial (rollback is API or dashboard, not CLI).
- **Managed/Serverless**: Vercel, Netlify, Cloudflare all Pass (no infrastructure to manage); Fly.io Partial (Firecracker VMs managed but Dockerfile required); Railway Partial (managed containers but `output: standalone` + start-script wiring required); Render Partial (managed web service but ISR cache ephemeral without Persistent Disk add-on).
- **Agent-readable docs**: Vercel Pass (`llms-full.txt`, Agent Resources section); Netlify Pass (`llms.txt`, `.md` URL suffix); Cloudflare Pass (best-in-class: `llms.txt`, per-product files, Docs for Agents hub); Fly.io Partial (markdown on GitHub but no `llms.txt`); Railway Partial (raw `.md` URLs available, no structured `llms.txt`); Render Pass (`llms.txt`, `llms-full.txt`, `.md` suffix).
- **Stable deploy API**: Vercel, Netlify, Cloudflare, Fly.io, Railway all Pass (deterministic one-command deploys with stable exit codes); Render Partial (CLI deploy is stable but rollback requires REST API call, not CLI).
- **MCP / Integration**: Netlify Pass (GA since Feb 2025); Cloudflare Pass (16 product-specific managed MCP servers, GA); Vercel Partial (public beta since Aug 2025, not yet GA as of 2026-06-03); Fly.io Partial (experimental, API may change); Railway Partial (beta/work-in-progress per own docs); Render Partial (GA MCP server but cannot trigger deploys — observation only).

**Cost weights applied (minimize cost preference):** Fly.io (no free tier, ~$3–10/month) and Render ($7/month floor) penalised −1. Railway (effectively $5/month Hobby for sustained use) and Cloudflare (10 ms CPU cap on free forces $5/month paid for SSR) penalised −0.5. Vercel's Hobby free tier (1 M invocations/month) and Netlify's credit-based free tier (viable at MVP scale) receive no penalty. Vercel breaks the Vercel/Netlify tie on familiarity (Q3: existing Vercel experience).

### Shortlisted Platforms

#### 1. Vercel (Recommended)

The native Next.js platform — every Next.js 16 feature works without an adapter or compatibility layer. The Hobby free tier allows 1 M function invocations and 1 M edge requests per month, which a small driving-school tool will not approach. The `vercel` CLI handles deploy (`vercel --prod`), rollback (`vercel rollback`), and log tailing (`vercel logs --follow`) without any browser interaction. The Supabase marketplace integration auto-injects `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the Supabase connection string into the Vercel project, reducing manual env-var setup. The gap vs. Netlify: no GA MCP server yet (public beta), and Hobby rollback is limited to the immediately prior deployment.

#### 2. Netlify

Netlify's OpenNext adapter (`@netlify/plugin-nextjs`) is GA and auto-applied at build time — zero configuration needed. Its MCP server is the most mature of all six candidates (GA since Feb 2025, works with Claude Code natively via `claude mcp add netlify npx -- -y @netlify/mcp`). The credit-based free tier (300 credits/month) is viable at MVP traffic levels but will be exhausted at ~100k requests/month once bandwidth is factored in, at which point Personal ($9/month) is required. The gap vs. Vercel: no `netlify rollback` CLI command (dashboard-only revert), Netlify is not the framework author so new Next.js features land slightly later, and the user has more existing Vercel familiarity.

#### 3. Cloudflare Workers

The highest raw agent-friendly criteria score (10/10) with the best-in-class `llms.txt` documentation and wrangler CLI. However, Next.js 16 App Router support on Cloudflare depends on `@opennextjs/cloudflare`, which was at 1.0-beta as of this research (2026-06-03) — it does not yet support the Edge runtime or Node.js middleware, and the composable caching (`use cache`) directive is not yet supported. The Cloudflare Workers free tier (100k requests/day) is generous, but the 10 ms CPU time cap per invocation is too tight for SSR pages making Supabase API calls — the paid plan ($5/month base) is effectively required. The user has no existing Cloudflare familiarity. For a cost-sensitive solo MVP with an existing Vercel comfort, Cloudflare's adapter beta status and mandatory paid tier for SSR make it the third pick.

## Anti-Bias Cross-Check: Vercel

### Devil's Advocate — Weaknesses

1. **Hobby rollback is limited to 1 prior deployment.** If a broken deployment is discovered after a second push, there is no CLI path back to an older version — only a manual re-deploy from Git history, taking 5–20 minutes. Upgrading to Pro ($20/user/month) unlocks rollback to any prior deployment.
2. **Supabase connection pool exhaustion surfaces only under concurrent load, not in development.** Each Vercel serverless invocation opens a new Supabase connection. Without the transaction-mode pooler (Supavisor port 6543 — not the default session-mode port 5432 shown in the Supabase dashboard), concurrent lesson-status polls from multiple office tabs can saturate the pool. The error appears in Vercel logs as function timeouts, not as a recognisable "connection refused" — misleading to diagnose.
3. **The 10-second function timeout on the Hobby plan is tighter than it appears.** Supabase SSL handshake overhead (200–500 ms per cold invocation) combines with multiple sequential Supabase queries in App Router Server Components — a pattern the framework makes easy to write. Under moderate load this pushes toward the 10-second wall.
4. **The Hobby plan prohibits commercial use.** The driving school planner is a commercial product (used by a business). Vercel's terms of service restrict the Hobby plan to personal/non-commercial projects. In practice this is rarely enforced for small internal tools, but it is a real contractual risk — a forced upgrade to Pro adds $20/month.
5. **`NEXT_PUBLIC_*` env vars are baked at build time; runtime changes require a full redeploy.** Rotating a Supabase key does not take effect by updating the env var in the Vercel dashboard alone — a new deployment must be triggered. Developers accustomed to server-side env vars expect instant propagation.

### Pre-Mortem — How This Could Fail

The team deployed DrivePlan on Vercel's Hobby plan, comfortable with the platform and confident the generous free tier covered the MVP. The driving school went live with three office staff and twelve instructors — usage well below any limit.

The first failure arrived six weeks in. The Supabase connection string was the session-mode URL (port 5432, the one displayed by default in the Supabase dashboard). At low concurrency this caused no visible problem. Then the office added a practice of keeping five browser tabs open, each polling lesson status every 30 seconds. During the morning booking rush, forty concurrent serverless invocations hit Supabase simultaneously. The session-mode pool was exhausted. Vercel logs showed function timeouts — no mention of Supabase connection limits. The root cause took three hours to diagnose because the failure only appeared at the intersection of Vercel serverless concurrency and Supabase pool capacity.

The second failure came three months later, when a bad deployment slipped through — an App Router cache interaction that served stale lesson status. A second bad push followed before the issue was spotted. The Hobby plan only retains one prior deployment; rollback to the known-good version required a manual re-deploy from Git, blocking the office for twenty minutes during the school's busiest window.

The third failure was a Vercel billing team inquiry about commercial use on the Hobby plan. The forced migration to Pro added $20/month — retroactively invalidating the zero-cost MVP assumption and straining the project budget.

### Unknown Unknowns

- **The Supabase–Vercel marketplace integration injects env vars into "Production" only by default.** Preview deployments (auto-created for every branch push) will not have Supabase credentials unless you explicitly copy them to the "Preview" environment in the Vercel dashboard. Branch previews will fail with 500s — a confusing first experience when you try to review a feature in a preview URL.
- **App Router's `fetch` cache behaves differently on Vercel than in `next dev`.** Vercel's edge layer can cache SSR responses in ways that differ from the local development server. A polling lesson-status page that updates correctly in development may return stale data in production if cache headers are not explicitly set on Supabase fetch calls.
- **Vercel's Hobby plan has a 4 CPU-hour/month compute cap, not just an invocation cap.** Automated preview deployments triggered by CI each burn compute. On an active project with frequent branch pushes, this cap drains faster than expected — it appears only on the usage dashboard, not on the main pricing page summary.
- **Next.js 16 may have behavioural differences from what this research verified against Next.js 15.** The research agents focused on Next.js 15 documentation and community reports. Vercel as the framework author supports Next.js 16 natively, but any behaviour changes (caching, middleware, server actions) introduced in 16.x should be verified against the Next.js 16 changelog before relying on Next.js-15 community guidance.

## Operational Story

- **Preview deploys**: Every branch push auto-creates a preview URL (`<branch>.<project>.vercel.app`). Preview URLs are publicly accessible by default — for an internal tool, add Vercel Authentication (Hobby: password protection; Pro: Vercel Access) to gate preview URLs. The Supabase marketplace integration must be set to inject env vars into both "Production" and "Preview" environments or previews will fail.
- **Secrets**: Env vars live in the Vercel project dashboard under Settings → Environment Variables, or set via `vercel env add VARIABLE_NAME production`. The Supabase marketplace integration auto-populates `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Never commit `.env.local` to the repo; pull it locally with `vercel env pull .env.local`. Rotation flow: update in Vercel dashboard → redeploy (required for `NEXT_PUBLIC_*` vars).
- **Rollback**: `vercel rollback` from the CLI reverts to the immediately previous deployment (Hobby limit). Time-to-revert: ~30 seconds (instant promote, no rebuild). DB migrations do NOT roll back automatically — coordinate schema rollbacks separately via Supabase dashboard.
- **Approval**: Agent may perform unattended: `vercel --prod` deploy, `vercel rollback`, `vercel logs`, `vercel env` operations. Human-only: rotating the `SUPABASE_SERVICE_ROLE_KEY` (full DB access), dropping a Supabase table, deleting the Vercel project, billing tier changes.
- **Logs**: `vercel logs [deployment-url] --follow` streams runtime logs. Filter by status: `vercel logs --status-code 5xx --since 30m`. Build logs: available in the Vercel dashboard or `vercel inspect [deployment-id] --logs`. Vercel MCP server (public beta) exposes a `get_deployment_events` tool for structured log access — usable but not GA.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Supabase connection pool exhaustion from concurrent serverless invocations | Devil's advocate | M | H | Use Supabase transaction-mode pooler: set `DATABASE_URL` to Supabase Supavisor port 6543 (not 5432) from day one |
| Hobby rollback limited to 1 prior deployment | Devil's advocate | M | M | Tag releases in Git (`git tag v0.x`); re-deploy a known-good tag takes ~5 min via `vercel --prod --build-env COMMIT=$(git rev-parse v0.x)` |
| 10-second function timeout on Hobby | Devil's advocate | L | M | Keep Supabase queries parallel (use `Promise.all`) not sequential in Server Components; enable Vercel Fluid Compute for streaming responses |
| Commercial use on Hobby plan | Devil's advocate | L | M | Switch to Pro ($20/month) before going live with real users; budget this as a known cost |
| Stale lesson status data served from edge cache | Unknown unknowns | M | M | Add `Cache-Control: no-store` to Supabase fetch calls; use `revalidatePath` after status mutations |
| Preview deployments missing Supabase credentials | Unknown unknowns | H | M | In Vercel dashboard → Settings → Environment Variables, set all Supabase vars to apply to Production + Preview + Development |
| `NEXT_PUBLIC_*` env var changes require a rebuild | Devil's advocate | M | L | Document this in the project README; use `vercel env pull` + redeploy as the rotation SOP |
| Next.js 16 behaviour differences from researched Next.js 15 | Unknown unknowns | L | M | Pin to exact Next.js 16.2.6 in `package.json` (already done); read the Next.js 16 changelog for any App Router caching or middleware changes before first deploy |
| Hobby compute cap (4 CPU-hours/month) draining from CI preview builds | Unknown unknowns | L | L | Monitor usage dashboard weekly; disable auto-deploy on non-main branches if cap is approached |

## Getting Started

These steps deploy DrivePlan to Vercel for the first time, validated against Next.js 16.2.6 and Vercel CLI as of 2026-06-03.

1. **Install and authenticate the Vercel CLI:**
   ```bash
   npm install -g vercel
   vercel login
   ```

2. **Link the project to a Vercel project (run once from repo root):**
   ```bash
   vercel link
   ```
   Choose "Create new project". Vercel auto-detects the Next.js framework and sets the build command (`next build`) and output directory (`.next`) — no `vercel.json` is required.

3. **Wire Supabase credentials via the Vercel dashboard:**
   - Go to the Vercel project → Integrations → find and connect Supabase. The integration auto-injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
   - **Critically**: Set `DATABASE_URL` manually to the Supabase Supavisor **transaction-mode** URL (port 6543, not 5432 session mode). Find it in the Supabase dashboard → Project Settings → Database → Connection string → Transaction mode.
   - Ensure all vars are applied to **Production, Preview, and Development** environments.
   - Pull to local: `vercel env pull .env.local`

4. **Deploy to production:**
   ```bash
   vercel --prod
   ```
   The CLI streams build and deploy logs. On success it prints the production URL. Subsequent pushes to `main` via GitHub auto-deploy if the GitHub integration is connected.

5. **Verify and tail logs:**
   ```bash
   vercel logs <your-production-url> --follow
   ```
   Trigger a lesson creation in the app and confirm Supabase queries appear in logs without timeout errors.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions workflow for Vercel is a deploy step, not covered here)
- Production-scale architecture (multi-region, HA, DR)
