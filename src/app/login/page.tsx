import { LoginForm } from './LoginForm'

interface Props {
  searchParams: Promise<{ next?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const next = params.next
  const safeNext =
    typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
      ? next
      : '/office'

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-zinc-900">DrivePlan</h1>
        <LoginForm next={safeNext} />
      </div>
    </div>
  )
}
