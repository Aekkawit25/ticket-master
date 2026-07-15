// ============================================================
// Core Enums / Union Types
// ============================================================

export type StockType  = 'SERIES' | 'AD_HOC' | 'FIT' | 'TICKET_ONLY'
export type TicketType = 'Group' | 'FIT' | 'Ticket + Land'
export type GroupType  = 'SERIES' | 'ADHOC'
export type TripType = 'One-way' | 'Round-trip' | 'Multi-city'
export type PNRStatus = 'Pending' | 'Confirmed'
export type PnrOperationalStatus = 'PENDING' | 'ACTIVE' | 'CLOSED' | 'CANCELLED'
export type PnrConfirmationStatus = 'PENDING_CONFIRMATION' | 'CONFIRMED'
export type SectorType = 'Departure' | 'Transit' | 'Arrival'
export type RelativeDayType = 'Travel Start' | 'Return Date' | 'Custom Day'
export type PaymentType =
  | 'RSVN_FEE'
  | 'DEPOSIT'
  | 'BALANCE'
  | 'FULL_PAYMENT'
  | 'FEE'
  | 'REMAINING_PAYMENT' // backward-compat — legacy data only
  | 'ADDITIONAL_PAYMENT'// backward-compat — legacy data only
  | 'OTHER'             // backward-compat — legacy data only
  | 'PARTIAL_PAYMENT'   // backward-compat — legacy data only
  | 'FINAL_PAYMENT'     // backward-compat — legacy data only
export type AmountType = 'Fixed' | 'Percent' | 'Remaining' | 'PER_SEAT_FIXED' | 'FIXED_TOTAL'
export type PercentBase = 'TOTAL_AMOUNT' | 'FARE_ONLY' | 'PER_SEAT' | 'REMAINING_AFTER_PREV'
export type BaseDateType = 'Travel Start' | 'Created Date' | 'Custom Date'
export type PaymentStatus = 'Pending' | 'Paid' | 'Overdue' | 'Waived'
export type TaxType = 'included' | 'separate' | 'pending'
export type ConditionStatus = 'Active' | 'Inactive'
export type ConditionSource = 'none' | 'template' | 'custom'
export type ConditionTemplateTicketType = TicketType | 'All'
export type DueCalculationType =
  | 'travel_minus_days'           // วันเดินทาง − N วัน
  | 'series_created_plus_days'    // วันสร้าง Series + N วัน
  | 'previous_payment_plus_days'  // วันชำระรอบก่อนหน้า + N วัน
  | 'custom_date'                 // วันที่กำหนดเอง
export type UserRole = 'Admin' | 'Manager' | 'Staff' | 'Viewer'

// ============================================================
// Flight Series (Stock)
// ============================================================

export interface FlightSeries {
  id: string
  stock_code: string
  ticket_type: TicketType
  group_type?: GroupType
  trip_type: TripType
  group_name: string
  country_id: string | null
  destination: string | null
  airline_code: string
  route_text: string | null
  period_start: string | null
  period_end: string | null
  currency: string
  remark: string | null
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
  // joined
  airline?: Airline
  country?: Country
  sectors?: FlightSector[]
  conditions?: FlightCondition[]
  pnrs?: FlightPNR[]
  pnr_count?: number
  seat_total?: number
  seat_used?: number
  seat_balance?: number
  nearest_ttl?: string | null
}

export interface FlightSeriesFormData {
  ticket_type: TicketType
  group_type?: GroupType
  trip_type: TripType
  stock_code: string
  group_name: string
  country_id?: string
  destination: string
  tour_group_id?: string
  airline_code: string
  currency: string
  remark: string
}

// ============================================================
// Sector
// ============================================================

export interface FlightSector {
  id: string
  series_id: string
  seq: number
  sector_type: SectorType
  airline_code: string
  flight_no: string
  dep_airport_code: string
  arr_airport_code: string
  dep_time: string
  arr_time: string
  relative_day_type: RelativeDayType
  relative_day_no: number
  day_offset: number
  remark: string | null
  status: string
  created_at: string
  updated_at: string
  // joined
  dep_airport?: Airport
  arr_airport?: Airport
}

export interface FlightSectorFormData {
  id?: string
  seq: number
  sector_type: SectorType
  airline_code: string
  flight_no: string
  dep_airport_code: string
  arr_airport_code: string
  dep_time: string
  arr_time: string
  /** +Day: ข้ามวันของเวลาถึงปลายทาง — 1 ถ้า arr_time < dep_time, มิฉะนั้น 0 (คำนวณอัตโนมัติ) */
  arr_day_offset: number
  /** Day Offset จาก PNR Travel Start (Sector Travel Date = Travel Start + day_offset) */
  day_offset: number
  remark: string
}

export interface FlightScheduleFormData {
  scheduleId: string
  scheduleName: string
  isMain: boolean
  sectors: FlightSectorFormData[]
  remark: string
  countryCode?: string
  countryName?: string
  destinationAirport?: string
  sourceScheduleId?: string
}

// ============================================================
// Condition (New Unified Schema — see lib/condition-schema.ts)
// ============================================================

// Re-export core condition types for convenience
export type { AppCondition, AppStockCondition, CondStage } from '@/lib/condition-schema'

// Legacy Supabase-based types (kept for API layer compatibility, NOT used in wizard)
export interface FlightCondition {
  id: string
  series_id: string
  condition_code: string
  condition_name: string
  description: string | null
  status: ConditionStatus
  created_at: string
  updated_at: string
  stages?: FlightConditionStage[]
}

export interface FlightConditionStage {
  id: string
  condition_id: string
  stage_no: number
  stage_name: string
  payment_type: PaymentType
  custom_payment_name: string | null
  amount_type: AmountType
  amount_value: number
  percent_base: PercentBase
  payment_base_date_type: BaseDateType
  payment_due_days_before: number
  payment_due_time: string
  status: ConditionStatus
  created_at: string
  updated_at: string
}

// ============================================================
// PNR
// ============================================================

export interface FlightPNR {
  id: string
  series_id: string
  condition_id: string | null
  pnr_code: string | null
  dummy_pnr: string | null
  travel_start: string | null
  duration_days: number | null
  travel_end: string | null
  seat_total: number
  seat_used: number
  seat_balance: number
  fare: number
  tax: number
  total_amount: number
  next_ttl_datetime: string | null
  status: PNRStatus
  remark: string | null
  created_by: string | null
  created_at: string
  updated_by: string | null
  updated_at: string
  // joined
  condition?: FlightCondition
  payment_schedule?: PaymentSchedule[]
}

export interface FlightPNRFormData {
  id?: string
  pnr_code: string
  dummy_pnr: string
  /** วันเดินทางของ Sector แรก (Departure) — input เดียวที่ผู้ใช้กรอกใน Step 4 */
  travel_start: string
  /** คำนวณอัตโนมัติจาก Return ตัวสุดท้าย (หรือ Sector สุดท้าย) */
  travel_end: string
  seat_total: number
  fare: number
  /** 'included' = tax baked into fare (tax stored as 0), 'separate' = explicit tax amount, 'pending' = unknown (tax stored as 0, fill later) */
  tax_type: TaxType
  /** null = ยังไม่ระบุ (แสดง —), 0 = ระบุแล้วว่าเป็น 0 */
  tax: number | null
  total_amount: number
  price_format?: 'FARE' | 'FARE_YQ' | 'ALL_IN'
  /** null = ยังไม่ระบุ (แสดง —), 0 = ระบุแล้วว่าเป็น 0 */
  yq?: number | null
  /** ราคารวมสำหรับ ALL_IN — แยกจาก fare เพื่อไม่ให้สับสน */
  all_in_amount?: number | null
  breakdown?: boolean
  condition_id: string
  status: PNRStatus
  pnr_status?: PnrOperationalStatus
  confirmation_status?: PnrConfirmationStatus
  remark: string
  schedule_id?: string
  /** วันที่ของแต่ละ Sector คำนวณจาก travel_start + day_offset — ส่งต่อไป Step 5 */
  sector_dates?: {
    /** wizard-level sector form id — ใช้ link กับ FlightSet sector เมื่อ save */
    sector_id?: string
    sector_type: string
    day_offset: number
    /** +Day ของ Arrival (= FlightSectorFormData.arr_day_offset) — ใช้คำนวณ arr_date */
    arr_day_offset?: number
    travel_date: string
    arr_date?: string
    dep_manual?: boolean
    arr_manual?: boolean
    /** เวลาออกเดินทาง HH:mm — default จาก Flight Set template, แก้ได้ต่อ PNR */
    dep_time?: string
    /** เวลาถึงปลายทาง HH:mm — default จาก Flight Set template, แก้ได้ต่อ PNR */
    arr_time?: string
    /** true = ผู้ใช้แก้ไข dep_time หรือ arr_time ต่างจาก template */
    time_override?: boolean
  }[]
  /** 'UNSET' = ยังไม่ระบุ TTL, 'SET' = ระบุ TTL แล้ว — กรอกโดยผู้ใช้ ไม่ใช่คำนวณจาก Condition */
  ttl_status?: 'UNSET' | 'SET'
  ttl_date?: string | null
  ttl_time?: string | null
  ttl_remark?: string
  /** รูปแบบ TTL: ไม่ระบุ / ก่อนวันเดินทาง N วัน / วันที่กำหนดเอง */
  ttl_type?: 'NONE' | 'DAYS_BEFORE' | 'FIXED_DATE'
  ttl_days_before?: number | null
  /** 'SYNCED' = วันที่ตรงกับ Flight Set ล่าสุด, 'OUTDATED' = Flight Set เปลี่ยนแล้วแต่ยังไม่อัปเดตวันที่ */
  date_sync_status?: 'SYNCED' | 'OUTDATED'
  /** true = ผู้ใช้แก้ไข Arr Date เองโดยไม่ใช้ค่าคำนวณจาก Flight Set */
  travel_end_override?: boolean
  /** สกุลเงินของ PNR นี้ — ค่าเริ่มต้นจาก Stock Info แก้ไขได้ต่อ PNR */
  currency?: string
}

// ============================================================
// PNR Sector Date (วันที่จริงของแต่ละ Sector ต่อ PNR)
// ============================================================

export interface FlightPnrSectorDate {
  id: string
  series_id: string
  pnr_id: string
  sector_id: string
  sector_type: SectorType
  /** = PNR travel_start + sector day_offset */
  travel_date: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Payment Schedule
// ============================================================

export interface PaymentSchedule {
  id: string
  series_id: string
  pnr_id: string
  condition_id: string
  condition_stage_id: string
  stage_no: number
  stage_name: string
  payment_type: PaymentType
  amount_due: number
  due_date: string | null
  ttl_datetime: string | null
  paid_amount: number
  payment_status: PaymentStatus
  created_at: string
  updated_at: string
}

// ============================================================
// Booking Seat Usage
// ============================================================

export interface BookingSeatUsage {
  id: string
  series_id: string
  pnr_id: string
  booking_no: string
  customer_name: string
  seat_used: number
  used_date: string
  created_by: string | null
  created_at: string
}

// ============================================================
// Master Data
// ============================================================

export interface Airline {
  airline_code: string
  airline_name: string
  airline_logo: string | null
  status: string
}

export interface Airport {
  airport_code: string
  airport_name: string
  city: string | null
  country: string | null
  status: string
}

export interface Country {
  id: string
  country_name: string
  status: string
}

export interface TourGroup {
  id: string
  group_name: string
  status: string
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  status: string
}

// ============================================================
// Condition Template
// ============================================================

export interface ConditionTemplate {
  id: string
  template_code: string
  template_name: string
  airline_code: string | null
  ticket_type: ConditionTemplateTicketType
  currency: string
  description: string | null
  status: ConditionStatus
  version: number
  created_at: string
  updated_at: string
  stages?: ConditionTemplateStage[]
  usage_count?: number  // computed from series referencing this template
}

export interface ConditionTemplateStage {
  id: string
  template_id: string
  stage_no: number
  stage_name: string
  payment_type: PaymentType
  custom_payment_name: string | null
  amount_type: AmountType
  amount_value: number
  percent_base: PercentBase
  due_calculation_type: DueCalculationType
  day_offset: number
  due_time: string
  due_custom_date: string | null
  credit_toward_fare: boolean
  refundable: boolean
  auto_calculate: boolean
  remark: string | null
  status: ConditionStatus
}

export interface ConditionTemplateFormData {
  template_code: string
  template_name: string
  airline_code: string
  ticket_type: ConditionTemplateTicketType
  currency: string
  description: string
  status: ConditionStatus
  stages: ConditionTemplateStageFormData[]
}

export interface ConditionTemplateStageFormData {
  id?: string
  stage_no: number
  stage_name: string
  payment_type: PaymentType | ''
  custom_payment_name: string | null
  amount_type: AmountType
  amount_value: number
  percent_base: PercentBase
  due_calculation_type: DueCalculationType
  day_offset: number
  due_time: string
  due_custom_date: string
  credit_toward_fare: boolean
  refundable: boolean
  auto_calculate: boolean
  remark: string
  status: ConditionStatus
}

// ============================================================
// Activity Log
// ============================================================

export interface ActivityLog {
  id: string
  module_name: string
  ref_id: string
  action: string
  old_value: string | null
  new_value: string | null
  created_by: string | null
  created_at: string
}

// ============================================================
// Dashboard / Summary
// ============================================================

export interface DashboardSummary {
  total_stocks: number
  group_tickets: number
  fit_tickets: number
  land_tickets: number
  total_pnr: number
  seat_total: number
  seat_used: number
  seat_balance: number
  pnr_near_ttl: number
  pnr_pending: number
  pnr_confirmed: number
  pnr_ticketed: number
}

// ============================================================
// Wizard State
// ============================================================

export interface WizardState {
  step: number
  stockInfo: FlightSeriesFormData
  schedules: FlightScheduleFormData[]
  conditions: import('@/lib/condition-schema').AppCondition[]
  pnrs: FlightPNRFormData[]
}

// ============================================================
// Import / Export
// ============================================================

export interface ImportResult {
  success: boolean
  total: number
  imported: number
  errors: ImportError[]
}

export interface ImportError {
  row: number
  field: string
  message: string
}

// ============================================================
// API Response
// ============================================================

export interface ApiResponse<T> {
  data: T | null
  error: string | null
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
}

// ============================================================
// Filter / Search
// ============================================================

export interface TicketFilter {
  ticket_type?: TicketType
  airline_code?: string
  country_id?: string
  search?: string
  period_from?: string
  period_to?: string
}
