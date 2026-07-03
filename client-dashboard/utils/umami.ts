export interface UmamiStats {
  pageviews: number
  visitors: number
  visits: number
  bounces: number
  totaltime: number
}

export interface PageviewDataPoint {
  x: string // date string like "2026-06-30 00:00:00"
  y: number
}

export interface UmamiPageviews {
  pageviews: PageviewDataPoint[]
  sessions: PageviewDataPoint[]
}

export async function getUmamiStats(websiteId?: string | null): Promise<UmamiStats | null> {
  if (!websiteId) return null

  try {
    const now = Date.now()
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

    const res = await fetch(
      `${process.env.UMAMI_API_URL}/api/websites/${websiteId}/stats?startAt=${thirtyDaysAgo}&endAt=${now}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${process.env.UMAMI_AUTH_TOKEN}`,
        },
        next: { revalidate: 300 },
      }
    )

    if (!res.ok) return null

    const data: UmamiStats = await res.json()
    return data
  } catch {
    return null
  }
}

export async function getUmamiPageviews(websiteId?: string | null, days = 3): Promise<UmamiPageviews | null> {
  if (!websiteId) return null

  try {
    const now = Date.now()
    const startAt = now - days * 24 * 60 * 60 * 1000

    const res = await fetch(
      `${process.env.UMAMI_API_URL}/api/websites/${websiteId}/pageviews?startAt=${startAt}&endAt=${now}&unit=day&timezone=America%2FLos_Angeles`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${process.env.UMAMI_AUTH_TOKEN}`,
        },
        next: { revalidate: 300 },
      }
    )

    if (!res.ok) return null

    const data: UmamiPageviews = await res.json()
    return data
  } catch {
    return null
  }
}