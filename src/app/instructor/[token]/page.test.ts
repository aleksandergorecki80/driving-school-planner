import { describe, it } from 'vitest'

// These tests require F-02 (middleware + token validation) and S-02 (lesson handler).
// When those ship: remove .todo(), configure webServer in vitest.config.ts.

describe('Risk #1 — Instructor token IDOR protection (HTTP layer)', () => {
  it.todo('GET /instructor/<tokenA> returns only instructor A lessons in the response')
  // Assertion shape when enabled:
  //   const res = await fetch(`${BASE_URL}/instructor/${instructorA.token}`)
  //   const html = await res.text()  // or JSON if the route returns JSON
  //   expect(html).toContain(lessonA.id)
  //   expect(html).not.toContain(lessonB.id)

  it.todo('GET /instructor/<invalid-uuid> returns 404')
  // Assertion shape when enabled:
  //   const res = await fetch(`${BASE_URL}/instructor/00000000-0000-0000-0000-000000000000`)
  //   expect(res.status).toBe(404)

  it.todo(
    'GET /instructor/<tokenA> does not expose instructor B lesson IDs anywhere in the response',
  )
  // This is the canonical IDOR test: seed two instructors with lessons,
  // request with tokenA, assert lessonB.id is absent from the full response body.
})
