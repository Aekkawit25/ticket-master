'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
// createPortal renders menu to document.body — bypasses all overflow clipping
import { createPortal } from 'react-dom'
import {
  Route, Copy, RotateCcw, CheckCircle2, Archive, XCircle,
  Trash2, MoreHorizontal, ArrowRightLeft,
} from 'lucide-react'

interface Props {
  opStatus: string        // 'PENDING' | 'ACTIVE' | 'CLOSED' | 'CANCELLED'
  isDummy: boolean
  canOperate: boolean
  onEditFlight: () => void
  onDuplicate: () => void
  onConvert: () => void
  onResetSchedule: () => void
  onActivate: () => void
  onClose: () => void
  onCancel: () => void
  onDelete: () => void
}

const MENU_W = 210
const VIEWPORT_PAD = 8

function MenuItem({
  icon, label, onClick, danger,
}: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      type="button"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onClick() }}
      className={`w-full flex items-center gap-2 px-3 py-[7px] text-[12px] text-left transition-colors whitespace-nowrap ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span className={`flex-shrink-0 ${danger ? 'text-red-400' : 'text-slate-400'}`}>{icon}</span>
      {label}
    </button>
  )
}

export function PnrActionMenu({
  opStatus, isDummy, canOperate,
  onEditFlight, onDuplicate, onConvert, onResetSchedule,
  onActivate, onClose, onCancel, onDelete,
}: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Position menu after it renders (useLayoutEffect = before paint → no flicker)
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !btnRef.current) return
    const btn = btnRef.current.getBoundingClientRect()
    const menuH = menuRef.current.offsetHeight
    const vh = window.innerHeight
    const vw = window.innerWidth

    // Prefer opening below; flip up if not enough space
    let top = btn.bottom + 4
    if (top + menuH > vh - VIEWPORT_PAD) {
      top = btn.top - menuH - 4
    }
    // Clamp vertical
    if (top < VIEWPORT_PAD) top = VIEWPORT_PAD

    // Prefer right-aligned to button; shift left if overflows viewport
    let left = btn.right - MENU_W
    if (left < VIEWPORT_PAD) left = VIEWPORT_PAD
    if (left + MENU_W > vw - VIEWPORT_PAD) left = vw - MENU_W - VIEWPORT_PAD

    setPos({ top, left })
  }, [open])

  // Close on outside pointer-down or Escape; reposition on scroll
  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => {
      // Reposition rather than close while scrolling
      if (!btnRef.current || !menuRef.current) return
      const btn = btnRef.current.getBoundingClientRect()
      const menuH = menuRef.current.offsetHeight
      const vh = window.innerHeight
      const vw = window.innerWidth
      let top = btn.bottom + 4
      if (top + menuH > vh - VIEWPORT_PAD) top = btn.top - menuH - 4
      if (top < VIEWPORT_PAD) top = VIEWPORT_PAD
      let left = btn.right - MENU_W
      if (left < VIEWPORT_PAD) left = VIEWPORT_PAD
      if (left + MENU_W > vw - VIEWPORT_PAD) left = vw - MENU_W - VIEWPORT_PAD
      setPos({ top, left })
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [open])

  const close = (fn: () => void) => () => { fn(); setOpen(false) }
  const showDanger = opStatus === 'PENDING'

  const menu = (
    <div
      ref={menuRef}
      onPointerDown={e => e.stopPropagation()}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_W, zIndex: 9999 }}
      className="bg-white rounded-lg border border-slate-200 shadow-xl py-1"
    >
      {canOperate && (
        <MenuItem icon={<Route size={12} />} label="แก้ไข Flight Schedule" onClick={close(onEditFlight)} />
      )}
      <MenuItem icon={<Copy size={12} />} label="คัดลอก PNR" onClick={close(onDuplicate)} />
      {isDummy && canOperate && (
        <MenuItem icon={<ArrowRightLeft size={12} />} label="ใช้ข้อมูลกับ PNR อื่น" onClick={close(onConvert)} />
      )}
      <MenuItem icon={<RotateCcw size={12} />} label="คืนค่า Schedule จาก Flight Set" onClick={close(onResetSchedule)} />
      {opStatus === 'PENDING' && (
        <MenuItem icon={<CheckCircle2 size={12} />} label="เปิดใช้งาน PNR" onClick={close(onActivate)} />
      )}
      {opStatus === 'ACTIVE' && (
        <MenuItem icon={<Archive size={12} />} label="ปิด PNR" onClick={close(onClose)} />
      )}
      {canOperate && (
        <MenuItem icon={<XCircle size={12} />} label="ยกเลิก PNR" onClick={close(onCancel)} />
      )}
      {showDanger && (
        <>
          <div className="border-t border-slate-100 my-1" />
          <MenuItem icon={<Trash2 size={12} />} label="ลบ PNR" onClick={close(onDelete)} danger />
        </>
      )}
    </div>
  )

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        onPointerDown={e => e.stopPropagation()}
        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
        title="เมนูเพิ่มเติม"
        aria-label="เมนูเพิ่มเติม"
        aria-expanded={open}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && createPortal(menu, document.body)}
    </>
  )
}
