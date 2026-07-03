export interface KumaMonitor {
  id: number
  name: string
  type: string
  sendUrl: number
  tags: string[]
}

export async function getKumaMonitors(statusSlug?: string | null): Promise<KumaMonitor[]> {
  if (!statusSlug) return []

  try {
    const res = await fetch(
      `${process.env.KUMA_API_URL}/api/status-page/${statusSlug}`,
      { next: { revalidate: 60 } } // Cache for 1 minute
    )

    if (!res.ok) return []

    const data = await res.json()
    const groups = data?.publicGroupList ?? []

    // Flatten all monitors from all groups
    const monitors: KumaMonitor[] = []
    for (const group of groups) {
      if (group.monitorList) {
        monitors.push(...group.monitorList)
      }
    }

    return monitors
  } catch {
    return []
  }
}