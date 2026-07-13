'use client'

import { Settings2, CheckCircle2, Archive, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StockStatusBadge } from '@/components/ui/badge'
import type { StockStatus } from '@/types'

export interface PnrCounts {
  pending: number
  active: number
  closed: number
  cancelled: number
  total: number
}

export function calcPnrCounts(pnrs: { pnrStatus?: string }[]): PnrCounts {
  let pending = 0, active = 0, closed = 0, cancelled = 0
  for (const p of pnrs) {
    const s = p.pnrStatus ?? 'PENDING'
    if (s === 'ACTIVE') active++
    else if (s === 'CLOSED') closed++
    else if (s === 'CANCELLED') cancelled++
    else pending++
  }
  return { pending, active, closed, cancelled, total: pnrs.length }
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  Draft: 'Stock ยังไม่ถูกเปิดใช้งาน — สามารถแก้ไขข้อมูลได้ทั้งหมด',
  Active: 'Stock เปิดใช้งานอยู่ — PNR พร้อมรับการจอง',
  Closed: 'Stock ถูกปิดแล้ว — ไม่รับการจองใหม่',
  Cancelled: 'Stock ถูกยกเลิกแล้ว — ไม่สามารถเปิดใช้งานได้อีก',
  Reopened: 'Stock ถูกเปิดกลับมาแก้ไขชั่วคราว',
}

const STATUS_STYLES: Record<string, string> = {
  Draft: 'border-slate-200 bg-slate-50',
  Active: 'border-green-200 bg-green-50',
  Closed: 'border-blue-200 bg-blue-50',
  Cancelled: 'border-red-200 bg-red-50',
  Reopened: 'border-amber-200 bg-amber-50',
}

interface StockStatusCardProps {
  status: StockStatus
  pnrCounts: PnrCounts
  onManage?: () => void
}

export default function StockStatusCard({ status, pnrCounts, onManage }: StockStatusCardProps) {
  const canManage = status !== 'Cancelled' && !!onManage
  const desc = STATUS_DESCRIPTIONS[status] ?? status
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.Draft

  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${style}`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={canManage ? onManage : undefined}
            className={canManage ? 'shrink-0 hover:opacity-80 transition-opacity cursor-pointer' : 'shrink-0 cursor-default'}
            title={canManage ? 'คลิกเพื่อจัดการสถานะ' : undefined}
          >
            <StockStatusBadge status={status} />
          </button>
          <p className="text-xs text-slate-600 min-w-0">{desc}</p>
        </div>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Settings2 size={13} />}
            onClick={onManage}
          >
            จัดการสถานะ
          </Button>
        )}
      </div>

      {/* PNR count breakdown */}
      {pnrCounts.total > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-200/70">
          <span className="text-[11px] text-slate-500 font-medium">PNR:</span>
          {pnrCounts.pending > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 rounded-full px-2 py-0.5">
              <Clock size={9} /> รอใช้งาน {pnrCounts.pending}
            </span>
          )}
          {pnrCounts.active > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-white border border-green-200 rounded-full px-2 py-0.5">
              <CheckCircle2 size={9} /> ใช้งาน {pnrCounts.active}
            </span>
          )}
          {pnrCounts.closed > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-white border border-blue-200 rounded-full px-2 py-0.5">
              <Archive size={9} /> ปิด {pnrCounts.closed}
            </span>
          )}
          {pnrCounts.cancelled > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 bg-white border border-red-200 rounded-full px-2 py-0.5">
              <XCircle size={9} /> ยกเลิก {pnrCounts.cancelled}
            </span>
          )}
          <span className="text-[11px] text-slate-400 ml-auto">รวม {pnrCounts.total} PNR</span>
        </div>
      )}
    </div>
  )
}
