'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import {
  PlusCircle, Pencil, Users, ShieldCheck, ShieldAlert,
  CheckCircle2, AlertTriangle, X, Eye, EyeOff, KeyRound, Lock,
} from 'lucide-react'
import { CURRENT_DEMO_USER } from '@/components/tickets/detail/ReopenStockModal'
import { getDemoPinEntry, saveDemoPinEntry } from '@/lib/demo-pin-storage'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DemoUserMeta {
  userId: string
  name: string
  role: string
  canReopenStock: boolean
  email: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEMO_USERS: DemoUserMeta[] = [
  { userId: 'u-admin', name: 'Admin User',  email: 'admin@company.com',   role: 'Admin',   canReopenStock: true  },
  { userId: 'u-mgr',   name: 'Manager A',   email: 'manager@company.com', role: 'Manager', canReopenStock: true  },
  { userId: 'u-staff', name: 'Staff B',     email: 'staff@company.com',   role: 'Staff',   canReopenStock: false },
  { userId: 'u-view',  name: 'Viewer C',    email: 'viewer@company.com',  role: 'Viewer',  canReopenStock: false },
]

const roleColor: Record<string, 'green' | 'blue' | 'yellow' | 'gray'> = {
  Admin: 'green', Manager: 'blue', Staff: 'yellow', Viewer: 'gray',
}

// ─── OTP PIN input ────────────────────────────────────────────────────────────

interface PinInputProps {
  value: string[]
  onChange: (v: string[]) => void
  disabled?: boolean
  hasError?: boolean
}

function PinInput({ value, onChange, disabled, hasError }: PinInputProps) {
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]
  const focus = (i: number) => refs[i]?.current?.focus()

  const handleChange = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1)
    const next = [...value]; next[i] = digit; onChange(next)
    if (digit && i < 3) focus(i + 1)
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!value[i] && i > 0) { const next = [...value]; next[i - 1] = ''; onChange(next); focus(i - 1) }
      else if (value[i]) { const next = [...value]; next[i] = ''; onChange(next) }
    } else if (e.key === 'ArrowLeft' && i > 0) focus(i - 1)
    else if (e.key === 'ArrowRight' && i < 3) focus(i + 1)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (!pasted) return
    const next = ['', '', '', '']; pasted.split('').forEach((d, i) => { next[i] = d }); onChange(next)
    focus(Math.min(pasted.length, 3))
  }

  return (
    <div className="flex items-center gap-2.5" onPaste={handlePaste}>
      {[0, 1, 2, 3].map(i => (
        <input key={i} ref={refs[i]} type="password" inputMode="numeric" maxLength={1}
          value={value[i] ? '•' : ''} autoComplete="off" data-lpignore="true"
          onChange={e => handleChange(i, e.target.value.replace('•', ''))}
          onKeyDown={e => handleKeyDown(i, e)}
          disabled={disabled}
          className={cn(
            'h-12 w-12 rounded-xl border-2 text-center text-xl font-bold transition caret-transparent outline-none focus:ring-2 focus:ring-offset-1',
            hasError
              ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-300 text-red-600'
              : value[i]
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 focus:ring-emerald-300'
                : 'border-slate-300 bg-white focus:border-emerald-500 focus:ring-emerald-200',
            disabled && 'cursor-not-allowed opacity-50 bg-slate-100'
          )}
        />
      ))}
    </div>
  )
}

// ─── SetPinModal ──────────────────────────────────────────────────────────────

interface SetPinModalProps {
  open: boolean
  user: DemoUserMeta
  hasPinAlready: boolean
  onClose: () => void
  onSuccess: () => void
}

function SetPinModal({ open, user, hasPinAlready, onClose, onSuccess }: SetPinModalProps) {
  const [currentPin, setCurrentPin]   = useState<string[]>(['', '', '', ''])
  const [newPin, setNewPin]           = useState<string[]>(['', '', '', ''])
  const [confirmPin, setConfirmPin]   = useState<string[]>(['', '', '', ''])
  const [error, setError]             = useState<string | null>(null)
  const [success, setSuccess]         = useState(false)
  const [submitting, setSubmitting]   = useState(false)

  useEffect(() => {
    if (!open) { setCurrentPin(['','','','']); setNewPin(['','','','']); setConfirmPin(['','','','']); setError(null); setSuccess(false) }
  }, [open])

  const newPinStr     = newPin.join('')
  const confirmPinStr = confirmPin.join('')
  const currentPinStr = currentPin.join('')

  const mismatch  = newPinStr.length === 4 && confirmPinStr.length === 4 && newPinStr !== confirmPinStr
  const canSubmit = newPinStr.length === 4 && confirmPinStr.length === 4 && !mismatch &&
                    (!hasPinAlready || currentPinStr.length === 4) && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    try {
      // When changing PIN, send the current hash from localStorage so the server
      // can verify even if it was restarted (globalThis cleared)
      const currentHashFromStorage = hasPinAlready
        ? (getDemoPinEntry(user.userId)?.reopenPinHash ?? undefined)
        : undefined

      const res = await fetch('/api/reopen-pin/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.userId,
          pin: newPinStr,
          ...(hasPinAlready ? { currentPin: currentPinStr, currentHashFromStorage } : {}),
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? data.message ?? 'เกิดข้อผิดพลาด')
        setCurrentPin(['','','','']); setNewPin(['','','','']); setConfirmPin(['','','',''])
        setSubmitting(false)
        return
      }
      // Save hash to localStorage so it persists across server restarts
      if (data.reopenPinHash) {
        saveDemoPinEntry(user.userId, { hasReopenPin: true, reopenPinHash: data.reopenPinHash })
      }
      setSuccess(true); setSubmitting(false)
      setTimeout(() => { onSuccess(); onClose() }, 1200)
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ')
      setSubmitting(false)
    }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-[calc(100vw-32px)] max-w-[440px] rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
              <KeyRound size={18} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {hasPinAlready ? 'เปลี่ยน Reopen PIN' : 'ตั้ง Reopen PIN'}
              </h2>
              <p className="text-xs text-slate-500">{user.name} ({user.role})</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 size={28} className="text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-emerald-800">ตั้งรหัส Reopen PIN สำเร็จ</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">ข้อกำหนด PIN</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>ตัวเลข 4 หลักเท่านั้น</li>
                  <li>ห้ามใช้ตัวเลขซ้ำทั้งหมด เช่น 0000, 1111</li>
                  <li>ห้ามใช้ตัวเลขเรียงลำดับ เช่น 1234, 4321</li>
                </ul>
              </div>

              {hasPinAlready && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">PIN เดิม</p>
                  <PinInput value={currentPin} onChange={setCurrentPin} hasError={!!error && hasPinAlready} />
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">PIN ใหม่</p>
                <PinInput value={newPin} onChange={v => { setNewPin(v); setError(null) }} />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">ยืนยัน PIN ใหม่</p>
                <PinInput value={confirmPin} onChange={v => { setConfirmPin(v); setError(null) }} hasError={mismatch} />
                {mismatch && <p className="mt-1.5 text-xs text-red-600">PIN ไม่ตรงกัน กรุณากรอกใหม่</p>}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertTriangle size={14} className="shrink-0" /> {error}
                </div>
              )}
            </>
          )}
        </div>

        {!success && (
          <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4">
            <button type="button" onClick={onClose} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">ยกเลิก</button>
            <Button onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
              {hasPinAlready ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [modal, setModal]               = useState(false)
  const [pinModal, setPinModal]         = useState<{ open: boolean; user: DemoUserMeta; hasPinAlready: boolean } | null>(null)
  const [pinStatuses, setPinStatuses]   = useState<Record<string, { hasReopenPin: boolean; isLocked: boolean }>>({})

  const fetchPinStatuses = useCallback(async () => {
    const results = await Promise.all(
      DEMO_USERS.filter(u => u.canReopenStock).map(async u => {
        // hasReopenPin from localStorage — persists across browser sessions and server restarts
        const localEntry   = getDemoPinEntry(u.userId)
        const hasReopenPin = !!localEntry?.hasReopenPin
        // isLocked from server — runtime rate-limiting state
        let isLocked = false
        try {
          const r = await fetch(`/api/reopen-pin/status?userId=${u.userId}`)
          const d = await r.json()
          isLocked = !!d.isLocked
        } catch {}
        return { userId: u.userId, hasReopenPin, isLocked }
      })
    )
    const map: Record<string, { hasReopenPin: boolean; isLocked: boolean }> = {}
    results.forEach(r => { map[r.userId] = { hasReopenPin: r.hasReopenPin, isLocked: r.isLocked } })
    setPinStatuses(map)
  }, [])

  // Targeted single-user refresh — called after PIN is set/changed
  const refreshUserStatus = useCallback(async (userId: string) => {
    // hasReopenPin from localStorage (already updated by SetPinModal before this is called)
    const localEntry   = getDemoPinEntry(userId)
    const hasReopenPin = !!localEntry?.hasReopenPin
    // isLocked from server
    let isLocked = false
    try {
      const r = await fetch(`/api/reopen-pin/status?userId=${userId}`)
      const d = await r.json()
      isLocked = !!d.isLocked
    } catch {}
    setPinStatuses(prev => ({ ...prev, [userId]: { hasReopenPin, isLocked } }))
  }, [])

  useEffect(() => { fetchPinStatuses() }, [fetchPinStatuses])

  const openPinModal = (user: DemoUserMeta) => {
    const status = pinStatuses[user.userId]
    setPinModal({ open: true, user, hasPinAlready: !!status?.hasReopenPin })
  }

  return (
    <AppLayout title="Users">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">จัดการสิทธิ์ผู้ใช้งานระบบ</p>
        </div>
        <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => setModal(true)}>Add User</Button>
      </div>

      {/* Permission Info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { role: 'Admin',   desc: 'ทำได้ทุกอย่าง',                            color: 'border-green-200 bg-green-50' },
          { role: 'Manager', desc: 'สร้าง/แก้ไข/ปิด Stock, Import/Export',   color: 'border-blue-200 bg-blue-50' },
          { role: 'Staff',   desc: 'เพิ่ม PNR, แก้ไขบางส่วน',                color: 'border-amber-200 bg-amber-50' },
          { role: 'Viewer',  desc: 'ดูข้อมูลเท่านั้น',                         color: 'border-slate-200 bg-slate-50' },
        ].map(r => (
          <div key={r.role} className={`rounded-xl border p-3 ${r.color}`}>
            <p className="text-xs font-bold text-slate-700">{r.role}</p>
            <p className="text-xs text-slate-500 mt-0.5">{r.desc}</p>
          </div>
        ))}
      </div>

      {/* Users Table */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users size={14} />{DEMO_USERS.length} Users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Reopen</Th><Th>Action</Th></tr>
            </TableHead>
            <TableBody>
              {DEMO_USERS.map(u => (
                <TableRow key={u.userId}>
                  <Td className="font-medium">{u.name}</Td>
                  <Td className="text-sm text-slate-500">{u.email}</Td>
                  <Td><Badge variant={roleColor[u.role] || 'gray'}>{u.role}</Badge></Td>
                  <Td>
                    {u.canReopenStock
                      ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium"><ShieldCheck size={12} /> มีสิทธิ์</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Lock size={12} /> ไม่มีสิทธิ์</span>}
                  </Td>
                  <Td>
                    <Button variant="ghost" size="sm" icon={<Pencil size={13} />} className="p-1.5" />
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Reopen PIN Management ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
            <ShieldAlert size={18} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Reopen PIN Management</h2>
            <p className="text-xs text-slate-500">ตั้งรหัส 4 หลักสำหรับการ Reopen Stock ที่ถูกปิด</p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
          <p className="font-semibold">ข้อควรทราบด้านความปลอดภัย</p>
          <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
            <li>Reopen PIN ถูกเก็บแบบ Hash — ไม่สามารถดู PIN เดิมได้</li>
            <li>กรอกผิดเกิน 5 ครั้ง จะถูกล็อก 15 นาที</li>
            <li>เฉพาะ Admin และ Manager ที่มีสิทธิ์ Reopen Stock เท่านั้น</li>
            <li>ตรวจสอบ PIN ผ่าน Server เท่านั้น — ไม่เก็บ PIN แบบ Plain Text ใน Browser</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEMO_USERS.filter(u => u.canReopenStock).map(u => {
            const status = pinStatuses[u.userId]
            const hasReopenPin = !!status?.hasReopenPin
            const isLocked     = !!status?.isLocked
            const isCurrent    = u.userId === CURRENT_DEMO_USER.userId

            return (
              <div key={u.userId} className={cn(
                'rounded-xl border p-4 flex items-center justify-between gap-3',
                isCurrent ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white'
              )}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    hasReopenPin ? 'bg-emerald-100' : 'bg-slate-100'
                  )}>
                    <KeyRound size={16} className={hasReopenPin ? 'text-emerald-600' : 'text-slate-400'} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                      {u.name}
                      {isCurrent && <span className="rounded-full bg-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">คุณ</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={roleColor[u.role] || 'gray'} className="text-[10px] px-1.5 py-0.5">{u.role}</Badge>
                      {isLocked
                        ? <span className="flex items-center gap-1 text-[10px] font-medium text-red-600"><Lock size={9} /> ถูกล็อก</span>
                        : hasReopenPin
                          ? <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600"><CheckCircle2 size={9} /> ตั้งแล้ว</span>
                          : <span className="flex items-center gap-1 text-[10px] text-slate-400"><AlertTriangle size={9} /> ยังไม่ได้ตั้ง</span>}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={hasReopenPin ? 'outline' : 'primary'}
                  onClick={() => openPinModal(u)}
                  className="shrink-0">
                  {hasReopenPin ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Add User Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title="Add User"
        footer={<><Button variant="outline" onClick={() => setModal(false)}>ยกเลิก</Button><Button onClick={() => setModal(false)}>บันทึก</Button></>}>
        <div className="space-y-3">
          <Input label="Name" required placeholder="ชื่อ-นามสกุล" />
          <Input label="Email" type="email" required placeholder="email@company.com" />
          <Select label="Role" required value="Staff"
            options={[
              { value: 'Admin', label: 'Admin' },
              { value: 'Manager', label: 'Manager' },
              { value: 'Staff', label: 'Staff' },
              { value: 'Viewer', label: 'Viewer' },
            ]} onChange={() => {}} />
        </div>
      </Modal>

      {/* ── Set/Change PIN Modal ── */}
      {pinModal && (
        <SetPinModal
          open={pinModal.open}
          user={pinModal.user}
          hasPinAlready={pinModal.hasPinAlready}
          onClose={() => setPinModal(null)}
          onSuccess={() => { refreshUserStatus(pinModal!.user.userId); setPinModal(null) }}
        />
      )}
    </AppLayout>
  )
}
