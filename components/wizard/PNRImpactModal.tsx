'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, CheckSquare, Square, Info } from 'lucide-react'
import { cn, formatTravelDate, calcTravelEndFromSectors, daysBetween } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type { FlightPNRFormData, FlightScheduleFormData } from '@/types'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ImpactedPNRItem {
  pnrIndex: number
  pnr: FlightPNRFormData
  oldArrDate: string | null
  newArrDate: string | null
  diffDays: number
}

export interface SectorChange {
  sectorNo: number
  sectorType: string
  oldDayOffset: number | null
  newDayOffset: number | null
  changeType: 'day_offset' | 'added' | 'removed'
}

// ─── Computation helpers (exported so add/page.tsx can use them) ──────────────

export function computePNRImpact(
  oldSchedules: FlightScheduleFormData[],
  newSchedules: FlightScheduleFormData[],
  pnrs: FlightPNRFormData[],
): ImpactedPNRItem[] {
  const oldMain = oldSchedules.find(s => s.isMain) ?? oldSchedules[0]
  const newMain = newSchedules.find(s => s.isMain) ?? newSchedules[0]
  const result: ImpactedPNRItem[] = []

  for (let i = 0; i < pnrs.length; i++) {
    const pnr = pnrs[i]
    if (!pnr.travel_start) continue

    const oldSch = pnr.schedule_id
      ? (oldSchedules.find(s => s.scheduleId === pnr.schedule_id) ?? oldMain)
      : oldMain
    const newSch = pnr.schedule_id
      ? (newSchedules.find(s => s.scheduleId === pnr.schedule_id) ?? newMain)
      : newMain

    if (!oldSch || !newSch) continue

    const oldArrDate = calcTravelEndFromSectors(pnr.travel_start, oldSch.sectors)
    const newArrDate = calcTravelEndFromSectors(pnr.travel_start, newSch.sectors)

    if (oldArrDate !== newArrDate) {
      result.push({
        pnrIndex: i,
        pnr,
        oldArrDate,
        newArrDate,
        diffDays: daysBetween(oldArrDate, newArrDate),
      })
    }
  }
  return result
}

export function computeSectorChanges(
  oldSchedules: FlightScheduleFormData[],
  newSchedules: FlightScheduleFormData[],
): SectorChange[] {
  const changes: SectorChange[] = []

  for (const newSch of newSchedules) {
    const oldSch = oldSchedules.find(s => s.scheduleId === newSch.scheduleId)
    if (!oldSch) continue

    const oldS = oldSch.sectors
    const newS = newSch.sectors

    if (newS.length > oldS.length) {
      changes.push({ sectorNo: 0, sectorType: '', oldDayOffset: null, newDayOffset: null, changeType: 'added' })
    } else if (newS.length < oldS.length) {
      changes.push({ sectorNo: 0, sectorType: '', oldDayOffset: null, newDayOffset: null, changeType: 'removed' })
    } else {
      for (let i = 0; i < newS.length; i++) {
        if (newS[i].day_offset !== oldS[i]?.day_offset) {
          changes.push({
            sectorNo: i + 1,
            sectorType: newS[i].sector_type,
            oldDayOffset: oldS[i]?.day_offset ?? null,
            newDayOffset: newS[i].day_offset,
            changeType: 'day_offset',
          })
        }
      }
    }
  }
  return changes
}

// ─── Modal component ──────────────────────────────────────────────────────────

interface Props {
  open: boolean
  affectedPNRs: ImpactedPNRItem[]
  sectorChanges: SectorChange[]
  onConfirm: (selectedIndices: number[]) => void
  onSaveOnly: () => void
  onCancel: () => void
}

export default function PNRImpactModal({
  open, affectedPNRs, sectorChanges, onConfirm, onSaveOnly, onCancel,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (open) setSelected(new Set(affectedPNRs.map(item => item.pnrIndex)))
  }, [open, affectedPNRs])

  const allSelected = affectedPNRs.length > 0 && selected.size === affectedPNRs.length

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(affectedPNRs.map(item => item.pnrIndex)))
  }

  const toggle = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="การเปลี่ยนแปลงนี้ส่งผลต่อวันที่ของ PNR"
      size="xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            ยกเลิกการแก้ไข
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onSaveOnly}
              className="text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100"
            >
              บันทึกเฉพาะ Flight Segments
            </Button>
            <Button
              size="sm"
              disabled={selected.size === 0}
              onClick={() => onConfirm([...selected])}
            >
              ยืนยันและอัปเดต {selected.size} PNR
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">

        {/* Warning banner */}
        <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            Travel Day หรือข้อมูลเที่ยวบินมีการเปลี่ยนแปลง ระบบพบ PNR ที่ต้องคำนวณวันที่ใหม่
            กรุณาเลือก PNR ที่ต้องการอัปเดต
          </p>
        </div>

        {/* Change summary */}
        {sectorChanges.length > 0 && (
          <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-600">รายการที่เปลี่ยนแปลง</p>
            {sectorChanges.map((ch, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-slate-500">
                {ch.changeType === 'day_offset' && (
                  <>
                    <span className="text-slate-400 shrink-0">Sector {ch.sectorNo} ({ch.sectorType}) — Travel Day:</span>
                    <span className="font-semibold text-red-500 line-through">{ch.oldDayOffset}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-semibold text-green-600">{ch.newDayOffset}</span>
                  </>
                )}
                {ch.changeType === 'added' && (
                  <span className="text-green-600 font-medium">เพิ่ม Sector ใหม่</span>
                )}
                {ch.changeType === 'removed' && (
                  <span className="text-red-500 font-medium">ลบ Sector ออก</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Count + Select All row */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-600">
            พบ <strong>{affectedPNRs.length}</strong> PNR ที่ได้รับผลกระทบ
          </span>
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-[#05a94f]">
              เลือกแล้ว {selected.size} จาก {affectedPNRs.length} PNR
            </span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-slate-500 underline hover:text-slate-700 transition-colors"
            >
              {allSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
          </div>
        </div>

        {/* Preview table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="border-b border-slate-200 px-3 py-2 w-10">
                  <button type="button" onClick={toggleAll} className="flex items-center justify-center mx-auto">
                    {allSelected
                      ? <CheckSquare size={14} className="text-[#05a94f]" />
                      : <Square size={14} className="text-slate-400" />
                    }
                  </button>
                </th>
                <th className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-600">PNR</th>
                <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-600">Dep Date</th>
                <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-600">Arr Date เดิม</th>
                <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-600">Arr Date ใหม่</th>
                <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-600">ผลต่าง</th>
                <th className="border-b border-slate-200 px-3 py-2 text-center font-semibold text-slate-600">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {affectedPNRs.map((item, i) => {
                const isSelected = selected.has(item.pnrIndex)
                const isDummy = !item.pnr.pnr_code?.trim()
                const label = item.pnr.pnr_code?.trim()
                  || item.pnr.dummy_pnr?.trim()
                  || `PNR #${item.pnrIndex + 1}`

                return (
                  <tr
                    key={i}
                    onClick={() => toggle(item.pnrIndex)}
                    className={cn(
                      'cursor-pointer transition-colors',
                      isSelected ? 'bg-emerald-50/40' : 'hover:bg-slate-50',
                      i < affectedPNRs.length - 1 ? 'border-b border-slate-100' : '',
                    )}
                  >
                    <td className="px-3 py-2 text-center">
                      {isSelected
                        ? <CheckSquare size={14} className="text-[#05a94f] mx-auto" />
                        : <Square size={14} className="text-slate-400 mx-auto" />
                      }
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('font-mono font-semibold', isDummy ? 'text-slate-400' : 'text-slate-700')}>
                        {label}
                      </span>
                      {isDummy && (
                        <span className="ml-1.5 text-[9px] font-medium text-slate-400 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                          Dummy
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-slate-600">
                      {formatTravelDate(item.pnr.travel_start)}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-slate-400 line-through">
                      {formatTravelDate(item.oldArrDate)}
                    </td>
                    <td className="px-3 py-2 text-center font-mono font-semibold text-slate-800">
                      {formatTravelDate(item.newArrDate)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {item.diffDays !== 0 && (
                        <span className={cn(
                          'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                          item.diffDays > 0
                            ? 'text-orange-600 bg-orange-50 border-orange-200'
                            : 'text-blue-600 bg-blue-50 border-blue-200',
                        )}>
                          {item.diffDays > 0 ? `+${item.diffDays}` : item.diffDays} วัน
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                        item.pnr.status === 'Pending'   ? 'text-amber-600 bg-amber-50' :
                        item.pnr.status === 'Confirmed' ? 'text-blue-600 bg-blue-50' :
                                                          'text-slate-500 bg-slate-100',
                      )}>
                        {item.pnr.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Contextual note */}
        {selected.size > 0 && selected.size < affectedPNRs.length && (
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50/70 border border-amber-200 rounded-lg">
            <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-700">
              {affectedPNRs.length - selected.size} PNR ที่ไม่ได้เลือกจะถูกตั้งเป็นสถานะ "รออัปเดตวันที่"
            </p>
          </div>
        )}
        {selected.size === 0 && (
          <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
            <Info size={12} className="text-slate-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-500">
              ไม่ได้เลือก PNR ใด — กด "บันทึกเฉพาะ Flight Segments" เพื่อบันทึกโดยไม่อัปเดตวันที่
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
