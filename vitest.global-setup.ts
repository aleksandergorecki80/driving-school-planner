import { spawn, type ChildProcess } from 'node:child_process'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'

async function isServerUp(): Promise<boolean> {
  try {
    await fetch(BASE_URL, { redirect: 'manual' })
    return true
  } catch {
    return false
  }
}

async function waitForServer(child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with code ${child.exitCode} before becoming ready`)
    }
    if (await isServerUp()) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`next dev did not become ready at ${BASE_URL} within ${timeoutMs}ms`)
}

export default async function setup() {
  if (await isServerUp()) {
    // Reuse whatever is already listening (matches local dev workflow).
    return
  }

  const child = spawn('npm', ['run', 'dev'], {
    stdio: 'ignore',
    detached: true,
  })

  await waitForServer(child, 120_000)

  return () => {
    if (child.pid) process.kill(-child.pid, 'SIGTERM')
  }
}
