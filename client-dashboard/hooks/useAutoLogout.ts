'use client'

import { useEffect, useRef, useCallback } from 'react'
import { signout } from '@/app/auth/callback/actions'

/**
 * Automatically logs the user out after a period of inactivity.
 * @param timeoutMinutes - Minutes of inactivity before auto-logout (default: 30)
 */
export function useAutoLogout(timeoutMinutes = 30) {
  const lastActivityRef = useRef(0)
  const timeoutMs = timeoutMinutes * 60 * 1000

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now()
  }, [])

  // Track user activity
  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']

    for (const event of events) {
      window.addEventListener(event, resetTimer, { passive: true })
    }

    return () => {
      for (const event of events) {
        window.removeEventListener(event, resetTimer)
      }
    }
  }, [resetTimer])

  // Check inactivity every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastActivityRef.current === 0) return
      const idleTime = Date.now() - lastActivityRef.current
      if (idleTime >= timeoutMs) {
        signout()
      }
    }, 10_000)

    return () => clearInterval(interval)
  }, [timeoutMs])
}