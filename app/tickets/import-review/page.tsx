'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Badge, PNRStatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import {
  buildRouteText,
  formatDate,
  formatDateTime,
  formatNumber,
  formatStockPeriod,
  generateDummyPnrs,
  calcTTLDatetime,
} from '@/lib/utils'
import {
  saveDemoStock,
  buildPaymentSchedule,
  calculateStockSummary,
} from '@/lib/demo-storage'
import type { DemoStock, DemoPNR, DemoSector, DemoLog } from '@/lib/demo-storage'
import type { AppStockCondition } from '@/lib/condition-schema'
import { newConditionId, newStageId, defaultBaggagePolicy, defaultSeatReductionPolicy, defaultSeatReturnPolicy, defaultRefundTerms, defaultCancelGroupTerms, defaultChangeTerms, defaultTtlRule } from '@/lib/condition-schema'
import type { ImportReviewData, ImportPNR } from '@/lib/excel-import'
import { addDays, format as fnsFormat, parseISO, isValid } from 'date-fns'
import { ChevronLeft, CheckCircle, AlertCircle, AlertTriangle, Copy } from 'lucide-react'

// ── Inline ID generator (no dependency on demo-storage genId) ─────────────────
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMaxDayOffset(sectors: ImportReviewData['sectors']): number {
  if (!sectors.length) return 0
  return Math.max(...sectors.map(s => s.dayOffset))
}

function computeTravelEnd(travelStart: string, maxDayOffset: number): string {
  if (!travelStart) return ''
  try {
    const d = parseISO(travelStart)
    if (!isValid(d)) return ''
    return fnsFormat(addDays(d, Math.max(0, maxDayOffset - 1)), 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

const _PNR_DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
function pnrDayAbbr(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try { const d = parseISO(dateStr); return isValid(d) ? _PNR_DAY_ABBR[d.getDay()] : '—' } catch { return '—' }
}

function getArrDayOffset(
  arrDayOffset: number | undefined | null,
  depTime: string,
  arrTime: string,
): number {
  if (arrDayOffset !== undefined && arrDayOffset !== null) return arrDayOffset
  if (!depTime || !arrTime) return 0
  return arrTime < depTime ? 1 : 0
}

// ── PNR cell (reuses detail page style) ──────────────────────────────────────

function PNRCell({ code, dummy }: { code: string; dummy: string }) {
  const display = code || dummy
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs font-bold">
        {display || <span className="text-slate-300 italic font-normal text-[10px]">รอ Generate</span>}
      </span>
      {code ? (
        <span className="inline-flex w-fit px-1.5 py-px rounded text-[9px] font-medium bg-blue-50 text-blue-600 border border-blue-200 whitespace-nowrap">
          PNR
        </span>
      ) : dummy ? (
        <span className="inline-flex w-fit px-1.5 py-px rounded text-[9px] font-medium bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">
          Dummy
        </span>
      ) : null}
    </div>
  )
}

// ── Tax cell ──────────────────────────────────────────────────────────────────

function TaxCell({ taxType, tax }: { taxType: string; tax: number }) {
  if (taxType === 'included') return <span className="text-slate-400 italic text-[10px]">รวมใน Fare</span>
  if (taxType === 'pending') return <span className="text-amber-500 italic text-[10px]">รอระบุ</span>
  return <>{formatNumber(tax)}</>
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  'Summary',
  'Stock Info',
  'Flight Sectors',
  'Conditions',
  'PNR',
  'Payment Schedule',
  'Errors & Warnings',
  'JSON Preview',
]

// ── Inner component (uses router/searchParams) ────────────────────────────────

function ImportReviewInner() {
  const router = useRouter()
  const [tab, setTab] = useState('Summary')
  const [data, setData] = useState<ImportReviewData | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ticket_import_review_data')
      if (raw) {
        setData(JSON.parse(raw) as ImportReviewData)
      }
    } catch {
      // ignore parse error
    }
  }, [])

  if (!data) {
    return (
      <AppLayout title="Import Review">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <AlertCircle size={40} className="text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">ไม่พบข้อมูล Import</p>
          <p className="text-xs text-slate-400 mt-1">กรุณา Import ไฟล์ Excel ก่อน</p>
          <button
            onClick={() => router.back()}
            className="mt-5 text-sm text-[#05a94f] hover:underline"
          >
            ← กลับ
          </button>
        </div>
      </AppLayout>
    )
  }

  const { stockInfo, sectors, conditions, pnrs, issues } = data

  // ── Derived values ──────────────────────────────────────────

  const routeText = buildRouteText(
    sectors.map(s => ({ dep_airport_code: s.depAirportCode, arr_airport_code: s.arrAirportCode }))
  )

  const travelStarts = pnrs.map(p => p.travelStart).filter(Boolean).sort()
  const periodStart = travelStarts[0] ?? null
  const periodEnd = travelStarts[travelStarts.length - 1] ?? null
  const stockPeriod = formatStockPeriod(periodStart, periodEnd)

  const maxDayOffset = getMaxDayOffset(sectors)

  // Generate dummy PNRs
  type PNRDummyInput = { pnr_code: string; dummy_pnr: string; travel_start: string }
  const pnrsWithDummy: (ImportPNR & { dummy_pnr: string })[] = generateDummyPnrs<PNRDummyInput>(
    pnrs.map(p => ({ pnr_code: p.pnrCode, dummy_pnr: '', travel_start: p.travelStart })),
    { ticket_type: stockInfo.ticketType, airline_code: stockInfo.airlineCode, group_type: stockInfo.groupType }
  ).map((d, i) => ({ ...pnrs[i], dummy_pnr: d.dummy_pnr }))

  // Compute totals per PNR
  const pnrRows = pnrsWithDummy.map(p => {
    const travelEnd = computeTravelEnd(p.travelStart, maxDayOffset)
    const total = p.taxType === 'separate' ? p.fare + p.tax : p.fare
    // TTL from condition
    let ttlDateTime: string | null = null
    if (p.conditionCode) {
      const cond = conditions.find(c => c.conditionCode === p.conditionCode)
      if (cond) {
        const rule = cond.ttlRule
        if (rule?.ttlCalcType === 'from_travel_date') {
          ttlDateTime = calcTTLDatetime(p.travelStart, rule.ttlBaseDate, rule.ttlDaysBefore, rule.ttlTime)
        } else if (rule?.ttlCalcType === 'manual' && rule.ttlDate) {
          const [h, m] = (rule.ttlTime || '18:00').split(':').map(Number)
          const dt = new Date(rule.ttlDate); dt.setHours(h, m, 0, 0)
          ttlDateTime = dt.toISOString()
        }
      }
    }
    return { ...p, travelEnd, total, ttlDateTime }
  })

  const errorCount = issues.filter(i => i.level === 'error').length
  const warnCount = issues.filter(i => i.level === 'warning').length
  const hasErrors = errorCount > 0

  const totalSeats = pnrs.reduce((s, p) => s + p.seatTotal, 0)
  const totalFareTax = pnrRows.reduce((s, p) => s + p.total, 0)

  // ── Build DemoStock for save ────────────────────────────────

  function buildDemoStock(): DemoStock {
    const now = new Date().toISOString()
    const stockId = genId('STK')

    const demoSectors: DemoSector[] = sectors.map((s, i) => ({
      sectorId: genId('SEC'),
      seq: s.seq ?? i + 1,
      sectorType: s.sectorType,
      airlineCode: s.airlineCode,
      flightNo: s.flightNo,
      depAirportCode: s.depAirportCode,
      arrAirportCode: s.arrAirportCode,
      depTime: s.depTime,
      arrTime: s.arrTime,
      arrDayOffset: s.arrDayOffset,
      dayOffset: s.dayOffset,
      remark: s.remark ?? '',
    }))

    const demoConditions: AppStockCondition[] = conditions.map(c => ({
      source: 'custom' as const,
      condition: {
        conditionId: newConditionId(),
        conditionCode: c.conditionCode ?? '',
        conditionName: c.conditionName ?? '',
        description: c.description ?? '',
        status: (c.status ?? 'Active') as 'Active' | 'Inactive',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stages: (c.stages ?? []).map((st: any, si: number) => ({
          stageId: newStageId(),
          stageNo: (st.stageSeq as number) ?? (si + 1),
          stageName: (st.stageName as string) ?? `งวดที่ ${si + 1}`,
          paymentType: ((st.paymentType as string) ?? '') as import('@/lib/condition-schema').CondPaymentType | '',
          customPaymentName: '',
          calcType: (() => {
            const t = (st.amountType as string) ?? ''
            if (t === 'Percent') return 'PERCENT_OF_BASE' as const
            if (t === 'Remaining' || t === 'REMAINING_BALANCE') return 'REMAINING_BALANCE' as const
            if (t === 'PER_SEAT' || t === 'FIXED_SEAT') return 'PER_SEAT' as const
            return 'FIXED_PER_PNR' as const
          })(),
          amount: (st.amount as number) ?? 0,
          currencyCode: (st.currencyCode as string) ?? '',
          percent: (st.amount as number) ?? 0,
          calcBase: null,
          dueType: (() => {
            const b = ((st.paymentBaseDate as string) || (st.baseDate as string)) ?? ''
            return b.includes('Travel') ? 'TRAVEL_MINUS_DAYS' as const : 'CREATED_PLUS_DAYS' as const
          })(),
          dueDays: (st.paymentDueDaysBefore as number) ?? (st.dueDaysBefore as number) ?? 30,
          dueTime: (st.paymentDueTime as string) || '18:00',
          dueDate: '',
          creditTowardFare: false,
          quantityBasis: 'INITIAL_SEAT' as const,
          refundable: 'NON_REFUNDABLE' as const,
          nonRefundable: false,
          remark: '',
        })),
        ttlRule: {
          calcType: (() => {
            const t = c.ttlRule?.ttlCalcType ?? 'not_set'
            if (t === 'from_travel_date') return 'TRAVEL_MINUS_DAYS' as const
            if (t === 'manual') return 'MANUAL_DATE' as const
            return 'NOT_SET' as const
          })(),
          daysBefore: c.ttlRule?.ttlDaysBefore ?? 30,
          fixedDate: c.ttlRule?.ttlDate ?? '',
          time: c.ttlRule?.ttlTime ?? '18:00',
          remark: '',
        },
        issuanceMode:        'SEPARATE' as const,
        ticketDlRule:        defaultTtlRule(),
        airline:             '',
        currency:            'THB',
        conditionType:       'Custom' as const,
        applyScope:          'ALL' as const,
        applyRoutes:         [],
        applyCountries:      [],
        effectiveDate:       '',
        version:             'V1',
        baggagePolicy: defaultBaggagePolicy(),
        seatReductionPolicy: defaultSeatReductionPolicy(),
        cancelGroupTerms:    defaultCancelGroupTerms(),
        changeTerms:         defaultChangeTerms(),
        seatReturnPolicy: defaultSeatReturnPolicy(),
        refundPolicy: { enabled: false, refundType: null, description: '', tiers: [] },
        refundTerms: defaultRefundTerms(),
        freeTextCondition: '',
        freeTextHtml:      '',
        internalNote: '',
      },
    }))

    const demoPNRs: DemoPNR[] = pnrRows.map(p => {
      const isReal = !!p.pnrCode
      const pnrType: 'real' | 'dummy' = isReal ? 'real' : 'dummy'
      const pnrDisplay = isReal ? p.pnrCode : (p.dummy_pnr || '')

      let taxStatus: 'completed' | 'included' | 'pending'
      if (p.taxType === 'included') taxStatus = 'included'
      else if (p.taxType === 'pending') taxStatus = 'pending'
      else taxStatus = 'completed'

      let ttlDate: string | null = null
      let ttlTimeStr: string | null = null
      if (p.ttlDateTime) {
        try {
          const d = parseISO(p.ttlDateTime)
          if (isValid(d)) {
            ttlDate = fnsFormat(d, 'yyyy-MM-dd')
            ttlTimeStr = fnsFormat(d, 'HH:mm')
          }
        } catch { /* keep null */ }
      }

      return {
        pnrId: genId('PNR'),
        pnrCode: p.pnrCode ?? '',
        dummyPnr: p.dummy_pnr ?? '',
        pnrType,
        pnrDisplay,
        travelStart: p.travelStart ?? '',
        travelEnd: p.travelEnd ?? '',
        sectorDates: sectors.map(s => ({
          sectorType: s.sectorType,
          date: computeTravelEnd(p.travelStart, s.dayOffset),
        })),
        seatTotal: p.seatTotal,
        seatUsed: 0,
        seatBalance: p.seatTotal,
        fare: p.fare,
        taxType: p.taxType,
        tax: p.tax,
        fareIncludesTax: p.taxType === 'included',
        taxStatus,
        total: p.total,
        conditionCode: p.conditionCode ?? '',
        ttlDate,
        ttlTime: ttlTimeStr,
        ttlDateTime: p.ttlDateTime,
        status: p.status ?? 'Pending',
        remark: p.remark ?? '',
      }
    })

    const summary = calculateStockSummary(demoPNRs)

    const logs: DemoLog[] = [
      {
        logId: genId('LOG'),
        action: 'Import Excel',
        message: `Import Stock ${stockInfo.stockCode} จาก Excel`,
        createdAt: now,
        createdBy: 'System',
      },
    ]
    const dummyCount = demoPNRs.filter(p => p.pnrType === 'dummy').length
    if (dummyCount > 0) {
      logs.push({
        logId: genId('LOG'),
        action: 'Generate Dummy PNR',
        message: `สร้าง Dummy PNR อัตโนมัติ ${dummyCount} รายการ`,
        createdAt: now,
        createdBy: 'System',
      })
    }

    return {
      stockId,
      stockCode: stockInfo.stockCode,
      ticketType: stockInfo.ticketType as DemoStock['ticketType'],
      tripType: stockInfo.tripType as DemoStock['tripType'],
      groupName: stockInfo.groupName,
      airlineCode: stockInfo.airlineCode,
      countryId: stockInfo.countryId ?? '',
      destination: stockInfo.destination ?? '',
      currency: stockInfo.currency,
      remark: stockInfo.remark ?? '',
      routeText,
      createdAt: now,
      updatedAt: now,
      sectors: demoSectors,
      conditions: demoConditions,
      pnrs: demoPNRs,
      summary,
      logs,
      transactions: [],
    }
  }

  // ── Build payment schedule preview from import data ─────────

  interface PaySchedRow {
    pnrDisplay: string
    stageSeq: number
    stageName: string
    paymentType: string
    amountType: string
    amount: number
    dueDate: string | null
    ttlDatetime: string | null
    status: 'Pending' | 'Paid' | 'Overdue'
  }

  function buildImportPaymentSchedule(): PaySchedRow[] {
    const items: PaySchedRow[] = []
    for (const p of pnrRows) {
      if (!p.conditionCode) continue
      const cond = conditions.find(c => c.conditionCode === p.conditionCode)
      if (!cond || !cond.stages.length) continue

      let cumulative = 0
      const sortedStages = [...cond.stages].sort((a, b) => a.stageSeq - b.stageSeq)
      for (const st of sortedStages) {
        const baseDateStr = p.travelStart
        let dueDate: string | null = null
        let ttlDatetime: string | null = null
        if (baseDateStr) {
          try {
            const d = parseISO(baseDateStr)
            if (isValid(d)) {
              const due = addDays(d, -(st.paymentDueDaysBefore ?? st.dueDaysBefore ?? 0))
              dueDate = fnsFormat(due, 'yyyy-MM-dd')
              ttlDatetime = `${dueDate}T${st.paymentDueTime || st.ttlTime || '18:00'}:00`
            }
          } catch { /* keep null */ }
        }
        let amount = 0
        const total = p.total
        if (st.amountType === 'Fixed') {
          amount = st.amount
          cumulative += amount
        } else if (st.amountType === 'Percent') {
          amount = Math.round(total * st.amount / 100)
          cumulative += amount
        } else {
          amount = Math.max(0, total - cumulative)
        }
        items.push({
          pnrDisplay: p.pnrCode || p.dummy_pnr || `PNR-${p.travelStart}`,
          stageSeq: st.stageSeq,
          stageName: st.stageName,
          paymentType: st.paymentType,
          amountType: st.amountType,
          amount,
          dueDate,
          ttlDatetime,
          status: 'Pending',
        })
      }
    }
    return items
  }

  const paySchedule = buildImportPaymentSchedule()

  // ── Save demo ───────────────────────────────────────────────

  async function handleSave() {
    if (hasErrors) return
    setSaving(true)
    try {
      const stock = buildDemoStock()
      saveDemoStock(stock)
      setSaveOk(true)
      sessionStorage.removeItem('ticket_import_review_data')
      setTimeout(() => {
        const type = stockInfo.ticketType
        if (type === 'Group') router.push('/tickets/group')
        else if (type === 'FIT') router.push('/tickets/fit')
        else router.push('/tickets/land')
      }, 1200)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── JSON preview data ───────────────────────────────────────

  const previewJson = JSON.stringify(data, null, 2)
  const previewDemoStock = hasErrors ? null : (() => {
    try { return JSON.stringify(buildDemoStock(), null, 2) } catch { return null }
  })()

  // ── Render ──────────────────────────────────────────────────

  return (
    <AppLayout title="Import Review">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">ตรวจสอบข้อมูล Import</h1>
          <p className="text-sm text-slate-500">
            {stockInfo.stockCode || '(ยังไม่ระบุ Series Code)'} · {stockInfo.ticketType} · {stockInfo.groupName}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Error / warning chips */}
          {errorCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200">
              <AlertCircle size={12} /> {errorCount} Error
            </span>
          )}
          {warnCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200">
              <AlertTriangle size={12} /> {warnCount} Warning
            </span>
          )}
          <Button variant="ghost" size="sm" icon={<ChevronLeft size={14} />} onClick={() => router.back()}>
            กลับ
          </Button>
          {saveOk ? (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200">
              <CheckCircle size={14} /> บันทึกสำเร็จ
            </span>
          ) : (
            <Button
              size="sm"
              disabled={hasErrors || saving}
              loading={saving}
              onClick={handleSave}
              style={{ backgroundColor: '#05a94f' }}
              className="text-white"
            >
              Save Demo
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto scrollbar-thin mb-4">
        <div className="flex border-b border-slate-200 min-w-max">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t
                  ? 'border-[#05a94f] text-[#05a94f]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t}
              {t === 'Errors & Warnings' && (errorCount + warnCount) > 0 && (
                <span className={`ml-1.5 inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-bold ${errorCount > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                  {errorCount + warnCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary ── */}
      {tab === 'Summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400">Route</p>
              <p className="font-mono font-bold text-slate-800 text-sm mt-1">{routeText || '—'}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400">Period (Dep Date)</p>
              <p className="text-sm font-medium mt-1">{stockPeriod || '—'}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400">PNR / Seats</p>
              <p className="text-sm font-bold text-[#05a94f] mt-1">{pnrs.length} PNR / {totalSeats} ที่นั่ง</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400">Fare + Tax ({stockInfo.currency})</p>
              <p className="text-sm font-bold text-[#05a94f] mt-1">{formatNumber(totalFareTax)}</p>
            </div>
          </div>

          {/* Error / Warning chips */}
          {(errorCount > 0 || warnCount > 0) && (
            <div className="flex flex-wrap gap-2">
              {errorCount > 0 && (
                <div
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200 cursor-pointer hover:bg-red-100"
                  onClick={() => setTab('Errors & Warnings')}
                >
                  <AlertCircle size={14} /> {errorCount} Errors — บันทึกไม่ได้จนกว่าจะแก้ไข
                </div>
              )}
              {warnCount > 0 && (
                <div
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-amber-50 text-amber-700 border border-amber-200 cursor-pointer hover:bg-amber-100"
                  onClick={() => setTab('Errors & Warnings')}
                >
                  <AlertTriangle size={14} /> {warnCount} Warnings — บันทึกได้แต่ควรตรวจสอบ
                </div>
              )}
            </div>
          )}
          {errorCount === 0 && warnCount === 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 text-green-700 border border-green-200 text-sm font-medium">
              <CheckCircle size={16} /> ข้อมูลถูกต้องทั้งหมด พร้อมบันทึก
            </div>
          )}
        </div>
      )}

      {/* ── Stock Info ── */}
      {tab === 'Stock Info' && (
        <Card>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              {([
                ['Series Code',  stockInfo.stockCode,   'font-mono font-bold'],
                ['Ticket Type',  stockInfo.ticketType],
                ['Trip Type',    stockInfo.tripType],
                ['Series Name',  stockInfo.groupName,   'sm:col-span-2'],
                ['Airline',      stockInfo.airlineCode, 'font-bold'],
                ['Route',        routeText,             'font-mono font-bold text-[#05a94f]'],
['Destination',  stockInfo.destination],
                ['Currency',     stockInfo.currency],
                ['Remark',       stockInfo.remark,      'sm:col-span-3'],
              ] as [string, string, string?][]).map(([label, value, cls]) => (
                <div key={label} className={cls || ''}>
                  <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                  <p className={`text-slate-800 ${cls || ''}`}>{value || '—'}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Flight Sectors ── */}
      {tab === 'Flight Sectors' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          {sectors.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">ไม่พบข้อมูล Flight Sectors</div>
          ) : (
            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['#', 'Type', 'Airline', 'Flight', 'From', 'To', 'Dep Time', 'Arr Time', '+Day', 'Travel Day', 'Remark'].map(h => (
                    <th key={h} className="px-3 h-9 text-xs font-semibold text-slate-500 text-center whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sectors.map((s, i) => {
                  const arrDay = getArrDayOffset(s.arrDayOffset, s.depTime, s.arrTime)
                  return (
                    <tr key={s.seq} className={`border-b border-slate-100 last:border-0 ${i % 2 === 0 ? '' : 'bg-slate-50/40'} hover:bg-slate-50`}>
                      <td className="px-3 py-2.5 text-xs text-center text-slate-400">{s.seq}</td>
                      <td className="px-3 py-2.5 text-xs text-center">
                        <span className={`font-medium ${s.sectorType === 'Departure' ? 'text-green-600' : s.sectorType === 'Arrival' ? 'text-purple-600' : 'text-slate-600'}`}>
                          {s.sectorType === 'Arrival' ? 'Return' : s.sectorType}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600">{s.airlineCode}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono font-bold text-center">{s.airlineCode}{s.flightNo || '—'}</td>
                      <td className="px-3 py-2.5 text-xs font-mono font-bold text-center">{s.depAirportCode}</td>
                      <td className="px-3 py-2.5 text-xs font-mono font-bold text-center">{s.arrAirportCode}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-center">{s.depTime}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-center">{s.arrTime}</td>
                      <td className="px-3 py-2.5 text-xs text-center">
                        {arrDay === 0
                          ? <span className="text-slate-400">0</span>
                          : <span className="font-semibold text-orange-500">+{arrDay}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-center text-slate-500">{s.dayOffset ?? 0}</td>
                      <td className="px-3 py-2.5 text-xs text-center text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap">{s.remark || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Conditions ── */}
      {tab === 'Conditions' && (
        <div className="space-y-4">
          {conditions.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-center text-slate-400 py-8 text-sm">ไม่พบ Condition</p>
              </CardContent>
            </Card>
          ) : (
            conditions.map(c => (
              <Card key={c.conditionCode}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">{c.conditionCode}</span>
                    <CardTitle>{c.conditionName}</CardTitle>
                    <Badge variant={c.status === 'Active' ? 'green' : 'gray'}>{c.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHead>
                      <tr>
                        <Th>#</Th>
                        <Th>Stage</Th>
                        <Th>Type</Th>
                        <Th>Amount Type</Th>
                        <Th>Amount</Th>
                        <Th>Base Date</Th>
                        <Th>Due Days Before</Th>
                        <Th>TTL Time</Th>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {c.stages.map(st => (
                        <TableRow key={st.stageSeq}>
                          <Td className="text-xs text-slate-400">{st.stageSeq}</Td>
                          <Td className="text-sm font-medium">{st.stageName}</Td>
                          <Td><Badge variant="gray">{st.paymentType}</Badge></Td>
                          <Td className="text-xs">{st.amountType}</Td>
                          <Td className="text-sm">
                            {st.amountType === 'Fixed'
                              ? formatNumber(st.amount)
                              : st.amountType === 'Percent'
                              ? `${st.percent || st.amount}%`
                              : <span className="text-slate-400 italic">ส่วนที่เหลือ</span>}
                          </Td>
                          <Td className="text-xs">{st.baseDate}</Td>
                          <Td className="text-xs">{st.dueDaysBefore} วัน</Td>
                          <Td className="text-xs font-mono">{st.ttlTime}</Td>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── PNR ── */}
      {tab === 'PNR' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table>
            <TableHead>
              <tr>
                <Th>PNR</Th>
                <Th>Flight Set</Th>
                <Th className="text-center w-[60px]">Day</Th>
                <Th>Dep Date</Th>
                <Th>Arr Date</Th>
                <Th className="text-right">Seat</Th>
                <Th className="text-right">Fare</Th>
                <Th className="text-right">Tax</Th>
                <Th className="text-right">Total</Th>
                <Th>Condition</Th>
                <Th>TTL</Th>
                <Th>Status</Th>
              </tr>
            </TableHead>
            <TableBody>
              {pnrRows.length === 0 ? (
                <EmptyRow cols={12} message="ไม่พบข้อมูล PNR" />
              ) : (
                pnrRows.map((p, i) => (
                  <TableRow key={i}>
                    <Td><PNRCell code={p.pnrCode} dummy={p.dummy_pnr} /></Td>
                    <Td className="text-xs">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium">Default</span>
                    </Td>
                    <Td className="text-center text-xs font-semibold tracking-wide text-slate-600">{pnrDayAbbr(p.travelStart)}</Td>
                    <Td className="text-xs">{p.travelStart ? formatDate(p.travelStart) : '—'}</Td>
                    <Td className="text-xs">{p.travelEnd ? formatDate(p.travelEnd) : '—'}</Td>
                    <Td className="text-right text-sm">{p.seatTotal}</Td>
                    <Td className="text-right text-xs">{formatNumber(p.fare)}</Td>
                    <Td className="text-right text-xs"><TaxCell taxType={p.taxType} tax={p.tax} /></Td>
                    <Td className="text-right text-xs font-bold">{formatNumber(p.total)}</Td>
                    <Td className="text-xs">
                      {p.conditionCode
                        ? <Badge variant="green">{p.conditionCode}</Badge>
                        : <span className="text-slate-300 italic text-[10px]">ไม่ระบุ</span>}
                    </Td>
                    <Td className="text-xs">
                      {p.ttlDateTime
                        ? <span className="text-orange-600 font-medium">{formatDateTime(p.ttlDateTime)}</span>
                        : '—'}
                    </Td>
                    <Td>
                      <PNRStatusBadge status={p.status} />
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Payment Schedule ── */}
      {tab === 'Payment Schedule' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <Table>
            <TableHead>
              <tr>
                <Th>PNR</Th>
                <Th>#</Th>
                <Th>Stage</Th>
                <Th>Type</Th>
                <Th className="text-right">Amount ({stockInfo.currency})</Th>
                <Th>Due Date</Th>
                <Th>NAME DL (Deadline)</Th>
                <Th>Status</Th>
              </tr>
            </TableHead>
            <TableBody>
              {paySchedule.length === 0 ? (
                <EmptyRow cols={8} message="ยังไม่มี Payment Schedule เนื่องจาก PNR ยังไม่เลือก Condition" />
              ) : (
                paySchedule.map((p, i) => (
                  <TableRow key={i}>
                    <Td className="font-mono text-xs font-bold">{p.pnrDisplay}</Td>
                    <Td className="text-xs text-slate-400">{p.stageSeq}</Td>
                    <Td className="text-sm">{p.stageName}</Td>
                    <Td><Badge variant="gray">{p.paymentType}</Badge></Td>
                    <Td className="text-right font-medium text-sm">{formatNumber(p.amount)}</Td>
                    <Td className="text-xs">{p.dueDate ? formatDate(p.dueDate) : '—'}</Td>
                    <Td className="text-xs font-medium text-orange-600">
                      {p.ttlDatetime ? formatDateTime(p.ttlDatetime) : '—'}
                    </Td>
                    <Td>
                      <Badge variant={p.status === 'Paid' ? 'green' : p.status === 'Overdue' ? 'red' : 'yellow'}>
                        {p.status}
                      </Badge>
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Errors & Warnings ── */}
      {tab === 'Errors & Warnings' && (
        <div className="space-y-5">
          {issues.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-4 rounded-xl bg-green-50 text-green-700 border border-green-200 text-sm font-medium">
              <CheckCircle size={18} /> ข้อมูลถูกต้องทั้งหมด พร้อมบันทึก
            </div>
          ) : (
            <>
              {/* Errors */}
              {issues.filter(i => i.level === 'error').length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                    <AlertCircle size={14} /> Errors (บันทึกไม่ได้)
                  </h3>
                  <div className="space-y-2">
                    {issues.filter(i => i.level === 'error').map((issue, idx) => (
                      <div key={idx} className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                        <span className="font-semibold">[{issue.sheet}] {issue.field}</span>
                        {issue.row && <span className="text-red-500 ml-1">Row {issue.row}</span>}
                        <span className="ml-2">{issue.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {issues.filter(i => i.level === 'warning').length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={14} /> Warnings (บันทึกได้)
                  </h3>
                  <div className="space-y-2">
                    {issues.filter(i => i.level === 'warning').map((issue, idx) => (
                      <div key={idx} className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                        <span className="font-semibold">[{issue.sheet}] {issue.field}</span>
                        {issue.row && <span className="text-amber-500 ml-1">Row {issue.row}</span>}
                        <span className="ml-2">{issue.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── JSON Preview ── */}
      {tab === 'JSON Preview' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-700">ImportReviewData (raw import)</span>
              <Button
                variant="outline"
                size="sm"
                icon={<Copy size={12} />}
                onClick={() => handleCopy(previewJson)}
              >
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <pre className="p-4 text-xs text-slate-600 overflow-x-auto max-h-80 font-mono leading-relaxed">
              {previewJson}
            </pre>
          </div>

          {previewDemoStock && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-700">DemoStock (จะบันทึก)</span>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Copy size={12} />}
                  onClick={() => handleCopy(previewDemoStock)}
                >
                  Copy
                </Button>
              </div>
              <pre className="p-4 text-xs text-slate-600 overflow-x-auto max-h-80 font-mono leading-relaxed">
                {previewDemoStock}
              </pre>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}

// ── Page export (wraps in Suspense per Next.js 15 requirement) ─────────────────

export default function ImportReviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">Loading...</div>}>
      <ImportReviewInner />
    </Suspense>
  )
}
