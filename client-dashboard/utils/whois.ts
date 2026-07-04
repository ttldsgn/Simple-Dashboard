import { lookup } from 'whois'

export interface DomainExpiration {
  domain: string
  expiryDate: string | null // ISO date string, e.g. '2027-06-25'
  daysRemaining: number | null
  error?: string
}

/**
 * Looks up a domain's expiration date via WHOIS.
 * Results are cached for 12 hours since expiration dates change infrequently.
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
    const raw = await new Promise<string>((resolve, reject) => {
      lookup(clean, (err, data) => {
        if (err) reject(err)
        else if (typeof data === 'string') resolve(data)
        else if (Array.isArray(data))
          resolve(data.map((r) => r.data).join('\n'))
        else resolve(String(data))
      })
    })

    // Try common WHOIS patterns to extract the expiry date
    // Different registrars use different field names
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
        // Normalize dots to dashes for paid-till format
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