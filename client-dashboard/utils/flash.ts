import { cookies } from 'next/headers'

const FLASH_COOKIE = 'mfa_flash'
const MAX_AGE_S = 10

export type FlashType = 'success' | 'error'

export interface FlashMessage {
  type: FlashType
  message: string
}

/**
 * Set a server-trusted flash message via an HTTP-only cookie.
 * The message will be available on the next request and auto-clears after being read.
 */
export async function setFlash(type: FlashType, message: string) {
  const cookieStore = await cookies()
  cookieStore.set(FLASH_COOKIE, JSON.stringify({ type, message }), {
    maxAge: MAX_AGE_S,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
}

/**
 * Read and consume the flash message cookie.
 * Returns the message and clears the cookie so it only shows once.
 */
export async function getFlash(): Promise<FlashMessage | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(FLASH_COOKIE)?.value
  if (!raw) return null

  // Consume immediately so it won't re-appear on refresh
  cookieStore.delete(FLASH_COOKIE)

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.type === 'string' && typeof parsed.message === 'string') {
      return parsed as FlashMessage
    }
  } catch {
    // Corrupt cookie — ignore
  }
  return null
}