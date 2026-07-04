---
project: "DrivePlan"
version: 2
status: draft
created: 2026-07-04
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Current System Overview

DrivePlan coordinates lesson scheduling between driving-school office staff and instructors, replacing phone/SMS coordination.

**Key architecture:** Server-rendered web app (Next.js App Router) with a managed backend (Supabase: Postgres + Auth), deployed on Vercel. No separate backend service.

**Tech stack:** Next.js 16 App Router, Supabase (Postgres + Auth), Tailwind CSS v4, deployed to Vercel.

**Current user base:** A single driving school. Office staff (one to three people, one shared login account) and instructors (secondary persona).

**Core functionality today:** Office logs in, filters instructors by licence category, picks a time slot, attaches a student, and creates a lesson with status "pending" — server-side guards enforce category-coherence and reject double-booking (instructor or student) regardless of what the UI submits. The instructor-facing half of the loop — viewing and responding to a lesson — is proposed in the roadmap (slice S-02) but has no implementation yet. The roadmap's originally-proposed design for that slice was a permanent, non-expiring URL token per instructor, resolving to that instructor's full list of pending/confirmed lessons. No email or other notification mechanism exists anywhere in the system today.

## Problem Statement & Motivation

S-02 has not been implemented yet — this document reshapes its access model before any code is written. The roadmap's original design (one permanent link per instructor, listing all their lessons) carries a standing security liability: if that link is ever forwarded, cached, or screenshotted, it grants indefinite access to that instructor's entire schedule.

This change is needed now, before S-02 implementation starts, because fixing the access model after the fact would mean rebuilding it. The trigger is a direct assessment of the original design's risk, not a reported incident — there is no current workaround because S-02's instructor-facing capability does not exist yet; coordination for lesson responses currently happens the same way it always has, outside the app (phone/SMS), at the cost the original PRD's Vision section already names (scheduling conflicts, wasted time, no durable record).

## User & Persona

**Primary persona: Office staff (biuro)** — unchanged by this change. One shared account, full access to instructor calendars and lesson management.

**Secondary persona: Instructor (instruktor)** — redefined by this change. No persistent access point of any kind. Each time a lesson is created (or otherwise needs their response), the instructor receives an email containing a one-time link scoped to exactly that lesson. Opening the link shows only that single lesson's details (date, time, student) with Approve/Reject actions. The link is consumed (invalidated) once a decision is made. The instructor cannot browse any other lesson, past or future, from this link.

## Success Criteria

### Primary
- Office creates a lesson → a unique one-time token is generated → instructor receives an email with the link → instructor opens it, sees that single lesson's details, approves (with a confirmation step) or rejects (optionally with a reason, freely typed or picked from an AI-suggested candidate) → lesson status updates in the database → the token is invalidated and cannot be reused. Office can manually regenerate a token (invalidating the prior one) if the instructor needs a new link.

### Secondary
- After the instructor submits a decision, the page shows a clear confirmation ("Thanks, your response has been recorded") instead of a blank or error screen.

### Guardrails
- Existing office-side behavior is unaffected: calendar view, lesson creation (category-coherence + double-booking guards), lesson cancellation, office login/session gating all continue to work exactly as today.
- Status changes remain visible to the office via the existing polling refresh (no manual reload) — this change does not alter that mechanism.
- A lesson token must be practically unguessable — possessing one valid token must not make any other lesson's token discoverable or predictable.

## User Stories

### US-01: Instructor responds to a lesson via a one-time email link

- **Given** the office has created a pending lesson assigned to an instructor
- **When** the system generates a one-time token and emails the instructor a link, the instructor opens it and clicks Approve (with a confirmation step) or Reject (optionally with a reason, freely typed or picked from AI-suggested candidates)
- **Then** the lesson's status updates in the database, the token is invalidated so the link no longer works, and the office sees the new status on the next poll cycle

Previously (under the roadmap's original, never-implemented design), the instructor would have used one permanent link to see a list of all their lessons and act on any of them from there. This story replaces that design entirely.

#### Acceptance Criteria
- Opening the link exposes only that one lesson's details — no access to any other lesson, past or future
- A token cannot be reused after a decision has been recorded, after the office has cancelled the lesson, or after the office has manually regenerated it
- Rejecting does not require a reason; if the instructor provides one (typed or selected from an AI-suggested candidate), the office sees it alongside the status change
- A failed or slow AI reason-suggestion call never blocks the instructor from submitting a rejection
- If the office manually regenerates the token, the previous link stops working and a new email is sent

## Scope of Change

### New
- **[new]** FR-001: System generates a unique, one-time token for a lesson the moment the office creates it (status "pending"). Priority: must-have.
  > Socratic: Counter-argument considered: immediate token/email issuance means a mistaken lesson (wrong student/time) notifies the instructor before office can correct it. Resolution: kept automatic. Risk accepted — office corrects the lesson and manually regenerates the token (FR-007) to resend.
- **[new]** FR-002: System emails the instructor a link containing that lesson's one-time token. Priority: must-have.
  > Socratic: Counter-argument considered: silent email delivery failure leaves office with no signal the instructor was never notified — there's no persistent link as fallback. Resolution: accepted for MVP. Small volume; office notices via instructor non-response and manually resends (FR-007). No delivery-status tracking in MVP.
- **[new]** FR-003: Instructor opens the link and sees only that single lesson's details (date, time, student) — no list of other lessons. Priority: must-have.
  > Socratic: Counter-argument considered: an instructor with several pending lessons receives several separate emails/links instead of one consolidated view. Resolution: kept as written — mirrors today's one-call-per-lesson phone/SMS model; consolidating would reintroduce the list-view design this change deliberately replaces.
- **[new]** FR-006: The token is invalidated only after the lesson's status update is confirmed written to the database; a consumed token cannot be reused to view or act on the lesson again. Priority: must-have.
  > Socratic: Counter-argument considered: invalidating the token before the DB write is confirmed could strand the instructor on a "success" page while the actual status change silently failed. Resolution: reordered — the status write must succeed before the token is invalidated.
- **[new]** FR-007: Office can manually regenerate a lesson's token, invalidating the previous one and triggering a new email to the instructor. Priority: must-have.
  > Socratic: Counter-argument considered: this is a rare edge case — building a dedicated UI for it may not be worth the cost inside a 3-week budget. Resolution: kept as written. A lesson with a lost/broken link and no repair path is worse than a small UI cost.
- **[new]** FR-008: After submitting a decision, the instructor sees a confirmation message on the page. Priority: nice-to-have.
  > Socratic: No counter-argument considered; stands as written. Nice-to-have, built if time allows within the 3-week budget.
- **[new]** FR-012: When the instructor opens the reject flow, the system generates up to 5 candidate rejection reasons contextual to that lesson (date, time, category only — never the student's name or any other student-identifying detail); the instructor may pick one, ignore them and type free text instead, or submit with no reason at all. If the suggestion generation is slow or fails, the reject flow degrades to the free-text/no-reason path without blocking the instructor's decision. Priority: must-have.
  > Socratic: Counter-argument considered: this reject flow is reached by an unauthenticated instructor on a one-time token — a dependency on an external AI call with no fallback could strand them unable to submit a decision if that call is slow or fails. Resolution: kept must-have, but the FR now explicitly requires graceful degradation — suggestion generation failing or being slow never blocks submitting a rejection (with free text or no reason). Separately resolved: the context fed into the suggestion excludes the student's name and any other student-identifying detail — only date, time, and category are used. Closes Open Question #2 below.
- **[new]** FR-013: Office can view and update an instructor's email address, which is where lesson notification links (FR-002) are delivered. Priority: must-have. Change: new — a narrow, explicit exception to the original PRD's "no in-app instructor profile management" non-goal; this change adds an editable email field, nothing else on the instructor profile.
  > Socratic: resolved directly by the user — email is a distinct field on the instructor record, editable/overwritable by the office. No counter-argument round run for this FR; it closes Open Question #1 below.

### Modified
- **[modified]** FR-004: Instructor can approve a pending lesson via the link, with a lightweight confirmation step ("Are you sure?") before the decision is finalized. Priority: must-have. Was: approve from a list view under a permanent instructor token, no confirmation step. Now: approve a single lesson reached via a one-time link, with a confirm step.
  > Socratic: Counter-argument considered: no undo once the token is invalidated — an accidental tap on a mobile screen permanently approves a lesson. Resolution: added a lightweight in-page confirmation step before the decision is submitted, at minimal UI cost.
- **[modified]** FR-005: Instructor can reject a pending lesson via the link, optionally providing a reason (free text). Priority: must-have. Was: rejection required a reason, under a permanent-token list view. Now: rejection reached via a one-time link, and the reason is optional.
  > Socratic: Counter-argument considered: a forced reason field on a mobile browser adds friction and may produce a junk answer just to pass the form. Resolution: made the reason field optional — instructor can reject with or without a reason.
- **[modified]** FR-009: Office can create, view, filter, and cancel lessons via the existing calendar flow, including the existing category-coherence and double-booking checks (enforced regardless of what the UI submits); cancelling a lesson also invalidates any outstanding token for it. Priority: must-have. Was: cancellation had no interaction with any instructor-facing access mechanism (none existed). Now: cancellation additionally invalidates the lesson's token, if one exists.
  > Socratic: Counter-argument considered: cancelling a lesson that already has an active token would otherwise leave a live link pointing at a cancelled lesson. Resolution: cancellation now explicitly invalidates the lesson's token, same as an approve/reject decision does.

### Removed
- **[removed]** The permanent, non-expiring per-instructor URL token and its list-view access model — never implemented in production, superseded entirely by the per-lesson one-time token design (FR-001–FR-003).

### Preserved
- **[preserved]** FR-010: Office login and session gating for all `/office` routes remains unchanged. Priority: must-have.
  > Socratic: Counter-argument considered: risk that office-session gating could accidentally be extended to cover the new per-lesson instructor links. Resolution: kept as written — explicitly confirmed as a scope boundary: `/office` session gating and instructor lesson-token access are and remain two separate access paths.
- **[preserved]** FR-011: Office sees lesson status changes on the existing polling refresh, without manual reload. Priority: must-have.
  > Socratic: Counter-argument considered: the existing poll query's behavior with status changes written via the new token-based approve/reject path isn't automatically guaranteed — it needs verification, not just an assumption of "no change needed". Resolution: kept as a preserved FR, but flagged as an implementation-time verification item, not a new capability.

## Constraints & Compatibility

**Backward compatibility requirements:** None on the instructor side — since the original S-02 design was never shipped, there is no live instructor-facing contract to preserve. On the office side, all existing data contracts (server actions, route behavior) must keep their current behavior unchanged.

**Data migration needs:** The unused permanent per-instructor token and its lookup mechanism (from the original, never-implemented S-02 design) are removed as part of this change. No existing data needs to be transformed or carried forward — nothing in production depends on them.

**Existing integrations that must continue working:** Office login/session flow; the existing lesson-creation and cancellation server actions, including their category-coherence and double-booking guards. This change introduces two new external dependencies not previously present: an email-sending capability and an AI-backed reason-suggestion capability — the specific services are a downstream stack decision, not part of this document, but both must fail gracefully rather than blocking the instructor's core ability to respond to a lesson (see FR-002, FR-012).

**Preserved behavior (explicitly named):**
- Office calendar view, lesson creation flow (category → instructor → time → student), and lesson cancellation.
- Office login and session gating for all `/office` routes.
- Office-visible status refresh via existing polling, without manual reload.
- The instructor-facing page remains usable on a mobile browser without horizontal scrolling or pinch-zoom (carried over from the original PRD's non-functional requirement — still applies to the redesigned single-lesson page).
- Any operation that takes longer than two seconds shows continuous visible progress; no silent waits or blank screens (carried over from the original PRD).

**New quality constraints introduced by this change:**
- A lesson token must be practically unguessable — possessing one valid token must not make any other lesson's token discoverable or predictable.
- Email delivery has no hard SLA in MVP — best-effort, relying on the standard delivery time of whatever email service is chosen downstream.
- The rejection-reason suggestion capability (FR-012) never receives the student's name or any other student-identifying detail as input — only the lesson's date, time, and category.

## Business Logic Changes

**Existing rule (unchanged by this change):** a lesson can only be created when the selected instructor holds the licence category of that lesson.

**New rule (added by this change):** a lesson token authorizes exactly one decision — approve or reject — on exactly one lesson, and becomes permanently invalid the instant that lesson's status changes, whether through the instructor's own decision or the office cancelling the lesson.

The rule consumes two user-facing inputs: the token presented via the emailed link, and the current status of the lesson it references. Its output is binary: either access to that single lesson's decision screen (token valid, lesson still pending), or a "this link is no longer valid" state (token already consumed, superseded by an office-triggered resend, or the lesson's status already changed by another means). The instructor encounters this passively — clicking an old or reused link simply stops working, rather than surfacing a confusing or stale lesson state.

**Second new rule (added by this change):** when an instructor is about to reject a lesson, the system proposes up to 5 candidate reasons tailored to that lesson's context (date, time, category) — a recommendation the instructor may accept, ignore, or override with free text. This recommendation never gates submission: a failed or slow suggestion never blocks the instructor from completing the rejection.

## Access Control Changes

**Office role — no changes.** One shared account (email + password); session gates all `/office` routes. Full access: view instructor calendars, create/cancel lessons, filter by category. Gains one new capability: can manually trigger a new token for a lesson (invalidating any prior one) if the instructor's link is lost or the response window has passed.

**Instructor role — redesigned.** Was: no login, permanent per-instructor URL token resolving to a list of all their lessons (never implemented). Now: no login, no persistent link. A one-time token is generated automatically the moment a lesson is created (status "pending") and emailed to the instructor. The token scopes access to exactly one lesson — approve/reject only, no visibility into any other lesson. The token is invalidated the instant a decision is recorded, the office cancels the lesson, or the office manually regenerates it.

**Unauthenticated — no changes.** Any request without a valid office session or a valid, unconsumed lesson token is rejected.

Role separation stays flat: two roles, no sub-roles or admin tiers.

## Non-Goals

- No dedicated instructor mobile app — this change stays email + browser page; a native app with push notifications is a future iteration, not part of this change.
- No SMS as a link-delivery channel — email only in this change's MVP.
- No token time-to-live (TTL) — a token doesn't expire on its own; only consumption (a recorded decision), cancellation, or office-triggered regeneration invalidates it.
- No email delivery-status tracking — office has no in-app indicator of whether the instructor's email actually arrived; a non-response is the office's only signal.
- No broader instructor profile management — the original PRD's "no in-app instructor profile management" non-goal still holds, except for the single new email field (FR-013). No other profile fields become editable as part of this change.

## Open Questions

None — both open questions raised during generation were resolved by the user: instructor email is a distinct, office-editable field (FR-013), and the reason-suggestion context excludes student-identifying data (FR-012).
