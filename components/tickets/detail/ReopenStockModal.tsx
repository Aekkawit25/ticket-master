'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils'
import { X, Lock, AlertTriangle, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DemoStock, DemoReopenEvent } from '@/lib/demo-storage'
import { getDemoPinEntry } from '@/lib/demo-pin-storage'

// ─── Constants ────────────────────────────────────────────────────────────────

export const REOPEN_SECTIONS = [
  { id: 'stock-info',       label: 'ข้อมูล Stock' },
  { id: 'pnr',             label: 'PNR' },
  { id: 'flight-segments', label: 'Flight Segments' },
  { id: 'conditions',      label: 'Conditions' },
  { id: 'price',           label: 'ราคา PNR' },
  { id: 'seats',           label: 'จำนวนที่นั่ง' },
  { id: 'other',           label: 'อื่น ๆ' },
]

export const CURRENT_DEMO_USER = { userId: 'u-admin', name: 'Admin User', role: 'Admin' }

// ─── OTP Input ────────────────────────────────────────────────────────────────

interface OtpInputProps {
  value: string[]
  onChange: (digits: string[]) => void
  disabled?: boolean
  hasError?: boolean
}

function OtpInput({ value, onChange, disabled, hasError }: OtpInputProps) {
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  const focus = (i: number) => refs[i]?.current?.focus()

  const handleChange = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1)
    const next = [...value]
    next[i] = digit
    onChange(next)
    if (digit && i < 3) focus(i + 1)
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!value[i] && i > 0) {
        const next = [...value]
        next[i - 1] = ''
        onChange(next)
        focus(i - 1)
      } else if (value[i]) {
        const next = [...value]
        next[i] = ''
        onChange(next)
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focus(i - 1)
    } else if (e.key === 'ArrowRight' && i < 3) {
      focus(i + 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (!pasted) return
    const next = ['', '', '', '']
    pasted.split('').forEach((d, i) => { next[i] = d })
    onChange(next)
    focus(Math.min(pasted.length, 3))
  }

  return (
    <div className="flex items-center gap-3" onPaste={handlePaste}>
      {[0, 1, 2, 3].map(i => (
        <input
          key={i}
          ref={refs[i]}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ? '•' : ''}
          onChange={e => handleChange(i, e.target.value.replace('•', ''))}
          onKeyDown={e => handleKeyDown(i, e)}
          disabled={disabled}
          autoComplete="off"
          data-lpignore="true"
          className={cn(
            'h-14 w-14 rounded-xl border-2 text-center text-2xl font-bold transition',
            'outline-none focus:ring-2 focus:ring-offset-1 caret-transparent',
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

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface ReopenStockModalProps {
  open: boolean
  stock: DemoStock
  onClose: () => void
  onReopened: (updatedStock: DemoStock) => void
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

export function ReopenStockModal({ open, stock, onClose, onReopened }: ReopenStockModalProps) {
  const [reason, setReason]             = useState('')
  const [sections, setSections]         = useState<string[]>([])
  const [pin, setPin]                   = useState<string[]>(['', '', '', ''])
  const [pinError, setPinError]         = useState<string | null>(null)
  const [pinLocked, setPinLocked]       = useState(false)
  const [lockedUntil, setLockedUntil]   = useState<string | null>(null)
  const [remainingAttempts, setRemaining] = useState<number | null>(null)
  const [submitting, setSubmitting]         = useState(false)
  const [hasReopenPin, setHasReopenPin]     = useState<boolean | null>(null)
  const [pinStatusLoading, setPinStatusLoading] = useState(false)

  // Load PIN status every time modal opens
  useEffect(() => {
    if (!open) return
    setReason('')
    setSections([])
    setPin(['', '', '', ''])
    setPinError(null)
    setPinLocked(false)
    setLockedUntil(null)
    setRemaining(null)

    // hasReopenPin from localStorage — instant, no network, survives server restarts
    const localEntry   = getDemoPinEntry(CURRENT_DEMO_USER.userId)
    const hasPinLocal  = !!localEntry?.hasReopenPin
    setHasReopenPin(hasPinLocal)

    // Only check server for rate-limiting (isLocked) if PIN is set
    if (hasPinLocal) {
      setPinStatusLoading(true)
      fetch(`/api/reopen-pin/status?userId=${CURRENT_DEMO_USER.userId}`)
        .then(r => r.json())
        .then(data => {
          if (data.isLocked) { setPinLocked(true); setLockedUntil(data.lockedUntil) }
        })
        .catch(() => {})
        .finally(() => setPinStatusLoading(false))
    }
  }, [open])

  const pinComplete = pin.every(d => d !== '')
  const canSubmit   = reason.trim().length > 0 && sections.length > 0
                   && pinComplete && !submitting && !pinLocked && hasReopenPin === true

  const toggleSection = (id: string) => {
    setSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setPinError(null)

    const pinStr = pin.join('')

    try {
      // Include hash from localStorage so the server can verify even after a cold restart
      const hashFromStorage = getDemoPinEntry(CURRENT_DEMO_USER.userId)?.reopenPinHash

      const res = await fetch('/api/reopen-pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: CURRENT_DEMO_USER.userId,
          pin: pinStr,
          stockCode: stock.stockCode,
          hashFromStorage,
        }),
      })
      const data = await res.json()

      if (!data.success) {
        // Clear PIN input regardless of error
        setPin(['', '', '', ''])
        if (data.lockedUntil) {
          setPinLocked(true)
          setLockedUntil(data.lockedUntil)
          setPinError(data.message)
        } else {
          setPinError(data.message)
          if (data.remainingAttempts !== undefined) {
            setRemaining(data.remainingAttempts)
          }
        }
        setSubmitting(false)
        return
      }

      // PIN verified — update stock to Reopened
      const now = new Date().toISOString()

      const reopenEvent: DemoReopenEvent = {
        eventId: `EVT-${Date.now()}`,
        eventType: 'STOCK_REOPENED',
        actor: CURRENT_DEMO_USER.name,
        role: CURRENT_DEMO_USER.role,
        timestamp: now,
        reason,
        sections,
      }

      const log = {
        logId: `LOG-${Date.now()}`,
        action: 'STOCK_REOPENED',
        message: `[${stock.stockCode}] เปิดกลับมาแก้ไขโดย ${CURRENT_DEMO_USER.name} (${CURRENT_DEMO_USER.role}) — เหตุผล: ${reason} — ส่วนที่อนุญาต: ${sections.map(s => REOPEN_SECTIONS.find(r => r.id === s)?.label ?? s).join(', ')}`,
        createdAt: now,
        createdBy: CURRENT_DEMO_USER.name,
      }

      const updated: DemoStock = {
        ...stock,
        status: 'Reopened',
        reopenedAt: now,
        reopenedBy: CURRENT_DEMO_USER.name,
        reopenedByRole: CURRENT_DEMO_USER.role,
        reopenReason: reason,
        reopenAllowedSections: sections,
        reopenEvents: [reopenEvent, ...(stock.reopenEvents ?? [])],
        updatedAt: now,
        logs: [log, ...stock.logs],
      }

      onReopened(updated)
    } catch {
      setPinError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่')
      setPin(['', '', '', ''])
      setSubmitting(false)
    }
  }, [canSubmit, pin, reason, sections, stock, onReopened])

  if (!open) return null

  const sectionLabels = (stock.reopenAllowedSections ?? [])
    .map(s => REOPEN_SECTIONS.find(r => r.id === s)?.label ?? s)
    .join(', ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />

      <div className="relative z-10 flex w-[calc(100vw-32px)] max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
              <ShieldAlert size={18} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">เปิด Stock กลับมาแก้ไข</h2>
              <p className="text-xs text-slate-500">ต้องการสิทธิ์และรหัสยืนยัน 4 หลัก</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Warning notice */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-800">
              Stock นี้ถูกปิดแล้ว การเปิดกลับมาแก้ไขอาจส่งผลต่อ PNR ราคา ที่นั่ง กำหนดชำระเงิน และ TTL
              กรุณาระบุเหตุผลและยืนยันด้วยรหัส 4 หลัก
            </p>
          </div>

          {/* Stock info */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Series Code</p>
              <p className="font-mono font-bold text-slate-900">{stock.stockCode}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">สถานะปัจจุบัน</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                <Lock size={10} /> Closed
              </span>
            </div>
            {stock.closedAt && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">วันที่และเวลาที่ปิด</p>
                <p className="text-xs text-slate-700">{formatDateTime(stock.closedAt)}</p>
              </div>
            )}
            {stock.closedBy && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">ผู้ที่ปิด Stock</p>
                <p className="text-xs text-slate-700">{stock.closedBy}</p>
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              เหตุผลในการเปิดกลับมาแก้ไข <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="ระบุเหตุผล เช่น เปลี่ยน Dummy PNR เป็น PNR จริง หรือแก้ไขข้อมูลจากสายการบิน"
              className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 transition hover:border-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
            {reason.trim().length === 0 && (
              <p className="mt-1 text-xs text-slate-400">บังคับกรอก</p>
            )}
          </div>

          {/* Sections */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              ส่วนที่ต้องการแก้ไข <span className="text-red-500">*</span>{' '}
              <span className="text-xs font-normal text-slate-400">(เลือกได้มากกว่า 1 รายการ)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {REOPEN_SECTIONS.map(s => {
                const checked = sections.includes(s.id)
                return (
                  <button key={s.id} type="button" onClick={() => toggleSection(s.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm text-left transition',
                      checked
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-medium'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    )}>
                    <div className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                      checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white'
                    )}>
                      {checked && <CheckCircle2 size={10} className="text-white" strokeWidth={3} />}
                    </div>
                    {s.label}
                  </button>
                )
              })}
            </div>
            {sections.length === 0 && (
              <p className="mt-1.5 text-xs text-slate-400">กรุณาเลือกอย่างน้อย 1 ส่วน</p>
            )}
            {sections.length > 0 && (
              <p className="mt-1.5 text-xs text-emerald-700 font-medium">
                เลือกแล้ว: {sectionLabels || sections.map(s => REOPEN_SECTIONS.find(r => r.id === s)?.label).join(', ')}
              </p>
            )}
          </div>

          {/* PIN Input */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-5">
            <p className="mb-1 text-sm font-semibold text-slate-800">รหัสยืนยัน 4 หลัก</p>
            <p className="mb-4 text-xs text-slate-500">
              กรุณากรอกรหัส Reopen PIN ของผู้มีสิทธิ์ เพื่อยืนยันการเปิด Stock กลับมาแก้ไข
            </p>

            {pinStatusLoading ? (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" />
                กำลังตรวจสอบสถานะ PIN...
              </div>
            ) : hasReopenPin === false ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>ยังไม่ได้ตั้งรหัส Reopen PIN กรุณาไปที่ Settings → Users เพื่อตั้งรหัสก่อน</span>
              </div>
            ) : pinLocked ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <Lock size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">การยืนยันถูกล็อก</p>
                  <p className="text-xs mt-0.5 text-red-600">
                    มีการกรอกรหัสไม่ถูกต้องหลายครั้ง กรุณาลองใหม่ภายหลัง
                    {lockedUntil && ` (ปลดล็อก: ${formatDateTime(lockedUntil)})`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <OtpInput
                  value={pin}
                  onChange={v => { setPin(v); setPinError(null) }}
                  disabled={submitting}
                  hasError={!!pinError}
                />
                {pinError && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>
                      {pinError}
                      {remainingAttempts !== null && remainingAttempts > 0 && (
                        <span className="text-xs ml-1.5 text-red-400">
                          (เหลืออีก {remainingAttempts} ครั้ง)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex min-h-[68px] shrink-0 items-center justify-between gap-4 border-t border-slate-200 bg-white px-6 py-4">
          <button type="button" onClick={onClose}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            ยกเลิก
          </button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            className="min-w-[160px]"
          >
            {submitting ? 'กำลังยืนยัน...' : 'ยืนยัน Reopen'}
          </Button>
        </div>
      </div>
    </div>
  )
}
