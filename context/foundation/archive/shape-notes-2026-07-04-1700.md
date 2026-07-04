---
project: "DrivePlan"
context_type: greenfield
created: 2026-05-19
updated: 2026-05-19
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 6
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 9
  gray_areas_resolved:
    - topic: "pain category"
      decision: "coordination overhead — office and instructors must agree on time slots; phone/SMS is the failure mode"
    - topic: "primary actor"
      decision: "office (biuro) — single account; instructors are secondary actors (approve/reject only)"
    - topic: "insight"
      decision: "generic calendar tools don't model driving school domain: category filters (B, C, D…), pending/approve workflow, student linking"
    - topic: "instructor access model"
      decision: "URL token per instructor — unique link, no login required; instructors see only their own lessons"
    - topic: "office auth model"
      decision: "one shared email+password account for the whole school (Supabase Auth)"
  quality_check_status: accepted
---

## Vision & Problem Statement

Driving schools coordinate lessons between office staff and instructors via phone and SMS. Every booking requires at least two calls: one to check the instructor's availability and one to confirm with the student. The result is scheduling conflicts when calls aren't returned promptly, misunderstandings about which slot was agreed on, and time wasted on both sides in a process that produces no durable record.

The insight: generic calendar tools (Google Calendar, Outlook) don't model the driving school domain. They have no concept of category-filtered instructor views (B, C, D, T…), no lesson approval workflow, and no way to link a lesson to a student record or "extra ride" booking. A purpose-built scheduling tool that reflects these domain concepts eliminates the coordination overhead at its root.

## User & Persona

**Primary persona: Office staff (biuro)**
A small team of one to three people responsible for booking all lessons at the driving school. They manage the school's full instructor roster across multiple licence categories, take calls from students, and must match students to the right instructor without double-booking anyone. Currently they carry this knowledge in their heads and their phones.

They reach for this product when a student calls in to book a lesson — they need to see, in under a minute, which instructors hold the right category and have an open slot.

### Secondary persona: Instructor (instruktor)
An instructor has no scheduling system today — the office texts them a lesson proposal and waits for a reply. In the MVP, an instructor reaches the product to see pending lessons assigned to them and to confirm or reject each one.

## Access Control

**Office role** — one shared account (email + password, Supabase Auth). Full access: view instructor calendars, create lessons, link students to lessons, filter by licence category. Instructor and student profiles are pre-seeded; no in-app profile management in MVP.

**Instructor role** — no login. Each instructor has a unique URL token (e.g. `/instructor?token=<uuid>`). Token gates access to that instructor's view only. Capabilities: see their own pending and confirmed lessons, approve or reject a pending lesson, see the student name attached to a lesson. Cannot view other instructors' calendars or any school-wide data.

**Unauthenticated** — no access. Any request without a valid session cookie (office) or a valid instructor token is rejected.

Role separation is flat: two roles, no sub-roles or admin tiers within either.

## Success Criteria

### Primary
- Office can propose a lesson (select instructor, pick time slot, attach student) in under 60 seconds from login.

### Secondary
- After applying a licence category filter, only instructors who hold that category are visible in the calendar view.

### Guardrails
- Lesson status updates are visible to both office and instructor without a manual page reload (polling-based refresh).

## Functional Requirements

### Calendar & Instructor View
- FR-001: Office can view a selected instructor's weekly calendar. Priority: must-have
  > Socratic: Counter-argument considered: "office only cares about one instructor at a time — a combined view adds complexity." Resolution: accepted. Per-instructor view is the MVP shape; combined all-instructors view demoted to nice-to-have (FR-001b).
- FR-001b: Office can view all instructors' schedules in a combined weekly calendar. Priority: nice-to-have
- FR-002: Office can filter the instructor list by licence category (B, C, D, T, B+E, C+E…). Priority: must-have
  > Socratic: Counter-argument considered: "category list isn't fully known yet — filter locks in a premature taxonomy." Resolution: kept as must-have. Categories will be finalized with the client and loaded as seed data before development; the filter is implemented against a configurable data list, not hardcoded values.

### Lesson Creation
- FR-003: Office can select an instructor — by applying a category filter or by browsing the full list. Priority: must-have
  > Socratic: Counter-argument considered: "FR-002 already covers filtering; browsing the full list is redundant." Resolution: kept as written. The office may know which instructor they want without filtering; both paths are legitimate navigation entries.
- FR-004: Office creates a lesson by selecting a category first, then an instructor (filtered to that category), then a date/time, then a student from the pre-seeded list filtered to that category. Lesson is created with status "pending". Priority: must-have
  > Socratic: Counter-argument considered: "two student-input paths (list vs manual) doubles form complexity." Resolution: accepted. Manual extra-ride entry dropped. One path only: pre-seeded student list, filtered by lesson category. Extra-ride students are handled by creating a student record without a class assignment (out of MVP scope — pre-seeding covers it).

### Status Updates
- FR-005: Office can see lesson status (pending / confirmed / rejected) refresh automatically at a regular interval (polling) without manual page reload. Priority: must-have
  > Socratic: Counter-argument considered: "real-time sync (Supabase Realtime) is the hardest technical piece — polling every 30s covers the same UX need." Resolution: accepted. FR-005 downgraded from real-time push to polling. Real-time sync (Supabase Realtime) moves to nice-to-have / v2. For a small school with low concurrent activity, polling is indistinguishable in practice.

### Instructor View
- FR-006: Instructor can view their own lesson calendar via a unique URL token (no login required). Priority: must-have
  > Socratic: Counter-argument considered: "token with no expiry is a security risk if the link leaks." Resolution: kept as-is. This is an internal tool for a small school; token revocation and TTL are a later concern. Risk is accepted.
- FR-007: Instructor can approve a pending lesson. Priority: must-have
  > Socratic: Counter-argument considered alongside FR-008 — see FR-008.
- FR-008: Instructor can reject a pending lesson and must provide a short reason (free text or from a fixed option list). Priority: must-have
  > Socratic: Counter-argument considered: "rejection without a reason still requires the office to call the instructor — the coordination problem isn't solved." Resolution: accepted. FR-008 updated to require a rejection reason field. The office sees the reason alongside the status change, reducing the need for a follow-up call.

**Pre-seeded data (no in-app management in MVP):**
- Instructor profiles: name + licence categories held
- Student profiles: name + phone number

## User Stories

### US-01: Office books a lesson for a student

- **Given** the office is logged in and a student has called to book a category-B lesson
- **When** the office filters instructors by category B, selects an available instructor, picks a date/time, and attaches the student from the pre-seeded list
- **Then** a lesson with status "pending" appears in the instructor's calendar; the instructor opens their URL, sees the lesson, and clicks Approve — the status updates to "confirmed" and the office sees the change on the next poll cycle

#### Acceptance Criteria
- Only instructors holding category B are visible after applying the filter
- The student list is filtered to students enrolled in category B
- The lesson appears in the instructor's calendar view on next poll refresh (no manual reload required)
- Status change (pending → confirmed / rejected) is visible to the office on next poll refresh
- A rejected lesson displays the instructor's rejection reason to the office

## Business Logic

A lesson can only be created when the selected instructor holds the licence category of that lesson.

The rule consumes two user-facing inputs: the licence category selected by the office at the start of lesson creation, and the instructor chosen from the resulting filtered list. Its output is a constraint on which instructors are valid candidates — only those whose profile includes the selected category appear as options. The office encounters the rule passively: choosing a category automatically narrows the instructor list, so an invalid pairing is structurally impossible rather than validated after the fact.

The student list is also filtered by the selected category, so the rule extends to student-instructor-category coherence: all three must align for a lesson to exist.

## Non-Functional Requirements

- The instructor view is usable on a mobile browser without horizontal scrolling or pinch-zoom — instructors open their URL on a phone.
- Any operation that takes longer than two seconds shows continuous visible progress; no silent waits or blank screens.

## Non-Goals

- No instructor self-service availability — instructors cannot mark their own open slots; the office manages scheduling entirely.
- No in-app student or instructor profile management — both are pre-seeded; no create/edit/delete UI in MVP.
- No course management or student-to-course enrollment — multi-session courses with enrolled students are a later iteration.
- No email or SMS notifications — no automated messages when a lesson is created or its status changes.
- No AI-suggested scheduling — no automatic matching of student availability to instructor slots; marked as a future iteration in the original notes.
- No payments or invoices — no financial features of any kind in MVP.
- No real-time push (Supabase Realtime) — status updates use polling, not WebSocket push; real-time sync is v2.
- No mobile app — web only; the instructor view is responsive but not a native mobile application.

## Quality cross-check

Run on 2026-05-19. All 5 greenfield elements present: Access Control, Business Logic (one-sentence rule), Project artifacts, Timeline-cost acknowledgment, Non-Goals. No gaps. Status: accepted.

## Timeline acknowledgment

Acknowledged on 2026-05-19: 6-week MVP requires sustained dedication (after-hours work over evenings and weekends); user accepted the cost going in eyes-open.


