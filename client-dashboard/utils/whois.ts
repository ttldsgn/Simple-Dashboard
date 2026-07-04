import { lookup } from 'whois'

export interface DomainExpiration {
  domain: string
  expiryDate: string | null // ISO date string, e.g. '2027-06-25'
  daysRemaining: number | null
  error?: string
}

const WHOIS_TIMEOUT_MS = 8000

/**
 * Looks up a domain's expiration date via WHOIS with a timeout.
 * If the WHOIS server doesn't respond within 8 seconds, returns null.
 */
export async function getDomainExpiration(
  domain: string | undefined | null,
): Promise<DomainExpiration | null> {
  // Normalize: strip protocol, path, www prefix
  const clean = domain
    ?.replace(/^https?:\/\//, '')
    ?.replace(/\/.*$/, '')
    ?.replace(/^www\./, '')
    ?.trim()
    ?.toLowerCase()

  if (!clean) return null

  try {
    const raw = await Promise.race([
      new Promise<string>((resolve, reject) => {
        lookup(clean, (err, data) => {
          if (err) reject(err)
          else if (typeof data === 'string') resolve(data)
          else if (Array.isArray(data))
            resolve(data.map((r) => r.data).join('\n'))
          else resolve(String(data))
        })
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('WHOIS lookup timed out')),
          WHOIS_TIMEOUT_MS,
        ),
      ),
    ])

    // Try common WHOIS patterns to extract the expiry date
    const patterns = [
      /Registry Expiry Date:\s*(\d{4}-\d{2}-\d{2})/i,
      /Registrar Registration Expiration Date:\s*(\d{4}-\d{2}-\d{2})/i,
      /Expir(?:y|ation) Date:\s*(\d{4}-\d{2}-\d{2})/i,
      /expires?:\s*(\d{4}-\d{2}-\d{2})/i,
      /paid-till:\s*(\d{4}\.\d{2}\.\d{2})/i,
      /Domain Expiration Date:\s*(\d{4}-\d{2}-\d{2})/i,
      /Expiration:\s*(\d{4}-\d{2}-\d{2})/i,
    ]

    let expiryStr: string | null = null

    for (const pattern of patterns) {
      const match = raw.match(pattern)
      if (match) {
        expiryStr = match[1]
        expiryStr = expiryStr.replace(/\./g, '-')
        break
      }
    }

    if (!expiryStr) {
      return {
        domain: clean,
        expiryDate: null,
        daysRemaining: null,
        error: 'Could not determine expiration date from WHOIS data',
      }
    }

    const expiryDate = new Date(expiryStr)
    if (isNaN(expiryDate.getTime())) {
      return {
        domain: clean,
        expiryDate: null,
        daysRemaining: null,
        error: 'Invalid expiration date format',
      }
    }

    const now = new Date()
    const diffMs = expiryDate.getTime() - now.getTime()
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    return {
      domain: clean,
      expiryDate: expiryStr,
      daysRemaining,
    }
  } catch (err) {
    return {
      domain: clean,
      expiryDate: null,
      daysRemaining: null,
      error: err instanceof Error ? err.message : 'WHOIS lookup failed',
    }
  }
}