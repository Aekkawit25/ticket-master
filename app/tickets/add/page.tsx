'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useCallback, useMemo, useRef, Suspense } from 'react'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import WizardLayout from '@/components/wizard/WizardLayout'
import Step1StockInfo from '@/components/wizard/Step1StockInfo'
import Step2Sectors from '@/components/wizard/Step2Sectors'
import Step4PNR from '@/components/wizard/Step4PNR'
import Step5Review from '@/components/wizard/Step5Review'
import StockInitialConfigModal, { type StockInitialConfig, PRICE_TYPE_LABEL } from '@/components/wizard/StockInitialConfigModal'
import { validateSectors, generateStockCode, getStockCodePrefix, generateDummyPnrs, calcTravelEndFromSectors, calcSectorDate } from '@/lib/utils'
import { isValidHHmm, sameAirport } from '@/lib/time-utils'
import { MASTER_AIRLINE_CODE_SET } from '@/lib/master-data'
import { getStockTypeConfig, getStockTypeConfigSafe, getStockTypeKey, STOCK_TYPE_CONFIG, type StockType } from '@/lib/stock-type-config'
import { wizardStateToDemoStock, saveDemoStock, getDemoStocks, checkPNRDuplicatesInSystem, formatPNRConflictMessage } from '@/lib/demo-storage'
import { getDefaultCurrencyCode } from '@/lib/currency-storage'
import type { WizardState, FlightSeriesFormData, FlightSectorFormData, FlightScheduleFormData, TicketType, GroupType, TripType } from '@/types'
import PNRImpactModal, { computePNRImpact, computeSectorChanges, type ImpactedPNRItem, type SectorChange } from '@/components/wizard/PNRImpactModal'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

const STOCK_TYPE_KEYS: StockType[] = ['SERIES', 'AD_HOC', 'FIT', 'TICKET_ONLY']

function addDaysForNormalize(dateStr: string, days: number): string {
  if (!dateStr || days === 0) return dateStr
  try {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  } catch { return dateStr }
}

function normalizeForReview(state: WizardState): WizardState {
  const { schedules, stockInfo, pnrs } = state
  const mainSectors = schedules.find(s => s.isMain)?.sectors ?? schedules[0]?.sectors ?? []
  // Collect all dummy codes from OTHER stocks so new dummies never collide system-wide
  const systemDummies = new Set(
    getDemoStocks()
      .filter(s => s.stockCode !== stockInfo.stock_code)
      .flatMap(s => s.pnrs.map(p => p.dummyPnr).filter(Boolean)),
  )
  const normalizedPNRs = pnrs.map(p => {
    const pnrSectors = p.schedule_id
      ? schedules.find(s => s.scheduleId === p.schedule_id)?.sectors ?? mainSectors
      : mainSectors
    const computedEnd = p.travel_start
      ? calcTravelEndFromSectors(p.travel_start, pnrSectors) || p.travel_end || ''
      : p.travel_end || ''
    return {
      ...p,
      travel_end: (p.travel_end_override && p.travel_end) ? p.travel_end : computedEnd,
      sector_dates: p.travel_start
        ? pnrSectors.map((s, sIdx) => {
            const existing = p.sector_dates?.[sIdx]
            const dep = existing?.dep_manual
              ? (existing.travel_date || '')
              : (calcSectorDate(p.travel_start!, s.day_offset) || '')
            const arrDayOff = s.arr_day_offset ?? 0
            const arr = existing?.arr_manual
              ? (existing.arr_date || '')
              : (dep ? addDaysForNormalize(dep, arrDayOff) : dep)
            return {
              sector_type: s.sector_type,
              day_offset: s.day_offset,
              travel_date: dep,
              arr_date: arr,
              dep_time: existing?.dep_time ?? s.dep_time ?? '',
              arr_time: existing?.arr_time ?? s.arr_time ?? '',
              dep_manual: existing?.dep_manual ?? false,
              arr_manual: existing?.arr_manual ?? false,
              time_override: existing?.time_override ?? false,
            }
          })
        : p.sector_dates ?? [],
      total_amount: (() => {
        const f = p.fare || 0; const fmt = p.price_format ?? 'FARE'
        return fmt === 'ALL_IN' ? f : fmt === 'FARE_YQ' ? f + (p.yq ?? 0) : f + (p.tax ?? 0) + (p.yq ?? 0)
      })(),
    }
  })
  return { ...state, pnrs: generateDummyPnrs(normalizedPNRs, stockInfo, systemDummies) }
}

function getDefaultSchedule(ticketType: TicketType, airlineCode: string, travelDays = 1, sectorCount = 2): FlightScheduleFormData {
  const dep: FlightSectorFormData = { seq: 1, sector_type: 'Departure', airline_code: airlineCode, flight_no: '', dep_airport_code: 'BKK', arr_airport_code: '', dep_time: '08:00', arr_time: '16:00', arr_day_offset: 0, day_offset: 1, remark: '' }
  const arr: FlightSectorFormData = { seq: 2, sector_type: 'Arrival', airline_code: airlineCode, flight_no: '', dep_airport_code: '', arr_airport_code: 'BKK', dep_time: '17:00', arr_time: '22:00', arr_day_offset: 0, day_offset: travelDays, remark: '' }
  // FIT one-way: only Departure sector(s); count=1 → single sector
  if (ticketType === 'FIT' && sectorCount <= 1) {
    return { scheduleId: 'SCH-A', scheduleName: 'ชุดเที่ยวบินหลัก', isMain: true, remark: '', sectors: [dep] }
  }
  const count = Math.max(2, sectorCount)
  if (count === 2) {
    return { scheduleId: 'SCH-A', scheduleName: 'ชุดเที่ยวบินหลัก', isMain: true, remark: '', sectors: [dep, { ...arr, seq: 2 }] }
  }
  // count > 2: insert (count-2) Transit sectors between Departure and Arrival
  // Default Travel Day: all Transit = Day 1; Arrival = travelDays
  const transits: FlightSectorFormData[] = Array.from({ length: count - 2 }, (_, i) => ({
    seq: i + 2, sector_type: 'Transit', airline_code: airlineCode,
    flight_no: '', dep_airport_code: '', arr_airport_code: '',
    dep_time: '08:00', arr_time: '16:00', arr_day_offset: 0, day_offset: 1, remark: '',
  }))
  const sectors = [dep, ...transits, { ...arr, seq: count }].map((s, i) => ({ ...s, seq: i + 1 }))
  return { scheduleId: 'SCH-A', scheduleName: 'ชุดเที่ยวบินหลัก', isMain: true, remark: '', sectors }
}

// Adjusts sector count on an existing schedule set (used when user edits sectorCount in config).
// Keeps the first (Departure) and last (Arrival) sectors intact; adds/removes Transit sectors.
function adjustSectorCount(
  schedules: FlightScheduleFormData[],
  newCount: number,
  airlineCode: string,
  travelDays: number,
): FlightScheduleFormData[] {
  return schedules.map(sch => {
    const secs = sch.sectors
    if (secs.length === newCount) {
      return { ...sch, sectors: secs.map(s => ({ ...s, airline_code: airlineCode })) }
    }
    const first = { ...secs[0], airline_code: airlineCode }
    const last  = { ...secs[secs.length - 1], airline_code: airlineCode, day_offset: travelDays }
    if (newCount < 2) {
      return { ...sch, sectors: [{ ...first, seq: 1 }, { ...last, seq: 2 }].slice(0, newCount).map((s, i) => ({ ...s, seq: i + 1 })) }
    }
    const currentMids = secs.slice(1, -1)
    const targetMidCount = newCount - 2
    let newMids: FlightSectorFormData[]
    if (targetMidCount <= 0) {
      newMids = []
    } else if (targetMidCount <= currentMids.length) {
      newMids = currentMids.slice(0, targetMidCount).map(s => ({ ...s, airline_code: airlineCode }))
    } else {
      const extras: FlightSectorFormData[] = Array.from({ length: targetMidCount - currentMids.length }, () => ({
        seq: 0, sector_type: 'Transit', airline_code: airlineCode,
        flight_no: '', dep_airport_code: '', arr_airport_code: '',
        dep_time: '08:00', arr_time: '16:00', arr_day_offset: 0, day_offset: 1, remark: '',
      }))
      newMids = [...currentMids.map(s => ({ ...s, airline_code: airlineCode })), ...extras]
    }
    const newSectors = [first, ...newMids, last].map((s, i) => ({ ...s, seq: i + 1 }))
    return { ...sch, sectors: newSectors }
  })
}

function getPageTitle(ticketType: TicketType, groupType?: GroupType | null, typeConfirmed = true): string {
  if (!typeConfirmed) return 'Add Stock'
  const cfg = getStockTypeConfig(ticketType, groupType)
  return cfg?.addTitle ?? 'Add Stock'
}

const STEP_SUBTITLES: Record<number, string> = {
  1: 'Stock Info',
  2: 'Flight Segments / Sectors',
  3: 'PNR และ Seat',
  4: 'Review และบันทึก',
}

function AddStockPageInner() {
  const params = useSearchParams()
  const router = useRouter()

  // Support new ?stockType=SERIES format AND old ?type=Group&groupType=SERIES for backward compat
  const rawStockType    = params.get('stockType') as StockType | null
  const lockedStockType = rawStockType && STOCK_TYPE_KEYS.includes(rawStockType) ? rawStockType : null
  // Derive ticket_type + group_type from stockType (or fall back to old ?type= params)
  const lockedType: TicketType | null = lockedStockType
    ? STOCK_TYPE_CONFIG[lockedStockType].ticketType
    : params.get('type') as TicketType | null
  const lockedGroupType: GroupType | null = lockedStockType
    ? (STOCK_TYPE_CONFIG[lockedStockType].groupType ?? null) as GroupType | null
    : params.get('groupType') as GroupType | null
  const defaultType: TicketType = lockedType ?? 'Group'
  const isTypeLocked = lockedType !== null

  const [step, setStep] = useState(1)
  const [typeConfirmed, setTypeConfirmed] = useState(isTypeLocked)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveMsg, setSaveMsg] = useState('')
  const [saveError, setSaveError] = useState('')
  const [pnrValidationShown, setPnrValidationShown] = useState(false)
  const [currencyChangeConfirm, setCurrencyChangeConfirm] = useState<{
    oldCurrency: string
    newCurrency: string
  } | null>(null)

  // ── Initial Config ────────────────────────────────────────────────────────────
  const [initialConfig, setInitialConfig]               = useState<StockInitialConfig | null>(null)
  const [configOpen, setConfigOpen]                     = useState(true)
  const [editConfigOpen, setEditConfigOpen]             = useState(false)
  const [travelDaysConfirm, setTravelDaysConfirm]       = useState<{
    config: StockInitialConfig
    oldDays: number
  } | null>(null)
  const [sectorCountConfirm, setSectorCountConfirm]     = useState<{
    config: StockInitialConfig
    oldCount: number
  } | null>(null)
  const [stockTypeChangeConfirm, setStockTypeChangeConfirm] = useState<{
    config: StockInitialConfig
    oldStockType: StockType
  } | null>(null)

  // Snapshot of schedules taken when going back from PNR step to Sectors step.
  // Used to detect which sectors changed so the impact modal can show before/after.
  const sectorSnapshotRef = useRef<FlightScheduleFormData[] | null>(null)

  const [pnrImpact, setPnrImpact] = useState<{
    affectedPNRs: ImpactedPNRItem[]
    sectorChanges: SectorChange[]
  } | null>(null)

  const [state, setState] = useState<WizardState>(() => ({
    step: 1,
    stockInfo: {
      ticket_type: defaultType,
      group_type: lockedGroupType ?? undefined,
      trip_type: defaultType === 'FIT' ? 'One-way' : 'Round-trip',
      stock_code: generateStockCode(
        getStockCodePrefix(defaultType, lockedGroupType),
        getDemoStocks().map(s => s.stockCode),
      ),
      group_name: '',
      destination: '',
      airline_code: '',
      currency: getDefaultCurrencyCode(),
      remark: '',
    },
    schedules: [getDefaultSchedule(defaultType, '')],
    conditions: [],
    pnrs: [],
  }))

  const hasDuplicatePNRs = useMemo(() => {
    if (step !== 4) return false
    const pnrsToCheck = state.pnrs.map(p => ({ pnr_code: p.pnr_code, dummy_pnr: p.dummy_pnr }))
    return checkPNRDuplicatesInSystem(pnrsToCheck).hasConflicts
  }, [step, state.pnrs])

  const nextDisabled = step === 3 && state.pnrs.length === 0

  const pnrHasErrors = (p: (typeof state.pnrs)[0]): boolean => {
    if (!p.travel_start || (p.seat_total ?? 0) <= 0) return true
    if (!(p.fare > 0)) return true
    const fmt = p.price_format ?? 'FARE'
    if (fmt === 'FARE_YQ' && p.yq == null) return true
    return false
  }

  const updateStockInfo = useCallback((patch: Partial<FlightSeriesFormData>) => {
    setState(prev => {
      const updated = { ...prev.stockInfo, ...patch }
      const existingCodes = getDemoStocks().map(s => s.stockCode)

      if (patch.ticket_type && patch.ticket_type !== prev.stockInfo.ticket_type) {
        // FIT defaults to One-way + 1 sector; others default to Round-trip + 2 sectors
        const defaultTrip: TripType = patch.ticket_type === 'FIT' ? 'One-way' : 'Round-trip'
        const prefix = getStockCodePrefix(patch.ticket_type, patch.group_type ?? updated.group_type)
        return {
          ...prev,
          stockInfo: { ...updated, trip_type: defaultTrip, stock_code: generateStockCode(prefix, existingCodes) },
          schedules: [getDefaultSchedule(patch.ticket_type, updated.airline_code)],
        }
      }

      if (patch.group_type !== undefined && patch.group_type !== prev.stockInfo.group_type) {
        const prefix = getStockCodePrefix(prev.stockInfo.ticket_type, patch.group_type)
        return {
          ...prev,
          stockInfo: { ...updated, stock_code: generateStockCode(prefix, existingCodes) },
        }
      }

      if (patch.airline_code) {
        return {
          ...prev,
          stockInfo: updated,
          schedules: prev.schedules.map(sch => ({
            ...sch,
            sectors: sch.sectors.map(s => ({
              ...s,
              airline_code: patch.airline_code!,
            })),
          })),
        }
      }
      return { ...prev, stockInfo: updated }
    })
  }, [])

  // ── Initial Config Handlers ───────────────────────────────────────────────────

  const handleInitialConfigConfirm = (config: StockInitialConfig) => {
    setInitialConfig(config)
    setConfigOpen(false)
    setTypeConfirmed(true)

    const stCfg       = STOCK_TYPE_CONFIG[config.stockType]
    const newTicket   = stCfg.ticketType
    const newGroup    = stCfg.groupType as GroupType | undefined
    const newTrip: TripType = newTicket === 'FIT' ? 'One-way' : 'Round-trip'
    const prefix      = getStockCodePrefix(newTicket, newGroup)
    const existingCodes = getDemoStocks().map(s => s.stockCode)

    setState(prev => {
      const currentKey  = getStockTypeKey(prev.stockInfo.ticket_type, prev.stockInfo.group_type)
      const needsNewCode = config.stockType !== currentKey
      return {
        ...prev,
        stockInfo: {
          ...prev.stockInfo,
          ticket_type:  newTicket,
          group_type:   newGroup,
          trip_type:    newTrip,
          stock_code:   needsNewCode ? generateStockCode(prefix, existingCodes) : prev.stockInfo.stock_code,
          airline_code: config.airlineCode,
          currency:     config.currencyCode,
        },
        schedules: [getDefaultSchedule(newTicket, config.airlineCode, config.travelDurationDays, config.sectorCount)],
      }
    })
  }

  const applyEditConfig = (config: StockInitialConfig) => {
    const prev = initialConfig
    setInitialConfig(config)

    const needsCurrencyConfirm = !!(prev && config.currencyCode !== prev.currencyCode && state.pnrs.length > 0)
    const needsTypeChange      = !!(prev && config.stockType !== prev.stockType)
    const prevSectorCount      = prev?.sectorCount ?? config.sectorCount
    const sectorCountChanged   = !needsTypeChange && config.sectorCount !== prevSectorCount

    const stCfg      = STOCK_TYPE_CONFIG[config.stockType]
    const newTicket  = stCfg.ticketType
    const newGroup   = stCfg.groupType as GroupType | undefined
    const newTrip: TripType = newTicket === 'FIT' ? 'One-way' : 'Round-trip'
    const prefix     = getStockCodePrefix(newTicket, newGroup)

    setState(s => {
      const existingCodes = getDemoStocks().map(sc => sc.stockCode)
      return {
        ...s,
        stockInfo: {
          ...s.stockInfo,
          airline_code: config.airlineCode,
          ticket_type:  newTicket,
          group_type:   newGroup,
          ...(needsTypeChange ? {
            trip_type:  newTrip,
            stock_code: generateStockCode(prefix, existingCodes),
          } : {}),
          ...(needsCurrencyConfirm ? {} : { currency: config.currencyCode }),
        },
        schedules: needsTypeChange
          ? [getDefaultSchedule(newTicket, config.airlineCode, config.travelDurationDays, config.sectorCount)]
          : sectorCountChanged
            ? adjustSectorCount(s.schedules, config.sectorCount, config.airlineCode, config.travelDurationDays)
            : s.schedules.map(sch => ({
                ...sch,
                sectors: sch.sectors.map(sec => ({ ...sec, airline_code: config.airlineCode })),
              })),
        pnrs: needsTypeChange ? [] : s.pnrs,
      }
    })

    if (needsCurrencyConfirm) {
      setCurrencyChangeConfirm({ oldCurrency: prev!.currencyCode, newCurrency: config.currencyCode })
    }
  }

  const handleEditConfigConfirm = (config: StockInitialConfig) => {
    setEditConfigOpen(false)

    // stockType change is most disruptive — confirm first
    if (initialConfig && config.stockType !== initialConfig.stockType) {
      setStockTypeChangeConfirm({ config, oldStockType: initialConfig.stockType })
      return
    }

    // Travel days change — confirm before applying
    const prevDays = initialConfig?.travelDurationDays ?? config.travelDurationDays
    if (config.travelDurationDays !== prevDays) {
      setTravelDaysConfirm({ config, oldDays: prevDays })
      return
    }

    // Sector count change with existing Flight Segment data — confirm before applying
    const prevCount = initialConfig?.sectorCount ?? config.sectorCount
    if (config.sectorCount !== prevCount) {
      const mainSch = state.schedules.find(s => s.isMain) ?? state.schedules[0]
      const hasFlightData = mainSch?.sectors.some(s => s.flight_no?.trim())
      if (hasFlightData) {
        setSectorCountConfirm({ config, oldCount: prevCount })
        return
      }
    }

    applyEditConfig(config)
  }

  // sectorCount reflects actual main schedule sector count (kept in sync with Step 2)
  const liveSectorCount = (state.schedules.find(s => s.isMain) ?? state.schedules[0])?.sectors.length
                          ?? initialConfig?.sectorCount ?? 2

  const configLabel = initialConfig
    ? [
        STOCK_TYPE_CONFIG[initialConfig.stockType]?.displayName,
        initialConfig.airlineCode,
        initialConfig.currencyCode,
        `${initialConfig.seatsPerPnr} ที่นั่ง/PNR`,
        `${initialConfig.travelDurationDays} วัน`,
        `${liveSectorCount} Sectors`,
        PRICE_TYPE_LABEL[initialConfig.priceType] ?? initialConfig.priceType,
      ].filter(Boolean).join(' · ')
    : undefined

  const handleCurrencyUpdateAll = () => {
    const { newCurrency } = currencyChangeConfirm!
    updateStockInfo({ currency: newCurrency })
    setState(prev => ({ ...prev, pnrs: prev.pnrs.map(p => ({ ...p, currency: newCurrency })) }))
    setCurrencyChangeConfirm(null)
  }

  const handleCurrencyUpdateDefaultOnly = () => {
    const { oldCurrency, newCurrency } = currencyChangeConfirm!
    updateStockInfo({ currency: newCurrency })
    setState(prev => ({
      ...prev,
      pnrs: prev.pnrs.map(p => ({
        ...p,
        currency: (!p.currency || p.currency === oldCurrency) ? newCurrency : p.currency,
      })),
    }))
    setCurrencyChangeConfirm(null)
  }

  const handleCurrencyKeepPNRs = () => {
    updateStockInfo({ currency: currencyChangeConfirm!.newCurrency })
    setCurrencyChangeConfirm(null)
  }

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!isTypeLocked && !typeConfirmed) return 'กรุณาเลือกประเภท Stock'
      const stepCfg = getStockTypeConfigSafe(state.stockInfo.ticket_type, state.stockInfo.group_type)
      if (!state.stockInfo.stock_code.trim()) return `กรุณากรอก ${stepCfg.codeLabel}`
      const existingCodes = getDemoStocks().map(s => s.stockCode)
      if (existingCodes.includes(state.stockInfo.stock_code.trim())) return `${stepCfg.codeLabel} นี้ถูกใช้งานแล้ว กรุณาใช้รหัสอื่น`
      if (!state.stockInfo.group_name.trim()) return `กรุณากรอก ${stepCfg.nameLabel}`
      if (!state.stockInfo.airline_code) return 'กรุณาเลือก Airline'
      if (!state.stockInfo.currency) return 'กรุณาเลือก Currency'
      return null
    }
    if (s === 2) {
      const mainSch = state.schedules.find(sch => sch.isMain) ?? state.schedules[0]
      const sectorErr = validateSectors(mainSch?.sectors as never, state.stockInfo.ticket_type, state.stockInfo.trip_type)
      if (sectorErr) return sectorErr
      const badAirline = mainSch?.sectors.find(sec => !sec.airline_code || !MASTER_AIRLINE_CODE_SET.has(sec.airline_code))
      if (badAirline) return `Airline "${badAirline.airline_code || '—'}" ไม่พบใน Master กรุณาเลือก Airline ที่ถูกต้อง`
      const dupFlight = (() => {
        const seen = new Map<string, number>()
        for (let i = 0; i < (mainSch?.sectors ?? []).length; i++) {
          const sec = mainSch!.sectors[i]
          if (sec.airline_code && sec.flight_no) {
            const key = `${sec.airline_code}${sec.flight_no}`
            if (seen.has(key)) return { key, row1: seen.get(key)! + 1, row2: i + 1 }
            seen.set(key, i)
          }
        }
        return null
      })()
      if (dupFlight) return `พบ Flight No ซ้ำ: ${dupFlight.key} (แถวที่ ${dupFlight.row1} และ ${dupFlight.row2}) — กรุณาตรวจสอบก่อนดำเนินการต่อ`
      // Same-airport check across ALL schedules
      for (const sch of state.schedules) {
        for (let i = 0; i < sch.sectors.length; i++) {
          const sec = sch.sectors[i]
          if (sameAirport(sec.dep_airport_code, sec.arr_airport_code)) {
            return `ชุดเที่ยวบิน "${sch.scheduleName}" Sector ${i + 1}: สนามบินต้นทางและปลายทางต้องไม่เป็นสนามบินเดียวกัน`
          }
        }
      }
      return null
    }
    return null
  }

  const goNext = () => {
    const err = validateStep(step)
    if (err) { setErrors({ _: err }); return }

    // Step 2: reset any invalid sector times to 00:00 before advancing
    if (step === 2) {
      let hadInvalidTimes = false
      const fixedSchedules = state.schedules.map(sch => ({
        ...sch,
        sectors: sch.sectors.map(s => {
          const depOk = !s.dep_time || isValidHHmm(s.dep_time)
          const arrOk = !s.arr_time || isValidHHmm(s.arr_time)
          if (depOk && arrOk) return s
          hadInvalidTimes = true
          return {
            ...s,
            dep_time: depOk ? s.dep_time : '00:00',
            arr_time: arrOk ? s.arr_time : '00:00',
          }
        }),
      }))
      if (hadInvalidTimes) {
        setState(prev => ({ ...prev, schedules: fixedSchedules }))
        setErrors({ _: 'ระบบปรับเวลาที่ไม่ถูกต้องเป็น 00:00 กรุณาตรวจสอบก่อนดำเนินการต่อ' })
        return
      }
    }

    setErrors({})

    // Step 2 → Step 3: check if sector changes affect existing PNR dates
    if (step === 2 && sectorSnapshotRef.current && state.pnrs.some(p => p.travel_start)) {
      const snapshot = sectorSnapshotRef.current
      const affected = computePNRImpact(snapshot, state.schedules, state.pnrs)

      if (affected.length > 0) {
        const changes = computeSectorChanges(snapshot, state.schedules)
        setPnrImpact({ affectedPNRs: affected, sectorChanges: changes })
        return
      }
      // No impact — clear snapshot and proceed
      sectorSnapshotRef.current = null
    }

    if (step === 3) {
      if (state.pnrs.some(pnrHasErrors)) {
        setPnrValidationShown(true)
        setErrors({ _: 'กรุณากรอกข้อมูล PNR ที่ขาดหายให้ครบก่อนดำเนินการต่อ' })
        return
      }
      setPnrValidationShown(false)
      // Normalize all PNR derived fields (travel_end, sector_dates, total, dummy PNR)
      // from the current sectors/fare values so Step 4 always shows the latest data.
      setState(normalizeForReview)
    }
    setStep(s => Math.min(s + 1, 4))
  }

  const goBack = () => {
    setErrors({})
    setPnrValidationShown(false)
    // Going back from PNR step (3) to Sectors step (2): snapshot current sectors
    // so we can detect changes on the next Next click.
    if (step === 3) {
      sectorSnapshotRef.current = JSON.parse(JSON.stringify(state.schedules))
    }
    setStep(s => Math.max(s - 1, 1))
  }

  // ── PNR Impact Modal handlers ─────────────────────────────────────────────────

  const handleImpactConfirm = (selectedIndices: number[]) => {
    const selectedSet = new Set(selectedIndices)
    const affectedSet = new Set(pnrImpact?.affectedPNRs.map(item => item.pnrIndex) ?? [])
    const newSchedules = state.schedules
    const mainSectors = newSchedules.find(s => s.isMain)?.sectors ?? newSchedules[0]?.sectors ?? []

    setState(prev => ({
      ...prev,
      pnrs: prev.pnrs.map((p, i) => {
        if (selectedSet.has(i) && p.travel_start) {
          const pnrSectors = p.schedule_id
            ? (newSchedules.find(s => s.scheduleId === p.schedule_id)?.sectors ?? mainSectors)
            : mainSectors
          return {
            ...p,
            travel_end: calcTravelEndFromSectors(p.travel_start, pnrSectors) ?? p.travel_end,
            travel_end_override: false,
            sector_dates: pnrSectors.map(s => {
              const dep = calcSectorDate(p.travel_start!, s.day_offset) ?? ''
              return { sector_type: s.sector_type, day_offset: s.day_offset, travel_date: dep, arr_date: '', dep_manual: false as const, arr_manual: false as const }
            }),
            date_sync_status: 'SYNCED' as const,
          }
        }
        if (affectedSet.has(i) && !selectedSet.has(i)) {
          return { ...p, date_sync_status: 'OUTDATED' as const }
        }
        return p
      }),
    }))
    sectorSnapshotRef.current = null
    setPnrImpact(null)
    setStep(s => Math.min(s + 1, 4))
  }

  const handleImpactSaveOnly = () => {
    const affectedSet = new Set(pnrImpact?.affectedPNRs.map(item => item.pnrIndex) ?? [])
    setState(prev => ({
      ...prev,
      pnrs: prev.pnrs.map((p, i) =>
        affectedSet.has(i) ? { ...p, date_sync_status: 'OUTDATED' as const } : p
      ),
    }))
    sectorSnapshotRef.current = null
    setPnrImpact(null)
    setStep(s => Math.min(s + 1, 4))
  }

  const handleImpactCancel = () => {
    if (sectorSnapshotRef.current) {
      setState(prev => ({ ...prev, schedules: sectorSnapshotRef.current! }))
      sectorSnapshotRef.current = null
    }
    setPnrImpact(null)
  }

  const confirmSave = () => {
    const pnrsToCheck = state.pnrs.map(p => ({ pnr_code: p.pnr_code, dummy_pnr: p.dummy_pnr }))
    const dupCheck = checkPNRDuplicatesInSystem(pnrsToCheck)
    if (dupCheck.hasConflicts) {
      setSaveError(formatPNRConflictMessage(dupCheck.conflicts))
      setTimeout(() => setSaveError(''), 7000)
      return
    }
    setSaving(true)
    try {
      const demoStock = wizardStateToDemoStock(state)
      saveDemoStock(demoStock)
      setSaving(false)
      setSaveMsg('บันทึกข้อมูล Demo สำเร็จ')
      const redirectTarget = (() => {
        const cfg = getStockTypeConfig(state.stockInfo.ticket_type, state.stockInfo.group_type)
        if (cfg?.key === 'SERIES')      return '/tickets/group/series'
        if (cfg?.key === 'AD_HOC')      return '/tickets/group/adhoc'
        if (cfg?.key === 'FIT')         return '/tickets/fit'
        if (cfg?.key === 'TICKET_ONLY') return '/tickets/land'
        return '/tickets'
      })()
      setTimeout(() => router.push(redirectTarget), 800)
    } catch {
      setSaving(false)
      setSaveMsg('เกิดข้อผิดพลาดในการบันทึก')
    }
  }

  const pageTitle = getPageTitle(state.stockInfo.ticket_type, state.stockInfo.group_type, typeConfirmed)

  return (
    <AppLayout title={pageTitle}>
      <WizardLayout
        step={step}
        pageTitle={pageTitle}
        subtitle={STEP_SUBTITLES[step]}
        ticketType={typeConfirmed ? state.stockInfo.ticket_type : undefined}
        error={errors._}
        saving={saving}
        isLastStep={step === 4}
        confirmDisabled={hasDuplicatePNRs}
        nextDisabled={nextDisabled}
        onBack={goBack}
        onNext={goNext}
        onConfirm={confirmSave}
        onEditConfig={initialConfig ? () => setEditConfigOpen(true) : undefined}
        initialConfigLabel={configLabel}
      >
        {saveMsg && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-[#05a94f] text-white text-sm font-medium shadow-lg flex items-center gap-2">
            <CheckCircle2 size={16} />
            {saveMsg}
          </div>
        )}
        {saveError && (
          <div className="fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-medium shadow-lg flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="whitespace-pre-line">{saveError}</span>
          </div>
        )}
        {step === 1 && (
          <Step1StockInfo
            data={state.stockInfo}
            onChange={(patch) => {
              if (
                'currency' in patch &&
                patch.currency &&
                patch.currency !== state.stockInfo.currency &&
                state.pnrs.length > 0
              ) {
                setCurrencyChangeConfirm({ oldCurrency: state.stockInfo.currency, newCurrency: patch.currency! })
                return
              }
              updateStockInfo(patch)
            }}
            errors={{}}
            isTypeLocked={isTypeLocked}
            typeConfirmed={typeConfirmed}
            onTypeConfirm={() => setTypeConfirmed(true)}
          />
        )}
        {step === 2 && (
          <Step2Sectors
            schedules={state.schedules}
            onChange={schedules => {
              setState(prev => ({ ...prev, schedules }))
              // Sync sectorCount with the actual number of rows in the main schedule
              const mainCount = (schedules.find(s => s.isMain) ?? schedules[0])?.sectors.length ?? 2
              setInitialConfig(prev => prev ? { ...prev, sectorCount: mainCount } : prev)
            }}
            ticketType={state.stockInfo.ticket_type}
            tripType={state.stockInfo.trip_type}
            airlineCode={state.stockInfo.airline_code}
            onTripTypeChange={tripType => setState(prev => ({
              ...prev,
              stockInfo: { ...prev.stockInfo, trip_type: tripType },
            }))}
          />
        )}
        {step === 3 && (
          <Step4PNR
            pnrs={state.pnrs}
            schedules={state.schedules}
            conditions={state.conditions}
            currency={state.stockInfo.currency}
            onChange={pnrs => setState(prev => ({ ...prev, pnrs }))}
            showValidation={pnrValidationShown}
            defaultSeatsPerPnr={initialConfig?.seatsPerPnr}
            defaultPriceFormat={initialConfig?.priceType}
          />
        )}
        {step === 4 && <Step5Review state={state} onGoToStep={s => setStep(s)} />}
      </WizardLayout>

      {pnrImpact && (
        <PNRImpactModal
          open={true}
          affectedPNRs={pnrImpact.affectedPNRs}
          sectorChanges={pnrImpact.sectorChanges}
          onConfirm={handleImpactConfirm}
          onSaveOnly={handleImpactSaveOnly}
          onCancel={handleImpactCancel}
        />
      )}

      {currencyChangeConfirm && (
        <Modal
          open={true}
          onClose={() => setCurrencyChangeConfirm(null)}
          title="เปลี่ยนสกุลเงิน Stock"
          size="sm"
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              เปลี่ยนสกุลเงินจาก{' '}
              <strong className="font-mono text-slate-800">{currencyChangeConfirm.oldCurrency}</strong>{' '}
              เป็น{' '}
              <strong className="font-mono text-slate-800">{currencyChangeConfirm.newCurrency}</strong>
              {' '}— ต้องการอัปเดตสกุลเงินของ PNR ที่มีอยู่ ({state.pnrs.length} รายการ) ด้วยหรือไม่?
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ราคาที่กรอกไว้จะไม่ถูกแปลงค่าอัตโนมัติ
            </p>
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={handleCurrencyUpdateAll}>
                อัปเดตทุก PNR ให้ใช้ {currencyChangeConfirm.newCurrency}
              </Button>
              <Button className="w-full" variant="outline" onClick={handleCurrencyUpdateDefaultOnly}>
                อัปเดตเฉพาะ PNR ที่ยังใช้ {currencyChangeConfirm.oldCurrency}
              </Button>
              <Button className="w-full" variant="outline" onClick={handleCurrencyKeepPNRs}>
                เปลี่ยน Stock เท่านั้น — คง Currency ของแต่ละ PNR ไว้
              </Button>
              <Button className="w-full" variant="ghost" onClick={() => setCurrencyChangeConfirm(null)}>
                ยกเลิก (ไม่เปลี่ยน Currency)
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {/* ── Initial Config Modal (first time) ── */}
      <StockInitialConfigModal
        open={configOpen}
        onClose={() => router.back()}
        onConfirm={handleInitialConfigConfirm}
        mode="create"
        lockedStockType={lockedStockType}
      />

      {/* ── Edit Config Modal ── */}
      {initialConfig && (
        <StockInitialConfigModal
          open={editConfigOpen}
          onClose={() => setEditConfigOpen(false)}
          onConfirm={handleEditConfigConfirm}
          initial={initialConfig}
          mode="edit"
          lockedStockType={lockedStockType}
        />
      )}

      {/* ── Stock Type Change Confirmation ── */}
      {stockTypeChangeConfirm && (
        <Modal
          open={true}
          onClose={() => setStockTypeChangeConfirm(null)}
          title="เปลี่ยนประเภท Stock"
          size="sm"
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              เปลี่ยนประเภทจาก{' '}
              <strong>{STOCK_TYPE_CONFIG[stockTypeChangeConfirm.oldStockType].displayName}</strong>{' '}
              เป็น{' '}
              <strong>{STOCK_TYPE_CONFIG[stockTypeChangeConfirm.config.stockType].displayName}</strong>
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              การเปลี่ยนประเภท Stock จะ Reset ข้อมูล Sectors และ PNR ทั้งหมดที่มีอยู่
            </p>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                onClick={() => {
                  applyEditConfig(stockTypeChangeConfirm.config)
                  setStockTypeChangeConfirm(null)
                }}
              >
                เปลี่ยนประเภทและตั้งค่าข้อมูลที่เกี่ยวข้องใหม่
              </Button>
              <Button
                className="w-full"
                variant="ghost"
                onClick={() => setStockTypeChangeConfirm(null)}
              >
                ยกเลิก (คงประเภทเดิมไว้)
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Sector Count Change Confirmation ── */}
      {sectorCountConfirm && (
        <Modal
          open={true}
          onClose={() => setSectorCountConfirm(null)}
          title="เปลี่ยนจำนวน Sector"
          size="sm"
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              เปลี่ยนจำนวน Sector จาก{' '}
              <strong>{sectorCountConfirm.oldCount} Sectors</strong>{' '}
              เป็น{' '}
              <strong>{sectorCountConfirm.config.sectorCount} Sectors</strong>
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              การเปลี่ยนจำนวน Sector จะเพิ่มหรือลบรายการเที่ยวบิน และอาจกระทบข้อมูลที่กรอกไว้ ต้องการดำเนินการต่อหรือไม่
            </p>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                onClick={() => {
                  applyEditConfig(sectorCountConfirm.config)
                  setSectorCountConfirm(null)
                }}
              >
                ปรับจำนวน Sector
              </Button>
              <Button
                className="w-full"
                variant="ghost"
                onClick={() => setSectorCountConfirm(null)}
              >
                ยกเลิก
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Travel Days Change Confirmation ── */}
      {travelDaysConfirm && (
        <Modal
          open={true}
          onClose={() => setTravelDaysConfirm(null)}
          title="เปลี่ยนจำนวนวันเดินทาง"
          size="sm"
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              เปลี่ยนจำนวนวันเดินทางจาก{' '}
              <strong>{travelDaysConfirm.oldDays} วัน</strong> เป็น{' '}
              <strong>{travelDaysConfirm.config.travelDurationDays} วัน</strong>
              {' '}— ต้องการปรับ Sector สุดท้ายด้วยหรือไม่?
            </p>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                onClick={() => {
                  setState(prev => ({
                    ...prev,
                    schedules: prev.schedules.map(sch => ({
                      ...sch,
                      sectors: sch.sectors.map((s, i) =>
                        i === sch.sectors.length - 1
                          ? { ...s, day_offset: travelDaysConfirm.config.travelDurationDays }
                          : s
                      ),
                    })),
                  }))
                  applyEditConfig(travelDaysConfirm.config)
                  setTravelDaysConfirm(null)
                }}
              >
                ปรับ Sector สุดท้ายให้เป็น Day {travelDaysConfirm.config.travelDurationDays}
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  applyEditConfig(travelDaysConfirm.config)
                  setTravelDaysConfirm(null)
                }}
              >
                ใช้กับ PNR ใหม่เท่านั้น (ไม่ปรับ Sector เดิม)
              </Button>
              <Button
                className="w-full"
                variant="ghost"
                onClick={() => setTravelDaysConfirm(null)}
              >
                ยกเลิก (คงค่าเดิมไว้)
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </AppLayout>
  )
}

export default function AddStockPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AddStockPageInner />
    </Suspense>
  )
}
