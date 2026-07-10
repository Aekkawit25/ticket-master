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
import { validateSectors, generateStockCode, getStockCodePrefix, generateDummyPnrs, calcTravelEndFromSectors, calcSectorDate } from '@/lib/utils'
import { isValidHHmm, sameAirport } from '@/lib/time-utils'
import { MASTER_AIRLINE_CODE_SET } from '@/lib/master-data'
import { getStockTypeConfig, getStockTypeConfigSafe, STOCK_TYPE_CONFIG, type StockType } from '@/lib/stock-type-config'
import { wizardStateToDemoStock, saveDemoStock, getDemoStocks, checkPNRDuplicatesInSystem, formatPNRConflictMessage } from '@/lib/demo-storage'
import { getDefaultCurrencyCode } from '@/lib/currency-storage'
import type { WizardState, FlightSeriesFormData, FlightSectorFormData, FlightScheduleFormData, TicketType, GroupType, TripType } from '@/types'
import PNRImpactModal, { computePNRImpact, computeSectorChanges, type ImpactedPNRItem, type SectorChange } from '@/components/wizard/PNRImpactModal'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

const STOCK_TYPE_KEYS: StockType[] = ['SERIES', 'AD_HOC', 'FIT', 'TICKET_ONLY']

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
        ? pnrSectors.map(s => ({
            sector_type: s.sector_type,
            day_offset: s.day_offset,
            travel_date: calcSectorDate(p.travel_start, s.day_offset) || '',
          }))
        : p.sector_dates ?? [],
      total_amount: (() => {
        const f = p.fare || 0; const fmt = p.price_format ?? 'FARE'
        return fmt === 'ALL_IN' ? f : fmt === 'FARE_YQ' ? f + (p.yq ?? 0) : f + (p.tax ?? 0) + (p.yq ?? 0)
      })(),
    }
  })
  return { ...state, pnrs: generateDummyPnrs(normalizedPNRs, stockInfo, systemDummies) }
}

function getDefaultSchedule(ticketType: TicketType, airlineCode: string): FlightScheduleFormData {
  const dep: FlightSectorFormData = { seq: 1, sector_type: 'Departure', airline_code: airlineCode, flight_no: '', dep_airport_code: 'BKK', arr_airport_code: '', dep_time: '08:00', arr_time: '16:00', arr_day_offset: 0, day_offset: 1, remark: '' }
  const arr: FlightSectorFormData = { seq: 2, sector_type: 'Arrival', airline_code: airlineCode, flight_no: '', dep_airport_code: '', arr_airport_code: 'BKK', dep_time: '17:00', arr_time: '22:00', arr_day_offset: 0, day_offset: 1, remark: '' }
  return { scheduleId: 'SCH-A', scheduleName: 'ชุดเที่ยวบินหลัก', isMain: true, remark: '', sectors: ticketType === 'FIT' ? [dep] : [dep, arr] }
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
      status: 'Draft',
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
      const sectorErr = validateSectors(mainSch?.sectors as any, state.stockInfo.ticket_type, state.stockInfo.trip_type)
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

  const saveDraft = () => {
    // Block if any sector has matching From/To airports
    for (const sch of state.schedules) {
      for (let i = 0; i < sch.sectors.length; i++) {
        const sec = sch.sectors[i]
        if (sameAirport(sec.dep_airport_code, sec.arr_airport_code)) {
          setErrors({ _: `ชุดเที่ยวบิน "${sch.scheduleName}" Sector ${i + 1}: สนามบินต้นทางและปลายทางต้องไม่เป็นสนามบินเดียวกัน กรุณาแก้ไขก่อนบันทึก` })
          return
        }
      }
    }
    // Reset any invalid sector times to 00:00 before saving
    let hadInvalidTimes = false
    const fixedSchedules = state.schedules.map(sch => ({
      ...sch,
      sectors: sch.sectors.map(s => {
        const depOk = !s.dep_time || isValidHHmm(s.dep_time)
        const arrOk = !s.arr_time || isValidHHmm(s.arr_time)
        if (depOk && arrOk) return s
        hadInvalidTimes = true
        return { ...s, dep_time: depOk ? s.dep_time : '00:00', arr_time: arrOk ? s.arr_time : '00:00' }
      }),
    }))
    if (hadInvalidTimes) {
      setState(prev => ({ ...prev, schedules: fixedSchedules }))
      setErrors({ _: 'ระบบปรับเวลาที่ไม่ถูกต้องเป็น 00:00 กรุณาตรวจสอบก่อนบันทึก Draft' })
      return
    }
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      alert('บันทึก Draft แล้ว (ระบบยังต้องเชื่อมต่อ Supabase)')
    }, 800)
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
        stockStatus={state.stockInfo.status}
        error={errors._}
        saving={saving}
        isLastStep={step === 4}
        confirmDisabled={hasDuplicatePNRs}
        nextDisabled={nextDisabled}
        onBack={goBack}
        onNext={goNext}
        onSaveDraft={saveDraft}
        onConfirm={confirmSave}
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
            onChange={schedules => setState(prev => ({ ...prev, schedules }))}
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
          />
        )}
        {step === 4 && <Step5Review state={state} />}
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
