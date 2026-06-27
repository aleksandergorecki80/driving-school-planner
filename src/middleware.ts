// TODO (F-02): implement auth middleware.
// Acceptance criteria: src/middleware.test.ts
import { NextResponse } from 'next/server'

export function middleware() {
  return NextResponse.next()
}
