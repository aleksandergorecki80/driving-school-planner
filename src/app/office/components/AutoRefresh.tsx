'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const POLL_INTERVAL_MS = 30_000

export default function AutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [router])

  return null
}
