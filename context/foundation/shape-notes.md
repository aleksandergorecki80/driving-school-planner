---
project: "DrivePlan"
context_type: brownfield
created: 2026-07-04
updated: 2026-07-04
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 12
  gray_areas_resolved:
    - topic: "change category"
      decision: "architectural improvement — redesigns the S-02 access model (instructor token) before any S-02 code exists"
    - topic: "email notification scope"
      decision: "single-purpose: deliver the one-time lesson link only. No reminders, no confirmation emails, no broader notification system in MVP"
    - topic: "token generation trigger"
      decision: "automatic — generated the moment office creates a lesson (status pending); no separate 'send to instructor' action"
    - topic: "resend / lost link"
      decision: "office can manually regenerate a token for a lesson, invalidating the previous one and triggering a new email"
    - topic: "blast radius"
      decision: "primary risk is email delivery/token validation failure (instructor stuck, office falls back to phone) — not breakage of the existing office lesson-management flow"
    - topic: "timeline"
      decision: "3 weeks after-hours — narrow scope (token generation, email send, one instructor page, invalidation) fits without acknowledgment gate"
    - topic: "legacy schema"
      decision: "instructors.token column and get_instructor_lessons() RPC (unused, never-shipped S-02 design) are removed as part of this change"
    - topic: "hard deadline"
      decision: "none — only the 3-week after-hours budget applies"
  quality_check_status: accepted
---

## Current System

DrivePlan MVP. S-01 (office books a lesson) is implemented and live: office logs in, filters instructors by licence category, picks a time slot, attaches a student, and creates a lesson with status "pending" — server-side guards enforce category-coherence and reject double-booking (instructor or student) regardless of what the UI submitted.

S-02 (instructor responds to a lesson) is proposed in the roadmap but has no implementation yet. The roadmap's original design: a permanent, non-expiring URL token per instructor (`instructors.token`, uuid, unique, generated at instructor creation) resolving via a `get_instructor_lessons(token)` DB function to that instructor's full list of pending/confirmed lessons. No email/notification delivery mechanism exists anywhere in the system today.

**Tech stack:** Next.js 16 App Router, Supabase (Postgres + Auth), Tailwind CSS v4, deployed to Vercel.

**Users today:** Office staff (one shared login, Supabase Auth session). Instructor (secondary persona — would use the permanent token link once S-02 ships). Student — no direct app access at any point.

**Pain / gap driving this change:** A permanent, non-expiring token embedded in a bookmarked URL is a standing security liability — if the link is ever forwarded, cached, or screenshotted, it grants indefinite access to that instructor's entire schedule. Separately, without a persistent bookmarkable link there is no way for an instructor to reach a lesson at all unless the link is delivered to them somehow — the original PRD ruled out email/SMS notifications as a non-goal under the assumption of a permanent link; that assumption no longer holds.

**Must preserve:** Everything on the office side is unaffected — calendar view, lesson creation flow (category → instructor → time → student, with the existing server-side coherence/overlap guards), lesson deletion/cancellation, office login and session gating (`proxy.ts`). The `instructors`/`students`/`lessons` schema and RLS approach stay as-is; only the instructor-side access mechanism for S-02 is being redesigned before it's built.

## Vision & Problem Statement

S-02 has not been implemented yet — this reshapes its access model before any code is written. The roadmap's original design (one permanent link per instructor, listing all their lessons) is replaced with a one-time link per lesson (a single-use token scoped to exactly one booking) that shows only that lesson's details. This removes a long-lived credential in favor of an ephemeral, single-use one, and makes a minimal, single-purpose email notification a required MVP capability — the instructor now needs a way to receive a fresh link every time a lesson needs their response, since there is no more permanent bookmark.

> Forward note (not MVP): the user's stated long-term direction is to replace this email-link flow with a dedicated instructor mobile app using push notifications. Out of scope for this change; captured for the technical roadmap, not as an FR.

## User & Persona

**Primary persona: Office staff (biuro)** — unchanged from the original shaping. One shared account, full access to instructor calendars and lesson management.

**Secondary persona: Instructor (instruktor)** — redefined for this change. No persistent access point of any kind. Each time a lesson is created (or otherwise needs their response), the instructor receives an email containing a one-time link scoped to exactly that lesson. Opening the link shows only that single lesson's details (date, time, student, …) with Approve/Reject actions. The link is consumed (invalidated) once a decision is made. The instructor cannot browse any other lesson, past or future, from this link.

## Access Control

**Office role** — unchanged. One shared account (email + password, Supabase Auth); session gates all `/office` routes. Full access: view instructor calendars, create/cancel lessons, filter by category. Can manually trigger a new token for a lesson (invalidating any prior one) if the instructor's link is lost or the response window has passed.

**Instructor role** — redesigned. No login, no persistent link. A one-time token is generated automatically the moment a lesson is created (status "pending") and emailed to the instructor. The token scopes access to exactly one lesson — approve/reject only, no visibility into any other lesson. The token is invalidated the instant a decision (approve or reject) is recorded; a consumed or superseded (manually regenerated) token no longer resolves to anything.

**Unauthenticated** — unchanged. Any request without a valid office session or a valid, unconsumed lesson token is rejected.

Role separation stays flat: two roles, no sub-roles or admin tiers.

## Success Criteria

### Primary
- Office creates a lesson → a unique one-time token is generated → instructor receives an email with the link → instructor opens it, sees that single lesson's details, approves or rejects (reject optionally with a reason, and optionally picking from AI-suggested candidates) → lesson status updates in the database → the token is invalidated and cannot be reused. Office can manually regenerate a token (invalidating the prior one) if the instructor needs a new link.

### Secondary
- After the instructor submits a decision, the page shows a clear confirmation ("Thanks, your response has been recorded") instead of a blank or error screen.

### Guardrails
- Existing office-side behavior is unaffected: calendar view, lesson creation (category-coherence + double-booking guards), lesson cancellation, office login/session gating all continue to work exactly as today.
- Status changes remain visible to the office via the existing polling refresh (no manual reload) — this change does not alter that mechanism.

## Functional Requirements

### Instructor lesson response (new access model)
- FR-001: System generates a unique, one-time token for a lesson the moment the office creates it (status "pending"). Priority: must-have. Change: new
  > Socratic: Counter-argument considered: immediate token/email issuance means a mistaken lesson (wrong student/time) notifies the instructor before office can correct it. Resolution: kept automatic. Risk accepted — office corrects the lesson and manually regenerates the token (FR-007) to resend.
- FR-002: System emails the instructor a link containing that lesson's one-time token. Priority: must-have. Change: new
  > Socratic: Counter-argument considered: silent email delivery failure leaves office with no signal the instructor was never notified — there's no persistent link as fallback. Resolution: accepted for MVP. Small volume; office notices via instructor non-response and manually resends (FR-007). No delivery-status tracking in MVP.
- FR-003: Instructor opens the link and sees only that single lesson's details (date, time, student) — no list of other lessons. Priority: must-have. Change: new
  > Socratic: Counter-argument considered: an instructor with several pending lessons receives several separate emails/links instead of one consolidated view. Resolution: kept as written — mirrors today's one-call-per-lesson phone/SMS model; consolidating would reintroduce the list-view design this change deliberately replaces.
- FR-004: Instructor can approve a pending lesson via the link, with a lightweight confirmation step ("Are you sure?") before the decision is finalized. Priority: must-have. Change: modified (capability existed in the original PRD as FR-007 under a permanent-token list view; now scoped to a single-lesson one-time link, plus a confirm step)
  > Socratic: Counter-argument considered: no undo once the token is invalidated — an accidental tap on a mobile screen permanently approves a lesson. Resolution: added a lightweight in-page confirmation step before the decision is submitted, at minimal UI cost.
- FR-005: Instructor can reject a pending lesson via the link, optionally providing a reason (free text). Priority: must-have. Change: modified (was FR-008 under the permanent-token design; reason is now optional rather than required)
  > Socratic: Counter-argument considered: a forced reason field on a mobile browser adds friction and may produce a junk answer just to pass the form. Resolution: made the reason field optional — instructor can reject with or without a reason.
- FR-006: The token is invalidated only after the lesson's status update is confirmed written to the database; a consumed token cannot be reused to view or act on the lesson again. Priority: must-have. Change: new
  > Socratic: Counter-argument considered: invalidating the token before the DB write is confirmed could strand the instructor on a "success" page while the actual status change silently failed. Resolution: reordered — the status write must succeed before the token is invalidated.
- FR-007: Office can manually regenerate a lesson's token, invalidating the previous one and triggering a new email to the instructor. Priority: must-have. Change: new
  > Socratic: Counter-argument considered: this is a rare edge case — building a dedicated UI for it may not be worth the cost inside a 3-week budget. Resolution: kept as written. A lesson with a lost/broken link and no repair path is worse than a small UI cost.
- FR-008: After submitting a decision, the instructor sees a confirmation message on the page. Priority: nice-to-have. Change: new
  > Socratic: No counter-argument considered; stands as written. Nice-to-have, built if time allows within the 3-week budget.
- FR-012: When the instructor opens the reject flow, the system generates up to 5 candidate rejection reasons contextual to that lesson (date, time, category); the instructor may pick one, ignore them and type free text instead, or submit with no reason at all. If the suggestion generation is slow or fails, the reject flow degrades to the free-text/no-reason path without blocking the instructor's decision. Priority: must-have. Change: new
  > Socratic: Counter-argument considered: this reject flow is reached by an unauthenticated instructor on a one-time token — a dependency on an external AI call with no fallback could strand them unable to submit a decision if that call is slow or fails. Resolution: kept must-have, but the FR now explicitly requires graceful degradation — suggestion generation failing or being slow never blocks submitting a rejection (with free text or no reason).

### Preserved (office side, unaffected by this change)
- FR-009: Office can create, view, filter, and cancel lessons via the existing calendar flow, including server-side category-coherence and double-booking guards; cancelling a lesson also invalidates any outstanding token for it. Priority: must-have. Change: preserved + modified (cancellation gains a new token-invalidation side effect)
  > Socratic: Counter-argument considered: cancelling a lesson that already has an active token would otherwise leave a live link pointing at a cancelled lesson. Resolution: cancellation now explicitly invalidates the lesson's token, same as an approve/reject decision does.
- FR-010: Office login and session gating for all `/office` routes remains unchanged. Priority: must-have. Change: preserved
  > Socratic: Counter-argument considered: risk that office-session gating could accidentally be extended to cover the new per-lesson instructor links. Resolution: kept as written — explicitly confirmed as a scope boundary: `/office` session gating and instructor lesson-token access are and remain two separate access paths.
- FR-011: Office sees lesson status changes on the existing polling refresh, without manual reload. Priority: must-have. Change: preserved
  > Socratic: Counter-argument considered: the existing poll query's behavior with status changes written via the new token-based approve/reject path isn't automatically guaranteed — it needs verification, not just an assumption of "no change needed". Resolution: kept as a preserved FR, but flagged as an implementation-time verification item, not a new capability.

## Business Logic

Existing rule (unchanged by this change): a lesson can only be created when the selected instructor holds the licence category of that lesson.

New rule (added by this change): a lesson token authorizes exactly one decision — approve or reject — on exactly one lesson, and becomes permanently invalid the instant that lesson's status changes, whether through the instructor's own decision or the office cancelling the lesson.

The rule consumes two user-facing inputs: the token presented via the emailed link, and the current status of the lesson it references. Its output is binary: either access to that single lesson's decision screen (token valid, lesson still pending), or an "this link is no longer valid" state (token already consumed, superseded by a office-triggered resend, or the lesson's status already changed by another means). The instructor encounters this passively — clicking an old or reused link simply stops working, rather than surfacing a confusing or stale lesson state.

Second new rule (added by this change): when an instructor is about to reject a lesson, the system proposes up to 5 candidate reasons tailored to that lesson's context (date, time, category) — a recommendation the instructor may accept, ignore, or override with free text. This recommendation never gates submission: a failed or slow suggestion never blocks the instructor from completing the rejection.

## Non-Functional Requirements

- The instructor view is usable on a mobile browser without horizontal scrolling or pinch-zoom — instructors open the link on a phone. (unchanged from original PRD)
- Any operation that takes longer than two seconds shows continuous visible progress; no silent waits or blank screens. (unchanged from original PRD)
- A lesson token must be practically unguessable — possessing one valid token must not make any other lesson's token discoverable or predictable.
- Email delivery has no hard SLA in MVP — best-effort, relying on the standard delivery time of whatever email service is chosen downstream.

## Constraints & Preserved Behavior

- The unused `instructors.token` column and `get_instructor_lessons(token)` DB function (schema from the original, never-implemented S-02 design) can be removed as part of this change — no production data or working feature depends on them.
- No backward-compatibility burden on the instructor side: since S-02 was never shipped, there is no existing instructor-facing behavior to preserve.
- Office-side data contracts must not change: the existing `lessons`/`instructors`/`students` schema, and the existing server actions for creating/cancelling lessons (including the category-coherence and double-booking guards), keep their current behavior. This change only adds new logic for the per-lesson token lifecycle.
- Existing deployment setup (Vercel) is unaffected. Sending email requires a new third-party service/credential — which service is a downstream stack decision, not a PRD concern.

## Non-Goals

- No dedicated instructor mobile app — this change stays email + browser page; a native app with push notifications is a future iteration, not part of this change.
- No SMS as a link-delivery channel — email only in this change's MVP.
- No token time-to-live (TTL) — a token doesn't expire on its own; only consumption (a recorded decision) or office-triggered regeneration/cancellation invalidates it.

## Quality cross-check

Run on 2026-07-04. All 6 brownfield elements present:

- Access Control: present — instructor model fully redefined (per-lesson one-time token)
- Business Logic: present — one-sentence new rule stated (token lifecycle) plus the unchanged existing rule
- Project artifacts: present — this file, valid checkpoint
- Timeline-cost ack: present — 3-week estimate, ≤ 3 weeks, no acknowledgment gate needed
- Non-Goals: present — 3 entries
- Preserved behavior: present — `## Constraints & Preserved Behavior` names office-side data contracts and the legacy-schema removal explicitly

No gaps. Status: accepted.

## User Stories

### US-01: Instructor responds to a lesson via a one-time email link

- **Given** the office has created a pending lesson assigned to an instructor
- **When** the system generates a one-time token and emails the instructor a link, the instructor opens it and clicks Approve (with a confirmation step) or Reject (optionally with a reason, freely typed or picked from AI-suggested candidates)
- **Then** the lesson's status updates in the database, the token is invalidated so the link no longer works, and the office sees the new status on the next poll cycle

#### Acceptance Criteria
- Opening the link exposes only that one lesson's details — no access to any other lesson, past or future
- A token cannot be reused after a decision has been recorded, after the office has cancelled the lesson, or after the office has manually regenerated it
- Rejecting does not require a reason; if the instructor provides one (typed or selected from an AI-suggested candidate), the office sees it alongside the status change
- A failed or slow AI reason-suggestion call never blocks the instructor from submitting a rejection
- If the office manually regenerates the token, the previous link stops working and a new email is sent
