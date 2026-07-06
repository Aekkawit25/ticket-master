import { NextRequest, NextResponse } from 'next/server'
import { getPinStatus, userCanReopen, DEMO_USERS_META } from '@/lib/pin-store'

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const status = getPinStatus(userId)
  const canReopen = userCanReopen(userId)
  const user = DEMO_USERS_META.find(u => u.userId === userId)

  return NextResponse.json({
    hasReopenPin: status.hasPinSet,   // never expose hash — boolean only
    isLocked: status.isLocked,
    lockedUntil: status.lockedUntil,
    failedAttempts: status.failedAttempts,
    canReopenStock: canReopen,
    userName: user?.name ?? null,
    role: user?.role ?? null,
  })
}
