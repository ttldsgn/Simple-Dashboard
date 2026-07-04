import net from 'net'

export interface DomainExpiration {
  domain: string
  expiryDate: string | null // ISO date string, e.g. '2027-06-25'
  daysRemaining: number | null
  error?: string
}

// Simple list of WHOIS servers mapped to TLDs for direct lookups
// For most common TLDs, we use whois.iana.org first then follow referrals
const WHOIS_DEFAULTS: Record<string, string> = {
  com: 'whois.verisign-grs.com',
  net: 'whois.verisign-grs.com',
  org: 'whois.pir.org',
  io: 'whois.nic.io',
  co: 'whois.nic.co',
  ai: 'whois.nic.ai',
  app: 'whois.nic.google',
  dev: 'whois.nic.google',
  me: 'whois.nic.me',
  xyz: 'whois.nic.xyz',
}

function getTLD(domain: string): string {
  const parts = domain.split('.')
  return parts[parts.length - 1]?.toLowerCase() || 'com'
}

async function whoisLookupRaw(domain: string): Promise<string> {
  const tld = getTLD(domain)
  const server = WHOIS_DEFAULTS[tld] || 'whois.iana.org'

  // Try the TLD-specific server first, fall back to iana
  return tryServer(server, domain)
}

async function tryServer(server: string, domain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    let data = ''
    let resolved = false
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        client.destroy()
        if (data) resolve(data)
        else reject(new Error(`WHOIS timeout connecting to ${server}`))
      }
    }, 15000)

    client.connect(43, server, () => {
      client.write(domain + '\r\n')
    })

    client.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf-8')
      // If we got a reasonable amount of data, we can resolve early
      // (some WHOIS servers close right after sending, others keep TCP open)
    })

    client.on('close', () => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        if (data) resolve(data)
        else reject(new Error(`No data received from WHOIS server ${server}`))
      }
    })

    client.on('error', (err: Error) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        reject(err)
      }
    })
  })
}

/**
 * Looks up a domain's expiration date via WHOIS using Node.js native net module.
 * No external dependencies required.
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
    const raw = await whoisLookupRaw(clean)

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
        break
      }
    }

    if (expiryStr) {
      // Normalize dots to dashes for paid-till format
      expiryStr = expiryStr.replace(/\./g, '-')
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