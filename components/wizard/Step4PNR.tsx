'use client'

import { useRef, useState, useMemo, useEffect, Fragment } from 'react'
import { PlusCircle, Info, CalendarDays, FileUp, Download, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn, formatTravelDate, formatDateThai, formatDateTimeThai, calcTravelEndFromSectors, calcSectorDate } from '@/lib/utils'
import { hasTtl } from '@/lib/ttl-utils'
import { BulkPnrBuilder } from '@/components/shared/BulkPnrBuilder'
import type { BulkPnrRow, BulkPnrSector, BulkPnrFlightSet, BulkPnrCondition } from '@/components/shared/BulkPnrBuilder'
import { SinglePnrModal } from '@/components/shared/SinglePnrModal'
import type { PnrFormValues, PnrModalFlightSet, PnrModalCondition } from '@/lib/pnr-shared-utils'
import type { FlightPNRFormData, FlightSectorFormData, FlightScheduleFormData, PNRStatus, TaxType } from '@/types'
import type { AppCondition } from '@/lib/condition-schema'
import { TimeInput } from '@/components/ui/time-input'
import ImportExcelModal from '@/components/wizard/ImportExcelModal'
import type { PastedExcelRow } from '@/lib/paste-excel'
import { downloadPnrTemplate } from '@/lib/excel-template'
import { getDemoStocks } from '@/lib/demo-storage'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { PNRSeatsTable } from '@/components/shared/PNRSeatsTable'
import type { PNRRecord, ScheduleTemplate } from '@/lib/pnr-record'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emptyPNR(
  defaultCurrency = 'THB',
  opts?: { seats?: number; priceFormat?: 'FARE' | 'FARE_YQ' | 'ALL_IN' }
): FlightPNRFormData {
  return {
    pnr_code: '', dummy_pnr: '', travel_start: '', travel_end: '',
    seat_total: opts?.seats ?? 40,
    price_format: opts?.priceFormat ?? 'FARE',
    fare: 0, yq: null, tax_type: 'separate',
    tax: null, total_amount: 0, currency: defaultCurrency, condition_id: '',
    status: 'Pending', pnr_status: 'PENDING', confirmation_status: 'PENDING_CONFIRMATION',
    remark: '', sector_dates: [], ttl_status: 'UNSET', ttl_date: null,
    ttl_time: null, ttl_remark: '', ttl_type: 'NONE', ttl_days_before: null,
  }
}

function calcPnrTotal(fmt: string, fare: number, tax: number | null, yq: number | null): number {
  if (fmt === 'ALL_IN') return fare
  if (fmt === 'FARE_YQ') return fare + (yq ?? 0)
  return fare + (tax ?? 0) + (yq ?? 0)
}

const TTL_NEAR_DAYS = 7
function getTtlStatus(ttlDate: string | null, ttlTime: string | null): 'unset' | 'past' | 'near' | 'ok' {
  if (!ttlDate) return 'unset'
  const now = new Date()
  const ttlDt = new Date(`${ttlDate}T${ttlTime || '00:00'}:00`)
  if (isNaN(ttlDt.getTime())) return 'unset'
  if (ttlDt < now) return 'past'
  if (ttlDt.getTime() - now.getTime() <= TTL_NEAR_DAYS * 86400000) return 'near'
  return 'ok'
}

function formatTtlDisplay(ttlDate: string | null, ttlTime: string | null): string {
  return formatDateTimeThai(ttlDate, ttlTime)
}

function subtractDaysFromDate(dateStr: string, days: number): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() - days)
    return d.toISOString().split('T')[0]
  } catch { return '' }
}

function addDaysToDate(dateStr: string, days: number): string {
  if (!dateStr || days === 0) return dateStr
  try {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch { return dateStr }
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Step4Props {
  pnrs: FlightPNRFormData[]
  schedules: FlightScheduleFormData[]
  conditions: AppCondition[]
  currency: string
  onChange: (pnrs: FlightPNRFormData[]) => void
  showValidation?: boolean
  defaultSeatsPerPnr?: number
  defaultPriceFormat?: 'FARE' | 'FARE_YQ' | 'ALL_IN'
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Step4PNR({
  pnrs, schedules, conditions, currency, onChange, showValidation = false,
  defaultSeatsPerPnr, defaultPriceFormat,
}: Step4Props) {
  const mainSectors = schedules.find(s => s.isMain)?.sectors ?? schedules[0]?.sectors ?? []

  const getPnrSectors = (pnr: FlightPNRFormData): FlightSectorFormData[] => {
    if (!pnr.schedule_id) return mainSectors
    return schedules.find(s => s.scheduleId === pnr.schedule_id)?.sectors ?? mainSectors
  }
  const sectors = mainSectors

  // ─── ScheduleTemplates for PNRSeatsTable ──────────────────────────────────
  const scheduleTemplates = useMemo((): ScheduleTemplate[] =>
    schedules.map(sch => ({
      scheduleId:   sch.scheduleId,
      scheduleName: sch.scheduleName,
      isMain:       sch.isMain,
      sectors:      sch.sectors.map(s => ({
        sectorType:     s.sector_type,
        dayOffset:      s.day_offset,
        arrDayOffset:   s.arr_day_offset ?? 0,
        depAirportCode: s.dep_airport_code ?? '',
        arrAirportCode: s.arr_airport_code ?? '',
        depTime:        s.dep_time ?? '',
        arrTime:        s.arr_time ?? '',
      })),
    }))
  , [schedules])

  // ─── Adapters ─────────────────────────────────────────────────────────────
  const getSectorDatesForPnr = (p: FlightPNRFormData, sects: FlightSectorFormData[]) => {
    if (p.sector_dates && p.sector_dates.length === sects.length) {
      return p.sector_dates.map((sd, i) => {
        const s = sects[i]
        // Always derive dep from travel_start for non-manual sectors — never use stale stored travel_date
        const dep = (!sd.dep_manual && !!p.travel_start)
          ? (calcSectorDate(p.travel_start, s.day_offset) ?? '')
          : (sd.travel_date ?? '')
        const arr = sd.arr_manual ? (sd.arr_date ?? '') : (dep ? addDaysToDate(dep, s?.arr_day_offset ?? 0) : '')
        return { ...sd, day_offset: s?.day_offset ?? sd.day_offset, travel_date: dep, arr_date: arr,
          dep_time: sd.dep_time !== undefined ? sd.dep_time : (s?.dep_time ?? ''),
          arr_time: sd.arr_time !== undefined ? sd.arr_time : (s?.arr_time ?? '') }
      })
    }
    return sects.map(s => {
      const dep = p.travel_start ? calcSectorDate(p.travel_start, s.day_offset) ?? '' : ''
      return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
        arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '',
        dep_manual: false as const, arr_manual: false as const,
        dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
    })
  }

  const pnrToRecord = (p: FlightPNRFormData, idx: number): PNRRecord => {
    const sects = getPnrSectors(p)
    const sectorDates = getSectorDatesForPnr(p, sects)
    return {
      rowId:           String(idx),
      seq:             idx + 1,
      pnrCode:         p.pnr_code,
      dummyPnr:        p.dummy_pnr,
      activeScheduleId: p.schedule_id,
      seatTotal:       p.seat_total,
      priceFormat:     (p.price_format ?? 'FARE') as 'FARE' | 'FARE_YQ' | 'ALL_IN',
      fare:            p.fare,
      yq:              p.yq ?? null,
      tax:             p.tax ?? null,
      taxType:         (p.tax_type ?? 'separate') as 'separate' | 'included' | 'pending',
      totalAmount:     p.total_amount,
      currency:        p.currency || currency,
      conditionId:     p.condition_id || '',
      remark:          p.remark || '',
      ttlType:         (p.ttl_type ?? 'NONE') as 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE',
      ttlDate:         p.ttl_date ?? null,
      ttlTime:         p.ttl_time ?? null,
      ttlDaysBefore:   p.ttl_days_before ?? null,
      sectors:         sects.map((s, i) => {
        const sd = sectorDates[i]
        return {
          sectorType:     s.sector_type,
          dayOffset:      s.day_offset,
          arrDayOffset:   s.arr_day_offset ?? 0,
          depAirportCode: s.dep_airport_code ?? '',
          arrAirportCode: s.arr_airport_code ?? '',
          depDate:        sd?.travel_date ?? '',
          depTime:        sd?.dep_time ?? s.dep_time ?? '',
          arrDate:        sd?.arr_date ?? '',
          arrTime:        sd?.arr_time ?? s.arr_time ?? '',
          depManual:      sd?.dep_manual ?? false,
          arrManual:      sd?.arr_manual ?? false,
          timeOverride:   sd?.time_override ?? false,
          tmplDepTime:    s.dep_time ?? '',
          tmplArrTime:    s.arr_time ?? '',
        }
      }),
    }
  }

  const recordToPnr = (rec: PNRRecord, orig: FlightPNRFormData): FlightPNRFormData => {
    const sects = getPnrSectors(orig)
    return {
      ...orig,
      pnr_code:       rec.pnrCode,
      dummy_pnr:      rec.pnrCode.trim() ? '' : orig.dummy_pnr,
      schedule_id:    rec.activeScheduleId,
      seat_total:     rec.seatTotal,
      price_format:   rec.priceFormat,
      fare:           rec.fare,
      yq:             rec.yq,
      tax:            rec.tax,
      tax_type:       rec.taxType as TaxType,
      total_amount:   rec.totalAmount,
      currency:       rec.currency,
      condition_id:   rec.conditionId,
      remark:         rec.remark,
      ttl_type:       rec.ttlType,
      ttl_date:       rec.ttlDate,
      ttl_time:       rec.ttlTime,
      ttl_days_before: rec.ttlDaysBefore,
      ttl_status:     rec.ttlType !== 'NONE' && rec.ttlDate ? 'SET' : 'UNSET',
      travel_start:   rec.sectors[0]?.depDate || orig.travel_start,
      travel_end:     rec.sectors[rec.sectors.length - 1]?.arrDate || orig.travel_end,
      sector_dates:   rec.sectors.map((sd, i) => ({
        sector_type:  sects[i]?.sector_type ?? sd.sectorType,
        day_offset:   sd.dayOffset,
        travel_date:  sd.depDate,
        arr_date:     sd.arrDate,
        dep_manual:   sd.depManual,
        arr_manual:   sd.arrManual,
        dep_time:     sd.depTime,
        arr_time:     sd.arrTime,
        time_override: sd.timeOverride,
      })),
    }
  }

  const records = useMemo(() => pnrs.map((p, i) => pnrToRecord(p, i)), [pnrs, schedules]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTableChange = (newRecords: PNRRecord[]) => {
    onChange(newRecords.map((rec, i) => recordToPnr(rec, pnrs[i] ?? emptyPNR(currency))))
  }

  const handleDelete = (rowId: string) => {
    const idx = parseInt(rowId, 10)
    if (isNaN(idx)) return
    onChange(pnrs.filter((_, i) => i !== idx))
  }

  const handleDuplicate = (rowId: string) => {
    const idx = parseInt(rowId, 10)
    if (isNaN(idx)) return
    const src = pnrs[idx]
    onChange([...pnrs.slice(0, idx + 1), { ...src, id: undefined, pnr_code: '', dummy_pnr: '' }, ...pnrs.slice(idx + 1)])
  }

  // ─── SinglePnrModal helpers ───────────────────────────────────────────────
  const [showSinglePnrModal, setShowSinglePnrModal] = useState(false)

  const pnrFlightSets: PnrModalFlightSet[] = useMemo(() =>
    schedules.map(s => ({
      flightSetId: s.scheduleId,
      flightSetName: s.scheduleName || (s.isMain ? 'Main' : s.scheduleId),
      sectors: s.sectors.map((sec, i) => ({
        sectorId: sec.id || `S${i}`,
        seq: sec.seq,
        sectorType: sec.sector_type,
        airlineCode: sec.airline_code || null,
        flightNo: sec.flight_no || null,
        depAirportCode: sec.dep_airport_code || null,
        arrAirportCode: sec.arr_airport_code || null,
        depTime: sec.dep_time || null,
        arrTime: sec.arr_time || null,
        dayOffset: sec.day_offset,
        arrDayOffset: sec.arr_day_offset ?? null,
      })),
    }))
  , [schedules])

  const pnrConditions: PnrModalCondition[] = useMemo(() =>
    conditions.filter(c => c.status === 'Active').map(c => ({
      code: c.conditionCode,
      name: c.conditionName,
      ttlRule: c.ttlRule.calcType === 'NOT_SET' ? undefined : {
        calcType: (c.ttlRule.calcType === 'TRAVEL_MINUS_DAYS' ? 'TRAVEL_MINUS_DAYS'
          : c.ttlRule.calcType === 'MANUAL_DATE' ? 'FIXED_DATE' : 'NONE') as 'TRAVEL_MINUS_DAYS' | 'FIXED_DATE' | 'NONE',
        daysBefore: c.ttlRule.daysBefore || null,
        fixedDate: c.ttlRule.fixedDate || null,
        time: c.ttlRule.time || null,
      },
    }))
  , [conditions])

  const handleSinglePnrConfirm = async (values: PnrFormValues) => {
    const sch   = schedules.find(s => s.scheduleId === values.flightSetId) ?? schedules.find(s => s.isMain) ?? schedules[0]
    const sects = sch?.sectors ?? sectors
    const fare  = Number(values.fare) || 0
    const yq    = Number(values.yq)   || 0
    const tax   = Number(values.tax)  || 0
    const allIn = Number(values.allIn) || 0
    const total = values.priceFormat === 'ALL_IN' ? allIn
      : values.priceFormat === 'FARE_YQ' ? fare + yq
      : fare + yq + tax
    const sectorDates = sects.map(s => {
      const dep = values.travelStart ? (calcSectorDate(values.travelStart, s.day_offset) ?? '') : ''
      const arr = dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : ''
      return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
        arr_date: arr, dep_manual: false as const, arr_manual: false as const,
        dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
    })
    let ttlDate: string | null = null, ttlTime: string | null = null
    if (values.ttlType === 'FIXED_DATE') {
      ttlDate = values.ttlDate || null; ttlTime = values.ttlTime || null
    } else if (values.ttlType === 'DAYS_BEFORE' && values.ttlDaysBefore && values.travelStart) {
      const days = parseInt(values.ttlDaysBefore, 10)
      if (!isNaN(days)) { ttlDate = subtractDaysFromDate(values.travelStart, days); ttlTime = values.ttlTime || null }
    }
    const newPnr: FlightPNRFormData = {
      pnr_code:            values.pnrCode,
      dummy_pnr:           '',
      travel_start:        values.travelStart,
      travel_end:          sectorDates[sectorDates.length - 1]?.arr_date || values.travelStart,
      seat_total:          Number(values.seatTotal) || (defaultSeatsPerPnr ?? 40),
      price_format:        values.priceFormat,
      fare:                values.priceFormat === 'ALL_IN' ? allIn : fare,
      yq:                  values.priceFormat !== 'FARE' ? (yq || null) : null,
      tax_type:            values.priceFormat === 'ALL_IN' ? 'included' : 'separate',
      tax:                 values.priceFormat === 'FARE' ? (tax || null) : null,
      total_amount:        total,
      currency,
      condition_id:        values.conditionCode,
      status:              'Pending',
      pnr_status:          'PENDING',
      confirmation_status: 'PENDING_CONFIRMATION',
      remark:              values.remark,
      sector_dates:        sectorDates,
      ttl_status:          ttlDate ? 'SET' : 'UNSET',
      ttl_date:            ttlDate,
      ttl_time:            ttlTime,
      ttl_remark:          '',
      ttl_type:            values.ttlType,
      ttl_days_before:     values.ttlType === 'DAYS_BEFORE' ? (parseInt(values.ttlDaysBefore, 10) || null) : null,
      schedule_id:         values.flightSetId || undefined,
    }
    onChange([...pnrs, newPnr])
  }

  // ─── UI state ─────────────────────────────────────────────────────────────
  const [bulkOpen,        setBulkOpen]        = useState(false)
  const [importOpen,      setImportOpen]      = useState(false)
  const [bulkTtlOpen,     setBulkTtlOpen]     = useState(false)
  const [bulkTtlMode,     setBulkTtlMode]     = useState<'days_before' | 'fixed_date'>('days_before')
  const [bulkTtlDays,     setBulkTtlDays]     = useState('14')
  const [bulkTtlFixedDate, setBulkTtlFixedDate] = useState('')
  const [bulkTtlTime,     setBulkTtlTime]     = useState('17:00')
  const [bulkTtlScope,    setBulkTtlScope]    = useState<'no_ttl' | 'all' | 'selected'>('no_ttl')
  const [bulkTtlSelectedPnrs, setBulkTtlSelectedPnrs] = useState<Set<number>>(new Set())
  const [bulkTtlInnerStep, setBulkTtlInnerStep] = useState<'config' | 'overwrite_confirm'>('config')
  const [toastMsg,        setToastMsg]        = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [newRowHighlight, setNewRowHighlight] = useState<{ start: number; count: number } | null>(null)
  const newHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingScrollIdx = useRef<number | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2500)
  }

  useEffect(() => {
    const idx = pendingScrollIdx.current
    if (idx === null) return
    pendingScrollIdx.current = null
    const el = document.querySelector<HTMLElement>(`[data-pnr-idx="${idx}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [pnrs])

  // ─── Row operations ────────────────────────────────────────────────────────
  const addRow = () => onChange([...pnrs, emptyPNR(currency, { seats: defaultSeatsPerPnr, priceFormat: defaultPriceFormat })])

  const addBulkPNRs = (rows: BulkPnrRow[]) => {
    const newPNRs: FlightPNRFormData[] = rows.map(row => {
      const pnr = emptyPNR(currency)
      pnr.pnr_code = row.pnrCode; pnr.dummy_pnr = ''
      pnr.travel_start = row.travelStart
      pnr.travel_end = row.travelEnd || calcTravelEndFromSectors(row.travelStart, sectors) || ''
      pnr.sector_dates = sectors.map(s => {
        const dep = calcSectorDate(row.travelStart, s.day_offset) || ''
        return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
          arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
          dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
      })
      pnr.seat_total = row.seatTotal; pnr.price_format = row.priceFormat as 'FARE' | 'FARE_YQ' | 'ALL_IN'
      pnr.fare = row.fare; pnr.tax_type = row.taxType as TaxType
      pnr.tax = row.priceFormat === 'FARE' ? (row.tax ?? null) : null
      pnr.yq = row.priceFormat !== 'ALL_IN' ? (row.yq ?? null) : null
      pnr.total_amount = row.total; pnr.condition_id = row.conditionCode
      pnr.status = (row.status || 'Pending') as PNRStatus; pnr.remark = row.remark
      pnr.ttl_type = row.ttlType; pnr.ttl_days_before = row.ttlDaysBefore
      pnr.ttl_status = row.ttlType !== 'NONE' && row.ttlDate ? 'SET' : 'UNSET'
      pnr.ttl_date = row.ttlDate ?? null; pnr.ttl_time = row.ttlTime ?? null
      return pnr
    })
    const firstNewIdx = pnrs.length
    pendingScrollIdx.current = firstNewIdx
    setNewRowHighlight({ start: firstNewIdx, count: newPNRs.length })
    if (newHighlightTimerRef.current) clearTimeout(newHighlightTimerRef.current)
    newHighlightTimerRef.current = setTimeout(() => setNewRowHighlight(null), 2500)
    showToast(`เพิ่ม PNR ลงในตารางแล้ว ${newPNRs.length} รายการ`)
    onChange([...pnrs, ...newPNRs])
  }

  const addPastedPNRs = (rows: PastedExcelRow[]) => {
    const newPNRs: FlightPNRFormData[] = rows.map(row => {
      const pnr = emptyPNR(currency)
      pnr.pnr_code = row.pnrCode; pnr.travel_start = row.outboundDate
      pnr.travel_end = row.returnDate || calcTravelEndFromSectors(row.outboundDate, sectors) || ''
      pnr.sector_dates = sectors.map(s => {
        const dep = calcSectorDate(row.outboundDate, s.day_offset) || ''
        return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
          arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
          dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
      })
      pnr.seat_total = row.seatCount; pnr.fare = 0; pnr.tax_type = 'separate'; pnr.tax = null; pnr.total_amount = 0
      pnr.condition_id = conditions.length === 1 ? conditions[0].conditionId : ''; pnr.status = 'Pending'
      return pnr
    })
    onChange([...pnrs, ...newPNRs])
  }

  const builderSectors: BulkPnrSector[] = sectors.map(s => ({
    sectorType:     s.sector_type,
    dayOffset:      s.day_offset,
    depAirportCode: s.dep_airport_code,
    arrAirportCode: s.arr_airport_code,
    depTime:        s.dep_time || undefined,
    arrTime:        s.arr_time || undefined,
    arrDayOffset:   s.arr_day_offset ?? 0,
    airlineCode:    s.airline_code || undefined,
    flightNo:       s.flight_no || undefined,
  }))

  // Build FlightSets from schedules so BulkPnrBuilder shows FS selector
  const builderFlightSets: BulkPnrFlightSet[] = schedules.map(sch => ({
    flightSetId:   sch.scheduleId,
    flightSetName: sch.scheduleName || (sch.isMain ? 'Main Schedule' : sch.scheduleId),
    sectors: sch.sectors.map(s => ({
      sectorType:     s.sector_type,
      dayOffset:      s.day_offset,
      depAirportCode: s.dep_airport_code,
      arrAirportCode: s.arr_airport_code,
      depTime:        s.dep_time || undefined,
      arrTime:        s.arr_time || undefined,
      arrDayOffset:   s.arr_day_offset ?? 0,
      airlineCode:    s.airline_code || undefined,
      flightNo:       s.flight_no || undefined,
    })),
  }))

  const builderConditions: BulkPnrCondition[] = conditions.map(c => ({
    code: c.conditionId, name: c.conditionName,
    stages: c.stages.map(st => ({ paymentBaseDate: st.dueType === 'TRAVEL_MINUS_DAYS' ? 'Travel Start' : 'Created Date', paymentDueDaysBefore: st.dueDays, paymentDueTime: st.dueTime })),
    ttlRule: { calcType: c.ttlRule?.calcType ?? 'NOT_SET', baseDate: 'Travel Start', daysBefore: c.ttlRule?.daysBefore ?? 0, date: c.ttlRule?.fixedDate, time: c.ttlRule?.time },
  }))

  // ─── Outdated PNRs ────────────────────────────────────────────────────────
  const outdatedCount = pnrs.filter(p => p.date_sync_status === 'OUTDATED').length
  const updateOutdatedPNRs = () => {
    onChange(pnrs.map(p => {
      if (p.date_sync_status !== 'OUTDATED' || !p.travel_start) return p
      const pnrSectors = getPnrSectors(p)
      const newSDs = pnrSectors.map(s => {
        const dep = calcSectorDate(p.travel_start!, s.day_offset) ?? ''
        return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep,
          arr_date: dep ? addDaysToDate(dep, s.arr_day_offset ?? 0) : '', dep_manual: false as const, arr_manual: false as const,
          dep_time: s.dep_time ?? '', arr_time: s.arr_time ?? '', time_override: false as const }
      })
      return { ...p, travel_end: calcTravelEndFromSectors(p.travel_start, pnrSectors) ?? p.travel_end, travel_end_override: false, sector_dates: newSDs, date_sync_status: 'SYNCED' as const }
    }))
  }

  // ─── Bulk TTL ─────────────────────────────────────────────────────────────
  const getTargetPnrIndices = (): number[] => {
    if (bulkTtlScope === 'all') return pnrs.map((_, i) => i)
    if (bulkTtlScope === 'selected') return [...bulkTtlSelectedPnrs].sort((a, b) => a - b)
    return pnrs.reduce<number[]>((acc, p, i) => { if (!hasTtl(p)) acc.push(i); return acc }, [])
  }
  const computeTtlDateForPnr = (pnr: FlightPNRFormData): string | null => {
    if (bulkTtlMode === 'fixed_date') return bulkTtlFixedDate || null
    const days = parseInt(bulkTtlDays, 10)
    if (isNaN(days) || days < 0 || !pnr.travel_start) return null
    return subtractDaysFromDate(pnr.travel_start, days)
  }
  const closeBulkTtl = () => { setBulkTtlOpen(false); setBulkTtlInnerStep('config') }
  const commitBulkTtl = (mode: 'all' | 'skip_existing') => {
    const targets = getTargetPnrIndices(); const updated = [...pnrs]; let changed = false
    for (const i of targets) {
      if (mode === 'skip_existing' && hasTtl(updated[i])) continue
      const ttlDate = computeTtlDateForPnr(updated[i]); if (!ttlDate) continue
      const ttlType = bulkTtlMode === 'days_before' ? 'DAYS_BEFORE' : 'FIXED_DATE'
      const ttlDaysBefore = bulkTtlMode === 'days_before' ? parseInt(bulkTtlDays, 10) : null
      updated[i] = { ...updated[i], ttl_type: ttlType, ttl_days_before: ttlDaysBefore, ttl_status: 'SET', ttl_date: ttlDate, ttl_time: bulkTtlTime || null }
      changed = true
    }
    if (changed) onChange(updated)
    closeBulkTtl()
  }
  const handleBulkTtlConfirm = () => {
    const targets = getTargetPnrIndices(); if (targets.length === 0) return
    if (targets.some(i => hasTtl(pnrs[i])) && bulkTtlScope !== 'no_ttl') { setBulkTtlInnerStep('overwrite_confirm'); return }
    commitBulkTtl('all')
  }

  const ttlTargetIndices = bulkTtlOpen ? getTargetPnrIndices() : []
  const ttlDaysNum = parseInt(bulkTtlDays, 10)
  const ttlDaysValid = !isNaN(ttlDaysNum) && ttlDaysNum >= 0
  const ttlTimeValid = /^\d{2}:\d{2}$/.test(bulkTtlTime)
  const ttlCanApply = (bulkTtlMode === 'days_before' ? ttlDaysValid : !!bulkTtlFixedDate) && ttlTimeValid && ttlTargetIndices.length > 0
  const ttlPreviewRows = ttlTargetIndices.slice(0, 4).map(i => {
    const pnr = pnrs[i]
    const computedDate = bulkTtlMode === 'days_before' ? (ttlDaysValid && pnr.travel_start ? subtractDaysFromDate(pnr.travel_start, ttlDaysNum) : null) : (bulkTtlFixedDate || null)
    return { index: i, pnr, computedDate }
  })
  const ttlNoDepsCount = bulkTtlMode === 'days_before' ? ttlTargetIndices.filter(i => !pnrs[i].travel_start).length : 0
  const ttlPastWarning = ttlPreviewRows.some(r => r.computedDate ? getTtlStatus(r.computedDate, bulkTtlTime) === 'past' : false)

  const summaryStats = useMemo(() => {
    const totalPnr = pnrs.length
    const totalSeats = pnrs.reduce((acc, p) => acc + (p.seat_total || 0), 0)
    const noTtlCount = pnrs.filter(p => !hasTtl(p)).length
    return { totalPnr, totalSeats, noTtlCount }
  }, [pnrs])

  const conditionsForTable = useMemo(() =>
    conditions.map(c => ({ conditionId: c.conditionId, conditionName: c.conditionName }))
  , [conditions])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-1.5">

      {/* Toast (for bulk-add notifications) */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-slate-800/95 text-white text-xs px-4 py-2 rounded-full shadow-xl pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* OUTDATED banner */}
      {outdatedCount > 0 && (
        <div className="flex items-center gap-2.5 px-3 py-1.5 bg-amber-50 border border-amber-300 rounded-lg">
          <AlertTriangle size={12} className="text-amber-600 shrink-0" />
          <span className="text-[12px] text-amber-800 flex-1">มี {outdatedCount} PNR ที่ใช้วันที่จาก Flight Set เวอร์ชันเดิม</span>
          <button type="button" onClick={updateOutdatedPNRs}
            className="flex items-center gap-1 text-[11px] font-semibold text-amber-800 border border-amber-400 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded transition-colors whitespace-nowrap">
            <RefreshCw size={11} />อัปเดตทั้งหมด
          </button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 flex-wrap px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg min-h-[38px]">
        <div className="flex items-center gap-1 text-[11px] text-slate-400 flex-1 min-w-0">
          <Info size={11} className="text-blue-400 shrink-0" />
          <span className="truncate">PNR ว่างได้ · ระบบคำนวณวันที่ Sector ให้อัตโนมัติ</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {([
            { label: '+ เพิ่ม PNR', onClick: () => setShowSinglePnrModal(true), cls: 'text-white bg-[#05a94f] hover:bg-[#048f43] border-[#05a94f]' },
            { label: 'Import', onClick: () => setImportOpen(true), cls: 'text-blue-600 border-blue-300 hover:bg-blue-50', icon: <FileUp size={11} /> },
            { label: 'Template', onClick: () => downloadPnrTemplate(sectors), cls: 'text-slate-600 border-slate-300 hover:bg-slate-100', icon: <Download size={11} /> },
            { label: 'หลาย PNR', onClick: () => setBulkOpen(true), cls: 'text-[#05a94f] border-[#05a94f] hover:bg-green-50', icon: <CalendarDays size={11} /> },
            { label: 'ตั้ง TTL', onClick: () => { setBulkTtlOpen(true); setBulkTtlInnerStep('config') }, cls: 'text-amber-700 border-amber-400 hover:bg-amber-50', disabled: pnrs.length === 0, icon: <CalendarDays size={11} /> },
          ] as const).map(btn => (
            <button key={btn.label} type="button" onClick={btn.onClick} disabled={'disabled' in btn ? btn.disabled : false}
              className={cn('h-[30px] flex items-center gap-1 px-2.5 text-[12px] font-medium border rounded-md transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed', btn.cls)}>
              {'icon' in btn && btn.icon}{btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── PNR Table (shared component) ── */}
      {pnrs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 border border-slate-200 rounded-xl bg-white">
          <PlusCircle size={28} className="text-slate-200" strokeWidth={1} />
          <p className="text-[13px] text-slate-400">ยังไม่มีรายการ PNR</p>
          <p className="text-[11px] text-slate-300">กดปุ่ม &quot;+ เพิ่ม PNR&quot; หรือ &quot;หลาย PNR&quot; ด้านบน</p>
        </div>
      ) : (
        <PNRSeatsTable
          records={records}
          scheduleTemplates={scheduleTemplates}
          conditions={conditionsForTable}
          currency={currency}
          mode="step3"
          immediateRecalcOnTravelStart
          showValidation={showValidation}
          newHighlight={newRowHighlight}
          onChange={handleTableChange}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
        />
      )}

      {/* ── Summary bar ── */}
      {pnrs.length > 0 && (
        <div className="flex items-center gap-0 h-[34px] px-3 bg-white border border-slate-200 rounded-lg text-[12px] overflow-hidden">
          {[
            { label: 'PNR รวม', value: summaryStats.totalPnr, cls: 'text-slate-700' },
            { label: 'Seat รวม', value: summaryStats.totalSeats.toLocaleString('en-US'), cls: 'text-slate-700' },
            ...(summaryStats.noTtlCount > 0 ? [{ label: 'ยังไม่มี NAME DL', value: summaryStats.noTtlCount, cls: 'text-slate-400' }] : []),
          ].map((item, i) => (
            <Fragment key={item.label}>
              {i > 0 && <span className="text-slate-200 mx-2.5 text-[13px]">|</span>}
              <span className="text-slate-400 whitespace-nowrap">{item.label}</span>
              <span className={cn('ml-1.5 font-bold tabular-nums whitespace-nowrap', item.cls)}>{item.value}</span>
            </Fragment>
          ))}
        </div>
      )}

      {/* ── Bulk TTL Modal ── */}
      <Modal open={bulkTtlOpen} onClose={closeBulkTtl} title="ตั้งค่า NAME DL" size="lg"
        footer={
          bulkTtlInnerStep === 'config'
            ? <div className="flex w-full items-center justify-between gap-2"><Button variant="ghost" onClick={closeBulkTtl}>ยกเลิก</Button><Button disabled={!ttlCanApply} onClick={handleBulkTtlConfirm}>ยืนยัน ({ttlTargetIndices.length} PNR)</Button></div>
            : <div className="flex w-full items-center justify-start"><Button variant="ghost" size="sm" onClick={() => setBulkTtlInnerStep('config')}>กลับแก้ไข</Button></div>
        }>
        {bulkTtlInnerStep === 'config' ? (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2.5">วิธีกำหนด NAME DL</p>
              <div className="flex gap-6">
                {(['days_before', 'fixed_date'] as const).map(m => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="radio" name="ttl_mode" checked={bulkTtlMode === m} onChange={() => setBulkTtlMode(m)} className="accent-[#05a94f]" />
                    <span className="text-sm text-slate-700">{m === 'days_before' ? 'ก่อนวันเดินทาง' : 'เลือกวันที่เอง'}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
              {bulkTtlMode === 'days_before' ? (
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">ก่อนวันเดินทาง <span className="text-red-400">*</span></label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={365} value={bulkTtlDays} onChange={e => setBulkTtlDays(e.target.value)}
                      className="w-20 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]" />
                    <span className="text-sm text-slate-500">วัน</span>
                  </div>
                  {bulkTtlDays !== '' && !ttlDaysValid && <p className="text-[11px] text-red-500 mt-1">ต้องเป็นตัวเลข ≥ 0</p>}
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">วันที่ NAME DL <span className="text-red-400">*</span></label>
                  <input type="date" value={bulkTtlFixedDate} onChange={e => setBulkTtlFixedDate(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]" />
                </div>
              )}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">เวลา <span className="text-red-400">*</span></label>
                <TimeInput value={bulkTtlTime} onChange={setBulkTtlTime} compact placeholder="HH:mm" className="border border-slate-300 rounded-lg bg-white" />
                {bulkTtlTime && !ttlTimeValid && <p className="text-[11px] text-red-500 mt-1">รูปแบบ HH:mm</p>}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2.5">ขอบเขต</p>
              <div className="flex flex-col gap-2">
                {(['no_ttl', 'all', 'selected'] as const).map(scope => (
                  <label key={scope} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer select-none transition-colors',
                    bulkTtlScope === scope ? 'border-[#05a94f] bg-green-50/50' : 'border-slate-200 hover:bg-slate-50')}>
                    <input type="radio" name="ttl_scope" checked={bulkTtlScope === scope} onChange={() => setBulkTtlScope(scope)} className="accent-[#05a94f]" />
                    <span className="text-sm text-slate-700 flex-1">{scope === 'no_ttl' ? 'เฉพาะ PNR ที่ยังไม่มี NAME DL' : scope === 'all' ? 'ทุก PNR' : 'เฉพาะ PNR ที่เลือก'}</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                      {scope === 'no_ttl' ? pnrs.filter(p => !hasTtl(p)).length : scope === 'all' ? pnrs.length : bulkTtlSelectedPnrs.size}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {bulkTtlScope === 'selected' && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">เลือก PNR</span>
                  <div className="flex gap-3">
                    <button type="button" className="text-[11px] text-[#05a94f] hover:underline" onClick={() => setBulkTtlSelectedPnrs(new Set(pnrs.map((_, i) => i)))}>เลือกทั้งหมด</button>
                    <button type="button" className="text-[11px] text-slate-400 hover:underline" onClick={() => setBulkTtlSelectedPnrs(new Set())}>ยกเลิกทั้งหมด</button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {pnrs.map((p, i) => {
                    const pSt = getTtlStatus(p.ttl_date ?? null, p.ttl_time ?? null)
                    return (
                      <label key={i} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 select-none">
                        <input type="checkbox" checked={bulkTtlSelectedPnrs.has(i)}
                          onChange={() => { const nx = new Set(bulkTtlSelectedPnrs); if (nx.has(i)) nx.delete(i); else nx.add(i); setBulkTtlSelectedPnrs(nx) }}
                          className="accent-[#05a94f]" />
                        <span className="text-xs font-mono text-slate-700 w-24 truncate shrink-0">{p.pnr_code || p.dummy_pnr || `PNR #${i + 1}`}</span>
                        <span className="text-xs text-slate-400 shrink-0">{p.travel_start ? formatTravelDate(p.travel_start) : '—'}</span>
                        {hasTtl(p) && p.ttl_date && (
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded ml-auto shrink-0',
                            pSt === 'past' ? 'text-red-600 bg-red-50' : pSt === 'near' ? 'text-amber-700 bg-amber-50' : 'text-green-700 bg-green-50')}>
                            {formatTtlDisplay(p.ttl_date, p.ttl_time ?? null)}
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            {ttlTargetIndices.length > 0 && ttlCanApply && (
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">ตัวอย่าง NAME DL ({ttlTargetIndices.length} PNR)</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200">PNR</th>
                        <th className="px-3 py-2 text-center font-medium text-slate-500 border-b border-slate-200">Dep Date</th>
                        {bulkTtlMode === 'days_before' && <th className="px-3 py-2 text-center font-medium text-slate-500 border-b border-slate-200">−{bulkTtlDays} วัน</th>}
                        <th className="px-3 py-2 text-center font-medium text-slate-500 border-b border-slate-200">NAME DL ที่จะตั้ง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ttlPreviewRows.map(({ index, pnr, computedDate }, i) => {
                        const st = computedDate ? getTtlStatus(computedDate, bulkTtlTime) : 'unset'
                        const noDep = bulkTtlMode === 'days_before' && !pnr.travel_start
                        return (
                          <tr key={i} className={noDep ? 'opacity-50' : ''}>
                            <td className="px-3 py-2 font-mono text-slate-700">{pnr.pnr_code || pnr.dummy_pnr || `PNR #${index + 1}`}</td>
                            <td className="px-3 py-2 text-center text-slate-500">{pnr.travel_start ? formatTravelDate(pnr.travel_start) : <span className="text-slate-300">—</span>}</td>
                            {bulkTtlMode === 'days_before' && <td className="px-3 py-2 text-center text-slate-400">{noDep ? '—' : `−${bulkTtlDays} วัน`}</td>}
                            <td className="px-3 py-2 text-center">
                              {computedDate
                                ? <span className={cn('font-semibold', st === 'past' ? 'text-red-600' : st === 'near' ? 'text-amber-700' : 'text-green-700')}>{formatTtlDisplay(computedDate, bulkTtlTime)}</span>
                                : <span className="text-slate-300 italic">ไม่สามารถคำนวณ</span>}
                            </td>
                          </tr>
                        )
                      })}
                      {ttlTargetIndices.length > 4 && <tr><td colSpan={bulkTtlMode === 'days_before' ? 4 : 3} className="px-3 py-1.5 text-center text-[11px] text-slate-400 italic">และอีก {ttlTargetIndices.length - 4} PNR</td></tr>}
                    </tbody>
                  </table>
                </div>
                {ttlNoDepsCount > 0 && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700">{ttlNoDepsCount} PNR ยังไม่มีวันเดินทาง — จะถูกข้ามไป</p>
                  </div>
                )}
                {ttlPastWarning && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-700">NAME DL บางรายการเลยกำหนดแล้ว — ตรวจสอบก่อนบันทึก</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 mb-1">มี NAME DL อยู่แล้ว — ต้องการเขียนทับ?</p>
                <p className="text-xs text-amber-700">PNR บางรายการมีค่า NAME DL อยู่แล้ว การดำเนินการนี้จะเขียนทับค่าเดิม</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => commitBulkTtl('all')}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-left transition-colors">
                <div>
                  <p className="text-sm font-semibold text-amber-800">เขียนทับทั้งหมด</p>
                  <p className="text-xs text-amber-600 mt-0.5">อัปเดต NAME DL ของทุก PNR ในขอบเขตที่เลือก</p>
                </div>
              </button>
              <button type="button" onClick={() => commitBulkTtl('skip_existing')}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors">
                <div>
                  <p className="text-sm font-semibold text-slate-700">เฉพาะที่ยังไม่มี NAME DL</p>
                  <p className="text-xs text-slate-500 mt-0.5">ข้าม PNR ที่มีค่า NAME DL อยู่แล้ว</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Import Excel Modal ── */}
      <ImportExcelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onConfirm={addPastedPNRs}
        existingPnrCodes={pnrs.map(p => p.pnr_code).filter(Boolean)}
        sectors={mainSectors}
      />

      {/* ── Single PNR Modal ── */}
      <SinglePnrModal
        open={showSinglePnrModal}
        onClose={() => setShowSinglePnrModal(false)}
        mode="create_stock"
        flightSets={pnrFlightSets}
        conditions={pnrConditions}
        currency={currency}
        defaultSeatTotal={defaultSeatsPerPnr}
        defaultFlightSetId={pnrFlightSets[0]?.flightSetId}
        onConfirm={handleSinglePnrConfirm}
      />

      {/* ── BulkPnrBuilder ── */}
      <BulkPnrBuilder
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        mode="create_stock"
        flightSets={builderFlightSets.length > 0 ? builderFlightSets : undefined}
        sectors={builderSectors}
        conditions={builderConditions}
        currency={currency}
        defaultSeatTotal={defaultSeatsPerPnr}
        defaultPriceFormat={defaultPriceFormat}
        onConfirm={addBulkPNRs}
      />
    </div>
  )
}
