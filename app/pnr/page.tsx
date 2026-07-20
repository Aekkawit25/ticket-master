'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { getDemoStocks, saveDemoStock, buildPaymentSchedule, deriveScheduleWithTransactions, calcPNRFinancialSummary, lockPaymentStage, isPostedStatus, type DemoStock, type DemoLog, type PaymentScheduleItem, type FinancialTransaction, type PNRFinancialSummary, type TransactionType, type PaymentMethod, type StageStatus, type AmountMode, type SeatBasis } from '@/lib/demo-storage'
import { formatDate, formatDateTime, formatCurrency, formatNumber, cn, PAYMENT_TYPE_LABELS } from '@/lib/utils'
import { getDemoRole, setDemoRole, isTicketRole, isAccountingRole, USER_ROLE_LABELS, ALL_USER_ROLES, type UserRole } from '@/lib/auth'
import { getRequestsForPNR, getRequestsForStage, saveFinancialRequest, generateRequestId, generateIdempotencyKey, checkDuplicateRef, REQUEST_TYPE_LABELS, REQUEST_STATUS_INFO, type FinancialRequest, type RequestType } from '@/lib/financial-requests-storage'
import type { TicketType } from '@/types'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/card'
import { Badge, PNRStatusBadge, TicketTypeBadge } from '@/components/ui/badge'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { Modal } from '@/components/ui/modal'
import {
  Search, X, Eye, ExternalLink, Link2, Repeat,
  ChevronLeft, ChevronRight, Download, SlidersHorizontal,
  CheckCircle2, AlertCircle, Hash, Users, CreditCard, Plus,
  FileText, Info,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ─── Types ───────────────────────────────────────────────────────────────────

type MappingStatus = 'Not Mapped' | 'Partially Mapped' | 'Mapped'

interface PNRRow {
  stockId: string
  stockCode: string   // "Series Code"
  groupName: string   // "Series Name"
  ticketType: TicketType
  groupType?: string
  airlineCode: string
  routeText: string
  currency: string
  pnrId: string
  pnrCode: string
  dummyPnr: string
  pnrType: 'real' | 'dummy'
  pnrDisplay: string
  travelStart: string
  travelEnd: string
  seatTotal: number
  seatUsed: number
  seatBalance: number
  fare: number
  tax: number
  total: number
  conditionCode: string
  ttlDateTime: string | null
  status: string
  remark: string
  available: number
  programCount: number
  mappingStatus: MappingStatus
}

interface FilterState {
  ticketType: string
  pnrType: string
  airline: string
  status: string
  mappingStatus: string
  seatFilter: string
  travelFrom: string
  travelTo: string
  condition: string
}

const INIT_FILTERS: FilterState = {
  ticketType: '', pnrType: '', airline: '', status: '',
  mappingStatus: '', seatFilter: '', travelFrom: '', travelTo: '', condition: '',
}

const PAGE_SIZE = 20

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRows(stocks: DemoStock[]): PNRRow[] {
  const rows: PNRRow[] = []
  for (const s of stocks) {
    for (const p of s.pnrs) {
      rows.push({
        stockId: s.stockId,
        stockCode: s.stockCode,
        groupName: s.groupName,
        ticketType: s.ticketType,
        groupType: s.groupType,
        airlineCode: s.airlineCode,
        routeText: s.routeText,
        currency: s.currency,
        pnrId: p.pnrId,
        pnrCode: p.pnrCode,
        dummyPnr: p.dummyPnr,
        pnrType: p.pnrType,
        pnrDisplay: p.pnrDisplay,
        travelStart: p.travelStart,
        travelEnd: p.travelEnd,
        seatTotal: p.seatTotal,
        seatUsed: p.seatUsed,
        seatBalance: p.seatBalance,
        fare: p.fare,
        tax: p.tax ?? 0,
        total: p.total,
        conditionCode: p.conditionCode,
        ttlDateTime: p.ttlDateTime,
        status: p.status,
        remark: p.remark,
        available: p.seatBalance,
        programCount: 0,
        mappingStatus: 'Not Mapped',
      })
    }
  }
  return rows
}

function mappingVariant(s: MappingStatus): 'green' | 'yellow' | 'gray' {
  if (s === 'Mapped') return 'green'
  if (s === 'Partially Mapped') return 'yellow'
  return 'gray'
}

// ─── Financial Transaction Helpers ───────────────────────────────────────────

type TxModalType = 'payment' | 'refund' | 'forfeiture' | 'adjustment'

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK_TRANSFER: 'เงินโอน',
  CREDIT_CARD:   'ตัดบัตร',
  TOPUP:         'ใช้ยอด Topup',
  CASH:          'เงินสด',
  CHEQUE:        'เช็ค',
  OTHER:         'อื่น ๆ',
}

function formatPaymentMethod(tx: FinancialTransaction): string {
  if (!tx.paymentMethod) return '—'
  if (tx.paymentMethod === 'CREDIT_CARD' && tx.cardLast4)
    return `ตัดบัตร •••• ${tx.cardLast4}`
  return PAYMENT_METHOD_LABELS[tx.paymentMethod]
}

const INIT_TX_ACTION_FORM = {
  effectiveDate: '',
  effectiveTime: '',
  referenceNo: '',
  reason: '',
  remark: '',
}

const INIT_LOCK_FORM = {
  seatCount: '',
  manualReason: '',
}

const INIT_TX_FORM = {
  paymentStageId: '',
  originalTransactionId: '',
  paymentMethod: 'BANK_TRANSFER' as PaymentMethod,
  amount: '',
  feeAmount: '',
  transactionDate: '',
  transactionTime: '',
  referenceNo: '',
  creditNoteNo: '',
  reasonCode: '',
  remark: '',
  status: 'COMPLETED',
  // Bank Transfer
  sourceBank: '',
  destinationBank: '',
  transferReference: '',
  // Credit Card
  cardBrand: '',
  cardLast4: '',
  authorizationCode: '',
  // Topup
  topupAccountId: '',
  topupReference: '',
  topupBalanceBefore: '',
}

// ─── Financial Request Form ────────────────────────────────────────────────────

const INIT_FIN_REQ_FORM = {
  requestType: 'PAYMENT' as RequestType,
  stageId: '',
  amount: '',
  currencyCode: 'THB',
  transactionDate: new Date().toISOString().slice(0, 10),
  referenceNo: '',
  reason: '',
  remark: '',
  attachmentName: '',
}

const INIT_ACCT_POST_FORM = {
  postingDate: new Date().toISOString().slice(0, 10),
  voucherNo: '',
  bankAccount: '',
  accountingNote: '',
}

function TxTypeBadge({ type }: { type: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    PAYMENT:    { cls: 'bg-green-100 text-green-700',   label: 'Payment' },
    REFUND:     { cls: 'bg-blue-100 text-blue-700',     label: 'Refund' },
    FORFEITURE: { cls: 'bg-orange-100 text-orange-700', label: 'Forfeiture' },
    ADJUSTMENT: { cls: 'bg-slate-100 text-slate-600',   label: 'Adjustment' },
    REVERSAL:   { cls: 'bg-red-100 text-red-600',       label: 'Reversal' },
  }
  const { cls, label } = map[type] ?? { cls: 'bg-slate-100 text-slate-500', label: type }
  return <span className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium ${cls}`}>{label}</span>
}

function getTxStatusInfo(type: string, status: string): { label: string; cls: string; tooltip: string } {
  if (type === 'PAYMENT' || type === 'ADJUSTMENT') {
    const m: Record<string, [string, string, string]> = {
      DRAFT:            ['ร่าง',             'bg-slate-100 text-slate-500',   'สร้างรายการไว้แล้ว แต่ยังไม่ได้ส่งตรวจสอบ'],
      PENDING:          ['รอตรวจสอบ',        'bg-yellow-100 text-yellow-700', 'รอผู้มีสิทธิ์ตรวจสอบและอนุมัติ'],
      PENDING_APPROVAL: ['รอตรวจสอบ',        'bg-yellow-100 text-yellow-700', 'รอผู้มีสิทธิ์ตรวจสอบและอนุมัติ'],
      COMPLETED:        ['ชำระสำเร็จ',       'bg-green-100 text-green-700',   'ตรวจสอบและยืนยันการจ่ายเรียบร้อยแล้ว'],
      CONFIRMED:        ['ชำระสำเร็จ',       'bg-green-100 text-green-700',   'ตรวจสอบและยืนยันการจ่ายเรียบร้อยแล้ว'],
      FAILED:           ['ล้มเหลว',          'bg-red-100 text-red-600',       'การชำระเงินล้มเหลว'],
      REJECTED:         ['ไม่อนุมัติ',       'bg-rose-100 text-rose-600',     'รายการไม่ผ่านการตรวจสอบ'],
      CANCELLED:                  ['ยกเลิก',                    'bg-slate-100 text-slate-500',   'รายการถูกยกเลิกและไม่นำมาคำนวณ'],
      REVERSED:                   ['กลับรายการแล้ว',            'bg-purple-100 text-purple-700', 'มีรายการ Reversal เพื่อล้างผลของรายการเดิมแล้ว'],
      PENDING_ACCOUNTING_REVIEW:  ['รอฝ่ายบัญชีตรวจสอบ',       'bg-orange-100 text-orange-700', 'รอฝ่ายบัญชีตรวจสอบและลงบัญชี'],
      PENDING_MANAGER_APPROVAL:   ['รออนุมัติผู้จัดการ',         'bg-yellow-100 text-yellow-700', 'รอผู้จัดการฝ่ายบัญชีอนุมัติ'],
      POSTED:                     ['ลงบัญชีแล้ว',               'bg-green-100 text-green-700',   'ลงบัญชีแล้ว — ยอดสมบูรณ์'],
      VOIDED:                     ['ยกเลิกรายการ',              'bg-slate-100 text-slate-500',   'รายการถูก Void — ไม่นำมาคำนวณ'],
    }
    const [label, cls, tooltip] = m[status] ?? [status, 'bg-slate-100 text-slate-500', status]
    return { label, cls, tooltip }
  }
  if (type === 'REFUND') {
    const m: Record<string, [string, string, string]> = {
      REQUESTED:                  ['ขอคืนเงิน',                'bg-yellow-100 text-yellow-700', 'ส่งคำขอคืนเงินแล้ว แต่ยังไม่ได้รับอนุมัติ'],
      APPROVED:                   ['อนุมัติคืนเงิน',           'bg-blue-100 text-blue-700',     'อนุมัติคำขอแล้ว แต่ยังไม่ได้รับเงินจริง'],
      RECEIVED:                   ['ได้รับเงินคืนแล้ว',        'bg-green-100 text-green-700',   'ได้รับเงินคืนจริงและยืนยันเรียบร้อยแล้ว'],
      REJECTED:                   ['ไม่อนุมัติคืนเงิน',       'bg-rose-100 text-rose-600',     'รายการไม่ผ่านการตรวจสอบ'],
      CANCELLED:                  ['ยกเลิกคำขอคืนเงิน',       'bg-slate-100 text-slate-500',   'รายการถูกยกเลิกและไม่นำมาคำนวณ'],
      REVERSED:                   ['กลับรายการแล้ว',           'bg-purple-100 text-purple-700', 'มีรายการ Reversal เพื่อล้างผลของรายการเดิมแล้ว'],
      PENDING_ACCOUNTING_REVIEW:  ['รอฝ่ายบัญชีตรวจสอบ',      'bg-orange-100 text-orange-700', 'รอฝ่ายบัญชีตรวจสอบและลงบัญชี'],
      PENDING_MANAGER_APPROVAL:   ['รออนุมัติผู้จัดการ',        'bg-yellow-100 text-yellow-700', 'รอผู้จัดการฝ่ายบัญชีอนุมัติ'],
      POSTED:                     ['ลงบัญชีแล้ว',              'bg-green-100 text-green-700',   'ลงบัญชีแล้ว — ยอดสมบูรณ์'],
      VOIDED:                     ['ยกเลิกรายการ',             'bg-slate-100 text-slate-500',   'รายการถูก Void — ไม่นำมาคำนวณ'],
    }
    const [label, cls, tooltip] = m[status] ?? [status, 'bg-slate-100 text-slate-500', status]
    return { label, cls, tooltip }
  }
  if (type === 'FORFEITURE') {
    const m: Record<string, [string, string, string]> = {
      PENDING_CONFIRMATION: ['รอยืนยันการถูกยึด',   'bg-orange-100 text-orange-600', 'ยังอยู่ระหว่างตรวจสอบว่าถูกยึดเงินจริงหรือไม่'],
      CONFIRMED:            ['ยืนยันถูกยึดแล้ว',     'bg-red-100 text-red-700',       'ยืนยันว่าเงินถูกยึดและไม่สามารถเรียกคืนได้'],
      DISPUTED:             ['อยู่ระหว่างโต้แย้ง',   'bg-orange-100 text-orange-700', 'อยู่ระหว่างเจรจาหรือคัดค้านการถูกยึด'],
      CANCELLED:            ['ยกเลิกรายการถูกยึด',   'bg-slate-100 text-slate-500',   'รายการถูกยกเลิกและไม่นำมาคำนวณ'],
      REVERSED:             ['กลับรายการแล้ว',        'bg-purple-100 text-purple-700', 'มีรายการ Reversal เพื่อล้างผลของรายการเดิมแล้ว'],
    }
    const [label, cls, tooltip] = m[status] ?? [status, 'bg-slate-100 text-slate-500', status]
    return { label, cls, tooltip }
  }
  if (type === 'REVERSAL') {
    return { label: 'กลับรายการแล้ว', cls: 'bg-purple-100 text-purple-700', tooltip: 'รายการ Reversal ที่สร้างขึ้นเพื่อล้างผลรายการเดิม' }
  }
  return { label: status, cls: 'bg-slate-100 text-slate-500', tooltip: status }
}

type TxMenuItem = { label: string; action: string; newStatus?: string; danger?: boolean; disabled?: boolean }

function getTxMenuActions(tx: FinancialTransaction): TxMenuItem[] {
  const { transactionType: type, status } = tx
  if (type === 'PAYMENT') {
    if (status === 'DRAFT')
      return [
        { label: 'แก้ไขรายการ',    action: 'view' },
        { label: 'ส่งตรวจสอบ',     action: 'change_status', newStatus: 'PENDING_APPROVAL' },
        { label: 'ยกเลิก',          action: 'change_status', newStatus: 'CANCELLED', danger: true },
      ]
    if (status === 'PENDING_APPROVAL' || status === 'PENDING')
      return [
        { label: 'อนุมัติการจ่าย', action: 'change_status', newStatus: 'COMPLETED' },
        { label: 'ไม่อนุมัติ',     action: 'change_status', newStatus: 'REJECTED', danger: true },
        { label: 'ดูรายละเอียด',   action: 'view' },
        { label: 'ดูหลักฐาน',      action: 'view_attachment', disabled: !tx.attachmentUrl },
      ]
    if (status === 'COMPLETED' || status === 'CONFIRMED')
      return [
        { label: 'ดูรายละเอียด', action: 'view' },
        { label: 'ดูหลักฐาน',    action: 'view_attachment', disabled: !tx.attachmentUrl },
        { label: 'กลับรายการ',   action: 'reversal', danger: true },
      ]
    if (status === 'REJECTED')
      return [
        { label: 'แก้ไขและส่งใหม่', action: 'change_status', newStatus: 'PENDING_APPROVAL' },
        { label: 'ดูรายละเอียด',    action: 'view' },
        { label: 'ยกเลิก',           action: 'change_status', newStatus: 'CANCELLED', danger: true },
      ]
    if (status === 'PENDING_ACCOUNTING_REVIEW')
      return [
        { label: 'ยืนยันและลงบัญชี', action: 'accounting_post' },
        { label: 'ปฏิเสธ', action: 'change_status', newStatus: 'REJECTED', danger: true },
      ]
    if (status === 'POSTED')
      return [
        { label: 'ดูรายละเอียด', action: 'view' },
        { label: 'Void รายการ', action: 'change_status', newStatus: 'VOIDED', danger: true, disabled: true },
      ]
    if (status === 'VOIDED')
      return [{ label: 'ดูรายละเอียด', action: 'view' }]
    if (status === 'REVERSED')
      return [{ label: 'ดูรายละเอียด', action: 'view' }]
    return [{ label: 'ดูรายละเอียด', action: 'view' }]
  }
  if (type === 'REFUND') {
    if (status === 'REQUESTED')
      return [
        { label: 'อนุมัติคืนเงิน',     action: 'change_status', newStatus: 'APPROVED' },
        { label: 'ไม่อนุมัติคืนเงิน', action: 'change_status', newStatus: 'REJECTED', danger: true },
        { label: 'ยกเลิกคำขอ',         action: 'change_status', newStatus: 'CANCELLED', danger: true },
        { label: 'ดูรายละเอียด',       action: 'view' },
      ]
    if (status === 'APPROVED')
      return [
        { label: 'ยืนยันได้รับเงินคืนแล้ว', action: 'change_status', newStatus: 'RECEIVED' },
        { label: 'ยกเลิกคำขอ',              action: 'change_status', newStatus: 'CANCELLED', danger: true },
        { label: 'ดูรายละเอียด',            action: 'view' },
      ]
    if (status === 'RECEIVED')
      return [
        { label: 'ดูรายละเอียด', action: 'view' },
        { label: 'ดูหลักฐาน',    action: 'view_attachment', disabled: !tx.attachmentUrl },
        { label: 'กลับรายการ',   action: 'reversal', danger: true },
      ]
    return [{ label: 'ดูรายละเอียด', action: 'view' }]
  }
  if (type === 'FORFEITURE') {
    if (status === 'PENDING_CONFIRMATION')
      return [
        { label: 'ยืนยันการถูกยึด',          action: 'change_status', newStatus: 'CONFIRMED' },
        { label: 'ระบุว่าอยู่ระหว่างโต้แย้ง', action: 'change_status', newStatus: 'DISPUTED' },
        { label: 'ยกเลิกรายการ',              action: 'change_status', newStatus: 'CANCELLED', danger: true },
        { label: 'ดูรายละเอียด',              action: 'view' },
      ]
    if (status === 'DISPUTED')
      return [
        { label: 'ยืนยันการถูกยึด', action: 'change_status', newStatus: 'CONFIRMED' },
        { label: 'ยกเลิกรายการ',    action: 'change_status', newStatus: 'CANCELLED', danger: true },
        { label: 'เพิ่มหมายเหตุ',   action: 'view' },
        { label: 'ดูรายละเอียด',    action: 'view' },
      ]
    if (status === 'CONFIRMED')
      return [
        { label: 'ดูรายละเอียด', action: 'view' },
        { label: 'ดูหลักฐาน',    action: 'view_attachment', disabled: !tx.attachmentUrl },
        { label: 'กลับรายการ',   action: 'reversal', danger: true },
      ]
    return [{ label: 'ดูรายละเอียด', action: 'view' }]
  }
  return [{ label: 'ดูรายละเอียด', action: 'view' }]
}

function TxStatusBadge({ type, status }: { type: string; status: string }) {
  const { label, cls, tooltip } = getTxStatusInfo(type, status)
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium cursor-help ${cls}`}>
      {label}
    </span>
  )
}

// ─── Payment Helpers ─────────────────────────────────────────────────────────

function computePaymentStatus(ttlDatetime: string | null): 'Pending' | 'Overdue' {
  if (!ttlDatetime) return 'Pending'
  return new Date(ttlDatetime) < new Date() ? 'Overdue' : 'Pending'
}

function getNextPaymentItem(items: PaymentScheduleItem[]): PaymentScheduleItem | null {
  if (items.length === 0) return null
  return [...items].sort((a, b) => {
    const at = a.ttlDatetime ? new Date(a.ttlDatetime).getTime() : Infinity
    const bt = b.ttlDatetime ? new Date(b.ttlDatetime).getTime() : Infinity
    return at - bt
  })[0]
}

function PaymentStatusBadge({ status }: { status: PaymentScheduleItem['paymentStatus'] }) {
  if (status === 'PAID')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-green-100 text-green-700">ชำระแล้ว</span>
  if (status === 'PARTIALLY_PAID')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">ชำระบางส่วน</span>
  if (status === 'UNPAID')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-red-100 text-red-600">ยังไม่ชำระ</span>
  return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-yellow-100 text-yellow-700">รอชำระ</span>
}

function TimingStatusBadge({ status, days }: { status: PaymentScheduleItem['timingStatus']; days?: number | null }) {
  if (status === 'PAID_ON_TIME')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-green-50 text-green-600 border border-green-200">ชำระตรงเวลา</span>
  if (status === 'PAID_LATE')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-orange-100 text-orange-600">ชำระล่าช้า {days} วัน</span>
  if (status === 'OVERDUE')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-red-100 text-red-600">เกินกำหนด{days ? ` ${days} วัน` : ''}</span>
  if (status === 'PENDING_MORE')
    return <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-blue-50 text-blue-600">รอชำระเพิ่ม</span>
  return null  // NOT_DUE: no timing badge
}

// ─── Per-seat schedule labels & badges ───────────────────────────────────────

const SEAT_BASIS_LABELS: Record<string, string> = {
  INITIAL_SEAT:        'จำนวนที่นั่งเริ่มต้น',
  REMAINING_AT_CUTOFF: 'ที่นั่งคงเหลือ ณ วันล็อกยอด',
  MANUAL_SEAT:         'ระบุจำนวนเอง',
}

const AMOUNT_MODE_LABELS: Record<string, string> = {
  PER_SEAT_FIXED:      'อัตราคงที่ต่อที่นั่ง',
  PERCENT_PER_SEAT:    'เปอร์เซ็นต์ต่อที่นั่ง',
  REMAINING_PER_SEAT:  'ยอดคงเหลือต่อที่นั่ง',
  FIXED_TOTAL:         'ยอดรวมตายตัว',
}

const STAGE_STATUS_INFO: Record<StageStatus, { label: string; cls: string }> = {
  WAITING_CALCULATION: { label: 'รอคำนวณ',       cls: 'bg-slate-100 text-slate-500' },
  ESTIMATED:           { label: 'ยอดประมาณการ',  cls: 'bg-sky-100 text-sky-700' },
  LOCKED:              { label: 'ล็อกยอดแล้ว',   cls: 'bg-[#05a94f]/10 text-[#05a94f]' },
  REQUESTED:           { label: 'สร้างใบเบิกแล้ว', cls: 'bg-blue-100 text-blue-700' },
  PARTIALLY_PAID:      { label: 'จ่ายบางส่วน',   cls: 'bg-yellow-100 text-yellow-700' },
  PAID:                { label: 'จ่ายแล้ว',       cls: 'bg-green-100 text-green-700' },
  ADJUSTED:            { label: 'ปรับยอดแล้ว',   cls: 'bg-orange-100 text-orange-600' },
  CANCELLED:           { label: 'ยกเลิก',         cls: 'bg-red-100 text-red-600' },
}

function StageStatusBadge({ status }: { status: StageStatus | undefined }) {
  if (!status) return null
  const { label, cls } = STAGE_STATUS_INFO[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' }
  return <span className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium ${cls}`}>{label}</span>
}

function PaymentSummaryCell({ summary, txCount, currency, onClick }: {
  summary: PNRFinancialSummary | null
  txCount: number
  currency: string
  onClick: () => void
}) {
  if (!summary || summary.requiredAmount === 0) {
    return <span className="text-xs text-slate-400">ยังไม่ได้กำหนดการชำระ</span>
  }
  const isPaid = summary.paidAmount >= summary.requiredAmount
  // outstanding = MAX(required - paid, 0) — ไม่นำ refund/forfeiture มาคำนวณ
  const outstanding = Math.max(0, summary.requiredAmount - summary.paidAmount)
  const methodEntries = Object.entries(summary.methodBreakdown) as [PaymentMethod, number][]
  const METHOD_SHORT: Record<PaymentMethod, string> = {
    BANK_TRANSFER: 'โอน', CREDIT_CARD: 'บัตร', TOPUP: 'Topup',
    CASH: 'สด', CHEQUE: 'เช็ค', OTHER: 'อื่นๆ',
  }
  return (
    <button onClick={onClick} className="text-left w-full hover:opacity-75 transition-opacity" title="ดูรายละเอียดการชำระเงิน">
      <div className="space-y-0.5">
        {isPaid ? (
          <p className="text-[11px] font-semibold text-[#05a94f]">
            ชำระครบแล้ว {formatNumber(summary.paidAmount)} {currency}
          </p>
        ) : (
          <>
            <p className={`text-[11px] font-semibold ${summary.paidAmount > 0 ? 'text-[#05a94f]' : 'text-slate-500'}`}>
              ชำระแล้ว {formatNumber(summary.paidAmount)} {currency}
            </p>
            <p className="text-[11px] text-amber-600">
              คงเหลือ {formatNumber(outstanding)} {currency}
            </p>
          </>
        )}
        {methodEntries.length > 0 && (
          <p className="text-[10px] text-slate-400 leading-tight">
            {methodEntries.map(([m, v]) => `${METHOD_SHORT[m]} ${formatNumber(v)}`).join(' · ')}
          </p>
        )}
      </div>
    </button>
  )
}

// ─── Payment Drawer ───────────────────────────────────────────────────────────

interface PaymentDrawerState {
  pnrDisplay: string
  currency: string
  summary: PNRFinancialSummary
  transactions: FinancialTransaction[]
  scheduleItems: PaymentScheduleItem[]
}

function PaymentDrawer({ state, onClose }: { state: PaymentDrawerState | null; onClose: () => void }) {
  const [tab, setTab] = useState<'summary' | 'history'>('summary')
  if (!state) return null
  const { pnrDisplay, currency, summary, transactions, scheduleItems } = state

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#05a94f]/10 flex items-center justify-center flex-shrink-0">
              <CreditCard size={16} className="text-[#05a94f]" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-base">Payment & Transactions</h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">{pnrDisplay}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-5 flex-shrink-0">
          {(['summary', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                'text-xs font-medium px-4 py-2.5 border-b-2 -mb-px transition-colors',
                tab === t ? 'border-[#05a94f] text-[#05a94f]' : 'border-transparent text-slate-500 hover:text-slate-700'
              )}>
              {t === 'summary' ? 'สรุป / Schedule' : `Transaction (${transactions.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'summary' && (
            <div className="space-y-4">
              {/* Financial Summary Grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'ยอดที่ต้องชำระ', value: summary.requiredAmount,    cls: 'text-slate-700' },
                  { label: 'ชำระแล้ว',        value: summary.paidAmount,        cls: 'text-[#05a94f]' },
                  { label: 'ได้รับเงินคืน',   value: summary.refundAmount,      cls: 'text-blue-600' },
                  { label: 'ถูกยึด',           value: summary.forfeitedAmount,   cls: 'text-orange-600' },
                  { label: 'ยอดค้างชำระ',     value: summary.outstandingAmount, cls: summary.outstandingAmount > 0 ? 'text-amber-600' : 'text-slate-400' },
                  { label: 'ยอดจ่ายสุทธิ',   value: summary.netCashPaid,       cls: 'text-slate-800 font-bold' },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
                    <p className={`text-sm ${cls}`}>{formatCurrency(value, currency)}</p>
                  </div>
                ))}
              </div>

              {/* Payment Schedule */}
              {scheduleItems.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Payment Schedule</p>
                  <div className="space-y-2">
                    {scheduleItems.map((si, i) => {
                      return (
                        <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                          {/* Stage name + badge */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="text-xs font-semibold text-slate-800 leading-snug">{si.stageName}</span>
                            <div className="shrink-0 mt-0.5 flex gap-1">
                              <PaymentStatusBadge status={si.paymentStatus} />
                              <TimingStatusBadge status={si.timingStatus} days={si.lateDays ?? si.overdueDays} />
                            </div>
                          </div>
                          {/* Amount + Due date */}
                          <div className="flex items-center gap-4 text-[11px] text-slate-500">
                            <span>
                              <span className="text-slate-400">ยอด: </span>
                              <span className="font-semibold text-slate-700">
                                {si.amountType === 'Percent' ? `${si.amount}%` : formatCurrency(si.amount, currency)}
                              </span>
                            </span>
                            {si.ttlDatetime && (
                              <span>
                                <span className="text-slate-400">ครบกำหนด: </span>
                                <span className={`font-medium ${si.timingStatus === 'OVERDUE' || si.timingStatus === 'PAID_LATE' ? 'text-red-500' : 'text-slate-700'}`}>
                                  {formatDateTime(si.ttlDatetime)}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            transactions.length === 0
              ? <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <CreditCard size={32} className="opacity-30" />
                  <p>ยังไม่มี Transaction</p>
                </div>
              : <div className="space-y-2">
                  {transactions.map(tx => (
                    <div key={tx.transactionId} className="border border-slate-200 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <TxTypeBadge type={tx.transactionType} />
                          <span className="text-sm font-bold text-slate-800">{formatCurrency(tx.amount, tx.currencyCode)}</span>
                          {tx.paymentMethod && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-px rounded-full">{formatPaymentMethod(tx)}</span>
                          )}
                        </div>
                        <TxStatusBadge type={tx.transactionType} status={tx.status} />
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                        <span className="text-slate-400">วันที่: <span className="text-slate-600">{tx.paymentDateTime ? formatDateTime(tx.paymentDateTime) : formatDate(tx.transactionDate)}</span></span>
                        {tx.feeAmount > 0 && <span className="text-slate-400">ค่าธรรมเนียม: <span className="text-slate-600">{formatCurrency(tx.feeAmount, tx.currencyCode)}</span></span>}
                        {tx.referenceNo && <span className="text-slate-400">Ref: <span className="text-slate-600">{tx.referenceNo}</span></span>}
                        {tx.creditNoteNo && <span className="text-slate-400">Credit Note: <span className="text-slate-600">{tx.creditNoteNo}</span></span>}
                        {tx.reasonCode && <span className="text-slate-400">Reason: <span className="text-slate-600">{tx.reasonCode}</span></span>}
                        {tx.createdBy && <span className="text-slate-400">By: <span className="text-slate-600">{tx.createdBy}</span></span>}
                      </div>
                      {tx.remark && <p className="text-[11px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-100">{tx.remark}</p>}
                    </div>
                  ))}
                </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Role Switcher (Demo only) ────────────────────────────────────────────────

function RoleSwitcher({ currentRole, onChange }: { currentRole: UserRole; onChange: (r: UserRole) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-400 whitespace-nowrap">สิทธิ์ (Demo):</span>
      <select
        value={currentRole}
        onChange={e => onChange(e.target.value as UserRole)}
        className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#05a94f]">
        {ALL_USER_ROLES.map(r => (
          <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Financial Request Modal (Ticket Staff) ───────────────────────────────────

function FinancialRequestModal({
  open, onClose, row, stock, scheduleItems, currentRole, onSaved,
}: {
  open: boolean
  onClose: () => void
  row: PNRRow | null
  stock: DemoStock | null
  scheduleItems: PaymentScheduleItem[]
  currentRole: UserRole
  onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState(() => ({ ...INIT_FIN_REQ_FORM, transactionDate: today }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const resetForm = () => {
    setForm({ ...INIT_FIN_REQ_FORM, transactionDate: new Date().toISOString().slice(0, 10) })
    setError('')
  }

  if (!row || !stock) return null

  const handleSubmit = () => {
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) { setError('กรุณากรอกจำนวนเงินที่ถูกต้อง'); return }
    if (!form.transactionDate) { setError('กรุณาเลือกวันที่'); return }
    if (!form.reason.trim()) { setError('กรุณาระบุเหตุผล'); return }

    // Check duplicate referenceNo
    if (form.referenceNo.trim()) {
      const dup = checkDuplicateRef(form.referenceNo.trim())
      if (dup) { setError(`เลขอ้างอิง "${form.referenceNo}" ถูกใช้แล้วใน ${dup.requestId}`); return }
    }

    setSaving(true)
    try {
      const now = new Date().toISOString()
      const req: FinancialRequest = {
        requestId: generateRequestId(),
        idempotencyKey: generateIdempotencyKey(),
        stockId: row.stockId,
        pnrId: row.pnrId,
        stageId: form.stageId || null,
        requestType: form.requestType,
        amount,
        currencyCode: row.currency,
        transactionDate: form.transactionDate,
        referenceNo: form.referenceNo.trim(),
        reason: form.reason.trim(),
        remark: form.remark.trim(),
        attachments: form.attachmentName ? [form.attachmentName] : [],
        requestedBy: USER_ROLE_LABELS[currentRole],
        requestedByRole: currentRole,
        requestedDate: now,
        status: 'PENDING_ACCOUNTING_REVIEW',
        reviewedBy: null,
        reviewedDate: null,
        accountingReviewedBy: null,
        accountingReviewedDate: null,
        approvedBy: null,
        approvedDate: null,
        rejectedBy: null,
        rejectedDate: null,
        rejectedReason: null,
        linkedTransactionId: null,
        logs: [{
          logId: `LOG-${Date.now()}`,
          action: `สร้างคำขอ ${REQUEST_TYPE_LABELS[form.requestType]}`,
          actor: USER_ROLE_LABELS[currentRole],
          actorRole: currentRole,
          timestamp: now,
        }],
      }
      saveFinancialRequest(req)
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#05a94f]'
  const selectCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#05a94f] bg-white'

  const handleClose = () => { resetForm(); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title="ส่งคำขอรายการการเงิน" size="md"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleClose}>ยกเลิก</Button>
          <Button size="sm" onClick={handleSubmit} loading={saving}>ส่งคำขอ</Button>
        </>
      }>
      <div className="space-y-3">
        {/* PNR info */}
        <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
          <span className="text-slate-400">PNR: </span><span className="font-mono font-semibold">{row.pnrDisplay}</span>
          <span className="mx-2 text-slate-300">|</span>
          <span className="text-slate-400">Series: </span><span>{row.stockCode}</span>
        </div>

        {/* ประเภทคำขอ */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">ประเภทคำขอ <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(REQUEST_TYPE_LABELS) as [RequestType, string][]).map(([k, v]) => (
              <button key={k} type="button"
                onClick={() => setForm(f => ({ ...f, requestType: k }))}
                className={`text-xs px-3 py-2 rounded-lg border text-left transition-colors ${form.requestType === k ? 'border-[#05a94f] bg-green-50 text-[#05a94f] font-medium' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* รอบชำระ */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">รอบชำระ (ถ้ามี)</label>
          <select value={form.stageId} onChange={e => setForm(f => ({ ...f, stageId: e.target.value }))} className={selectCls}>
            <option value="">ไม่ระบุรอบ</option>
            {scheduleItems.map(s => <option key={s.stageId} value={s.stageId}>{s.stageName}</option>)}
          </select>
        </div>

        {/* จำนวนเงิน + วันที่ */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">จำนวนเงิน ({row.currency}) <span className="text-red-500">*</span></label>
            <input type="number" min="0" step="0.01" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0.00" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">วันที่รายการ <span className="text-red-500">*</span></label>
            <input type="date" value={form.transactionDate}
              onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))}
              className={inputCls} />
          </div>
        </div>

        {/* เลขอ้างอิง */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">เอกสารอ้างอิง</label>
          <input type="text" value={form.referenceNo}
            onChange={e => setForm(f => ({ ...f, referenceNo: e.target.value }))}
            placeholder="เลขที่เอกสาร, Invoice No. ฯลฯ"
            className={inputCls} />
        </div>

        {/* เหตุผล */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">เหตุผล <span className="text-red-500">*</span></label>
          <textarea value={form.reason}
            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            rows={2} placeholder="ระบุเหตุผล..."
            className={`${inputCls} resize-none`} />
        </div>

        {/* หมายเหตุ */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">หมายเหตุ</label>
          <textarea value={form.remark}
            onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
            rows={2} placeholder="หมายเหตุเพิ่มเติม..."
            className={`${inputCls} resize-none`} />
        </div>

        {/* ไฟล์แนบ (simulated) */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">ไฟล์แนบ</label>
          <input type="text" value={form.attachmentName}
            onChange={e => setForm(f => ({ ...f, attachmentName: e.target.value }))}
            placeholder="ชื่อไฟล์เอกสาร (เช่น invoice-001.pdf)"
            className={inputCls} />
          <p className="text-[10px] text-slate-400 mt-1">Demo: พิมพ์ชื่อไฟล์แนบ (ระบบจริงจะมี Upload)</p>
        </div>

        {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  )
}

// ─── Accounting Post Modal ────────────────────────────────────────────────────

function AccountingPostModal({
  open, onClose, pendingReq, row, currentRole, onPosted,
}: {
  open: boolean
  onClose: () => void
  pendingReq: FinancialRequest | null
  row: PNRRow | null
  currentRole: UserRole
  onPosted: (req: FinancialRequest, tx: FinancialTransaction) => void
}) {
  const [form, setForm] = useState(() => ({ ...INIT_ACCT_POST_FORM, postingDate: new Date().toISOString().slice(0, 10) }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const resetForm = () => {
    setForm({ ...INIT_ACCT_POST_FORM, postingDate: new Date().toISOString().slice(0, 10) })
    setError('')
  }

  if (!pendingReq || !row) return null

  const needsManagerApproval = ['REFUND', 'FORFEITURE', 'ADJUSTMENT'].includes(pendingReq.requestType) && currentRole === 'ACCOUNTING_STAFF'

  const handlePost = () => {
    if (!form.postingDate) { setError('กรุณาระบุวันที่ลงบัญชี'); return }
    if (!form.voucherNo.trim()) { setError('กรุณาระบุ Voucher No.'); return }
    if (needsManagerApproval) { setError('รายการนี้ต้องได้รับอนุมัติจากผู้จัดการฝ่ายบัญชีก่อน'); return }

    setSaving(true)
    try {
      const now = new Date().toISOString()
      const txType: TransactionType = pendingReq.requestType === 'PAYMENT' ? 'PAYMENT'
        : pendingReq.requestType === 'REFUND' ? 'REFUND'
        : pendingReq.requestType === 'FORFEITURE' ? 'FORFEITURE'
        : 'ADJUSTMENT'

      const newTx: FinancialTransaction = {
        transactionId: `TX-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        pnrId: pendingReq.pnrId,
        paymentStageId: pendingReq.stageId,
        originalTransactionId: null,
        transactionType: txType,
        paymentMethod: txType === 'PAYMENT' ? 'BANK_TRANSFER' : null,
        amount: pendingReq.amount,
        feeAmount: 0,
        currencyCode: pendingReq.currencyCode,
        transactionDate: pendingReq.transactionDate,
        paymentDateTime: null,
        status: 'POSTED',
        reasonCode: pendingReq.reason || null,
        referenceNo: pendingReq.referenceNo || null,
        creditNoteNo: null,
        attachmentUrl: null,
        remark: pendingReq.remark || null,
        sourceBank: null, destinationBank: null, transferReference: null,
        cardBrand: null, cardLast4: null, authorizationCode: null,
        topupAccountId: null, topupReference: null, topupBalanceBefore: null, topupUsedAmount: null, topupBalanceAfter: null,
        createdBy: USER_ROLE_LABELS[currentRole],
        approvedBy: USER_ROLE_LABELS[currentRole],
        createdAt: now,
        updatedAt: now,
        // New fields
        postingDate: form.postingDate,
        voucherNo: form.voucherNo.trim(),
        accountingNote: form.accountingNote.trim() || null,
        postedBy: USER_ROLE_LABELS[currentRole],
        linkedRequestId: pendingReq.requestId,
        idempotencyKey: pendingReq.idempotencyKey,
      }

      // Update the request status to APPROVED
      const updatedReq: FinancialRequest = {
        ...pendingReq,
        status: 'APPROVED',
        accountingReviewedBy: USER_ROLE_LABELS[currentRole],
        accountingReviewedDate: now,
        approvedBy: USER_ROLE_LABELS[currentRole],
        approvedDate: now,
        linkedTransactionId: newTx.transactionId,
        logs: [...pendingReq.logs, {
          logId: `LOG-${Date.now()}`,
          action: `ลงบัญชีแล้ว — Voucher: ${form.voucherNo}`,
          actor: USER_ROLE_LABELS[currentRole],
          actorRole: currentRole,
          timestamp: now,
        }],
      }
      saveFinancialRequest(updatedReq)
      onPosted(updatedReq, newTx)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#05a94f]'

  const handleClose = () => { resetForm(); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title="ยืนยันและลงบัญชี" size="sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleClose}>ยกเลิก</Button>
          <Button size="sm" onClick={handlePost} loading={saving} disabled={needsManagerApproval}>
            {needsManagerApproval ? 'ต้องอนุมัติโดยผู้จัดการ' : 'ยืนยันลงบัญชี'}
          </Button>
        </>
      }>
      <div className="space-y-3">
        {/* Request summary */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs">
          <p className="font-semibold text-blue-800 mb-1">{REQUEST_TYPE_LABELS[pendingReq.requestType]} — {pendingReq.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} {pendingReq.currencyCode}</p>
          <p className="text-blue-600">PNR: {row.pnrDisplay} | {pendingReq.reason}</p>
          {pendingReq.referenceNo && <p className="text-blue-500 mt-1">อ้างอิง: {pendingReq.referenceNo}</p>}
        </div>

        {needsManagerApproval && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            รายการ Refund, ยอดถูกยึด และปรับปรุงยอด ต้องได้รับอนุมัติจากผู้จัดการฝ่ายบัญชีก่อน
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">วันที่ลงบัญชี <span className="text-red-500">*</span></label>
          <input type="date" value={form.postingDate}
            onChange={e => setForm(f => ({ ...f, postingDate: e.target.value }))}
            className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Voucher No. <span className="text-red-500">*</span></label>
          <input type="text" value={form.voucherNo}
            onChange={e => setForm(f => ({ ...f, voucherNo: e.target.value }))}
            placeholder="JV-2026-0001" className={inputCls} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">หมายเหตุฝ่ายบัญชี</label>
          <textarea value={form.accountingNote}
            onChange={e => setForm(f => ({ ...f, accountingNote: e.target.value }))}
            rows={2} placeholder="หมายเหตุ..."
            className={`${inputCls} resize-none`} />
        </div>

        {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  )
}

// ─── View Drawer ──────────────────────────────────────────────────────────────

function ViewDrawer({
  row, stock, onClose, onEdit, onHistory, onTransactionSave, currentRole,
}: {
  row: PNRRow | null
  stock: DemoStock | null
  onClose: () => void
  onEdit: (row: PNRRow) => void
  onHistory: (stockId: string) => void
  onTransactionSave: (updated: DemoStock) => void
  currentRole: UserRole
}) {
  // ─── Hooks must precede early return ─────────────────────────
  const router = useRouter()
  const [txTab, setTxTab] = useState<'schedule' | 'history'>('schedule')
  const [txModal, setTxModal] = useState<TxModalType | null>(null)
  const [txForm, setTxForm] = useState({ ...INIT_TX_FORM })
  const [txError, setTxError] = useState('')
  const [txSaving, setTxSaving] = useState(false)
  const [scheduleActionIdx, setScheduleActionIdx] = useState<number | null>(null)
  const [scheduleMenuPos, setScheduleMenuPos] = useState<{
    top: number; right: number; openUp: boolean
  } | null>(null)

  useEffect(() => {
    if (scheduleActionIdx === null) return
    const close = () => { setScheduleActionIdx(null); setScheduleMenuPos(null) }
    document.addEventListener('scroll', close, true)
    return () => document.removeEventListener('scroll', close, true)
  }, [scheduleActionIdx])

  const [txMenuIdx, setTxMenuIdx] = useState<number | null>(null)
  const [txMenuPos, setTxMenuPos] = useState<{ top: number; right: number; openUp: boolean } | null>(null)
  const [txActionModal, setTxActionModal] = useState<{
    tx: FinancialTransaction; newStatus: string; label: string; isReversal: boolean
  } | null>(null)
  const [txActionForm, setTxActionForm] = useState({ ...INIT_TX_ACTION_FORM })
  const [txActionSaving, setTxActionSaving] = useState(false)
  const [txActionError, setTxActionError] = useState('')
  const [txActionConfirm, setTxActionConfirm] = useState(false)

  const [lockModal, setLockModal] = useState<PaymentScheduleItem | null>(null)
  const [lockForm, setLockForm] = useState({ ...INIT_LOCK_FORM })
  const [lockError, setLockError] = useState('')
  const [lockSaving, setLockSaving] = useState(false)

  // Financial request state (ticket role)
  const [finReqModal, setFinReqModal] = useState(false)
  const [finReqRefresh, setFinReqRefresh] = useState(0)

  // Accounting post state
  const [acctPostModal, setAcctPostModal] = useState<FinancialRequest | null>(null)

  // Financial requests for this PNR — re-derived whenever pnrId or finReqRefresh changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pnrRequests = useMemo(() => row?.pnrId ? getRequestsForPNR(row.pnrId) : [], [row?.pnrId, finReqRefresh])

  useEffect(() => {
    if (txMenuIdx === null) return
    const close = () => { setTxMenuIdx(null); setTxMenuPos(null) }
    document.addEventListener('scroll', close, true)
    return () => document.removeEventListener('scroll', close, true)
  }, [txMenuIdx])

  const pnrTx = useMemo(() =>
    (stock?.transactions ?? []).filter(t => t.pnrId === row?.pnrId),
    [stock, row?.pnrId])

  const scheduleItems = useMemo(() => {
    if (!stock) return []
    const raw = buildPaymentSchedule(stock).filter(i => i.pnrId === row?.pnrId)
    return deriveScheduleWithTransactions(raw, stock.transactions ?? [])
  }, [stock, row?.pnrId])

  const requiredAmount = useMemo(() => {
    const LOCKED_STATUSES: StageStatus[] = ['LOCKED', 'REQUESTED', 'PARTIALLY_PAID', 'PAID', 'ADJUSTED']
    const pnrSchedule = scheduleItems.filter(i => i.pnrId === row?.pnrId)
    const hasPerSeat = pnrSchedule.some(i => i.amountMode)
    if (hasPerSeat) {
      return pnrSchedule
        .filter(i => i.stageStatus && LOCKED_STATUSES.includes(i.stageStatus))
        .reduce((s, i) => s + (i.confirmedAmount ?? i.amount), 0)
    }
    return pnrSchedule.reduce((s, i) => s + i.amount, 0) || (row?.total ?? 0)
  }, [scheduleItems, row?.pnrId, row?.total])

  const financialSummary = useMemo(() =>
    calcPNRFinancialSummary(row?.pnrId ?? '', stock?.transactions ?? [], requiredAmount, scheduleItems),
    [row?.pnrId, stock?.transactions, requiredAmount, scheduleItems])

  const maxRefundable = useMemo(() => {
    if (!txForm.originalTransactionId || !stock) return 0
    const origTx = (stock.transactions ?? []).find(t => t.transactionId === txForm.originalTransactionId)
    if (!origTx) return 0
    const used = (stock.transactions ?? [])
      .filter(t =>
        t.originalTransactionId === txForm.originalTransactionId &&
        (t.transactionType === 'REFUND' || t.transactionType === 'FORFEITURE') &&
        isPostedStatus(t)
      )
      .reduce((s, t) => s + t.amount, 0)
    return Math.max(0, origTx.amount - used)
  }, [txForm.originalTransactionId, stock])

  // ─── Early return ─────────────────────────────────────────────
  if (!row || !stock) return null

  const pnr = stock.pnrs.find(p => p.pnrId === row.pnrId)
  const condition = stock.conditions.find(sc => sc.condition.conditionCode === row.conditionCode)?.condition

  const openTxModal = (type: TxModalType, presetStageId?: string) => {
    const now = new Date()
    // Auto-select stage when: no presetStageId + only 1 stage exists (prevents null paymentStageId)
    const autoStageId = presetStageId
      ?? (type === 'payment' && scheduleItems.length === 1 ? scheduleItems[0].stageId : '')
    setTxForm({
      ...INIT_TX_FORM,
      paymentStageId: autoStageId,
      transactionDate: now.toISOString().slice(0, 10),
      transactionTime: now.toTimeString().slice(0, 5),
      status: 'POSTED',
    })
    setTxError('')
    setTxModal(type)
  }

  const handleTxSave = async () => {
    const amount = parseFloat(txForm.amount)
    if (isNaN(amount) || amount <= 0) { setTxError('กรุณากรอกจำนวนเงินที่ถูกต้อง'); return }
    if (!txForm.transactionDate) { setTxError('กรุณาเลือกวันที่'); return }
    if ((txModal === 'refund' || txModal === 'forfeiture') && !txForm.originalTransactionId) {
      setTxError('กรุณาเลือก Payment ต้นทาง'); return
    }
    if ((txModal === 'refund' || txModal === 'forfeiture') && txForm.originalTransactionId) {
      if (amount > maxRefundable) {
        setTxError(`จำนวนเงินเกินวงเงินคงเหลือ (${formatCurrency(maxRefundable, row.currency)})`); return
      }
    }
    if (txModal === 'payment' && txForm.paymentMethod === 'TOPUP' && txForm.topupBalanceBefore) {
      const topupBefore = parseFloat(txForm.topupBalanceBefore)
      if (!isNaN(topupBefore) && amount > topupBefore) {
        setTxError(`จำนวนเงินเกินยอด Topup คงเหลือ (${formatCurrency(topupBefore, row.currency)})`); return
      }
    }
    setTxSaving(true)
    try {
      const now = new Date().toISOString()
      const txType: TransactionType = txModal === 'payment' ? 'PAYMENT'
        : txModal === 'refund' ? 'REFUND'
        : txModal === 'forfeiture' ? 'FORFEITURE'
        : 'ADJUSTMENT'
      const feeAmount = parseFloat(txForm.feeAmount) || 0
      const topupBefore = txForm.topupBalanceBefore ? parseFloat(txForm.topupBalanceBefore) : null
      const methodLabel = txType === 'PAYMENT' ? ` ผ่าน${PAYMENT_METHOD_LABELS[txForm.paymentMethod]}` : ''
      // Fallback: if stageId still empty and only 1 stage exists, auto-link to prevent null
      const resolvedStageId = txForm.paymentStageId
        || (txType === 'PAYMENT' && scheduleItems.length === 1 ? scheduleItems[0].stageId : null)
        || null
      const newTx: FinancialTransaction = {
        transactionId: `TX-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        pnrId: row.pnrId,
        paymentStageId: resolvedStageId,
        originalTransactionId: txForm.originalTransactionId || null,
        transactionType: txType,
        paymentMethod: txType === 'PAYMENT' ? txForm.paymentMethod : null,
        amount,
        feeAmount,
        currencyCode: row.currency,
        transactionDate: txForm.transactionDate,
        paymentDateTime: txForm.transactionTime
          ? `${txForm.transactionDate}T${txForm.transactionTime}:00`
          : null,
        status: txForm.status,
        reasonCode: txForm.reasonCode || null,
        referenceNo: txForm.referenceNo || null,
        creditNoteNo: txForm.creditNoteNo || null,
        attachmentUrl: null,
        remark: txForm.remark || null,
        // Bank Transfer
        sourceBank: txForm.paymentMethod === 'BANK_TRANSFER' ? txForm.sourceBank || null : null,
        destinationBank: txForm.paymentMethod === 'BANK_TRANSFER' ? txForm.destinationBank || null : null,
        transferReference: txForm.paymentMethod === 'BANK_TRANSFER' ? txForm.transferReference || null : null,
        // Credit Card
        cardBrand: txForm.paymentMethod === 'CREDIT_CARD' ? txForm.cardBrand || null : null,
        cardLast4: txForm.paymentMethod === 'CREDIT_CARD' ? txForm.cardLast4 || null : null,
        authorizationCode: txForm.paymentMethod === 'CREDIT_CARD' ? txForm.authorizationCode || null : null,
        // Topup
        topupAccountId: txForm.paymentMethod === 'TOPUP' ? txForm.topupAccountId || null : null,
        topupReference: txForm.paymentMethod === 'TOPUP' ? txForm.topupReference || null : null,
        topupBalanceBefore: txForm.paymentMethod === 'TOPUP' ? topupBefore : null,
        topupUsedAmount: txForm.paymentMethod === 'TOPUP' ? amount : null,
        topupBalanceAfter: txForm.paymentMethod === 'TOPUP' && topupBefore !== null ? topupBefore - amount : null,
        createdBy: 'Demo User',
        approvedBy: null,
        createdAt: now,
        updatedAt: now,
      }
      const updated: DemoStock = {
        ...stock,
        transactions: [...(stock.transactions ?? []), newTx],
        logs: [...stock.logs, {
          logId: `LOG-${Date.now()}`,
          action: `${txType}_RECORDED`,
          message: `บันทึก ${txType} ${formatCurrency(amount, row.currency)}${methodLabel}${txForm.referenceNo ? ` Ref: ${txForm.referenceNo}` : ''}`,
          createdAt: now,
          createdBy: 'Demo User',
        }],
      }
      onTransactionSave(updated)
      setTxModal(null)
      setTxError('')
      setTxTab('history')
    } finally {
      setTxSaving(false)
    }
  }

  const CRITICAL_STATUSES = ['COMPLETED', 'RECEIVED', 'CONFIRMED']

  const openTxAction = (tx: FinancialTransaction, action: string, newStatus: string, label: string) => {
    const now = new Date()
    setTxActionForm({
      ...INIT_TX_ACTION_FORM,
      effectiveDate: now.toISOString().slice(0, 10),
      effectiveTime: now.toTimeString().slice(0, 5),
    })
    setTxActionError('')
    setTxActionConfirm(false)
    setTxActionModal({ tx, newStatus, label, isReversal: action === 'reversal' })
  }

  const handleStatusChange = async () => {
    if (!txActionModal) return
    const { tx, newStatus, isReversal } = txActionModal
    if (!txActionForm.reason) { setTxActionError('กรุณากรอกเหตุผลในการเปลี่ยนสถานะ'); return }
    setTxActionSaving(true)
    try {
      const now = new Date().toISOString()
      const currentInfo = getTxStatusInfo(tx.transactionType, tx.status)
      const newInfo = isReversal
        ? { label: 'กลับรายการแล้ว' }
        : getTxStatusInfo(tx.transactionType, newStatus)
      if (isReversal) {
        const reversalTx: FinancialTransaction = {
          transactionId: `TX-${Date.now()}-REV`,
          pnrId: tx.pnrId,
          paymentStageId: tx.paymentStageId,
          originalTransactionId: tx.transactionId,
          transactionType: 'REVERSAL',
          paymentMethod: null,
          amount: tx.amount,
          feeAmount: 0,
          currencyCode: tx.currencyCode,
          transactionDate: txActionForm.effectiveDate || now.slice(0, 10),
          paymentDateTime: txActionForm.effectiveTime
            ? `${txActionForm.effectiveDate}T${txActionForm.effectiveTime}:00`
            : null,
          status: 'COMPLETED',
          reasonCode: txActionForm.reason || null,
          referenceNo: txActionForm.referenceNo || null,
          creditNoteNo: null, attachmentUrl: null,
          remark: txActionForm.remark || null,
          sourceBank: null, destinationBank: null, transferReference: null,
          cardBrand: null, cardLast4: null, authorizationCode: null,
          topupAccountId: null, topupReference: null,
          topupBalanceBefore: null, topupUsedAmount: null, topupBalanceAfter: null,
          createdBy: 'Demo User', approvedBy: 'Demo User',
          createdAt: now, updatedAt: now,
        }
        const updated: DemoStock = {
          ...stock,
          transactions: [
            ...(stock.transactions ?? []).map(t =>
              t.transactionId === tx.transactionId ? { ...t, status: 'REVERSED', updatedAt: now } : t
            ),
            reversalTx,
          ],
          logs: [...stock.logs, {
            logId: `LOG-${Date.now()}`,
            action: 'REVERSAL_CREATED',
            message: `กลับรายการ ${tx.transactionType} ${formatCurrency(tx.amount, tx.currencyCode)} จาก "${currentInfo.label}" (${tx.status})${txActionForm.reason ? ` เหตุผล: ${txActionForm.reason}` : ''}`,
            createdAt: now, createdBy: 'Demo User',
          }],
        }
        onTransactionSave(updated)
      } else {
        const updatedTx: FinancialTransaction = {
          ...tx, status: newStatus, updatedAt: now,
          referenceNo: txActionForm.referenceNo || tx.referenceNo,
          remark: txActionForm.remark
            ? (tx.remark ? `${tx.remark}\n${txActionForm.remark}` : txActionForm.remark)
            : tx.remark,
          approvedBy: CRITICAL_STATUSES.includes(newStatus) ? 'Demo User' : tx.approvedBy,
        }
        const updated: DemoStock = {
          ...stock,
          transactions: (stock.transactions ?? []).map(t =>
            t.transactionId === tx.transactionId ? updatedTx : t
          ),
          logs: [...stock.logs, {
            logId: `LOG-${Date.now()}`,
            action: 'STATUS_CHANGED',
            message: `เปลี่ยนสถานะ ${tx.transactionType} จาก "${currentInfo.label}" (${tx.status}) เป็น "${newInfo.label}" (${newStatus})${txActionForm.reason ? ` เหตุผล: ${txActionForm.reason}` : ''}`,
            createdAt: now, createdBy: 'Demo User',
          }],
        }
        onTransactionSave(updated)
      }
      setTxActionModal(null)
      setTxActionForm({ ...INIT_TX_ACTION_FORM })
      setTxActionConfirm(false)
    } finally {
      setTxActionSaving(false)
    }
  }

  const openLockModal = (si: PaymentScheduleItem) => {
    const pnr = stock.pnrs.find(p => p.pnrId === row.pnrId)
    const basis = si.seatBasis ?? 'REMAINING_AT_CUTOFF'
    let defaultSeat = ''
    if (basis === 'INITIAL_SEAT') {
      defaultSeat = String(pnr?.initialSeatCount ?? pnr?.seatTotal ?? '')
    } else if (basis === 'REMAINING_AT_CUTOFF') {
      defaultSeat = String(pnr?.seatBalance ?? pnr?.seatTotal ?? '')
    }
    setLockForm({ seatCount: defaultSeat, manualReason: '' })
    setLockError('')
    setLockModal(si)
  }

  const handleLockStage = async () => {
    if (!lockModal) return
    const seats = parseInt(lockForm.seatCount)
    if (isNaN(seats) || seats < 0) { setLockError('กรุณากรอกจำนวนที่นั่งที่ถูกต้อง'); return }
    if (lockModal.seatBasis === 'MANUAL_SEAT' && !lockForm.manualReason) {
      setLockError('กรุณาระบุเหตุผลสำหรับการกำหนดจำนวนที่นั่งเอง'); return
    }
    setLockSaving(true)
    try {
      const ratePerSeat = lockModal.ratePerSeat ?? 0
      const updated = lockPaymentStage(
        stock, row.pnrId, lockModal.stageId, seats, ratePerSeat, 'Demo User',
        lockModal.seatBasis === 'MANUAL_SEAT' ? lockForm.manualReason : undefined
      )
      onTransactionSave(updated)
      setLockModal(null)
      setLockForm({ ...INIT_LOCK_FORM })
    } finally {
      setLockSaving(false)
    }
  }

  const selectCls = 'w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#05a94f]'
  const inputCls  = 'w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#05a94f]'
  const completedPayments = pnrTx.filter(
    t => t.transactionType === 'PAYMENT' && isPostedStatus(t)
  )
  // Balance info for payment modal — use derived schedule data (paidForStage already computed)
  const selectedStageItem = scheduleItems.find(si => si.stageId === txForm.paymentStageId)
  const stageRequired = selectedStageItem ? (selectedStageItem.confirmedAmount ?? selectedStageItem.amount) : 0
  const stagePaidSoFar = selectedStageItem?.paidForStage ?? 0
  const stageRemaining = Math.max(0, stageRequired - stagePaidSoFar)
  const currentAmount = parseFloat(txForm.amount) || 0
  const topupBalanceAfterPreview = txForm.topupBalanceBefore
    ? Math.max(0, parseFloat(txForm.topupBalanceBefore) - currentAmount)
    : null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full lg:w-[88vw] xl:w-[78vw] 2xl:w-[68vw] max-w-[1320px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header — sticky */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="min-w-0 flex-1 mr-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-800 text-base font-mono">{row.pnrDisplay}</h3>
              {row.pnrType === 'dummy' && (
                <Badge variant="orange" className="text-[10px]">Dummy</Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {row.stockCode}
              {row.groupName && <span className="text-slate-400"> — {row.groupName}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" icon={<ExternalLink size={13} />}
              onClick={() => { onClose(); onEdit(row) }}>แก้ไข</Button>
            <button onClick={onClose}
              className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors">
              <X size={16} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* PNR Information — General + Seat combined */}
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">PNR Information</p>
            <div className="flex flex-col lg:flex-row gap-4">

              {/* General Information — ~70% */}
              <div className="min-w-0 lg:flex-[7]">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">General Information</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                  {[
                    { label: 'PNR', value: row.pnrType === 'real' ? (row.pnrCode || '—') : '—' },
                    { label: 'Dummy PNR เดิม', value: row.dummyPnr || '—' },
                    { label: 'Series Code', value: row.stockCode },
                    { label: 'Series Name', value: row.groupName },
                    { label: 'Airline', value: row.airlineCode || '—' },
                    { label: 'Route', value: row.routeText || '—' },
                    { label: 'วันเดินทางเริ่มต้น', value: row.travelStart ? formatDate(row.travelStart) : '—' },
                    { label: 'Travel End', value: row.travelEnd ? formatDate(row.travelEnd) : '—' },
                    { label: 'Remark', value: row.remark || '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] text-slate-400">{label}</p>
                      <p className="text-sm font-medium text-slate-700 mt-0.5">{value}</p>
                    </div>
                  ))}
                  <div>
                    <p className="text-[10px] text-slate-400">Ticket Type</p>
                    <div className="mt-0.5"><TicketTypeBadge type={row.ticketType} groupType={row.groupType} /></div>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">PNR Status</p>
                    <div className="mt-0.5"><PNRStatusBadge status={row.status} /></div>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Mapping Status</p>
                    <div className="mt-0.5">
                      <Badge variant={mappingVariant(row.mappingStatus)}>{row.mappingStatus}</Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider — desktop only */}
              <div className="hidden lg:block w-px bg-slate-200 self-stretch flex-shrink-0" />

              {/* Seat Summary — ~30% */}
              <div className="lg:flex-[3] lg:min-w-[180px] flex-shrink-0">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Seat Summary</p>
                {/* Mobile: 2-col | Tablet (below lg, full-width): 4-col | Desktop: 2×2 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2">
                  {[
                    { label: 'Total',         value: row.seatTotal,  color: '#05a94f' },
                    { label: 'Used',          value: row.seatUsed,   color: '#3b82f6' },
                    { label: 'Available',     value: row.available,  color: row.available > 0 ? '#05a94f' : '#ef4444' },
                    { label: 'Not Allocated', value: row.seatTotal,  color: '#64748b' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white rounded-lg border border-slate-200 px-2 py-2.5 flex flex-col items-center justify-center text-center">
                      <p className="text-xl font-bold leading-none" style={{ color }}>{value}</p>
                      <p className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </section>

          {/* Flight Segments */}
          {stock.sectors.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Flight Segments</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Seq', 'Type', 'Airline', 'Flight', 'From', 'To', 'Dep Date', 'Dep', 'Arr', '+Day'].map(h => (
                        <th key={h} className="px-2.5 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stock.sectors.map((sec, i) => {
                      const sd = pnr?.sectorDates?.[i]
                      return (
                        <tr key={sec.sectorId} className="border-t border-slate-100">
                          <td className="px-2.5 py-2 text-slate-500">{sec.seq}</td>
                          <td className="px-2.5 py-2 font-medium text-slate-700">{sec.sectorType}</td>
                          <td className="px-2.5 py-2">{sec.airlineCode}</td>
                          <td className="px-2.5 py-2 font-mono">{sec.airlineCode}{sec.flightNo || '—'}</td>
                          <td className="px-2.5 py-2 font-medium">{sec.depAirportCode}</td>
                          <td className="px-2.5 py-2 font-medium">{sec.arrAirportCode}</td>
                          <td className="px-2.5 py-2 whitespace-nowrap">{sd?.date ? formatDate(sd.date) : '—'}</td>
                          <td className="px-2.5 py-2">{sec.depTime || '—'}</td>
                          <td className="px-2.5 py-2">{sec.arrTime || '—'}</td>
                          <td className="px-2.5 py-2">{sec.arrDayOffset ? `+${sec.arrDayOffset}` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Fare Information */}
          <section className="bg-slate-50 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Fare Information</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Fare', value: formatCurrency(row.fare, row.currency) },
                { label: 'Tax', value: formatCurrency(row.tax, row.currency) },
                { label: 'Total', value: formatCurrency(row.total, row.currency) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-lg p-3 border border-slate-200 text-center">
                  <p className="text-[11px] text-slate-400">{label}</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{row.currency}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Payment & Financial Transactions */}
          <section>
            {/* Header + Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex-shrink-0">
                  Payment & Financial Transactions
                </p>
                {/* Pending requests indicator */}
                {pnrRequests.filter(r => r.status === 'PENDING_ACCOUNTING_REVIEW' || r.status === 'PENDING_MANAGER_APPROVAL').length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">
                    {pnrRequests.filter(r => r.status === 'PENDING_ACCOUNTING_REVIEW' || r.status === 'PENDING_MANAGER_APPROVAL').length} รายการรอตรวจสอบ
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                {/* TICKET STAFF/SUPERVISOR: Single request button */}
                {isTicketRole(currentRole) && (
                  <button onClick={() => setFinReqModal(true)}
                    className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-[#05a94f] text-white hover:bg-[#048a3f] transition-colors whitespace-nowrap">
                    <Plus size={11} />ส่งคำขอรายการการเงิน
                  </button>
                )}
                {/* ACCOUNTING STAFF/MANAGER: Existing buttons (now post directly) */}
                {isAccountingRole(currentRole) && (
                  <>
                    <button onClick={() => openTxModal('payment')}
                      className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-[#05a94f] text-white hover:bg-[#048a3f] transition-colors whitespace-nowrap">
                      <Plus size={11} />ยืนยันการจ่าย
                    </button>
                    <button onClick={() => openTxModal('refund')}
                      className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg text-white transition-colors whitespace-nowrap ${currentRole === 'ACCOUNTING_MANAGER' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-300 cursor-not-allowed'}`}
                      disabled={currentRole !== 'ACCOUNTING_MANAGER'}>
                      <Plus size={11} />ยืนยัน Refund
                    </button>
                    <button onClick={() => openTxModal('forfeiture')}
                      className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg text-white transition-colors whitespace-nowrap ${currentRole === 'ACCOUNTING_MANAGER' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-orange-300 cursor-not-allowed'}`}
                      disabled={currentRole !== 'ACCOUNTING_MANAGER'}>
                      <Plus size={11} />บันทึกถูกยึด
                    </button>
                    <button onClick={() => openTxModal('adjustment')}
                      className={`text-[11px] px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${currentRole === 'ACCOUNTING_MANAGER' ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                      disabled={currentRole !== 'ACCOUNTING_MANAGER'}>
                      ปรับปรุงยอด
                    </button>
                  </>
                )}
                <button onClick={() => setTxTab('history')}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 transition-colors whitespace-nowrap">
                  ดูประวัติ
                </button>
              </div>
            </div>

            {/* Condition Badge */}
            {(condition || row.conditionCode) && (
              <div className="flex items-center gap-2 mb-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <Badge variant="blue">{condition?.conditionCode ?? row.conditionCode}</Badge>
                {condition && <span className="text-xs text-slate-600">{condition.conditionName}</span>}
              </div>
            )}

            {/* Financial Summary — 6 cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {/* Card: ยอดยืนยัน (locked stages only) */}
              <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
                <p className="text-[10px] font-medium text-slate-500 leading-tight">ยอดยืนยัน</p>
                <p className="text-sm font-semibold text-slate-700 mt-0.5">{formatCurrency(financialSummary.confirmedRequiredAmount, row.currency)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">รอบที่ล็อกยอดแล้วเท่านั้น</p>
                {financialSummary.estimatedAmount > 0 && (
                  <p className="text-[10px] text-sky-600 mt-0.5">ประมาณการ: +{formatCurrency(financialSummary.estimatedAmount, row.currency)}</p>
                )}
              </div>
              {/* Card: ชำระแล้ว (with method breakdown) */}
              <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
                <p className="text-[10px] font-medium text-slate-500 leading-tight">ชำระแล้ว</p>
                <p className="text-sm font-semibold text-[#05a94f] mt-0.5">{formatCurrency(financialSummary.paidAmount, row.currency)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">ยอดที่ชำระและยืนยันสำเร็จแล้ว</p>
                {Object.keys(financialSummary.methodBreakdown).length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-100 space-y-0.5">
                    {(Object.entries(financialSummary.methodBreakdown) as [PaymentMethod, number][]).map(([m, v]) => (
                      <div key={m} className="flex justify-between">
                        <span className="text-[10px] text-slate-400">{PAYMENT_METHOD_LABELS[m]}</span>
                        <span className="text-[10px] text-slate-600 font-medium">{formatNumber(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Card: ได้รับเงินคืน */}
              <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
                <p className="text-[10px] font-medium text-slate-500 leading-tight">ได้รับเงินคืน</p>
                <p className="text-sm font-semibold text-blue-600 mt-0.5">{formatCurrency(financialSummary.refundAmount, row.currency)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">ยอด Refund ที่ได้รับเงินจริงแล้ว</p>
              </div>
              {/* Card: ถูกยึด */}
              <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
                <p className="text-[10px] font-medium text-slate-500 leading-tight">ถูกยึด</p>
                <p className="text-sm font-semibold text-orange-600 mt-0.5">{formatCurrency(financialSummary.forfeitedAmount, row.currency)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">ยอดเงินที่ถูกยึดและยืนยันแล้ว</p>
              </div>
              {/* Card: ยอดค้างชำระ */}
              <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
                <p className="text-[10px] font-medium text-slate-500 leading-tight">ยอดค้างชำระ</p>
                <p className={`text-sm font-semibold mt-0.5 ${financialSummary.outstandingAmount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                  {formatCurrency(financialSummary.outstandingAmount, row.currency)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">ยอดที่ยังต้องชำระเพิ่มเติม</p>
              </div>
              {/* Card: ยอดจ่ายสุทธิ */}
              <div className="bg-white rounded-lg p-3 border border-slate-200 min-w-0">
                <p className="text-[10px] font-medium text-slate-500 leading-tight">ยอดจ่ายสุทธิ</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">{formatCurrency(financialSummary.netCashPaid, row.currency)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">ยอดจ่ายจริงหลังหักเงินคืน</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 mb-3">
              {(['schedule', 'history'] as const).map(tab => (
                <button key={tab} onClick={() => setTxTab(tab)}
                  className={cn(
                    'text-xs font-medium px-4 py-2 border-b-2 -mb-px transition-colors',
                    txTab === tab
                      ? 'border-[#05a94f] text-[#05a94f]'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  )}>
                  {tab === 'schedule' ? 'Payment Schedule' : `Transaction History (${pnrTx.length})`}
                </button>
              ))}
            </div>

            {/* Payment Schedule Tab */}
            {txTab === 'schedule' && (
              scheduleItems.length === 0
                ? <div className="py-6 text-center text-xs text-slate-400">ยังไม่ได้กำหนด Payment Schedule</div>
                : <>
                    <div className="space-y-3 mb-6">
                      {scheduleItems.map((si, i) => {
                        const isLocked = si.stageStatus && ['LOCKED','REQUESTED','PARTIALLY_PAID','PAID','ADJUSTED'].includes(si.stageStatus)
                        // All status values are pre-derived by deriveScheduleWithTransactions
                        const stagePaid = si.paidForStage
                        const remaining = si.remainingForStage
                        const stageTxCount = pnrTx.filter(t => t.paymentStageId === si.stageId).length
                        const stagePendingRequests = pnrRequests.filter(r =>
                          r.stageId === si.stageId &&
                          (r.status === 'PENDING_ACCOUNTING_REVIEW' || r.status === 'PENDING_MANAGER_APPROVAL')
                        ).length

                        return (
                          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                            {/* Card header */}
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="text-sm font-semibold text-slate-800">{si.stageName}</span>
                                {si.paymentType && PAYMENT_TYPE_LABELS[si.paymentType] && (
                                  <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                                    {PAYMENT_TYPE_LABELS[si.paymentType]}
                                  </span>
                                )}
                                {/* Per-seat stages: show stage lock status badge */}
                                {si.amountMode && si.paymentStatus !== 'PAID' && si.paymentStatus !== 'PARTIALLY_PAID' && (
                                  <StageStatusBadge status={si.stageStatus ?? 'ESTIMATED'} />
                                )}
                                {/* Payment status badge (primary) */}
                                <PaymentStatusBadge status={si.paymentStatus} />
                                {/* Timing status badge (secondary) — not shown for NOT_DUE when pending */}
                                <TimingStatusBadge status={si.timingStatus} days={si.lateDays ?? si.overdueDays} />
                                {si.nonRefundable && (
                                  <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-red-100 text-red-600">ไม่คืนเงิน</span>
                                )}
                                {si.creditTowardFare && (
                                  <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-green-100 text-green-700">นำไปหักค่าตั๋ว</span>
                                )}
                                {stagePendingRequests > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">
                                    มีรายการรอตรวจสอบ {stagePendingRequests} รายการ
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  if (scheduleActionIdx === i) { setScheduleActionIdx(null); setScheduleMenuPos(null); return }
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                  const openUp = window.innerHeight - rect.bottom < 200
                                  setScheduleMenuPos({ top: openUp ? rect.top - 4 : rect.bottom + 4, right: window.innerWidth - rect.right, openUp })
                                  setScheduleActionIdx(i)
                                }}
                                className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 whitespace-nowrap">
                                จัดการ <span className="text-[9px]">▾</span>
                              </button>
                            </div>

                            {/* Per-seat info block (new system only) */}
                            {si.amountMode && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 pb-3 border-b border-slate-100 text-xs">
                                <div>
                                  <p className="text-[10px] text-slate-400 mb-0.5">อัตราต่อที่นั่ง</p>
                                  <p className="font-semibold text-slate-800">{formatNumber(si.ratePerSeat ?? 0)} {row.currency}</p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">{AMOUNT_MODE_LABELS[si.amountMode]}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-slate-400 mb-0.5">ฐานจำนวนที่นั่ง</p>
                                  <p className="font-medium text-slate-700">{SEAT_BASIS_LABELS[si.seatBasis ?? 'REMAINING_AT_CUTOFF']}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-slate-400 mb-0.5">จำนวนประมาณการ</p>
                                  <p className="font-semibold text-sky-700">{si.estimatedSeats ?? '—'} ที่นั่ง</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-slate-400 mb-0.5">จำนวนที่ล็อกแล้ว</p>
                                  <p className={`font-semibold ${si.lockedSeats != null ? 'text-[#05a94f]' : 'text-slate-400'}`}>
                                    {si.lockedSeats != null ? `${si.lockedSeats} ที่นั่ง` : '—'}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Amount row */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div>
                                <p className="text-[10px] text-slate-400 mb-0.5">ยอดประมาณการ</p>
                                <p className={`font-medium ${si.amountMode && !si.estimatedAmount ? 'text-slate-300' : 'text-sky-600'}`}>
                                  {si.amountMode
                                    ? (si.estimatedAmount != null ? formatCurrency(si.estimatedAmount, row.currency) : '—')
                                    : formatCurrency(si.amount, row.currency)
                                  }
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 mb-0.5">ยอดยืนยัน</p>
                                <p className={`font-semibold ${si.confirmedAmount != null ? 'text-slate-800' : 'text-slate-300'}`}>
                                  {si.confirmedAmount != null ? formatCurrency(si.confirmedAmount, row.currency) : '—'}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 mb-0.5">ชำระแล้ว</p>
                                <p className={`font-semibold ${stagePaid > 0 ? 'text-[#05a94f]' : 'text-slate-400'}`}>
                                  {stagePaid > 0 ? formatCurrency(stagePaid, row.currency) : '—'}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 mb-0.5">คงเหลือ</p>
                                <p className={`font-semibold ${remaining > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                                  {remaining > 0 ? formatCurrency(remaining, row.currency) : '—'}
                                </p>
                              </div>
                            </div>

                            {/* Dates + timing info */}
                            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-[10px] text-slate-500">
                              {si.lockDate && (
                                <span>ล็อกยอดเมื่อ: <span className="font-medium text-[#05a94f]">{formatDateTime(si.lockDate)}</span></span>
                              )}
                              {si.ttlDatetime && (
                                <span>ครบกำหนด: <span className={`font-medium ${si.timingStatus === 'OVERDUE' || si.timingStatus === 'PAID_LATE' ? 'text-red-500' : 'text-slate-700'}`}>{formatDateTime(si.ttlDatetime)}</span></span>
                              )}
                              {si.fullyPaidAt && (
                                <span>ชำระครบเมื่อ: <span className="font-medium text-[#05a94f]">{formatDateTime(si.fullyPaidAt)}</span></span>
                              )}
                              {si.timingStatus === 'PAID_LATE' && si.lateDays != null && (
                                <span>ล่าช้า: <span className="font-medium text-orange-500">{si.lateDays} วัน</span></span>
                              )}
                              {si.timingStatus === 'OVERDUE' && si.overdueDays != null && (
                                <span>เกินกำหนด: <span className="font-medium text-red-500">{si.overdueDays} วัน</span></span>
                              )}
                              {stageTxCount > 0 && <span>{stageTxCount} รายการชำระ</span>}
                            </div>

                            {/* Lock button — only for ESTIMATED per-seat stages */}
                            {si.amountMode && !isLocked && (
                              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
                                <button
                                  onClick={() => openLockModal(si)}
                                  className="text-[11px] px-3 py-1.5 rounded-lg bg-[#05a94f] text-white hover:bg-[#048a3f] transition-colors font-medium">
                                  ล็อกยอด
                                </button>
                                <span className="text-[10px] text-slate-400">ยอดประมาณการ — ยังสร้างใบเบิกไม่ได้</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Portal dropdown for schedule cards */}
                    {scheduleActionIdx !== null && scheduleMenuPos && (() => {
                      const si = scheduleItems[scheduleActionIdx]
                      const closeMenu = () => { setScheduleActionIdx(null); setScheduleMenuPos(null) }
                      return createPortal(
                        <>
                          <div className="fixed inset-0 z-[999]" onClick={closeMenu} />
                          <div
                            className="fixed z-[1000] bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[160px]"
                            style={scheduleMenuPos.openUp
                              ? { bottom: window.innerHeight - scheduleMenuPos.top, right: scheduleMenuPos.right }
                              : { top: scheduleMenuPos.top, right: scheduleMenuPos.right }
                            }>
                            {si?.amountMode && !['LOCKED','REQUESTED','PARTIALLY_PAID','PAID','ADJUSTED'].includes(si.stageStatus ?? '') && (
                              <button onClick={() => { openLockModal(si); closeMenu() }}
                                className="w-full text-left px-3 py-2 text-[11px] text-[#05a94f] hover:bg-green-50 whitespace-nowrap font-medium">
                                ล็อกยอด
                              </button>
                            )}
                            {si?.stageStatus === 'LOCKED' && row && (
                              <button onClick={() => { router.push(`/requisitions/create?stockId=${row.stockId}&pnrId=${row.pnrId}&stageId=${si.stageId}`); closeMenu() }}
                                className="w-full text-left px-3 py-2 text-[11px] text-[#05a94f] hover:bg-green-50 whitespace-nowrap font-medium">
                                สร้างใบเบิก
                              </button>
                            )}
                            <button onClick={() => { openTxModal('payment', si?.stageId); closeMenu() }}
                              className="w-full text-left px-3 py-2 text-[11px] text-slate-700 hover:bg-slate-50 whitespace-nowrap">
                              บันทึกการจ่าย
                            </button>
                            <button onClick={() => { setTxTab('history'); closeMenu() }}
                              className="w-full text-left px-3 py-2 text-[11px] text-slate-700 hover:bg-slate-50 whitespace-nowrap">
                              ดูรายการชำระ
                            </button>
                            <div className="h-px bg-slate-100 my-1" />
                            <button onClick={closeMenu}
                              className="w-full text-left px-3 py-2 text-[11px] text-slate-400 hover:bg-slate-50 whitespace-nowrap cursor-not-allowed">
                              แก้ไขรอบชำระ
                            </button>
                            <button onClick={() => { setTxTab('history'); closeMenu() }}
                              className="w-full text-left px-3 py-2 text-[11px] text-slate-700 hover:bg-slate-50 whitespace-nowrap">
                              ดูประวัติ
                            </button>
                            <div className="h-px bg-slate-100 my-1" />
                            <button onClick={closeMenu}
                              className="w-full text-left px-3 py-2 text-[11px] text-red-500 hover:bg-red-50 whitespace-nowrap cursor-not-allowed">
                              ยกเลิกรอบชำระ
                            </button>
                          </div>
                        </>,
                        document.body
                      )
                    })()}
                  </>
            )}

            {/* Transaction History Tab */}
            {txTab === 'history' && (
              <>
                {/* Pending requests section — visible to accounting roles */}
                {isAccountingRole(currentRole) && pnrRequests.filter(r => r.status === 'PENDING_ACCOUNTING_REVIEW' || r.status === 'PENDING_MANAGER_APPROVAL').length > 0 && (
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold text-orange-600 uppercase tracking-wider mb-2">คำขอรอตรวจสอบ</p>
                    <div className="space-y-2">
                      {pnrRequests.filter(r => r.status === 'PENDING_ACCOUNTING_REVIEW' || r.status === 'PENDING_MANAGER_APPROVAL').map(req => (
                        <div key={req.requestId} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-semibold text-slate-800">{REQUEST_TYPE_LABELS[req.requestType]}</span>
                                <span className="text-[11px] font-semibold text-[#05a94f]">{req.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} {req.currencyCode}</span>
                                <span className="inline-flex px-1.5 py-px rounded-full text-[10px] bg-orange-100 text-orange-700">{REQUEST_STATUS_INFO[req.status].label}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5">โดย {req.requestedBy} | {formatDate(req.requestedDate)} | เหตุผล: {req.reason}</p>
                              {req.referenceNo && <p className="text-[10px] text-slate-400">อ้างอิง: {req.referenceNo}</p>}
                            </div>
                            <button
                              onClick={() => setAcctPostModal(req)}
                              className="flex-shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg bg-[#05a94f] text-white hover:bg-[#048a3f] transition-colors whitespace-nowrap">
                              ยืนยันและลงบัญชี
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pnrTx.length === 0
                ? <div className="py-6 text-center text-xs text-slate-400">ยังไม่มี Transaction</div>
                : <><div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">เลขที่รายการ</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">วันที่/เวลา</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">ประเภทรายการ</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">วิธีชำระ</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">รอบชำระ</th>
                        <th className="px-3 py-2 text-right text-[11px] font-medium text-slate-500 whitespace-nowrap">จำนวนเงิน</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">สถานะ</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">วันที่ลงบัญชี</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">Voucher No.</th>
                        <th className="px-3 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">ผู้สร้าง</th>
                        <th className="px-3 py-2 text-center text-[11px] font-medium text-slate-500 whitespace-nowrap min-w-[80px]">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pnrTx.map((tx, txIdx) => {
                        return (
                          <tr key={tx.transactionId} className="border-t border-slate-100 hover:bg-slate-50/60 align-middle">
                            <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{tx.transactionId.slice(-8)}</td>
                            <td className="px-3 py-2 text-[11px] whitespace-nowrap">{tx.paymentDateTime ? formatDateTime(tx.paymentDateTime) : formatDate(tx.transactionDate)}</td>
                            <td className="px-3 py-2"><TxTypeBadge type={tx.transactionType} /></td>
                            <td className="px-3 py-2 text-[11px] text-slate-600">{formatPaymentMethod(tx)}</td>
                            <td className="px-3 py-2 text-[11px] text-slate-600">
                              {tx.paymentStageId ? (condition?.stages.find(s => s.stageId === tx.paymentStageId)?.stageName ?? '—') : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-[11px] font-medium text-slate-800 whitespace-nowrap">{formatCurrency(tx.amount, tx.currencyCode)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <TxStatusBadge type={tx.transactionType} status={tx.status} />
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-600">{tx.postingDate ? formatDate(tx.postingDate) : '—'}</td>
                            <td className="px-3 py-2 text-[11px] font-mono text-slate-600">{tx.voucherNo ?? '—'}</td>
                            <td className="px-3 py-2 text-[11px] text-slate-600">{tx.createdBy}</td>
                            <td className="px-3 py-2.5 text-center min-w-[80px]">
                              <button
                                onClick={(e) => {
                                  if (txMenuIdx === txIdx) { setTxMenuIdx(null); setTxMenuPos(null); return }
                                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                                  const spaceBelow = window.innerHeight - rect.bottom
                                  const openUp = spaceBelow < 220
                                  setTxMenuPos({ top: openUp ? rect.top - 4 : rect.bottom + 4, right: window.innerWidth - rect.right, openUp })
                                  setTxMenuIdx(txIdx)
                                }}
                                className="inline-flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap">
                                จัดการ <span className="text-[9px]">▾</span>
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                  {/* Portal dropdown for Transaction History */}
                  {txMenuIdx !== null && txMenuPos && (() => {
                    const tx = pnrTx[txMenuIdx]
                    if (!tx) return null
                    const menuItems = getTxMenuActions(tx)
                    const closeMenu = () => { setTxMenuIdx(null); setTxMenuPos(null) }
                    return createPortal(
                      <>
                        <div className="fixed inset-0 z-[999]" onClick={closeMenu} />
                        <div
                          className="fixed z-[1000] bg-white border border-slate-200 rounded-lg shadow-xl py-1 min-w-[180px]"
                          style={txMenuPos.openUp
                            ? { bottom: window.innerHeight - txMenuPos.top, right: txMenuPos.right }
                            : { top: txMenuPos.top, right: txMenuPos.right }
                          }>
                          {menuItems.map((item, mi) => (
                            <button
                              key={mi}
                              disabled={item.disabled}
                              onClick={() => {
                                closeMenu()
                                if (item.action === 'view' || item.action === 'view_attachment') return
                                if ((item.action === 'change_status' || item.action === 'reversal') && item.newStatus !== undefined || item.action === 'reversal') {
                                  openTxAction(tx, item.action, item.newStatus ?? 'REVERSED', item.label)
                                }
                              }}
                              className={`w-full text-left px-3 py-2 text-[11px] whitespace-nowrap transition-colors ${
                                item.disabled
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : item.danger
                                    ? 'text-red-500 hover:bg-red-50'
                                    : 'text-slate-700 hover:bg-slate-50'
                              }`}>
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </>,
                      document.body
                    )
                  })()}
                </>
                }
            </>
            )}
          </section>

          {/* Status Change Modal */}
          {txActionModal && (() => {
            const { tx, newStatus, label, isReversal } = txActionModal
            const currentInfo = getTxStatusInfo(tx.transactionType, tx.status)
            const newInfo = isReversal
              ? { label: 'กลับรายการแล้ว', cls: 'bg-purple-100 text-purple-700', tooltip: '' }
              : getTxStatusInfo(tx.transactionType, newStatus)
            const isCritical = isReversal || CRITICAL_STATUSES.includes(newStatus)
            const txTypeLabel: Record<string, string> = {
              PAYMENT: 'การจ่ายเงิน', REFUND: 'การคืนเงิน',
              FORFEITURE: 'เงินถูกยึด', REVERSAL: 'กลับรายการ', ADJUSTMENT: 'ปรับปรุงยอด',
            }
            return (
              <Modal
                open
                onClose={() => { setTxActionModal(null); setTxActionConfirm(false) }}
                title={`เปลี่ยนสถานะ — ${label}`}
                size="md"
                footer={
                  txActionConfirm ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setTxActionConfirm(false)}>แก้ไข</Button>
                      <Button size="sm" onClick={handleStatusChange} loading={txActionSaving}
                        className="bg-red-500 hover:bg-red-600 border-red-500">ยืนยัน (ไม่สามารถยกเลิกได้)</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" size="sm"
                        onClick={() => { setTxActionModal(null); setTxActionConfirm(false) }}>ยกเลิก</Button>
                      <Button size="sm" onClick={() => {
                        if (!txActionForm.reason) { setTxActionError('กรุณากรอกเหตุผลในการเปลี่ยนสถานะ'); return }
                        if (isCritical) { setTxActionError(''); setTxActionConfirm(true) } else { handleStatusChange() }
                      }} loading={txActionSaving}>ยืนยันการเปลี่ยนสถานะ</Button>
                    </>
                  )
                }
              >
                <div className="space-y-3">
                  {/* Info summary */}
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">ประเภทรายการ</span>
                      <span className="font-medium text-slate-700">{txTypeLabel[tx.transactionType] ?? tx.transactionType}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">สถานะปัจจุบัน</span>
                      <span className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium ${currentInfo.cls}`}>{currentInfo.label}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">สถานะใหม่</span>
                      <span className={`inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium ${newInfo.cls}`}>{newInfo.label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">จำนวนเงิน</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(tx.amount, tx.currencyCode)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">ผู้ดำเนินการ</span>
                      <span className="font-medium text-slate-700">Demo User</span>
                    </div>
                  </div>

                  {/* Confirm step */}
                  {txActionConfirm && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                      <p className="font-semibold mb-1">⚠ ยืนยันการดำเนินการสำคัญ</p>
                      <p>การเปลี่ยนสถานะเป็น <strong>{newInfo.label}</strong> จะมีผลทางการเงินทันที และไม่สามารถยกเลิกได้โดยตรง (ต้องใช้กลับรายการเท่านั้น) คุณต้องการดำเนินการต่อใช่หรือไม่?</p>
                    </div>
                  )}

                  {!txActionConfirm && (
                    <>
                      {/* วันที่และเวลาที่มีผล */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs font-medium text-slate-600 block mb-1">วันที่มีผล</label>
                          <input type="date" value={txActionForm.effectiveDate}
                            onChange={e => setTxActionForm(f => ({ ...f, effectiveDate: e.target.value }))}
                            className={inputCls} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600 block mb-1">เวลา</label>
                          <input type="time" value={txActionForm.effectiveTime}
                            onChange={e => setTxActionForm(f => ({ ...f, effectiveTime: e.target.value }))}
                            className={inputCls} />
                        </div>
                      </div>

                      {/* เลขอ้างอิง */}
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">เลขอ้างอิง</label>
                        <input type="text" value={txActionForm.referenceNo} placeholder="เลขอ้างอิงเอกสาร"
                          onChange={e => setTxActionForm(f => ({ ...f, referenceNo: e.target.value }))}
                          className={inputCls} />
                      </div>

                      {/* เหตุผล (required) */}
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">
                          เหตุผลในการเปลี่ยนสถานะ <span className="text-red-500">*</span>
                        </label>
                        <textarea value={txActionForm.reason} rows={2} placeholder="กรอกเหตุผล..."
                          onChange={e => setTxActionForm(f => ({ ...f, reason: e.target.value }))}
                          className={`${inputCls} resize-none`} />
                      </div>

                      {/* หมายเหตุ */}
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">หมายเหตุ</label>
                        <textarea value={txActionForm.remark} rows={2} placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                          onChange={e => setTxActionForm(f => ({ ...f, remark: e.target.value }))}
                          className={`${inputCls} resize-none`} />
                      </div>
                    </>
                  )}

                  {txActionError && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{txActionError}</p>
                  )}
                </div>
              </Modal>
            )
          })()}

          {/* Lock Modal */}
          {lockModal && (() => {
            const seats = parseInt(lockForm.seatCount) || 0
            const ratePerSeat = lockModal.ratePerSeat ?? 0
            const previewAmount = seats * ratePerSeat
            return (
              <Modal
                open
                onClose={() => setLockModal(null)}
                title={`ล็อกยอด — ${lockModal.stageName}`}
                size="sm"
                footer={
                  <>
                    <Button variant="outline" size="sm" onClick={() => setLockModal(null)}>ยกเลิก</Button>
                    <Button size="sm" onClick={handleLockStage} loading={lockSaving}
                      className="bg-[#05a94f] hover:bg-[#048a3f] border-[#05a94f]">ล็อกยอด</Button>
                  </>
                }
              >
                <div className="space-y-3">
                  {/* Stage info */}
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">ฐานจำนวนที่นั่ง</span>
                      <span className="font-medium text-slate-700">{SEAT_BASIS_LABELS[lockModal.seatBasis ?? 'REMAINING_AT_CUTOFF']}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">อัตราต่อที่นั่ง</span>
                      <span className="font-semibold text-slate-800">{formatNumber(ratePerSeat)} {row.currency}</span>
                    </div>
                    {lockModal.estimatedSeats != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">จำนวนประมาณการ</span>
                        <span className="text-sky-700 font-medium">{lockModal.estimatedSeats} ที่นั่ง</span>
                      </div>
                    )}
                  </div>

                  {/* Seat input */}
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">
                      จำนวนที่นั่ง <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number" min="0" value={lockForm.seatCount}
                      onChange={e => setLockForm(f => ({ ...f, seatCount: e.target.value }))}
                      placeholder="ระบุจำนวนที่นั่ง"
                      className={inputCls}
                    />
                  </div>

                  {/* Manual seat reason */}
                  {lockModal.seatBasis === 'MANUAL_SEAT' && (
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">
                        เหตุผลในการระบุจำนวนเอง <span className="text-red-500">*</span>
                      </label>
                      <textarea rows={2} value={lockForm.manualReason}
                        onChange={e => setLockForm(f => ({ ...f, manualReason: e.target.value }))}
                        placeholder="กรอกเหตุผล..."
                        className={`${inputCls} resize-none`} />
                    </div>
                  )}

                  {/* Preview */}
                  {seats > 0 && (
                    <div className="bg-[#05a94f]/5 border border-[#05a94f]/20 rounded-lg p-3 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">{seats} × {formatNumber(ratePerSeat)}</span>
                        <span className="text-lg font-bold text-[#05a94f]">{formatCurrency(previewAmount, row.currency)}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">ยอดยืนยันที่จะล็อก</p>
                    </div>
                  )}

                  {lockError && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{lockError}</p>
                  )}
                </div>
              </Modal>
            )
          })()}

          {/* Financial Request Modal — ticket staff */}
          <FinancialRequestModal
            open={finReqModal}
            onClose={() => setFinReqModal(false)}
            row={row}
            stock={stock}
            scheduleItems={scheduleItems}
            currentRole={currentRole}
            onSaved={() => { setFinReqRefresh(n => n + 1); setTxTab('history') }}
          />

          {/* Accounting Post Modal */}
          <AccountingPostModal
            open={!!acctPostModal}
            onClose={() => setAcctPostModal(null)}
            pendingReq={acctPostModal}
            row={row}
            currentRole={currentRole}
            onPosted={(updatedReq, newTx) => {
              if (!stock) return
              const updatedStock: DemoStock = {
                ...stock,
                transactions: [...(stock.transactions ?? []), newTx],
                logs: [...(stock.logs ?? []), {
                  logId: `LOG-${Date.now()}`,
                  action: `ลงบัญชี ${REQUEST_TYPE_LABELS[updatedReq.requestType]} — ${newTx.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ${newTx.currencyCode} (Voucher: ${newTx.voucherNo ?? '—'})`,
                  message: `Posted by ${newTx.postedBy ?? 'Accounting'}`,
                  createdAt: newTx.createdAt,
                  createdBy: newTx.createdBy,
                }],
              }
              onTransactionSave(updatedStock)
              setFinReqRefresh(n => n + 1)
              setAcctPostModal(null)
              setTxTab('history')
            }}
          />

          {/* Transaction Modal */}
          {txModal && (
            <Modal
              open={!!txModal}
              onClose={() => { setTxModal(null); setTxError('') }}
              title={
                txModal === 'payment' ? 'บันทึกการจ่าย'
                : txModal === 'refund' ? 'บันทึก Refund'
                : txModal === 'forfeiture' ? 'บันทึกเงินถูกยึด'
                : 'ปรับปรุงยอด'
              }
              size="md"
              footer={
                <>
                  <Button variant="outline" size="sm" onClick={() => { setTxModal(null); setTxError('') }}>ยกเลิก</Button>
                  <Button size="sm" onClick={handleTxSave} loading={txSaving}>บันทึก</Button>
                </>
              }
            >
              <div className="space-y-3">

                {/* ── Balance info panel (payment only) ── */}
                {txModal === 'payment' && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide mb-2">ยอดประกอบ</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      <span className="text-slate-500">ยอดที่ต้องชำระ (รอบ)</span>
                      <span className="text-right text-slate-700 font-medium">{stageRequired > 0 ? formatCurrency(stageRequired, row.currency) : '—'}</span>
                      <span className="text-slate-500">ชำระแล้ว</span>
                      <span className="text-right text-[#05a94f] font-medium">{formatCurrency(stagePaidSoFar, row.currency)}</span>
                      <span className="text-slate-500">ยอดคงเหลือ</span>
                      <span className="text-right text-amber-600 font-medium">{stageRequired > 0 ? formatCurrency(stageRemaining, row.currency) : '—'}</span>
                      <span className="text-slate-500">กำลังบันทึก</span>
                      <span className="text-right font-bold text-slate-800">{currentAmount > 0 ? formatCurrency(currentAmount, row.currency) : '—'}</span>
                    </div>
                  </div>
                )}

                {/* ── รอบชำระ (payment) ── */}
                {txModal === 'payment' && condition && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">รอบชำระ</label>
                    <select value={txForm.paymentStageId}
                      onChange={e => setTxForm(f => ({ ...f, paymentStageId: e.target.value }))}
                      className={selectCls}>
                      <option value="">ไม่ระบุรอบ</option>
                      {condition.stages.map(s => <option key={s.stageId} value={s.stageId}>{s.stageName}</option>)}
                    </select>
                  </div>
                )}

                {/* ── วิธีการชำระ (payment) ── */}
                {txModal === 'payment' && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">วิธีการชำระ <span className="text-red-500">*</span></label>
                    <select value={txForm.paymentMethod}
                      onChange={e => setTxForm(f => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))}
                      className={selectCls}>
                      {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* ── จำนวนเงิน + ค่าธรรมเนียม ── */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">
                      จำนวนเงิน ({row.currency}) <span className="text-red-500">*</span>
                    </label>
                    <input type="number" min="0" step="0.01"
                      value={txForm.amount}
                      onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                      className={inputCls} />
                  </div>
                  {txModal === 'payment' && (
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">ค่าธรรมเนียม</label>
                      <input type="number" min="0" step="0.01"
                        value={txForm.feeAmount}
                        onChange={e => setTxForm(f => ({ ...f, feeAmount: e.target.value }))}
                        placeholder="0.00"
                        className={inputCls} />
                    </div>
                  )}
                </div>

                {/* ── วันที่ + เวลา ── */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">วันที่ <span className="text-red-500">*</span></label>
                    <input type="date" value={txForm.transactionDate}
                      onChange={e => setTxForm(f => ({ ...f, transactionDate: e.target.value }))}
                      className={inputCls} />
                  </div>
                  {txModal === 'payment' && (
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">เวลา</label>
                      <input type="time" value={txForm.transactionTime}
                        onChange={e => setTxForm(f => ({ ...f, transactionTime: e.target.value }))}
                        className={inputCls} />
                    </div>
                  )}
                </div>

                {/* ── Bank Transfer fields ── */}
                {txModal === 'payment' && txForm.paymentMethod === 'BANK_TRANSFER' && (
                  <div className="space-y-2.5 pt-1 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">ข้อมูลการโอน</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">ธนาคารต้นทาง</label>
                        <input type="text" value={txForm.sourceBank}
                          onChange={e => setTxForm(f => ({ ...f, sourceBank: e.target.value }))}
                          placeholder="เช่น กสิกรไทย"
                          className={inputCls} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">ธนาคารปลายทาง</label>
                        <input type="text" value={txForm.destinationBank}
                          onChange={e => setTxForm(f => ({ ...f, destinationBank: e.target.value }))}
                          placeholder="เช่น ไทยพาณิชย์"
                          className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">เลขอ้างอิงการโอน</label>
                      <input type="text" value={txForm.transferReference}
                        onChange={e => setTxForm(f => ({ ...f, transferReference: e.target.value }))}
                        placeholder="Transaction reference"
                        className={inputCls} />
                    </div>
                  </div>
                )}

                {/* ── Credit Card fields ── */}
                {txModal === 'payment' && txForm.paymentMethod === 'CREDIT_CARD' && (
                  <div className="space-y-2.5 pt-1 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">ข้อมูลบัตร</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">ประเภทบัตร</label>
                        <select value={txForm.cardBrand}
                          onChange={e => setTxForm(f => ({ ...f, cardBrand: e.target.value }))}
                          className={selectCls}>
                          <option value="">เลือกประเภทบัตร</option>
                          {['Visa', 'Mastercard', 'JCB', 'Amex', 'UnionPay'].map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">เลขบัตร 4 ตัวท้าย</label>
                        <input type="text" maxLength={4} value={txForm.cardLast4}
                          onChange={e => setTxForm(f => ({ ...f, cardLast4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                          placeholder="XXXX"
                          className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">Authorization Code</label>
                      <input type="text" value={txForm.authorizationCode}
                        onChange={e => setTxForm(f => ({ ...f, authorizationCode: e.target.value }))}
                        placeholder="Auth code จากธนาคาร"
                        className={inputCls} />
                    </div>
                    <p className="text-[10px] text-slate-400">* จัดเก็บเฉพาะ Card Brand และเลขบัตร 4 ตัวท้าย ไม่จัดเก็บเลขบัตรเต็มหรือ CVV</p>
                  </div>
                )}

                {/* ── Topup fields ── */}
                {txModal === 'payment' && txForm.paymentMethod === 'TOPUP' && (
                  <div className="space-y-2.5 pt-1 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">ข้อมูล Topup</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">บัญชี Topup</label>
                        <input type="text" value={txForm.topupAccountId}
                          onChange={e => setTxForm(f => ({ ...f, topupAccountId: e.target.value }))}
                          placeholder="รหัสบัญชี Topup"
                          className={inputCls} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1">เลขอ้างอิง Topup</label>
                        <input type="text" value={txForm.topupReference}
                          onChange={e => setTxForm(f => ({ ...f, topupReference: e.target.value }))}
                          placeholder="Topup reference"
                          className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">ยอดคงเหลือก่อนใช้</label>
                      <input type="number" min="0" step="0.01" value={txForm.topupBalanceBefore}
                        onChange={e => setTxForm(f => ({ ...f, topupBalanceBefore: e.target.value }))}
                        placeholder="0.00"
                        className={inputCls} />
                    </div>
                    {txForm.topupBalanceBefore && topupBalanceAfterPreview !== null && (
                      <div className="bg-slate-50 rounded-lg p-2.5 text-xs flex justify-between">
                        <span className="text-slate-500">ยอดคงเหลือหลังใช้</span>
                        <span className={`font-semibold ${topupBalanceAfterPreview < 0 ? 'text-red-500' : 'text-slate-700'}`}>
                          {formatCurrency(topupBalanceAfterPreview, row.currency)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Original Payment (refund / forfeiture) ── */}
                {(txModal === 'refund' || txModal === 'forfeiture') && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Payment ต้นทาง <span className="text-red-500">*</span></label>
                    <select value={txForm.originalTransactionId}
                      onChange={e => setTxForm(f => ({ ...f, originalTransactionId: e.target.value }))}
                      className={selectCls}>
                      <option value="">เลือก Payment</option>
                      {completedPayments.map(t => (
                        <option key={t.transactionId} value={t.transactionId}>
                          {formatDate(t.transactionDate)} · {formatCurrency(t.amount, t.currencyCode)}{t.referenceNo ? ` · ${t.referenceNo}` : ''}
                        </option>
                      ))}
                    </select>
                    {completedPayments.length === 0 && (
                      <p className="text-[11px] text-amber-600 mt-1">ยังไม่มี Payment ที่ Completed/Confirmed</p>
                    )}
                    {txForm.originalTransactionId && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        วงเงินคงเหลือ: <span className="font-medium text-slate-700">{formatCurrency(maxRefundable, row.currency)}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* ── สถานะ ── */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">สถานะ</label>
                  <select value={txForm.status}
                    onChange={e => setTxForm(f => ({ ...f, status: e.target.value }))}
                    className={selectCls}>
                    {txModal === 'payment' && ['PENDING', 'COMPLETED', 'CONFIRMED', 'FAILED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                    {txModal === 'refund' && ['REQUESTED', 'APPROVED', 'RECEIVED', 'REJECTED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                    {txModal === 'forfeiture' && ['PENDING_CONFIRMATION', 'CONFIRMED', 'DISPUTED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
                    {txModal === 'adjustment' && ['COMPLETED'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* ── เลขอ้างอิง ── */}
                {(txModal === 'payment' || txModal === 'adjustment') && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">เลขอ้างอิง</label>
                    <input type="text" value={txForm.referenceNo}
                      onChange={e => setTxForm(f => ({ ...f, referenceNo: e.target.value }))}
                      placeholder="หมายเลขอ้างอิง"
                      className={inputCls} />
                  </div>
                )}

                {/* ── Credit Note (refund) ── */}
                {txModal === 'refund' && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Credit Note No</label>
                    <input type="text" value={txForm.creditNoteNo}
                      onChange={e => setTxForm(f => ({ ...f, creditNoteNo: e.target.value }))}
                      placeholder="เลขที่ Credit Note"
                      className={inputCls} />
                  </div>
                )}

                {/* ── Reason Code ── */}
                {(txModal === 'refund' || txModal === 'forfeiture' || txModal === 'adjustment') && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">
                      Reason Code {(txModal === 'refund' || txModal === 'forfeiture') && <span className="text-red-500">*</span>}
                    </label>
                    <input type="text" value={txForm.reasonCode}
                      onChange={e => setTxForm(f => ({ ...f, reasonCode: e.target.value }))}
                      placeholder="เช่น CANCEL, AIRLINE_CHANGE"
                      className={inputCls} />
                  </div>
                )}

                {/* ── หมายเหตุ ── */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">หมายเหตุ</label>
                  <textarea value={txForm.remark} rows={2}
                    onChange={e => setTxForm(f => ({ ...f, remark: e.target.value }))}
                    placeholder="บันทึกเพิ่มเติม..."
                    className={`${inputCls} resize-none`} />
                </div>

                {txError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{txError}</p>}
              </div>
            </Modal>
          )}

          {/* Program Mapping */}
          <section>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Program Mapping</p>
            <div className="bg-slate-50 rounded-xl p-6 text-center text-slate-400 text-sm">
              ยังไม่มีการ Map Program
            </div>
          </section>

          {/* History */}
          <section>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">History</p>
            {stock.logs.length === 0 ? (
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-400 text-center">ยังไม่มีประวัติ</div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Date/Time', 'User', 'Action', 'Detail'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[11px] font-medium text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stock.logs.slice(0, 10).map((log, i) => (
                      <tr key={log.logId ?? i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                        <td className="px-3 py-2 font-medium text-slate-700">{log.createdBy}</td>
                        <td className="px-3 py-2"><Badge variant="blue">{log.action}</Badge></td>
                        <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">{log.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stock.logs.length > 10 && (
                  <div className="px-4 py-2.5 border-t border-slate-100 text-center">
                    <button
                      onClick={() => { onClose(); onHistory(row.stockId) }}
                      className="text-xs text-[#05a94f] hover:underline">
                      ดูประวัติทั้งหมด ({stock.logs.length} รายการ)
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

// ─── Requisition Modal ────────────────────────────────────────────────────────

const BANK_OPTIONS = [
  'ธนาคารกรุงเทพ (BBL)',
  'ธนาคารกสิกรไทย (KBANK)',
  'ธนาคารไทยพาณิชย์ (SCB)',
  'ธนาคารกรุงไทย (KTB)',
  'ธนาคารกรุงศรีอยุธยา (BAY)',
  'ธนาคารทหารไทยธนชาต (TTB)',
  'ธนาคารออมสิน (GSB)',
  'ธนาคารอาคารสงเคราะห์ (GHB)',
]

const INIT_REQ_FORM = {
  stageId: '',
  payeeName: '',
  bankName: '',
  accountNo: '',
  branch: '',
  remark: '',
}

function RequisitionModal({
  row, stock, scheduleItems, open, onClose, onSave,
}: {
  row: PNRRow | null
  stock: DemoStock | null
  scheduleItems: PaymentScheduleItem[]
  open: boolean
  onClose: () => void
  onSave: (updated: DemoStock) => void
}) {
  const [form, setForm] = useState({ ...INIT_REQ_FORM })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const resetReqForm = () => { setForm({ ...INIT_REQ_FORM }); setError(''); setSaving(false) }

  if (!row || !stock) return null

  // Stages eligible for requisition: not yet REQUESTED/PARTIALLY_PAID/PAID/ADJUSTED
  const DONE_STATUSES = ['REQUESTED', 'PARTIALLY_PAID', 'PAID', 'ADJUSTED']
  const eligibleStages = scheduleItems.filter(s => {
    if (!s.stageStatus) return true  // legacy stage, always eligible
    return !DONE_STATUSES.includes(s.stageStatus)
  })

  const selectedStage = scheduleItems.find(s => s.stageId === form.stageId)

  const handleSubmit = () => {
    if (!form.stageId) { setError('กรุณาเลือกรอบชำระ'); return }
    if (!form.payeeName.trim()) { setError('กรุณาระบุชื่อบัญชีผู้รับเงิน'); return }
    if (!form.bankName) { setError('กรุณาเลือกธนาคาร'); return }
    if (!form.accountNo.trim()) { setError('กรุณาระบุเลขที่บัญชี'); return }
    setSaving(true)

    const now = new Date().toISOString()
    const reqId = `REQ-${Date.now().toString(36).toUpperCase()}`

    const updatedPnrs = stock.pnrs.map(p => {
      if (p.pnrId !== row.pnrId) return p
      const snapshots = { ...(p.stageSnapshots ?? {}) }
      if (snapshots[form.stageId]) {
        snapshots[form.stageId] = { ...snapshots[form.stageId], stageStatus: 'REQUESTED' as StageStatus }
      }
      return { ...p, stageSnapshots: snapshots }
    })

    const newLog: DemoLog = {
      logId: `LOG-${Date.now()}`,
      action: 'REQUISITION_CREATED',
      message: `สร้างใบเบิก ${reqId} — ${selectedStage?.stageName ?? form.stageId} | ยอด ${selectedStage ? formatCurrency(selectedStage.confirmedAmount ?? selectedStage.amount, row.currency) : ''} | โอนไป ${form.payeeName} ${form.bankName} ${form.accountNo}${form.remark ? ` | หมายเหตุ: ${form.remark}` : ''}`,
      createdAt: now,
      createdBy: 'Admin',
    }

    const updated: DemoStock = {
      ...stock,
      pnrs: updatedPnrs,
      logs: [...(stock.logs ?? []), newLog],
    }

    onSave(updated)
    resetReqForm()
    onClose()
  }

  const handleReqClose = () => { resetReqForm(); onClose() }

  return (
    <Modal
      open={open}
      onClose={handleReqClose}
      title="สร้างใบเบิก"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button
            variant="primary"
            icon={<FileText size={14} />}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'กำลังสร้าง...' : 'สร้างใบเบิก'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* PNR Info */}
        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200">
          <span className="font-mono text-sm font-bold text-slate-800">{row.pnrDisplay}</span>
          {row.pnrType === 'dummy' && (
            <span className="px-1.5 py-px text-[10px] rounded-full font-medium bg-amber-100 text-amber-700">Dummy</span>
          )}
          <span className="text-xs text-slate-500">{row.routeText}</span>
          {row.travelStart && (
            <span className="text-xs text-slate-400">
              {formatDate(row.travelStart)}{row.travelEnd ? ` – ${formatDate(row.travelEnd)}` : ''}
            </span>
          )}
          <span className="text-xs text-slate-400">{row.seatTotal} ที่นั่ง</span>
        </div>

        {/* Stage Selector */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-700">
            รอบชำระที่ต้องการเบิก <span className="text-red-500">*</span>
          </label>

          {eligibleStages.length === 0 ? (
            <div className="flex items-start gap-2 px-3 py-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-700">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>ไม่มีรอบชำระที่พร้อมสร้างใบเบิก — กรุณาล็อกยอดชำระก่อนในหน้า Payment Schedule</span>
            </div>
          ) : (
            <div className="space-y-2">
              {eligibleStages.map(s => {
                const isSelected = form.stageId === s.stageId
                const needsLock = s.amountMode && s.stageStatus === 'ESTIMATED'
                return (
                  <button
                    key={s.stageId}
                    type="button"
                    disabled={!!needsLock}
                    onClick={() => { setForm(f => ({ ...f, stageId: s.stageId })); setError('') }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                      needsLock
                        ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                        : isSelected
                        ? 'border-[#05a94f] bg-[#05a94f]/5 ring-1 ring-[#05a94f]/20'
                        : 'border-slate-200 bg-white hover:border-[#05a94f]/40 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          isSelected ? 'border-[#05a94f] bg-[#05a94f]' : 'border-slate-300'
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className={`text-sm font-medium truncate ${isSelected ? 'text-[#05a94f]' : 'text-slate-800'}`}>
                          {s.stageName}
                        </span>
                        {s.paymentType && (
                          <span className="text-[10px] px-1.5 py-px rounded-full bg-slate-100 text-slate-500 shrink-0">
                            {PAYMENT_TYPE_LABELS[s.paymentType] ?? s.paymentType}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-slate-800">
                          {formatCurrency(s.confirmedAmount ?? s.amount, row.currency)}
                        </div>
                        {s.ttlDatetime && (
                          <div className={`text-[10px] ${computePaymentStatus(s.ttlDatetime) === 'Overdue' ? 'text-red-500' : 'text-slate-400'}`}>
                            ครบกำหนด {formatDate(s.ttlDatetime)}
                          </div>
                        )}
                      </div>
                    </div>
                    {needsLock && (
                      <p className="text-[10px] text-amber-600 mt-1 ml-6">ยังไม่ล็อกยอด — ต้องล็อกก่อนจึงสร้างใบเบิกได้</p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Bank Details */}
        {form.stageId && (
          <div className="space-y-3 pt-1">
            <p className="text-sm font-semibold text-slate-700">ข้อมูลบัญชีปลายทาง</p>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">
                ชื่อบัญชีผู้รับเงิน <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.payeeName}
                onChange={e => { setForm(f => ({ ...f, payeeName: e.target.value })); setError('') }}
                placeholder="เช่น บริษัท XX Airlines Co., Ltd."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  ธนาคาร <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.bankName}
                  onChange={e => { setForm(f => ({ ...f, bankName: e.target.value })); setError('') }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
                >
                  <option value="">เลือกธนาคาร</option>
                  {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">
                  เลขที่บัญชี <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.accountNo}
                  onChange={e => { setForm(f => ({ ...f, accountNo: e.target.value })); setError('') }}
                  placeholder="XXX-X-XXXXX-X"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">สาขา</label>
              <input
                type="text"
                value={form.branch}
                onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                placeholder="เช่น สาขาสุวรรณภูมิ (ไม่บังคับ)"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600">หมายเหตุ</label>
              <textarea
                rows={2}
                value={form.remark}
                onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
                placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
              />
            </div>
          </div>
        )}

        {/* Summary row */}
        {selectedStage && (
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#05a94f]/5 border border-[#05a94f]/20">
            <div>
              <p className="text-[11px] text-slate-500 mb-0.5">ยอดที่จะเบิก</p>
              <p className="text-lg font-bold text-[#05a94f]">
                {formatCurrency(selectedStage.confirmedAmount ?? selectedStage.amount, row.currency)}
              </p>
            </div>
            {selectedStage.ttlDatetime && (
              <div className="text-right">
                <p className="text-[11px] text-slate-500 mb-0.5">วันครบกำหนด</p>
                <p className={`text-sm font-semibold ${computePaymentStatus(selectedStage.ttlDatetime) === 'Overdue' ? 'text-red-500' : 'text-slate-700'}`}>
                  {formatDate(selectedStage.ttlDatetime)}
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1.5">
            <AlertCircle size={12} /> {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

// ─── Replace Dummy Modal ──────────────────────────────────────────────────────

function ReplaceDummyModal({
  row, allRows, open, onClose, onSave,
}: {
  row: PNRRow | null
  allRows: PNRRow[]
  open: boolean
  onClose: () => void
  onSave: (pnrId: string, stockId: string, newCode: string) => Promise<void>
}) {
  const [newPnr, setNewPnr] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const resetReplaceForm = () => { setNewPnr(''); setError('') }

  const validate = (code: string): string => {
    if (!code) return 'กรุณากรอก PNR ใหม่'
    if (code.length < 6) return 'PNR ต้องมีอย่างน้อย 6 ตัวอักษร'
    const dup = allRows.find(r =>
      r.pnrType === 'real' && r.pnrCode.toUpperCase() === code && r.pnrId !== row?.pnrId
    )
    if (dup) return `PNR "${code}" ซ้ำกับรายการ ${dup.stockCode} (${dup.pnrDisplay})`
    return ''
  }

  const handleSave = async () => {
    const code = newPnr.trim().toUpperCase()
    const err = validate(code)
    if (err) { setError(err); return }
    setSaving(true)
    try {
      await onSave(row!.pnrId, row!.stockId, code)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleReplaceClose = () => { resetReplaceForm(); onClose() }

  return (
    <Modal
      open={open}
      onClose={handleReplaceClose}
      title="เปลี่ยน Dummy PNR เป็น PNR"
      size="sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleReplaceClose}>ยกเลิก</Button>
          <Button size="sm" onClick={handleSave} loading={saving}>บันทึก</Button>
        </>
      }
    >
      {row && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-sm font-medium text-amber-800">Dummy PNR เดิม: <span className="font-mono">{row.dummyPnr || row.pnrDisplay}</span></p>
            <p className="text-xs text-amber-600 mt-1">{row.stockCode} — {row.groupName}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              PNR ใหม่ <span className="text-red-500">*</span>
            </label>
            <input
              value={newPnr}
              onChange={e => { setNewPnr(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="เช่น ABC123"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#05a94f]"
            />
            {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
          </div>
          <p className="text-xs text-slate-500">ระบบจะตรวจสอบ PNR ซ้ำจากทุก Ticket Type ก่อนบันทึก Dummy PNR เดิมจะยังเก็บไว้ใน History</p>
        </div>
      )}
    </Modal>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ListPNRPage() {
  const router = useRouter()
  const [currentRole, setCurrentRole] = useState<UserRole>(() => getDemoRole())

  const handleRoleChange = (role: UserRole) => {
    setCurrentRole(role)
    setDemoRole(role)
  }

  const [stocks, setStocks] = useState<DemoStock[]>([])
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterState>(INIT_FILTERS)
  const [showFilter, setShowFilter] = useState(false)
  const [page, setPage] = useState(1)
  const [viewRow, setViewRow] = useState<PNRRow | null>(null)
  const [viewStock, setViewStock] = useState<DemoStock | null>(null)
  const [replaceRow, setReplaceRow] = useState<PNRRow | null>(null)
  const [paymentDrawer, setPaymentDrawer] = useState<PaymentDrawerState | null>(null)
  const [requisitionRow, setRequisitionRow] = useState<PNRRow | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStocks(getDemoStocks())
  }, [])

  const allRows = useMemo(() => buildRows(stocks), [stocks])

  const paymentMap = useMemo(() => {
    const map: Record<string, PaymentScheduleItem[]> = {}
    for (const stock of stocks) {
      const raw = buildPaymentSchedule(stock)
      const derived = deriveScheduleWithTransactions(raw, stock.transactions ?? [])
      for (const item of derived) {
        if (!map[item.pnrId]) map[item.pnrId] = []
        map[item.pnrId].push(item)
      }
    }
    return map
  }, [stocks])

  const transactionMap = useMemo(() => {
    const map: Record<string, FinancialTransaction[]> = {}
    for (const stock of stocks) {
      for (const tx of (stock.transactions ?? [])) {
        if (!map[tx.pnrId]) map[tx.pnrId] = []
        map[tx.pnrId].push(tx)
      }
    }
    return map
  }, [stocks])

  const financialSummaryMap = useMemo(() => {
    const map: Record<string, PNRFinancialSummary> = {}
    for (const pnr of allRows) {
      const schedule = paymentMap[pnr.pnrId] ?? []
      const required = schedule.reduce((s, i) => s + i.amount, 0) || pnr.total
      map[pnr.pnrId] = calcPNRFinancialSummary(pnr.pnrId, transactionMap[pnr.pnrId] ?? [], required)
    }
    return map
  }, [allRows, paymentMap, transactionMap])

  const airlines = useMemo(() =>
    [...new Set(allRows.map(r => r.airlineCode).filter(Boolean))].sort(), [allRows])
  const conditions = useMemo(() =>
    [...new Set(allRows.map(r => r.conditionCode).filter(Boolean))].sort(), [allRows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allRows.filter(r => {
      if (q) {
        const haystack = [r.pnrDisplay, r.dummyPnr, r.pnrCode, r.stockCode, r.groupName, r.airlineCode, r.routeText]
          .map(v => (v || '').toLowerCase())
        if (!haystack.some(s => s.includes(q))) return false
      }
      if (filters.ticketType && r.ticketType !== filters.ticketType) return false
      if (filters.pnrType && r.pnrType !== filters.pnrType) return false
      if (filters.airline && r.airlineCode !== filters.airline) return false
      if (filters.status && r.status !== filters.status) return false
      if (filters.mappingStatus && r.mappingStatus !== filters.mappingStatus) return false
      if (filters.condition && r.conditionCode !== filters.condition) return false
      if (filters.seatFilter === 'available' && r.available <= 0) return false
      if (filters.seatFilter === 'full' && r.available > 0) return false
      if (filters.travelFrom && r.travelStart && r.travelStart < filters.travelFrom) return false
      if (filters.travelTo && r.travelEnd && r.travelEnd > filters.travelTo) return false
      return true
    })
  }, [allRows, search, filters])

  const summary = useMemo(() => ({
    total: allRows.length,
    real: allRows.filter(r => r.pnrType === 'real').length,
    dummy: allRows.filter(r => r.pnrType === 'dummy').length,
    hasSeats: allRows.filter(r => r.available > 0).length,
    notMapped: allRows.filter(r => r.mappingStatus === 'Not Mapped').length,
  }), [allRows])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleView = (row: PNRRow) => {
    setViewRow(row)
    setViewStock(stocks.find(s => s.stockId === row.stockId) ?? null)
  }

  const handleEdit = (row: PNRRow) => {
    router.push(`/tickets/${row.stockId}`)
  }

  const handleHistory = (stockId: string) => {
    router.push(`/tickets/${stockId}?tab=Logs`)
  }

  const handleReplaceSave = async (pnrId: string, stockId: string, newCode: string) => {
    const stock = stocks.find(s => s.stockId === stockId)
    if (!stock) return
    const updated: DemoStock = {
      ...stock,
      pnrs: stock.pnrs.map(p =>
        p.pnrId === pnrId
          ? { ...p, pnrCode: newCode, pnrType: 'real', pnrDisplay: newCode }
          : p
      ),
    }
    saveDemoStock(updated)
    const fresh = getDemoStocks()
    setStocks(fresh)
    showToast('เปลี่ยน PNR สำเร็จ')
  }

  const handleTransactionSave = (updated: DemoStock) => {
    saveDemoStock(updated)
    const fresh = getDemoStocks()
    setStocks(fresh)
    setViewStock(updated)
    showToast('บันทึก Transaction สำเร็จ')
  }

  const handleRequisitionSave = (updated: DemoStock) => {
    saveDemoStock(updated)
    const fresh = getDemoStocks()
    setStocks(fresh)
    showToast('สร้างใบเบิกสำเร็จ')
  }

  const handleExport = () => {
    const data = filtered.map(r => ({
      'PNR': r.pnrDisplay,
      'Dummy PNR': r.dummyPnr || '',
      'PNR Type': r.pnrType === 'real' ? 'PNR' : 'Dummy PNR',
      'Series Code': r.stockCode,
      'Series Name': r.groupName,
      'Ticket Type': r.ticketType,
      'Airline': r.airlineCode,
      'Route': r.routeText,
      'Travel Start': r.travelStart ? formatDate(r.travelStart) : '',
      'Travel End': r.travelEnd ? formatDate(r.travelEnd) : '',
      'Seat Used': r.seatUsed,
      'Seat Total': r.seatTotal,
      'Available': r.available,
      'Condition': r.conditionCode,
      'NAME DL': r.ttlDateTime ? formatDateTime(r.ttlDateTime) : '',
      'Program Count': r.programCount,
      'Mapping Status': r.mappingStatus,
      'PNR Status': r.status,
      'Currency': r.currency,
      'Fare': r.fare,
      'Tax': r.tax,
      'Total': r.total,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'List PNR')
    XLSX.writeFile(wb, `list-pnr-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const setFilter = <K extends keyof FilterState>(key: K, value: string) => {
    setFilters(f => ({ ...f, [key]: value }))
    setPage(1)
  }

  const hasActiveFilter = !!search || Object.values(filters).some(v => v)
  const clearAll = () => { setSearch(''); setFilters(INIT_FILTERS); setPage(1) }

  // Build pagination items
  const paginationItems = useMemo(() => {
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
      .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
    const items: React.ReactNode[] = []
    for (let idx = 0; idx < pages.length; idx++) {
      if (idx > 0 && pages[idx - 1] !== pages[idx] - 1) {
        items.push(<span key={`e-${pages[idx]}`} className="text-slate-400 text-sm px-1">...</span>)
      }
      const p = pages[idx]
      items.push(
        <button
          key={p}
          onClick={() => setPage(p)}
          className={cn(
            'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
            p === page ? 'bg-[#05a94f] text-white' : 'hover:bg-slate-100 text-slate-600'
          )}
        >{p}</button>
      )
    }
    return items
  }, [totalPages, page])

  const selectClass = 'w-full text-sm border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#05a94f]'

  return (
    <AppLayout title="List PNR">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[9999] bg-[#05a94f] text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 pointer-events-none">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}

      {/* View Drawer */}
      <ViewDrawer
        row={viewRow}
        stock={viewStock}
        onClose={() => { setViewRow(null); setViewStock(null) }}
        onEdit={handleEdit}
        onHistory={handleHistory}
        onTransactionSave={handleTransactionSave}
        currentRole={currentRole}
      />

      {/* Replace Dummy Modal */}
      <ReplaceDummyModal
        row={replaceRow}
        allRows={allRows}
        open={!!replaceRow}
        onClose={() => setReplaceRow(null)}
        onSave={handleReplaceSave}
      />

      {/* Requisition Modal */}
      <RequisitionModal
        row={requisitionRow}
        stock={requisitionRow ? (stocks.find(s => s.stockId === requisitionRow.stockId) ?? null) : null}
        scheduleItems={requisitionRow ? (paymentMap[requisitionRow.pnrId] ?? []) : []}
        open={!!requisitionRow}
        onClose={() => setRequisitionRow(null)}
        onSave={handleRequisitionSave}
      />

      {/* Payment Drawer */}
      <PaymentDrawer state={paymentDrawer} onClose={() => setPaymentDrawer(null)} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">List PNR</h1>
          <p className="text-sm text-slate-500">รายการ PNR ทั้งหมดจาก Group, FIT และ Ticket + Land</p>
        </div>
        <div className="flex items-center gap-3">
          <RoleSwitcher currentRole={currentRole} onChange={handleRoleChange} />
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={handleExport}>
            Export Excel
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        <StatCard title="PNR ทั้งหมด" value={summary.total} icon={<Hash size={18} />} color="#05a94f" />
        <StatCard title="PNR" value={summary.real} icon={<CheckCircle2 size={18} />} color="#3b82f6" />
        <StatCard title="Dummy PNR" value={summary.dummy} icon={<AlertCircle size={18} />} color="#f59e0b" />
        <StatCard title="มีที่นั่งคงเหลือ" value={summary.hasSeats} icon={<Users size={18} />} color="#10b981" />
        <StatCard title="ยังไม่ Map" value={summary.notMapped} icon={<Link2 size={18} />} color="#8b5cf6" />
      </div>

      {/* Search & Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="ค้นหา PNR, Series Code, Series Name, Airline, Route..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#05a94f]"
            />
          </div>
          <Button
            variant={showFilter ? 'primary' : 'outline'}
            size="sm"
            icon={<SlidersHorizontal size={14} />}
            onClick={() => setShowFilter(v => !v)}
          >
            Filter
          </Button>
          {hasActiveFilter && (
            <Button variant="outline" size="sm" icon={<X size={14} />} onClick={clearAll}>
              Clear
            </Button>
          )}
        </div>

        {showFilter && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pt-3 border-t border-slate-100">
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Ticket Type</label>
              <select value={filters.ticketType} onChange={e => setFilter('ticketType', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                <option value="Group">Group</option>
                <option value="FIT">FIT</option>
                <option value="Ticket + Land">Ticket + Land</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">PNR Type</label>
              <select value={filters.pnrType} onChange={e => setFilter('pnrType', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                <option value="real">PNR</option>
                <option value="dummy">Dummy PNR</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Airline</label>
              <select value={filters.airline} onChange={e => setFilter('airline', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                {airlines.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">PNR Status</label>
              <select value={filters.status} onChange={e => setFilter('status', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                <option value="Pending">รอยืนยัน</option>
                <option value="Confirmed">ยืนยันแล้ว</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Mapping Status</label>
              <select value={filters.mappingStatus} onChange={e => setFilter('mappingStatus', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                {(['Not Mapped', 'Partially Mapped', 'Mapped'] as const).map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Condition</label>
              <select value={filters.condition} onChange={e => setFilter('condition', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                {conditions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">ที่นั่ง</label>
              <select value={filters.seatFilter} onChange={e => setFilter('seatFilter', e.target.value)} className={selectClass}>
                <option value="">ทั้งหมด</option>
                <option value="available">มีที่นั่งคงเหลือ</option>
                <option value="full">ที่นั่งเต็ม</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Travel Date From</label>
              <input type="date" value={filters.travelFrom} onChange={e => setFilter('travelFrom', e.target.value)}
                className={selectClass} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">Travel Date To</label>
              <input type="date" value={filters.travelTo} onChange={e => setFilter('travelTo', e.target.value)}
                className={selectClass} />
            </div>
          </div>
        )}
      </div>

      {/* Result count */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500">
          {hasActiveFilter
            ? `ค้นพบ ${filtered.length} รายการ จากทั้งหมด ${allRows.length} PNR`
            : `ทั้งหมด ${allRows.length} PNR`}
        </p>
        {totalPages > 1 && (
          <p className="text-xs text-slate-500">หน้า {page} / {totalPages}</p>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <tr>
                <Th>PNR</Th>
                <Th>Series Code</Th>
                <Th className="hidden lg:table-cell">Airline</Th>
                <Th className="hidden xl:table-cell">Travel Period</Th>
                <Th className="text-center">Seat Used/Total</Th>
                <Th className="text-center hidden sm:table-cell">Available</Th>
                <Th className="hidden xl:table-cell">NAME DL</Th>
                <Th className="hidden xl:table-cell">Payment</Th>
                <Th className="hidden 2xl:table-cell text-center">Program</Th>
                <Th className="hidden xl:table-cell">Mapping</Th>
                <Th>Status</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </TableHead>
            <TableBody>
              {paginated.length === 0 ? (
                <EmptyRow cols={12} message="ยังไม่มีข้อมูล PNR" />
              ) : (
                paginated.map(row => (
                  <TableRow key={row.pnrId}>
                    {/* PNR */}
                    <Td>
                      {/* Line 1: PNR Code + Dummy badge */}
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-sm text-slate-800 whitespace-nowrap">{row.pnrDisplay}</span>
                        {row.pnrType === 'dummy' && (
                          <Badge variant="orange" className="text-[10px] py-0 px-1.5 whitespace-nowrap">Dummy</Badge>
                        )}
                      </div>
                      {/* Line 2: Route */}
                      <p
                        className="text-[11px] text-slate-600 font-medium mt-0.5 truncate max-w-[220px]"
                        title={row.routeText || undefined}
                      >
                        {row.routeText || '–'}
                      </p>
                      {/* Line 3: Series Name */}
                      <p
                        className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[220px]"
                        title={row.groupName || undefined}
                      >
                        {row.groupName || '–'}
                      </p>
                    </Td>
                    {/* Series Code + Ticket Type */}
                    <Td>
                      <div className="mb-1">
                        {row.ticketType
                          ? <TicketTypeBadge type={row.ticketType} groupType={row.groupType} />
                          : <span className="text-xs text-slate-400">–</span>}
                      </div>
                      <button
                        onClick={() => handleEdit(row)}
                        className="text-xs font-semibold text-slate-800 hover:text-[#05a94f] hover:underline transition-colors text-left font-mono"
                        title="เปิดรายละเอียด Series"
                      >
                        {row.stockCode}
                      </button>
                    </Td>
                    {/* Airline */}
                    <Td className="hidden lg:table-cell text-xs font-medium text-slate-700">{row.airlineCode || '—'}</Td>
                    {/* Travel Period */}
                    <Td className="hidden xl:table-cell text-xs text-slate-600 whitespace-nowrap">
                      {row.travelStart
                        ? `${formatDate(row.travelStart)} – ${formatDate(row.travelEnd)}`
                        : '—'}
                    </Td>
                    {/* Seat Used / Total */}
                    <Td className="text-center">
                      <span className="text-xs font-medium text-slate-700">{row.seatUsed}</span>
                      <span className="text-xs text-slate-400 mx-0.5">/</span>
                      <span className="text-xs font-medium text-slate-700">{row.seatTotal}</span>
                    </Td>
                    {/* Available */}
                    <Td className="hidden sm:table-cell text-center">
                      <span className="text-sm font-bold" style={{ color: row.available > 0 ? '#05a94f' : '#ef4444' }}>
                        {row.available}
                      </span>
                    </Td>
                    {/* TTL Date */}
                    <Td className="hidden xl:table-cell text-xs text-slate-700 whitespace-nowrap">
                      {row.ttlDateTime ? formatDateTime(row.ttlDateTime) : <span className="text-slate-400">—</span>}
                    </Td>
                    {/* Payment */}
                    <Td className="hidden xl:table-cell">
                      <PaymentSummaryCell
                        summary={financialSummaryMap[row.pnrId] ?? null}
                        txCount={(transactionMap[row.pnrId] ?? []).length}
                        currency={row.currency}
                        onClick={() => setPaymentDrawer({
                          pnrDisplay: row.pnrDisplay,
                          currency: row.currency,
                          summary: financialSummaryMap[row.pnrId] ?? { requiredAmount: 0, paidAmount: 0, refundAmount: 0, forfeitedAmount: 0, supplierHeldAmount: 0, outstandingAmount: 0, netCashPaid: 0 },
                          transactions: transactionMap[row.pnrId] ?? [],
                          scheduleItems: paymentMap[row.pnrId] ?? [],
                        })}
                      />
                    </Td>
                    {/* Program */}
                    <Td className="hidden 2xl:table-cell text-center text-xs text-slate-500">{row.programCount}</Td>
                    {/* Mapping Status */}
                    <Td className="hidden xl:table-cell">
                      <Badge variant={mappingVariant(row.mappingStatus)}>{row.mappingStatus}</Badge>
                    </Td>
                    {/* PNR Status */}
                    <Td><PNRStatusBadge status={row.status} /></Td>
                    {/* Action */}
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          title="ดูรายละเอียด"
                          onClick={() => handleView(row)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700">
                          <Eye size={14} />
                        </button>
                        <button
                          title="สร้างใบเบิก"
                          onClick={() => router.push(`/requisitions/create?stockId=${row.stockId}&pnrId=${row.pnrId}`)}
                          className="p-1.5 rounded-lg hover:bg-[#05a94f]/10 transition-colors text-[#05a94f]/60 hover:text-[#05a94f]">
                          <FileText size={14} />
                        </button>
                        <button
                          title="แก้ไขใน Ticket Stock"
                          onClick={() => handleEdit(row)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700">
                          <ExternalLink size={14} />
                        </button>
                        {row.pnrType === 'dummy' && (
                          <button
                            title="เปลี่ยน Dummy PNR"
                            onClick={() => setReplaceRow(row)}
                            className="p-1.5 rounded-lg hover:bg-amber-50 transition-colors text-amber-400 hover:text-amber-600">
                            <Repeat size={14} />
                          </button>
                        )}
                      </div>
                    </Td>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft size={16} />
          </button>
          {paginationItems}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </AppLayout>
  )
}
