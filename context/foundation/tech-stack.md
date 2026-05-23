---
starter_id: next
package_manager: npm
project_name: driving-school-planner
hints:
  language_family: js
  team_size: solo
  deployment_target: vercel
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

A solo developer shipping a driving-school lesson-scheduling MVP in 6 after-hours weeks needs a full-stack, TypeScript-first, agent-friendly starter with auth in scope. Next.js was chosen on the custom path after reviewing the quality-gated candidate set: it passes all four agent-friendly gates (typed via TypeScript, convention-based App Router file routing, popular in JS training data, current versioned docs) and carries verified bootstrapper confidence — scaffolding will be smooth. Supabase is the intended data and auth layer (PostgreSQL for the lesson, instructor, and student data; Supabase Auth for the office email+password account; URL token access for instructors handled at the application layer). Supabase is added post-scaffold via the official Supabase Next.js integration rather than being pre-wired in the starter — one deliberate setup step the developer owns. Deployment targets Vercel (first in Next.js defaults) with GitHub Actions auto-deploy on merge. No payments, realtime push, AI, or background jobs in scope per PRD non-goals.
