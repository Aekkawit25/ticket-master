import { NextRequest, NextResponse } from 'next/server'
import { setPin, hasPinSet, verifyPin, hydrateFromHash, validatePinFormat, DEMO_USERS_META } from '@/lib/pin-store'

export async function POST(req: NextRequest) {
  let body: {
    userId?: string
    pin?: string
    currentPin?: string
    currentHashFromStorage?: string  // bcrypt hash from localStorage — for hydration after server restart
  } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { userId, pin, currentPin, currentHashFromStorage } = body

  if (!userId || !pin) return NextResponse.json({ error: 'userId และ pin จำเป็นต้องระบุ' }, { status: 400 })

  const user = DEMO_USERS_META.find(u => u.userId === userId)
  if (!user) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
  if (!user.canReopenStock) return NextResponse.json({ error: 'ผู้ใช้นี้ไม่มีสิทธิ์ตั้ง Reopen PIN' }, { status: 403 })

  const fmt = validatePinFormat(pin)
  if (!fmt.valid) return NextResponse.json({ error: fmt.reason }, { status: 422 })

  // PIN is considered set if server knows it (globalThis) OR client reports it (localStorage hash)
  const pinKnownToServer = hasPinSet(userId)
  const pinSetAnywhere   = pinKnownToServer || !!currentHashFromStorage

  if (pinSetAnywhere) {
    if (!currentPin) return NextResponse.json({ error: 'กรุณายืนยัน PIN เดิมก่อนเปลี่ยน' }, { status: 422 })

    // If server lost state (cold restart) but client has the hash — hydrate globalThis first
    if (!pinKnownToServer && currentHashFromStorage) {
      hydrateFromHash(userId, currentHashFromStorage)
    }

    const check = await verifyPin(userId, currentPin)
    if (!check.success) {
      return NextResponse.json({ error: check.message, lockedUntil: check.lockedUntil }, { status: 401 })
    }
  }

  // Hash and store new PIN — returns hash for client localStorage persistence
  const newHash = await setPin(userId, pin)

  // PIN itself is never returned — only the bcrypt hash for demo localStorage persistence
  return NextResponse.json({
    success: true,
    message: 'ตั้งรหัส Reopen PIN สำเร็จ',
    hasReopenPin: true,
    reopenPinHash: newHash,
  })
}
