'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

function subscribe() {
  return () => {}
}

// Avoids the brief wrong-icon flash: resolvedTheme is undefined until next-themes
// resolves the stored/system preference client-side, so without this guard a
// dark-mode visitor would briefly see Moon (light-mode icon) before it flips to Sun.
function useIsHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false)
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isHydrated = useIsHydrated()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {isHydrated && resolvedTheme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
