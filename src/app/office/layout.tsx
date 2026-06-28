export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <span className="text-sm font-semibold text-zinc-900">DrivePlan</span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-900">
            Log out
          </button>
        </form>
      </header>
      <main>{children}</main>
    </>
  )
}
