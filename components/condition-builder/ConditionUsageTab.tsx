'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Unlink, Eye, Clock, Layers, Users, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { cn, buildRouteText, formatDate } from '@/lib/utils'
import {
  computeUsageStats, getPnrRoute,
  removeTemplateFromSeries, removeTemplateFromPnr,
  type UsageStats, type PnrWithRelationship, type ConditionRelationshipType, type ConditionUsageLog,
} from '@/lib/condition-usage'
import type { AppConditionTemplate } from '@/lib/condition-schema'
import type { DemoStock } from '@/lib/demo-storage'
import ConditionAssignModal from './ConditionAssignModal'
import { useRouter } from 'next/navigation'

interface Props { template: AppConditionTemplate }

// ─── Constants ────────────────────────────────────────────────────────────────

const LOG_ACTION_LABELS: Record<string, string> = {
  assign_series: 'กำหนด Condition ให้ Series',
  remove_series: 'ยกเลิก Condition จาก Series',
  assign_pnr:    'กำหนด Condition ให้ PNR',
  remove_pnr:    'ยกเลิก Condition จาก PNR',
}
const LOG_ACTION_COLORS: Record<string, string> = {
  assign_series: 'bg-emerald-50 text-emerald-700',
  remove_series: 'bg-red-50 text-red-700',
  assign_pnr:    'bg-blue-50 text-blue-700',
  remove_pnr:    'bg-orange-50 text-orange-700',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seriesRoute(stock: DemoStock): string {
  const secs = stock.flightSets?.[0]?.sectors ?? stock.sectors ?? []
  if (secs.length < 2) return 'ยังไม่ครบ'
  return buildRouteText(secs.map(s => ({ dep_airport_code: s.depAirportCode, arr_airport_code: s.arrAirportCode }))) || 'ยังไม่ครบ'
}

function travelPeriod(stock: DemoStock): string {
  const starts = stock.pnrs.map(p => p.travelStart).filter(Boolean).sort()
  const ends   = stock.pnrs.map(p => p.travelEnd).filter(Boolean).sort()
  if (!starts.length) return '—'
  const first = formatDate(starts[0])
  const last  = ends.length ? formatDate(ends[ends.length - 1]) : ''
  return last && last !== first ? `${first} – ${last}` : first
}

function relBadge(rel: ConditionRelationshipType): { label: string; cls: string } {
  if (rel === 'OVERRIDE') return { label: 'Override',       cls: 'bg-orange-50 text-orange-700 border border-orange-200' }
  return                         { label: 'กำหนดโดยตรง',  cls: 'bg-blue-50 text-blue-700 border border-blue-200' }
}

function sourceLabel(rel: ConditionRelationshipType, seriesHasThis: boolean): { text: string; cls: string } {
  if (rel === 'INHERITED') return { text: 'รับจาก Series',           cls: 'bg-slate-100 text-slate-600' }
  if (rel === 'OVERRIDE')  return { text: 'Override จาก Series',     cls: 'bg-orange-50 text-orange-700' }
  if (seriesHasThis)       return { text: 'ปรับเงื่อนไขจาก Series', cls: 'bg-violet-50 text-violet-700' }
  return                          { text: 'กำหนดโดยตรง',            cls: 'bg-blue-50 text-blue-700' }
}

function pnrRemoveBody(code: string, rel: ConditionRelationshipType, seriesHasThis: boolean): string {
  if (rel === 'OVERRIDE')
    return `ยกเลิกการ Override จาก PNR "${code}" หรือไม่?\nPNR จะกลับไปรับ Condition จาก Series แทน`
  if (seriesHasThis)
    return `ยกเลิกการกำหนดโดยตรงจาก PNR "${code}" หรือไม่?\nPNR จะรับ Condition จาก Series แทน`
  return `ยกเลิกการกำหนด Condition จาก PNR "${code}" หรือไม่?\nPNR จะเป็น "ยังไม่ได้กำหนด Condition" เนื่องจาก Series ไม่มี Condition`
}

// ─── Remove target type ───────────────────────────────────────────────────────

type RemoveTarget =
  | { type: 'series'; stockId: string; name: string }
  | { type: 'pnr'; stockId: string; pnrId: string; code: string; relationship: ConditionRelationshipType; seriesHasThisTemplate: boolean }

// ─── Sub-components ───────────────────────────────────────────────────────────

function RemoveConfirmModal({ open, onClose, onConfirm, title, body }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: string
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button variant="danger" onClick={onConfirm}>ยืนยัน</Button>
        </>
      }>
      <div className="space-y-1">
        {body.split('\n').map((line, i) => (
          <p key={i} className="text-sm text-slate-600">{line}</p>
        ))}
      </div>
    </Modal>
  )
}

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: number; sub?: string
}) {
  return (
    <div className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3.5 min-w-[190px]">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-bold text-slate-800 leading-none tabular-nums">{value}</p>
        <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">{label}</p>
        {sub && (
          <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{sub}</p>
        )}
      </div>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{title}</h3>
        <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{count}</span>
      </div>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-10 border border-dashed border-slate-200 rounded-xl">
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  )
}

// ─── Action button ─────────────────────────────────────────────────────────────
function ActionBtn({ title, onClick, danger }: { title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'p-1.5 rounded-lg transition-colors shrink-0',
        danger
          ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100',
      )}
    >
      {danger ? <Unlink size={13} /> : <Eye size={13} />}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConditionUsageTab({ template }: Props) {
  const router = useRouter()
  const [stats, setStats]           = useState<UsageStats | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [toast, setToast]           = useState('')
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null)

  const refresh = useCallback(() => {
    setStats(computeUsageStats(template.templateId))
  }, [template.templateId])

  useEffect(() => { refresh() }, [refresh])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const handleSaved = (seriesCount: number, pnrCount: number) => {
    setAssignOpen(false)
    refresh()
    const parts: string[] = []
    if (seriesCount > 0) parts.push(`${seriesCount} Series`)
    if (pnrCount > 0)    parts.push(`${pnrCount} PNR`)
    showToast(`กำหนด Condition ให้ ${parts.join(' และ ')} สำเร็จ`)
  }

  const handleRemoveConfirm = () => {
    if (!removeTarget) return
    if (removeTarget.type === 'series') {
      removeTemplateFromSeries(template.templateId, removeTarget.stockId, 'User')
      showToast(`ยกเลิก Condition จาก Series ${removeTarget.name} สำเร็จ`)
    } else {
      removeTemplateFromPnr(removeTarget.pnrId, removeTarget.stockId, template.templateId, 'User')
      showToast(`ยกเลิก Condition จาก PNR ${removeTarget.code} สำเร็จ`)
    }
    setRemoveTarget(null)
    refresh()
  }

  if (!stats) return null

  const removeBody = !removeTarget ? '' :
    removeTarget.type === 'series'
      ? `ยกเลิกการใช้ Condition นี้จาก Series "${removeTarget.name}" หรือไม่?\nPNR ที่รับ Condition จาก Series นี้ จะหยุดใช้ Condition นี้ด้วย`
      : pnrRemoveBody(removeTarget.code, removeTarget.relationship, removeTarget.seriesHasThisTemplate)

  const seriesIdSet = new Set(stats.series.map(s => s.stockId))

  return (
    <div className="space-y-6">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-5 py-3 rounded-xl shadow-xl animate-in fade-in slide-in-from-bottom-2 pointer-events-none">
          {toast}
        </div>
      )}

      {/* ── KPIs + action ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <StatCard
            icon={<Layers size={15} className="text-[#05a94f]" />}
            label="Series ที่กำหนดโดยตรง"
            value={stats.series.length}
          />
          <StatCard
            icon={<Users size={15} className="text-blue-500" />}
            label="PNR ที่รับจาก Series"
            value={stats.inheritedPnrs.length}
          />
          <StatCard
            icon={<Link2 size={15} className="text-orange-500" />}
            label="PNR ที่กำหนดโดยตรง"
            value={stats.directPnrs.length}
            sub={stats.directPnrHostStockCount > 0 ? `อยู่ภายใต้ ${stats.directPnrHostStockCount} Series` : undefined}
          />
        </div>
        <Button icon={<Plus size={14} />} onClick={() => setAssignOpen(true)} className="shrink-0">
          กำหนดการใช้งาน
        </Button>
      </div>

      {/* ── Series ─────────────────────────────────────────────────────────── */}
      <Section title="Series ที่กำหนด Condition โดยตรง" count={stats.series.length}>
        {stats.series.length === 0 ? (
          <EmptyState text="ยังไม่มี Series ที่กำหนด Condition นี้โดยตรง" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs" style={{ minWidth: 660 }}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                  <th className="px-4 py-3 text-left" style={{ minWidth: 120 }}>Code</th>
                  <th className="px-4 py-3 text-left">ชื่อ</th>
                  <th className="px-4 py-3 text-left" style={{ minWidth: 140 }}>Route</th>
                  <th className="px-4 py-3 text-left" style={{ minWidth: 160 }}>ช่วงวันเดินทาง</th>
                  <th className="px-4 py-3 text-right" style={{ minWidth: 60 }}>PNR</th>
                  <th className="px-4 py-3 text-right" style={{ minWidth: 72 }}>Override</th>
                  <th className="px-4 py-3" style={{ minWidth: 80 }}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.series.map(stock => {
                  const overrideCount = stock.pnrs.filter(
                    p => p.conditionTemplateId != null && p.conditionTemplateId !== template.templateId
                  ).length
                  return (
                    <tr key={stock.stockId} className="hover:bg-slate-50 transition-colors align-middle">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-slate-800 whitespace-nowrap">{stock.stockCode}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 min-w-0">
                        <span className="block leading-snug">{stock.groupName}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{seriesRoute(stock)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{travelPeriod(stock)}</td>
                      <td className="px-4 py-3 text-slate-600 text-right tabular-nums">{stock.pnrs.length}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {overrideCount > 0
                          ? <span className="text-orange-600 font-semibold">{overrideCount}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <ActionBtn title="ดูรายละเอียด" onClick={() => router.push(`/tickets/${stock.stockId}`)} />
                          <ActionBtn title="ยกเลิกการใช้ Condition" danger onClick={() => setRemoveTarget({ type: 'series', stockId: stock.stockId, name: stock.groupName })} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── PNR direct ─────────────────────────────────────────────────────── */}
      <Section title="PNR ที่กำหนด Condition โดยตรง" count={stats.directPnrs.length}>
        {stats.directPnrs.length === 0 ? (
          <EmptyState text="ยังไม่มี PNR ที่กำหนด Condition โดยตรง" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            {/* min-width = sum of all column min-widths: 150+110+110+140+90+70+120+80 = 870 */}
            <table className="w-full text-xs" style={{ minWidth: 870 }}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                  <th className="px-4 py-3 text-left"  style={{ minWidth: 150 }}>PNR Code</th>
                  <th className="px-4 py-3 text-left"  style={{ minWidth: 110 }}>ประเภท</th>
                  <th className="px-4 py-3 text-left"  style={{ minWidth: 110 }}>Series</th>
                  <th className="px-4 py-3 text-left"  style={{ minWidth: 140 }}>Route</th>
                  <th className="px-4 py-3 text-left"  style={{ minWidth: 90  }}>วันขาไป</th>
                  <th className="px-4 py-3 text-right" style={{ minWidth: 70  }}>Seat</th>
                  <th className="px-4 py-3 text-left"  style={{ minWidth: 120 }}>แหล่งที่มา</th>
                  <th className="px-4 py-3"            style={{ minWidth: 80  }}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.directPnrs.map(({ stock, pnr, relationship }) => {
                  const seriesHasThis = seriesIdSet.has(stock.stockId)
                  const badge  = relBadge(relationship)
                  const source = sourceLabel(relationship, seriesHasThis)
                  return (
                    <tr key={pnr.pnrId} className="hover:bg-slate-50 transition-colors align-middle">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="font-mono font-semibold text-slate-800 break-all leading-snug">
                            {pnr.pnrCode || pnr.pnrDisplay}
                          </span>
                          <span className={cn('inline-flex self-start text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap', badge.cls)}>
                            {badge.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap',
                          pnr.pnrType === 'real' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600')}>
                          {pnr.pnrType === 'real' ? 'PNR' : 'Dummy PNR'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap">{stock.stockCode}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 leading-snug">{getPnrRoute(pnr, stock)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {pnr.travelStart ? formatDate(pnr.travelStart) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-right tabular-nums font-medium">
                        {pnr.seatTotal ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap', source.cls)}>
                          {source.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <ActionBtn title="ดูรายละเอียด" onClick={() => router.push(`/tickets/${stock.stockId}`)} />
                          <ActionBtn
                            title="ยกเลิกการกำหนดโดยตรง"
                            danger
                            onClick={() => setRemoveTarget({
                              type: 'pnr',
                              stockId: stock.stockId,
                              pnrId: pnr.pnrId,
                              code: pnr.pnrCode || pnr.pnrDisplay,
                              relationship,
                              seriesHasThisTemplate: seriesHasThis,
                            })}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── History ────────────────────────────────────────────────────────── */}
      <Section title="ประวัติการกำหนดและยกเลิก" count={stats.logs.length}>
        {stats.logs.length === 0 ? (
          <EmptyState text="ยังไม่มีประวัติ" />
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5">
            {stats.logs.map(log => (
              <div key={log.logId} className="flex items-start gap-3 px-4 py-3 bg-white border border-slate-100 rounded-xl hover:border-slate-200 transition-colors">
                <Clock size={12} className="text-slate-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  {/* Badges row */}
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap', LOG_ACTION_COLORS[log.action] ?? 'bg-slate-100 text-slate-600')}>
                      {LOG_ACTION_LABELS[log.action] ?? log.action}
                    </span>
                    <span className="font-mono text-[11px] text-slate-600 font-semibold">{log.stockCode}</span>
                    {log.pnrCode && <span className="text-[11px] text-slate-500">· {log.pnrCode}</span>}
                    {log.relationshipType && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap',
                        log.relationshipType === 'OVERRIDE' ? 'bg-orange-50 text-orange-700' :
                        log.relationshipType === 'DIRECT'   ? 'bg-blue-50 text-blue-700' :
                                                              'bg-slate-100 text-slate-500')}>
                        {log.relationshipType === 'OVERRIDE' ? 'Override'
                          : log.relationshipType === 'DIRECT' ? 'กำหนดโดยตรง'
                          : 'Inherited'}
                      </span>
                    )}
                  </div>
                  {/* Condition change */}
                  {(log.prevCondCode || log.newCondCode) && (
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {log.prevCondCode && (
                        <span>Condition เดิม: <span className="font-medium text-slate-500">{log.prevCondCode}</span></span>
                      )}
                      {log.prevCondCode && log.newCondCode && <span className="mx-1">→</span>}
                      {log.newCondCode && (
                        <span className="font-medium text-slate-600">{log.newCondCode}</span>
                      )}
                    </p>
                  )}
                  {/* Timestamp */}
                  <p className="text-[10px] text-slate-400">
                    {formatDate(log.performedAt)} · {log.performedBy}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <ConditionAssignModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        template={template}
        onSaved={handleSaved}
      />

      <RemoveConfirmModal
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemoveConfirm}
        title={removeTarget?.type === 'series' ? 'ยกเลิก Condition จาก Series' : 'ยกเลิก Condition จาก PNR'}
        body={removeBody}
      />
    </div>
  )
}
