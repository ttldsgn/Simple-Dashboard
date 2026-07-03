import { NextRequest, NextResponse } from 'next/server'
import { getUmamiPageviews } from '@/utils/umami'

export async function GET(request: NextRequest) {
  const websiteId = request.nextUrl.searchParams.get('websiteId')
  const days = parseInt(request.nextUrl.searchParams.get('days') || '3', 10)

  if (!websiteId) {
    return NextResponse.json({ error: 'websiteId is required' }, { status: 400 })
  }

  const data = await getUmamiPageviews(websiteId, days)

  if (!data) {
    return NextResponse.json({ error: 'Failed to fetch pageviews' }, { status: 502 })
  }

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
    },
  })
}