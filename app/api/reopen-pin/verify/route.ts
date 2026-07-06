import { NextRequest, NextResponse } from 'next/server'
import { verifyPin, userCanReopen, getPinStatus, hasPinSet, hydrateFromHash } from '@/lib/pin-store'

export async function POST(req: NextRequest) {
  let body: {
    userId?: string
    pin?: string
    stockCode?: string
    hashFromStorage?: string  // bcrypt hash from localStorage — for hydration after server restart
  } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { userId, pin, stockCode, hashFromStorage } = body

  if (!userId || !pin) return NextResponse.json({ error: 'userId และ pin จำเป็นต้องระบุ' }, { status: 400 })

  if (!userCanReopen(userId)) {
    return NextResponse.json({ success: false, message: 'ผู้ใช้นี้ไม่มีสิทธิ์ Reopen Stock' }, { status: 403 })
  }

  // If server was restarted (globalThis cleared) but client has the hash — re-seed globalThis
  if (!hasPinSet(userId) && hashFromStorage) {
    hydrateFromHash(userId, hashFromStorage)
  }

  // Check lockout before bcrypt (avoid timing leak on locked accounts)
  const status = getPinStatus(userId)
  if (status.isLocked) {
    return NextResponse.json({
      success: false,
      message: 'มีการกรอกรหัสไม่ถูกต้องหลายครั้ง กรุณาลองใหม่ภายหลัง',
      lockedUntil: status.lockedUntil,
    }, { status: 429 })
  }

  const result = await verifyPin(userId, pin)

  // PIN is never echoed back — only boolean + message
  return NextResponse.json({
    success: result.success,
    message: result.message,
    remainingAttempts: result.remainingAttempts,
    lockedUntil: result.lockedUntil ?? null,
    stockCode: result.success ? stockCode : undefined,
  }, { status: result.success ? 200 : 401 })
}
