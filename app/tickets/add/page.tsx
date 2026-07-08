'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useCallback, useMemo, Suspense } from 'react'
import { CheckCircle2, AlertTriangle, Globe, ArrowLeft } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import WizardLayout from '@/components/wizard/WizardLayout'
import Step1StockInfo from '@/components/wizard/Step1StockInfo'
import Step2Sectors from '@/components/wizard/Step2Sectors'
import Step3Conditions from '@/components/wizard/Step3Conditions'
import Step4PNR from '@/components/wizard/Step4PNR'
import Step5Review from '@/components/wizard/Step5Review'
import { validateSectors, generateStockCode, getStockCodePrefix, generateDummyPnrs, calcTravelEndFromSectors, calcSectorDate } from '@/lib/utils'
import { MASTER_AIRLINE_CODE_SET } from '@/lib/master-data'
import { getStockTypeConfig, getStockTypeConfigSafe } from '@/lib/stock-type-config'
import { wizardStateToDemoStock, saveDemoStock, getDemoStocks, checkPNRDuplicatesInSystem, formatPNRConflictMessage } from '@/lib/demo-storage'
import { getDefaultCurrencyCode } from '@/lib/currency-storage'
import type { WizardState, FlightSeriesFormData, FlightSectorFormData, FlightScheduleFormData, TicketType, GroupType, TripType } from '@/types'

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
    return {
      ...p,
      travel_end: p.travel_start
        ? calcTravelEndFromSectors(p.travel_start, pnrSectors) || p.travel_end || ''
        : p.travel_end || '',
      sector_dates: p.travel_start
        ? pnrSectors.map(s => ({
            sector_type: s.sector_type,
            day_offset: s.day_offset,
            travel_date: calcSectorDate(p.travel_start, s.day_offset) || '',
          }))
        : p.sector_dates ?? [],
      total_amount: (() => {
        const f = p.fare || 0; const fmt = p.price_format ?? 'FARE'
        return fmt === 'ALL_IN' ? f : fmt === 'FARE_YQ' ? f + (p.tax ?? 0) : f + (p.tax ?? 0) + (p.yq ?? 0)
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
  3: 'Conditions ของ Stock',
  4: 'PNR และ Seat',
  5: 'Review และบันทึก',
}

function AddStockPageInner() {
  const params = useSearchParams()
  const router = useRouter()
  const lockedType      = params.get('type') as TicketType | null
  const lockedGroupType = params.get('groupType') as GroupType | null
  const defaultType: TicketType = lockedType ?? 'Group'
  const isTypeLocked = lockedType !== null

  const [step, setStep] = useState(1)
  const [typeConfirmed, setTypeConfirmed] = useState(isTypeLocked)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saveMsg, setSaveMsg] = useState('')
  const [saveError, setSaveError] = useState('')

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
    if (step !== 5) return false
    const pnrsToCheck = state.pnrs.map(p => ({ pnr_code: p.pnr_code, dummy_pnr: p.dummy_pnr }))
    return checkPNRDuplicatesInSystem(pnrsToCheck).hasConflicts
  }, [step, state.pnrs])

  const nextDisabled = step === 4 && (
    state.pnrs.length === 0 ||
    state.pnrs.some(p => !p.travel_start || (p.seat_total ?? 0) <= 0 || (p.total_amount ?? 0) <= 0)
  )

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

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!isTypeLocked && !typeConfirmed) return 'กรุณาเลือกประเภท Stock'
      if (state.stockInfo.ticket_type === 'FIT') return 'FIT ยังไม่เปิดใช้งาน'
      if (state.stockInfo.ticket_type === 'Ticket + Land') return 'Ticket + Land ยังไม่เปิดใช้งาน'
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
      return null
    }
    return null
  }

  const goNext = () => {
    const err = validateStep(step)
    if (err) { setErrors({ _: err }); return }
    setErrors({})
    if (step === 4) {
      // Normalize all PNR derived fields (travel_end, sector_dates, total, dummy PNR)
      // from the current sectors/fare values so Step 5 always shows the latest data.
      setState(normalizeForReview)
    }
    setStep(s => Math.min(s + 1, 5))
  }

  const goBack = () => {
    setErrors({})
    setStep(s => Math.max(s - 1, 1))
  }

  const saveDraft = () => {
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
        if (state.stockInfo.ticket_type === 'Group') {
          if (state.stockInfo.group_type === 'SERIES') return '/tickets/group/series'
          if (state.stockInfo.group_type === 'ADHOC')  return '/tickets/group/adhoc'
          return '/tickets/group'
        }
        if (state.stockInfo.ticket_type === 'FIT') return '/tickets/fit'
        return '/tickets/land'
      })()
      setTimeout(() => router.push(redirectTarget), 800)
    } catch {
      setSaving(false)
      setSaveMsg('เกิดข้อผิดพลาดในการบันทึก')
    }
  }

  const pageTitle = getPageTitle(state.stockInfo.ticket_type, state.stockInfo.group_type, typeConfirmed)

  // FIT and Ticket + Land are not yet available — show Coming Soon screen
  if (lockedType === 'FIT' || lockedType === 'Ticket + Land') {
    const isFIT = lockedType === 'FIT'
    return (
      <AppLayout title={`${lockedType} — Coming Soon`}>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${isFIT ? 'bg-sky-100' : 'bg-violet-100'}`}>
            <Globe size={28} className={isFIT ? 'text-sky-400' : 'text-violet-400'} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">{lockedType}</h2>
          <p className="text-slate-500 mb-1">ฟีเจอร์นี้ยังไม่เปิดใช้งาน</p>
          <p className="text-sm text-slate-400 mb-6">Coming Soon</p>
          <button
            onClick={() => router.push(isFIT ? '/tickets/fit' : '/tickets/land')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft size={14} />
            กลับ
          </button>
        </div>
      </AppLayout>
    )
  }

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
        isLastStep={step === 5}
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
            onChange={updateStockInfo}
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
        {step === 3 && (() => {
          const mainSch = state.schedules.find(s => s.isMain) ?? state.schedules[0]
          const routes = (mainSch?.sectors ?? [])
            .filter(s => s.dep_airport_code && s.arr_airport_code)
            .map(s => `${s.dep_airport_code}-${s.arr_airport_code}`)
            .filter((r, i, arr) => arr.indexOf(r) === i)
          return (
            <Step3Conditions
              conditions={state.conditions}
              onChange={conditions => setState(prev => ({ ...prev, conditions }))}
              currency={state.stockInfo.currency}
              conditionMode="series"
              seriesInfo={{
                seriesCode:  state.stockInfo.stock_code,
                seriesName:  state.stockInfo.group_name,
                airlineCode: state.stockInfo.airline_code,
                currency:    state.stockInfo.currency,
                routes,
              }}
            />
          )
        })()}
        {step === 4 && (
          <Step4PNR
            pnrs={state.pnrs}
            schedules={state.schedules}
            conditions={state.conditions}
            currency={state.stockInfo.currency}
            onChange={pnrs => setState(prev => ({ ...prev, pnrs }))}
          />
        )}
        {step === 5 && <Step5Review state={state} />}
      </WizardLayout>
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
