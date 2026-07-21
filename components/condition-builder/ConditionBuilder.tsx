'use client'

/**
 * ConditionBuilder — 7-section condition editor.
 * Exports utilities used by ConditionEditorModal for tabs, status, validation, and clear.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { format, parseISO, isValid, subDays } from 'date-fns'
import { Plus, Trash2, Edit2, GripVertical, X, AlertCircle, ChevronDown, Check, Lock, Copy, ArrowUp, ArrowDown, CreditCard, Clock, Info, Package, Briefcase, StickyNote, Layers, Calculator, Receipt, Eye, Calendar, CheckCircle2 } from 'lucide-react'
import {
  AppCondition, CondStage, CondTtlRule, CondIssuanceMode, CondBaggagePolicy,
  CondSeatReductionPolicy, CondSeatReductionRule, CondRefundTerms,
  COND_PAYMENT_TYPE_LABELS, COND_CALC_TYPE_LABELS, COND_DUE_TYPE_LABELS,
  COND_QUANTITY_BASIS_LABELS, COND_REFUNDABLE_LABELS,
  CondPaymentType, CondCalcType, CondCalcBase, CondDueType, CondTtlCalcType,
  CondQuantityBasis, CondRefundableType,
  COND_CALC_BASE_LABELS,
  CondBaggageStatus, CondBaggageType, CondBaggageAllowanceMode, CondBaggagePiece,
  CondSeatReductionAllow, CondSeatBasis, CondSeatNoticeDaysBase, CondSeatReductionMode, CondSeatRangeType,
  CondSeatCalcType, CondSeatScope,
  CondSingleOverLimit, CondRuleOverLimitAction, CondForfeitSource, CondStepPenaltyType, CondStepCalcBase,
  CondCancelGroupPolicy, CondCancelGroupDeadlineBase, CondCancelGroupRefundable, CondCancelGroupTerms,
  defaultCancelGroupTerms,
  CondCancelType, CondCancelStepResult, CondCancelStepRefundable, CondCancelStep,
  CondCancelPaymentResult, CondCancelPaymentEntry,
  CondCancelResult, CondCancelPartialRefundSpec, CondCancelPenaltyInlineSpec,
  defaultCancelPartialRefundSpec, defaultCancelPenaltyInlineSpec,
  CondCancelPenaltyBasis, CondCancelPenaltyCalcType, CondCancelPenaltyBase, CondCancelPenaltyRefund, CondCancelPenaltySpec,
  newCancelStepId, newCancelPaymentEntryId, defaultCancelPenaltySpec,
  CondChangePolicy, CondChangeFeeType, CondChangeFeeBasis, CondChangeSingleTerm, CondChangeTerms,
  defaultChangeTerms, defaultChangeSingleTerm,
  CondPostRefundFeeType, CondPostRefundFeeBase,
  CondMainRefundPolicy,
  // v2 refund types
  CondPostRefundApplyAfter, CondPostRefundMainPolicy, CondRefundItem, CondRefundFeeUnit,
  CondRefundPenaltyMode, CondRefundPenaltyStepRule,
  CondNameChangePolicy,
  CondUtilizationBase, CondUtilizationMeasure, CondUtilizationAction, CondUtilizationPenaltyType, CondUtilizationForfeitType,
  CondUtilization,
  defaultCondStage, defaultBaggagePolicy, defaultSeatReductionPolicy, defaultSeatReductionRule,
  defaultRefundTerms, newRefundPenaltyStepRuleId,
  defaultTtlRule, newStageId, newSeatReductionRuleId,
  formatStageAmount, formatTtlRule, autoStageName, formatBaggageSummary, migrateBaggagePolicy,
  migrateSeatReductionPolicy, formatSeatReductionSummary,
  migrateRefundTerms, formatRefundTermsSummary,
  DAY_BASED_DUE_TYPES,
} from '@/lib/condition-schema'
import { MASTER_AIRLINES, MASTER_COUNTRIES, getAirlineName } from '@/lib/master-data'
import { getCurrencyOptions } from '@/lib/currency-storage'
import { CurrencyCombobox } from '@/components/shared/CurrencyCombobox'
import { AirlineCombobox } from '@/components/shared/AirlineCombobox'
import RichTextEditor from '@/components/condition-builder/RichTextEditor'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { TimeInput } from '@/components/ui/time-input'

// ─── Tab definitions ──────────────────────────────────────────────────────────

export type TabKey = 'basic' | 'payment' | 'baggage' | 'reduce' | 'cancel' | 'change' | 'refund' | 'extra'
export type TabStatus = 'empty' | 'incomplete' | 'complete' | 'error'

export const TABS: { key: TabKey; label: string; no: number }[] = [
  { key: 'basic',   label: 'รายละเอียด',              no: 1 },
  { key: 'payment', label: 'เงื่อนไขงวดชำระเงิน',    no: 2 },
  { key: 'baggage', label: 'เงื่อนไขสัมภาระ',        no: 3 },
  { key: 'reduce',  label: 'เงื่อนไขการลดที่นั่ง',   no: 4 },
  { key: 'cancel',  label: 'เงื่อนไขการยกเลิกกรุ๊ป (No Sell)', no: 5 },
  { key: 'change',  label: 'เงื่อนไขการเปลี่ยนชื่อ',  no: 6 },
  { key: 'refund',  label: 'เงื่อนไขการ Refund',      no: 7 },
  { key: 'extra',   label: 'เงื่อนไขเพิ่มเติม',      no: 8 },
]

// ─── Per-tab validation ────────────────────────────────────────────────────────

export function validateTab(key: TabKey, v: AppCondition, conditionMode: ConditionMode = 'template', templateInfo?: TemplateInfo): string[] {
  switch (key) {
    case 'basic': {
      const errs: string[] = []
      if (conditionMode === 'series' && !v.conditionCode.trim()) errs.push('กรุณาระบุรหัส Condition')
      if (!v.conditionName.trim()) errs.push('กรุณาระบุชื่อ Condition')
      if (conditionMode === 'template') {
        if (!templateInfo && !v.currency.trim()) errs.push('กรุณาเลือก Currency')
        if (!templateInfo && !v.airline.trim())  errs.push('กรุณาเลือก Airline')
        // templateInfo present but airline not yet selected
        if (templateInfo && !templateInfo.airlineCode) errs.push('กรุณาเลือกสายการบิน')
      }
      return errs
    }
    case 'payment': {
      const errs: string[] = []
      v.stages.forEach((s, i) => {
        const no = `งวดที่ ${i + 1}`
        if (!s.paymentType) errs.push(`${no}: กรุณาเลือกประเภทการชำระเงิน`)
        if (!s.calcType)    errs.push(`${no}: กรุณาเลือกวิธีคิดเงิน`)
        if (isAmountCalc(s.calcType) && s.amount < 0)
          errs.push(`${no}: จำนวนเงินต้องมากกว่าหรือเท่ากับ 0`)
        if (isPercentCalc(s.calcType)) {
          if (s.percent <= 0)   errs.push(`${no}: เปอร์เซ็นต์ต้องมากกว่า 0`)
          if (s.percent > 100)  errs.push(`${no}: เปอร์เซ็นต์ต้องไม่เกิน 100`)
        }
        if (DAY_BASED_DUE_TYPES.includes(s.dueType) && !s.dueDays && s.paymentType !== 'TICKET_ISSUE_DATE')
          errs.push(`${no}: กรุณาระบุจำนวนวัน`)
        if (s.dueType === 'CUSTOM_DATE' && !s.dueDate)
          errs.push(`${no}: กรุณาระบุวันที่กำหนดเอง`)
        if (s.refundable === 'UNSPECIFIED')
          errs.push(`${no}: กรุณาระบุว่าคืนเงินได้หรือไม่`)
      })
      const remainIdxs = v.stages.map((s, i) => s.calcType === 'REMAINING_BALANCE' ? i : -1).filter(i => i >= 0)
      if (remainIdxs.length > 1) errs.push('มีงวด "ชำระยอดคงเหลือ" มากกว่า 1 งวด — ควรมีได้แค่งวดเดียว')
      if (remainIdxs.length === 1 && remainIdxs[0] !== v.stages.length - 1)
        errs.push('งวด "ชำระยอดคงเหลือ" ต้องเป็นงวดสุดท้าย')
      const ttl = v.ttlRule
      if (ttl.calcType === 'TRAVEL_MINUS_DAYS' && !ttl.daysBefore)
        errs.push('NAME DL: กรุณาระบุจำนวนวัน')
      if (ttl.calcType === 'MANUAL_DATE' && !ttl.fixedDate)
        errs.push('NAME DL: กรุณาระบุวันที่กำหนดส่งชื่อ')
      if (v.issuanceMode === 'SEPARATE') {
        const tkDl = v.ticketDlRule
        if (tkDl.calcType === 'TRAVEL_MINUS_DAYS' && !tkDl.daysBefore)
          errs.push('TICKET DL: กรุณาระบุจำนวนวัน')
        if (tkDl.calcType === 'MANUAL_DATE' && !tkDl.fixedDate)
          errs.push('TICKET DL: กรุณาระบุวันที่กำหนดออกตั๋ว')
        // Cross-validate ordering: NAME DL must come before TICKET DL
        if (ttl.calcType === 'TRAVEL_MINUS_DAYS' && tkDl.calcType === 'TRAVEL_MINUS_DAYS') {
          // Larger daysBefore = earlier date. TICKET DL (tkDl) must NOT be earlier (larger) than NAME DL
          if (tkDl.daysBefore > ttl.daysBefore)
            errs.push('กำหนดออกตั๋วต้องไม่เร็วกว่ากำหนดส่งชื่อ')
        }
      }
      return errs
    }
    case 'baggage': {
      const errs: string[] = []
      const bp = migrateBaggagePolicy(v.baggagePolicy)
      if (bp.checkedBagStatus === 'INCLUDED') {
        if (bp.checkedMode === 'SAME_WEIGHT_PER_PIECE') {
          if (!bp.pieceCount || bp.pieceCount <= 0) errs.push('สัมภาระโหลด: กรุณาระบุจำนวนใบ')
          if (bp.weightPerPiece === null)            errs.push('สัมภาระโหลด: กรุณาระบุน้ำหนักต่อใบ')
        }
        if (bp.checkedMode === 'TOTAL_WEIGHT' && (!bp.totalWeight || bp.totalWeight <= 0))
          errs.push('สัมภาระโหลด: กรุณาระบุน้ำหนักรวม')
        if (bp.checkedMode === 'CUSTOM_PER_PIECE' && !bp.checkedPieceList.length)
          errs.push('สัมภาระโหลด: กรุณาเพิ่มอย่างน้อย 1 ใบ')
        if (bp.checkedMode === 'TEXT_ONLY' && !bp.checkedText.trim())
          errs.push('สัมภาระโหลด: กรุณาระบุรายละเอียดสัมภาระ')
      }
      if (bp.carryOnStatus === 'INCLUDED') {
        if (bp.carryOnMode === 'SAME_WEIGHT_PER_PIECE') {
          if (!bp.carryOnPieces || bp.carryOnPieces <= 0) errs.push('Carry-on: กรุณาระบุจำนวนใบ')
          if (bp.carryOnWeight === null)                   errs.push('Carry-on: กรุณาระบุน้ำหนักต่อใบ')
        }
        if (bp.carryOnMode === 'TOTAL_WEIGHT' && (!bp.carryOnTotalWeight || bp.carryOnTotalWeight <= 0))
          errs.push('Carry-on: กรุณาระบุน้ำหนักรวม')
        if (bp.carryOnMode === 'CUSTOM_PER_PIECE' && !bp.carryOnPieceList.length)
          errs.push('Carry-on: กรุณาเพิ่มอย่างน้อย 1 ใบ')
        if (bp.carryOnMode === 'TEXT_ONLY' && !bp.carryOnText.trim())
          errs.push('Carry-on: กรุณาระบุรายละเอียดสัมภาระ')
      }
      return errs
    }
    case 'reduce': {
      const errs: string[] = []
      const sp = migrateSeatReductionPolicy(v.seatReductionPolicy)
      if (!sp.enabled) return errs
      if (sp.mode === 'SINGLE') {
        const spCt = sp.calcType
        if (spCt == null || spCt === 'UNLIMITED') {
          errs.push('กรุณาเลือกวิธีระบุจำนวนที่ลดได้ (เปอร์เซ็นต์หรือจำนวน Seat)')
        } else if (spCt === 'PERCENT') {
          if (sp.maxReducePercent == null || sp.maxReducePercent < 0 || sp.maxReducePercent > 100)
            errs.push('ลดได้สูงสุด (%) ต้องอยู่ระหว่าง 0–100')
          if (!sp.scope)
            errs.push('กรุณาเลือกขอบเขต (ต่อ PNR หรือต่อ Series)')
        } else if (spCt === 'SEAT_COUNT') {
          if (sp.maxReduceSeat == null || sp.maxReduceSeat < 0 || !Number.isInteger(sp.maxReduceSeat))
            errs.push('จำนวน Seat ต้องเป็นจำนวนเต็มที่ไม่ติดลบ')
          if (!sp.scope)
            errs.push('กรุณาเลือกขอบเขต (ต่อ PNR หรือต่อ Series)')
        }
        if (sp.noticeDays != null && sp.noticeDays < 0)
          errs.push('แจ้งลดไม่น้อยกว่า ต้องมากกว่าหรือเท่ากับ 0')
        if (sp.singleOverLimitAction === 'FORFEIT' && !sp.singleForfeitSource)
          errs.push('กรุณาเลือกว่ายึดเงินจากส่วนใด')
        if (sp.singleOverLimitAction === 'PENALTY') {
          if (sp.singlePenaltyType === 'NONE')
            errs.push('กรุณาเลือกประเภทค่าปรับ')
          if (sp.singlePenaltyType === 'FIXED' && (sp.singlePenaltyAmount == null || sp.singlePenaltyAmount < 0))
            errs.push('กรุณาระบุจำนวนเงินค่าปรับ')
          if (sp.singlePenaltyType === 'PERCENT' && (sp.singlePenaltyPercent == null || sp.singlePenaltyPercent <= 0))
            errs.push('กรุณาระบุเปอร์เซ็นต์ค่าปรับ')
        }
      } else {
        if (sp.rules.length === 0) errs.push('กรุณาเพิ่ม Step อย่างน้อย 1 รายการ')
        sp.rules.forEach((r, i) => {
          const n = i + 1
          if (r.rangeType === 'FROM_DAY_UP' && r.fromDays === null)
            errs.push(`Step ${n}: กรุณาระบุจำนวนวัน`)
          if (r.rangeType === 'UNTIL_DAY' && r.toDays === null)
            errs.push(`Step ${n}: กรุณาระบุจำนวนวัน`)
          if (r.rangeType === 'BETWEEN') {
            if (r.fromDays === null || r.toDays === null)
              errs.push(`Step ${n}: กรุณาระบุช่วงวัน`)
            else if (r.fromDays <= r.toDays)
              errs.push(`Step ${n}: วัน "ตั้งแต่" ต้องมากกว่าวัน "ถึง"`)
          }
          const rCt = r.calcType ?? 'PERCENT'
          if (rCt === 'PERCENT' && r.maxReducePercent != null && (r.maxReducePercent < 0 || r.maxReducePercent > 100))
            errs.push(`Step ${n}: ลดได้สูงสุด (%) ต้องอยู่ระหว่าง 0–100`)
          if (rCt === 'SEAT_COUNT' && r.maxReduceSeat != null && (r.maxReduceSeat < 0 || !Number.isInteger(r.maxReduceSeat)))
            errs.push(`Step ${n}: จำนวน Seat ต้องเป็นจำนวนเต็มที่ไม่ติดลบ`)
          if (r.ruleOverLimitAction === 'FORFEIT' && !r.forfeitSource)
            errs.push(`Step ${n}: กรุณาเลือกว่ายึดเงินจากส่วนใด`)
          if (r.ruleOverLimitAction === 'PENALTY') {
            if (r.penaltyType === 'FIXED'   && (r.penaltyAmount  == null || r.penaltyAmount  < 0))
              errs.push(`Step ${n}: กรุณาระบุจำนวนเงินค่าปรับ`)
            if (r.penaltyType === 'PERCENT' && (r.penaltyPercent == null || r.penaltyPercent <= 0))
              errs.push(`Step ${n}: กรุณาระบุเปอร์เซ็นต์ค่าปรับ`)
          }
        })
        const getRangeBounds = (r: CondSeatReductionRule) => {
          if (r.rangeType === 'FROM_DAY_UP') return { lo: r.fromDays ?? 0, hi: Infinity }
          if (r.rangeType === 'UNTIL_DAY')   return { lo: 0, hi: r.toDays ?? Infinity }
          return { lo: r.toDays ?? 0, hi: r.fromDays ?? Infinity }
        }
        for (let i = 0; i < sp.rules.length; i++) {
          for (let j = i + 1; j < sp.rules.length; j++) {
            const { lo: aLo, hi: aHi } = getRangeBounds(sp.rules[i])
            const { lo: bLo, hi: bHi } = getRangeBounds(sp.rules[j])
            if (aLo <= bHi && bLo <= aHi)
              errs.push(`Step ${i + 1} และ Step ${j + 1} มีช่วงวันที่ทับซ้อนกัน`)
          }
        }
      }
      return errs
    }
    case 'cancel': {
      const errs: string[] = []
      const cg = v.cancelGroupTerms ?? defaultCancelGroupTerms()
      if (cg.enabled) {
        if (!cg.cancelType) {
          errs.push('กรุณาเลือกประเภทเงื่อนไขการยกเลิก')
        } else if (cg.cancelType === 'STEP') {
          const steps = cg.stepCancels ?? []
          if (steps.length === 0) errs.push('กรุณาเพิ่มอย่างน้อย 1 เงื่อนไข Step')
          steps.forEach((s, i) => {
            if (s.result === 'UNSPECIFIED') {
              errs.push(`เงื่อนไข Step ${i + 1}: กรุณาเลือกผลเมื่อยกเลิก`)
            } else if (s.result === 'PARTIAL_REFUND') {
              if (!s.partialRefund?.calcType) errs.push(`เงื่อนไข Step ${i + 1}: กรุณาเลือกวิธีคำนวณเงินคืน`)
              if (s.partialRefund?.calcType === 'FIXED' && (s.partialRefund?.amount == null || s.partialRefund.amount < 0)) errs.push(`เงื่อนไข Step ${i + 1}: กรุณาระบุจำนวนเงินที่คืน`)
              if (s.partialRefund?.calcType === 'PERCENT' && (!s.partialRefund?.percent || s.partialRefund.percent <= 0)) errs.push(`เงื่อนไข Step ${i + 1}: กรุณาระบุเปอร์เซ็นต์ที่คืน`)
            } else if (s.result === 'PENALTY') {
              if (!s.penalty?.basis) errs.push(`เงื่อนไข Step ${i + 1}: กรุณาเลือกคิดค่าปรับต่อ`)
              if (!s.penalty?.calcType) errs.push(`เงื่อนไข Step ${i + 1}: กรุณาเลือกวิธีคิดค่าปรับ`)
              if (s.penalty?.calcType === 'FIXED' && (s.penalty?.fixedAmount == null || s.penalty.fixedAmount < 0)) errs.push(`เงื่อนไข Step ${i + 1}: กรุณาระบุจำนวนค่าปรับ`)
              if (s.penalty?.calcType === 'PERCENT' && (!s.penalty?.percent || s.penalty.percent <= 0)) errs.push(`เงื่อนไข Step ${i + 1}: กรุณาระบุเปอร์เซ็นต์ค่าปรับ`)
            }
          })
        } else if (cg.cancelType === 'PAYMENT_STAGE') {
          const stages = v.stages.filter(s => !!s.paymentType)
          if (stages.length === 0) errs.push('กรุณาตั้งค่างวดชำระเงินใน Tab เงื่อนไขงวดชำระเงินก่อน')
          const entries = cg.paymentCancels ?? []
          const allIds = ['BEFORE_PAYMENT', ...stages.map(s => s.stageId)]
          allIds.forEach(id => {
            const e = entries.find(x => x.stageId === id)
            const label = id === 'BEFORE_PAYMENT' ? 'ก่อนชำระเงิน' : stages.find(s => s.stageId === id)?.customPaymentName || id
            if (!e || e.result === 'UNSPECIFIED') {
              errs.push(`${label}: กรุณาเลือกผลการยกเลิก`)
            } else if (e.result === 'PARTIAL_REFUND') {
              if (!e.partialRefund?.calcType) errs.push(`${label}: กรุณาเลือกวิธีคำนวณเงินคืน`)
              if (e.partialRefund?.calcType === 'FIXED' && (e.partialRefund?.amount == null || e.partialRefund.amount < 0)) errs.push(`${label}: กรุณาระบุจำนวนเงินที่คืน`)
              if (e.partialRefund?.calcType === 'PERCENT' && (!e.partialRefund?.percent || e.partialRefund.percent <= 0)) errs.push(`${label}: กรุณาระบุเปอร์เซ็นต์ที่คืน`)
            } else if (e.result === 'PENALTY') {
              if (!e.penalty?.basis) errs.push(`${label}: กรุณาเลือกคิดค่าปรับต่อ`)
              if (!e.penalty?.calcType) errs.push(`${label}: กรุณาเลือกวิธีคิดค่าปรับ`)
            }
          })
        } else if (cg.cancelType === 'PENALTY') {
          const p = cg.cancelPenalty
          if (!p?.basis) errs.push('กรุณาเลือกคิดค่าปรับต่อ')
          if (!p?.calcType) errs.push('กรุณาเลือกวิธีคิดค่าปรับ')
          if (p?.calcType === 'FIXED' && (p.fixedAmount == null || p.fixedAmount < 0)) errs.push('กรุณาระบุจำนวนเงินค่าปรับ')
          if (p?.calcType === 'PERCENT') {
            if (!p.percent || p.percent <= 0) errs.push('กรุณาระบุเปอร์เซ็นต์ค่าปรับ')
            if (!p.percentBase) errs.push('กรุณาเลือกฐานคำนวณ')
          }
          if (!p?.refund) errs.push('กรุณาเลือกการคืนเงินส่วนที่เหลือ')
        }
      }
      return errs
    }
    case 'change': {
      const errs: string[] = []
      const ct = v.changeTerms ?? defaultChangeTerms()
      if (ct.enabled) {
        const nc = ct.nameChange
        if (nc.feeType === 'FIXED' && (nc.feeAmount == null || nc.feeAmount < 0))
          errs.push('กรุณาระบุจำนวนเงินค่าธรรมเนียมการเปลี่ยนชื่อ')
        if (nc.feeType === 'PERCENT' && (nc.feePercent == null || nc.feePercent <= 0))
          errs.push('กรุณาระบุเปอร์เซ็นต์ค่าธรรมเนียมการเปลี่ยนชื่อ')
      }
      return errs
    }
    case 'refund': {
      const errs: string[] = []
      const rt = migrateRefundTerms(v.refundTerms)
      if (!rt.enabled) return errs
      const post = rt.postTicket
      if (post.enabled && post.refundMainPolicy !== 'UNSPECIFIED') {
        if (post.refundMainPolicy === 'PARTIAL_REFUND' && post.refundableItems.length === 0)
          errs.push('กรุณาเลือกอย่างน้อย 1 รายการที่ Refund ได้')
        const overlap = post.refundableItems.filter(x => post.nonRefundableItems.includes(x))
        if (overlap.length > 0)
          errs.push('รายการ Refund ซ้ำกัน กรุณาเลือกแต่ละรายการให้อยู่ฝั่งใดฝั่งหนึ่งเท่านั้น')
        if (post.refundFeeType === 'FIX' && (post.refundFeeAmount == null || post.refundFeeAmount < 0))
          errs.push('กรุณาระบุจำนวนเงินค่าธรรมเนียม Refund')
        if (post.refundFeeType === 'PERCENT' && (post.refundFeePercent == null || post.refundFeePercent <= 0))
          errs.push('กรุณาระบุเปอร์เซ็นต์ค่าธรรมเนียม Refund')
        if (post.penaltyMode === 'STEP_RULE') {
          if (post.penaltyStepRules.length === 0)
            errs.push('กรุณาเพิ่ม Step อย่างน้อย 1 รายการ')
          post.penaltyStepRules.forEach((r, i) => {
            if (r.penaltyValue == null || r.penaltyValue < 0)
              errs.push(`Step ${i + 1}: กรุณาระบุค่าปรับ`)
          })
        }
      }
      if (rt.preTicket.enabled) {
        rt.preTicket.moneyTypeRules.forEach(() => { /* kept for backward compat */ })
        rt.preTicket.rules.forEach((r, i) => {
          if (r.fromDays !== null && r.toDays !== null && r.fromDays <= r.toDays)
            errs.push(`Step ${i + 1}: "จาก" ต้องมากกว่า "ถึง"`)
        })
        for (let i = 0; i < rt.preTicket.rules.length; i++) {
          for (let j = i + 1; j < rt.preTicket.rules.length; j++) {
            const a = rt.preTicket.rules[i], b = rt.preTicket.rules[j]
            const shared = a.appliesToMoneyTypes.some(t => b.appliesToMoneyTypes.includes(t))
            if (!shared) continue
            const aLo = a.toDays ?? 0, aHi = a.fromDays ?? Infinity
            const bLo = b.toDays ?? 0, bHi = b.fromDays ?? Infinity
            if (aLo <= bHi && bLo <= aHi)
              errs.push(`Step ${i + 1} และ Step ${j + 1} มีช่วงวันซ้อนกันในประเภทเงินเดียวกัน`)
          }
        }
      }
      if (rt.utilization.enabled) {
        const pct = rt.utilization.requiredPercent
        if (pct == null || pct <= 0)
          errs.push('ใช้ที่นั่งขั้นต่ำ: กรุณาระบุเปอร์เซ็นต์การใช้ที่นั่งขั้นต่ำ (มากกว่า 0)')
        else if (pct > 100)
          errs.push('ใช้ที่นั่งขั้นต่ำ: เปอร์เซ็นต์การใช้ที่นั่งขั้นต่ำต้องไม่เกิน 100')
        if (rt.utilization.calcBase === 'LATEST_SEAT' && rt.utilization.measureBy === 'CURRENT_TICKET')
          errs.push('ใช้ที่นั่งขั้นต่ำ: ฐานคำนวณและจำนวนที่ใช้ตรวจสอบไม่ควรเป็นค่าเดียวกัน เพราะจะทำให้เงื่อนไขไม่มีผล')
        if (rt.utilization.exceedAction === 'PENALTY') {
          if (rt.utilization.penaltyType === 'AMOUNT_PER_MISSING') {
            if (rt.utilization.penaltyAmount == null || rt.utilization.penaltyAmount <= 0)
              errs.push('ใช้ที่นั่งขั้นต่ำ: กรุณาระบุจำนวนเงินค่าปรับ (มากกว่า 0)')
          } else if (rt.utilization.penaltyType === 'PERCENT_GROUP' || rt.utilization.penaltyType === 'PERCENT_DEPOSIT') {
            if (rt.utilization.penaltyPercent == null || rt.utilization.penaltyPercent <= 0)
              errs.push('ใช้ที่นั่งขั้นต่ำ: กรุณาระบุเปอร์เซ็นต์ค่าปรับ (มากกว่า 0)')
            else if (rt.utilization.penaltyPercent > 100)
              errs.push('ใช้ที่นั่งขั้นต่ำ: เปอร์เซ็นต์ค่าปรับต้องไม่เกิน 100')
          }
        }
      }
      return errs
    }
    case 'extra':
      return []
    default:
      return []
  }
}

/** Validate all tabs — returns only tabs that have actual errors. */
export function validateCondition(v: AppCondition, conditionMode: ConditionMode = 'template', templateInfo?: TemplateInfo): Partial<Record<TabKey, string[]>> {
  const result: Partial<Record<TabKey, string[]>> = {}
  for (const tab of TABS) {
    const errs = validateTab(tab.key, v, conditionMode, templateInfo)
    if (errs.length > 0) result[tab.key] = errs
  }
  return result
}

// ─── Per-tab status ───────────────────────────────────────────────────────────

export function getTabStatus(key: TabKey, v: AppCondition, errs: string[] = [], conditionMode: ConditionMode = 'template', seriesInfo?: SeriesInfo, templateInfo?: TemplateInfo): TabStatus {
  if (errs.length > 0) return 'error'
  switch (key) {
    case 'basic': {
      const effAirline  = conditionMode === 'series'
        ? (seriesInfo?.airlineCode ?? v.airline)
        : (templateInfo?.airlineCode || v.airline)
      const effCurrency = conditionMode === 'series'
        ? (seriesInfo?.currency ?? v.currency)
        : (templateInfo?.currency || v.currency)
      const inTemplateMode = conditionMode === 'template' && !!templateInfo
      // In template mode, conditionCode is auto-generated (not user-entered),
      // and airline comes from templateInfo externally — only conditionName is user-fillable
      const hasAny = inTemplateMode
        ? (v.conditionName || v.description)
        : (v.conditionCode || v.conditionName || effAirline || v.description)
      if (!hasAny) return 'empty'
      // Required: name + currency + airline (conditionCode NOT required in template mode)
      const airlineOk = inTemplateMode ? !!templateInfo!.airlineCode : !!effAirline.trim()
      const required = v.conditionName.trim() && effCurrency.trim() && airlineOk
        && (conditionMode === 'series' ? !!v.conditionCode.trim() : true)
      return required ? 'complete' : 'incomplete'
    }
    case 'payment': {
      const hasStages = v.stages.length > 0
      const hasTtl    = true
      if (!hasStages && !hasTtl) return 'empty'
      const hasInvalid = v.stages.some(s =>
        !s.paymentType
        || (isAmountCalc(s.calcType) && s.amount < 0)
        || (isPercentCalc(s.calcType) && (s.percent <= 0 || s.percent > 100))
        || (s.dueType === 'CUSTOM_DATE' && !s.dueDate)
        || (DAY_BASED_DUE_TYPES.includes(s.dueType) && !s.dueDays && s.paymentType !== 'TICKET_ISSUE_DATE')
        || s.refundable === 'UNSPECIFIED'
      )
      const ttlIncomplete = (v.ttlRule.calcType === 'TRAVEL_MINUS_DAYS' && !v.ttlRule.daysBefore)
        || (v.ttlRule.calcType === 'MANUAL_DATE' && !v.ttlRule.fixedDate)
      if (hasInvalid || ttlIncomplete) return 'incomplete'
      return 'complete'
    }
    case 'baggage': {
      const bp = migrateBaggagePolicy(v.baggagePolicy)
      const allUnset =
        bp.checkedBagStatus === 'UNSPECIFIED' &&
        bp.carryOnStatus === 'UNSPECIFIED' &&
        !bp.remark.trim()
      if (allUnset) return 'empty'
      if (bp.checkedBagStatus === 'INCLUDED') {
        if (bp.checkedMode === 'SAME_WEIGHT_PER_PIECE' && (!bp.pieceCount || !bp.weightPerPiece)) return 'incomplete'
        if (bp.checkedMode === 'TOTAL_WEIGHT' && !bp.totalWeight) return 'incomplete'
        if (bp.checkedMode === 'CUSTOM_PER_PIECE' && !bp.checkedPieceList.length) return 'incomplete'
        if (bp.checkedMode === 'TEXT_ONLY' && !bp.checkedText.trim()) return 'incomplete'
      }
      if (bp.carryOnStatus === 'INCLUDED') {
        if (bp.carryOnMode === 'SAME_WEIGHT_PER_PIECE' && (!bp.carryOnPieces || !bp.carryOnWeight)) return 'incomplete'
        if (bp.carryOnMode === 'TOTAL_WEIGHT' && !bp.carryOnTotalWeight) return 'incomplete'
        if (bp.carryOnMode === 'CUSTOM_PER_PIECE' && !bp.carryOnPieceList.length) return 'incomplete'
        if (bp.carryOnMode === 'TEXT_ONLY' && !bp.carryOnText.trim()) return 'incomplete'
      }
      return 'complete'
    }
    case 'reduce': {
      const sp = migrateSeatReductionPolicy(v.seatReductionPolicy)
      if (!sp.enabled) return 'empty'
      if (sp.mode === 'SINGLE') {
        if (sp.singleOverLimitAction === 'FORFEIT' && !sp.singleForfeitSource) return 'incomplete'
        if (sp.singleOverLimitAction === 'PENALTY') {
          if (sp.singlePenaltyType === 'NONE') return 'incomplete'
          if (sp.singlePenaltyType === 'FIXED'   && (sp.singlePenaltyAmount  == null || sp.singlePenaltyAmount  < 0)) return 'incomplete'
          if (sp.singlePenaltyType === 'PERCENT' && (sp.singlePenaltyPercent == null || sp.singlePenaltyPercent <= 0)) return 'incomplete'
        }
      }
      if (sp.mode === 'STEP_RULE') {
        if (sp.rules.length === 0) return 'incomplete'
        if (sp.rules.some(r =>
          (r.ruleOverLimitAction === 'FORFEIT' && !r.forfeitSource) ||
          (r.ruleOverLimitAction === 'PENALTY' && (
            (r.penaltyType === 'FIXED'   && (r.penaltyAmount  == null || r.penaltyAmount  < 0)) ||
            (r.penaltyType === 'PERCENT' && (r.penaltyPercent == null || r.penaltyPercent <= 0))
          ))
        )) return 'incomplete'
      }
      return 'complete'
    }
    case 'cancel': {
      const cg = v.cancelGroupTerms ?? defaultCancelGroupTerms()
      if (!cg.enabled) return 'empty'
      if (!cg.cancelType) return 'incomplete'
      if (cg.cancelType === 'STEP') {
        const steps = cg.stepCancels ?? []
        if (steps.length === 0) return 'incomplete'
        const stepIncomplete = steps.some(s => {
          if (s.result === 'UNSPECIFIED') return true
          if (s.result === 'PARTIAL_REFUND' && !s.partialRefund?.calcType) return true
          if (s.result === 'PENALTY' && (!s.penalty?.basis || !s.penalty?.calcType)) return true
          return false
        })
        if (stepIncomplete) return 'incomplete'
        return 'complete'
      }
      if (cg.cancelType === 'PAYMENT_STAGE') {
        const stages = v.stages.filter(s => !!s.paymentType)
        const allIds = ['BEFORE_PAYMENT', ...stages.map(s => s.stageId)]
        const entries = cg.paymentCancels ?? []
        const paymentIncomplete = allIds.some(id => {
          const e = entries.find(x => x.stageId === id)
          if (!e || e.result === 'UNSPECIFIED') return true
          if (e.result === 'PARTIAL_REFUND' && !e.partialRefund?.calcType) return true
          if (e.result === 'PENALTY' && (!e.penalty?.basis || !e.penalty?.calcType)) return true
          return false
        })
        if (paymentIncomplete) return 'incomplete'
        return 'complete'
      }
      if (cg.cancelType === 'PENALTY') {
        const p = cg.cancelPenalty
        if (!p?.basis || !p?.calcType || !p?.refund) return 'incomplete'
        if (p.calcType === 'FIXED' && (p.fixedAmount == null || p.fixedAmount < 0)) return 'incomplete'
        if (p.calcType === 'PERCENT' && (!p.percent || !p.percentBase)) return 'incomplete'
        return 'complete'
      }
      return 'incomplete'
    }
    case 'change': {
      const ct = v.changeTerms ?? defaultChangeTerms()
      if (!ct.enabled) return 'empty'
      const nc = ct.nameChange
      if (nc.feeType === 'FIXED' && (nc.feeAmount == null || nc.feeAmount < 0)) return 'incomplete'
      if (nc.feeType === 'PERCENT' && (nc.feePercent == null || nc.feePercent <= 0)) return 'incomplete'
      return 'complete'
    }
    case 'refund': {
      const rt = migrateRefundTerms(v.refundTerms)
      if (!rt.enabled) return 'empty'
      const post = rt.postTicket
      if (post.enabled) {
        if (post.refundMainPolicy === 'UNSPECIFIED') return 'incomplete'
        if (post.refundMainPolicy === 'PARTIAL_REFUND' && post.refundableItems.length === 0) return 'incomplete'
        if (post.penaltyMode === 'STEP_RULE' && post.penaltyStepRules.length === 0) return 'incomplete'
      }
      const util = rt.utilization
      if (util.enabled) {
        if (util.requiredPercent == null) return 'incomplete'
        if (util.exceedAction === 'PENALTY') {
          if (util.penaltyType === 'AMOUNT_PER_MISSING' && util.penaltyAmount == null) return 'incomplete'
          if ((util.penaltyType === 'PERCENT_GROUP' || util.penaltyType === 'PERCENT_DEPOSIT') && util.penaltyPercent == null) return 'incomplete'
        }
      }
      if (!post.enabled && !util.enabled) return 'incomplete'
      return 'complete'
    }
    case 'extra':
      return v.freeTextCondition.trim() || v.freeTextHtml.trim() ? 'complete' : 'empty'
    default:
      return 'empty'
  }
}

// ─── Per-tab summary text ─────────────────────────────────────────────────────

export function getTabSummary(key: TabKey, v: AppCondition, currency = 'THB', conditionMode: ConditionMode = 'template', seriesInfo?: SeriesInfo, templateInfo?: TemplateInfo): string {
  switch (key) {
    case 'basic': {
      const effAirline  = conditionMode === 'series'
        ? (seriesInfo?.airlineCode ?? v.airline)
        : (templateInfo?.airlineCode || v.airline)
      const effCurrency = conditionMode === 'series'
        ? (seriesInfo?.currency ?? v.currency)
        : (templateInfo?.currency || v.currency)
      const inTemplateMode = conditionMode === 'template' && !!templateInfo
      if (!v.conditionCode && !v.conditionName && !effAirline && !inTemplateMode) return 'ยังไม่ระบุ'
      const airline = effAirline ? getAirlineName(effAirline)
        : inTemplateMode ? 'ยังไม่ได้เลือก'
        : 'ยังไม่เลือก'
      const code = inTemplateMode ? (v.conditionCode || 'รอสร้าง') : (v.conditionCode || '—')
      const parts = [
        `รหัส: ${code}`,
        `ชื่อ: ${v.conditionName || 'ยังไม่มีชื่อ'}`,
        `สายการบิน: ${airline}`,
        `สกุลเงิน: ${effCurrency || 'THB'}`,
      ]
      return parts.join(' · ')
    }
    case 'payment': {
      const stageParts = v.stages.map(s =>
        `${autoStageName(s.paymentType, s.customPaymentName, s.stageNo)}: ${formatStageAmount(s, currency)}`
      )
      const ttlPart = v.issuanceMode === 'SEPARATE'
        ? `NAME DL: ${formatTtlRule(v.ttlRule)} · TICKET DL: ${formatTtlRule(v.ticketDlRule)}`
        : `NAME & TICKET DL: ${formatTtlRule(v.ttlRule)}`
      if (stageParts.length === 0) return ttlPart
      return `${v.stages.length} งวด · ${ttlPart}`
    }
    case 'baggage':
      return formatBaggageSummary(migrateBaggagePolicy(v.baggagePolicy))
    case 'reduce':
      return formatSeatReductionSummary(migrateSeatReductionPolicy(v.seatReductionPolicy))
    case 'cancel': {
      const cg = v.cancelGroupTerms ?? defaultCancelGroupTerms()
      if (!cg.enabled) return 'ยกเลิกกรุ๊ป (No Sell): ไม่อนุญาต'
      const noticePart = cg.noticeDays != null ? ` · แจ้งล่วงหน้า ${cg.noticeDays} วัน` : ''
      if (!cg.cancelType) return `ยกเลิกกรุ๊ป (No Sell): อนุญาตตามเงื่อนไข${noticePart}`
      if (cg.cancelType === 'STEP') {
        const n = cg.stepCancels?.length ?? 0
        return `No Sell: ตามช่วงวัน${noticePart} · ${n} เงื่อนไข Step`
      }
      if (cg.cancelType === 'PAYMENT_STAGE') {
        const n = (cg.paymentCancels ?? []).filter(e => e.result !== 'UNSPECIFIED').length
        return `No Sell: ตามงวดชำระเงิน${noticePart} · อ้างอิง ${n} งวด`
      }
      if (cg.cancelType === 'PENALTY') {
        const p = cg.cancelPenalty
        const basisTh: Record<string, string> = { PER_SEAT: 'Seat', PER_PNR: 'PNR', PER_SERIES: 'Series' }
        const b = p?.basis ? basisTh[p.basis] ?? '' : ''
        if (p?.calcType === 'FIXED' && p.fixedAmount != null) return `No Sell: Penalty ${p.fixedAmount.toLocaleString()} ${currency}${b ? ` ต่อ ${b}` : ''}`
        if (p?.calcType === 'PERCENT' && p.percent != null) return `No Sell: Penalty ${p.percent}%${b ? ` ต่อ ${b}` : ''}`
        return `No Sell: Penalty${noticePart}`
      }
      return `ยกเลิกกรุ๊ป (No Sell): อนุญาตตามเงื่อนไข${noticePart}`
    }
    case 'change': {
      const ct = v.changeTerms ?? defaultChangeTerms()
      if (!ct.enabled) return 'ไม่อนุญาตเปลี่ยนชื่อผู้โดยสาร'
      const nc = ct.nameChange
      const parts: string[] = []
      if (nc.noticeDays != null) parts.push(`แจ้งล่วงหน้า ${nc.noticeDays} วัน`)
      if (nc.maxChanges  != null) parts.push(`สูงสุด ${nc.maxChanges} ครั้ง`)
      if (nc.feeType === 'NONE') parts.push('ไม่มีค่าธรรมเนียม')
      else if (nc.feeType === 'FIXED'   && nc.feeAmount  != null) parts.push(`ค่าธรรมเนียม ${nc.feeAmount.toLocaleString()} ${nc.feeCurrency}`)
      else if (nc.feeType === 'PERCENT' && nc.feePercent != null) parts.push(`ค่าธรรมเนียม ${nc.feePercent}%`)
      return 'อนุญาตเปลี่ยนชื่อ' + (parts.length > 0 ? ' · ' + parts.join(' · ') : '')
    }
    case 'refund':
      return formatRefundTermsSummary(migrateRefundTerms(v.refundTerms), currency)
    case 'extra': {
      const plain = v.freeTextCondition.trim()
      if (!plain) return 'เงื่อนไขเพิ่มเติม: ยังไม่มีข้อความ'
      const preview = plain.replace(/\s+/g, ' ').slice(0, 120)
      return `เงื่อนไขเพิ่มเติม: ${preview}${plain.length > 120 ? '…' : ''}`
    }
    default: return ''
  }
}

// ─── Per-tab clear ────────────────────────────────────────────────────────────

export function clearTab(key: TabKey, v: AppCondition, conditionMode: ConditionMode = 'template'): AppCondition {
  switch (key) {
    case 'basic':
      if (conditionMode === 'series') {
        // Keep series-locked fields (airline, currency)
        return {
          ...v,
          conditionCode: '', conditionName: '', description: '', status: 'Active',
          effectiveDate: '', version: 'V1',
        }
      }
      return {
        ...v,
        conditionCode: '', conditionName: '', description: '', status: 'Active',
        airline: '', currency: 'THB', conditionType: 'Custom',
        effectiveDate: '', version: 'V1',
      }
    case 'payment':
      return { ...v, stages: [], ttlRule: defaultTtlRule() }
    case 'baggage':
      return { ...v, baggagePolicy: defaultBaggagePolicy() }
    case 'reduce':
      return { ...v, seatReductionPolicy: defaultSeatReductionPolicy() }
    case 'cancel':
      return { ...v, cancelGroupTerms: defaultCancelGroupTerms() }
    case 'change':
      return { ...v, changeTerms: defaultChangeTerms() }
    case 'refund':
      return { ...v, refundTerms: defaultRefundTerms() }
    case 'extra':
      return { ...v, freeTextCondition: '', freeTextHtml: '', internalNote: '' }
    default:
      return v
  }
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function cn(...cls: (string | false | null | undefined)[]) { return cls.filter(Boolean).join(' ') }

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function FInput({ value, onChange, placeholder, type = 'text', min, max, step, disabled, className }: {
  value: string | number; onChange: (v: string) => void; placeholder?: string
  type?: string; min?: number; max?: number; step?: number | string; disabled?: boolean; className?: string
}) {
  return (
    <input type={type} value={value} min={min} max={max} step={step} disabled={disabled} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={cn(
        'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white',
        'focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f] transition',
        'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
        className,
      )} />
  )
}

function FSelect<T extends string>({ value, onChange, options, disabled, className }: {
  value: T | ''; onChange: (v: T | '') => void
  options: { value: T | ''; label: string }[]
  disabled?: boolean; className?: string
}) {
  return (
    <select value={value} disabled={disabled} onChange={e => onChange(e.target.value as T | '')}
      className={cn(
        'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white',
        'focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f] transition',
        'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
        className,
      )}>
      {options.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function FTextarea({ value, onChange, placeholder, rows = 3, disabled, maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; disabled?: boolean; maxLength?: number
}) {
  return (
    <textarea value={value} rows={rows} disabled={disabled} placeholder={placeholder} maxLength={maxLength}
      onChange={e => onChange(e.target.value)}
      className={cn(
        'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white resize-none',
        'focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f] transition',
        'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
      )} />
  )
}

function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'w-10 h-[22px] rounded-full transition-colors relative flex items-center shrink-0',
        checked ? 'bg-[#05a94f]' : 'bg-slate-200',
        disabled && 'opacity-50 cursor-not-allowed',
      )}>
      <span className={cn('absolute h-4 w-4 rounded-full bg-white shadow transition-all',
        checked ? 'translate-x-[22px]' : 'translate-x-[2px]')} />
    </button>
  )
}

export function ErrorBox({ errors }: { errors: string[] }) {
  if (!errors.length) return null
  return (
    <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2">
      <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {errors.map((e, i) => <p key={i} className="text-xs text-red-700">{e}</p>)}
      </div>
    </div>
  )
}

// ─── TTL Rule Form (shared inside § 2 Payment) ───────────────────────────────

function TtlRuleForm({ label, sublabel, rule, setRule, readOnly }: {
  label: string
  sublabel?: string
  rule: CondTtlRule
  setRule: <K extends keyof CondTtlRule>(k: K, v: CondTtlRule[K]) => void
  readOnly: boolean
}) {
  const needsDays = rule.calcType === 'TRAVEL_MINUS_DAYS'
  const needsDate = rule.calcType === 'MANUAL_DATE'
  return (
    <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-3">
      <div>
        <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">{label}</p>
        {sublabel && <p className="text-[10px] text-slate-400 mt-0.5">{sublabel}</p>}
      </div>
      <div>
        <Label>วิธีคำนวณ</Label>
        <FSelect<CondTtlCalcType>
          value={rule.calcType}
          onChange={v => setRule('calcType', v as CondTtlCalcType)}
          options={[
            { value: 'TRAVEL_MINUS_DAYS' as const, label: 'ก่อนวันเดินทาง N วัน' },
            { value: 'MANUAL_DATE'       as const, label: 'วันที่กำหนดเอง' },
          ]}
          disabled={readOnly}
        />
      </div>
      {needsDays && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>ก่อนเดินทาง (วัน)</Label>
            <FInput type="number" min={0} value={rule.daysBefore || ''} onChange={v => setRule('daysBefore', Number(v))} disabled={readOnly} placeholder="30" />
          </div>
          <div>
            <Label>เวลา Deadline</Label>
            <TimeInput value={rule.time} onChange={v => setRule('time', v)} disabled={readOnly} />
          </div>
        </div>
      )}
      {needsDate && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label required>วันที่กำหนด</Label>
            <FInput type="date" value={rule.fixedDate} onChange={v => setRule('fixedDate', v)} disabled={readOnly} />
          </div>
          <div>
            <Label>เวลา Deadline</Label>
            <TimeInput value={rule.time} onChange={v => setRule('time', v)} disabled={readOnly} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── § 1 Basic Info ───────────────────────────────────────────────────────────

export type ConditionMode = 'template' | 'series'

export interface SeriesInfo {
  seriesCode: string
  seriesName: string
  airlineCode: string
  currency: string
  routes: string[]
  departureDate?: string
}

/** Metadata from a Template's header — airline/currency/ticketType are locked here, not inside the condition. */
export interface TemplateInfo {
  airlineCode: string
  currency: string
  ticketType?: string
}

export function BasicInfoSection({ value, onChange, readOnly, errors = [], conditionMode = 'template', seriesInfo, templateInfo }: {
  value: AppCondition; onChange: (v: AppCondition) => void; readOnly: boolean; errors?: string[]
  conditionMode?: ConditionMode; seriesInfo?: SeriesInfo; templateInfo?: TemplateInfo
}) {
  const set = <K extends keyof AppCondition>(k: K, v: AppCondition[K]) => onChange({ ...value, [k]: v })
  const hasErr = (fields: (keyof AppCondition)[]) =>
    errors.length > 0 && fields.some(f => {
      const v = value[f]
      return typeof v === 'string' ? !v.trim() : (Array.isArray(v) ? v.length === 0 : !v)
    })

  const isSeries = conditionMode === 'series'
  // hasTemplateInfo: true whenever we're editing inside a template — airline/currency come from template header
  const hasTemplateInfo = !isSeries && conditionMode === 'template' && !!templateInfo
  const airlineObj = seriesInfo
    ? MASTER_AIRLINES.find(a => a.code === seriesInfo.airlineCode)
    : (templateInfo?.airlineCode || value.airline)
      ? MASTER_AIRLINES.find(a => a.code === (templateInfo?.airlineCode || value.airline))
      : undefined

  return (
    <div className="space-y-6">
      <ErrorBox errors={errors} />

      {/* ── Template mode: locked info from template header ── */}
      {hasTemplateInfo && templateInfo && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100 border-b border-emerald-200">
            <Lock size={13} className="text-emerald-600 shrink-0" />
            <span className="text-xs font-semibold text-emerald-800">ข้อมูลดึงจาก Template Header — แก้ไขได้ที่ข้อมูล Template ด้านบน</span>
          </div>
          <div className="px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
            <div>
              <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide mb-0.5">Airline</p>
              {templateInfo.airlineCode ? (
                <p className="text-sm font-semibold text-emerald-900">
                  {airlineObj ? `${airlineObj.code} — ${airlineObj.name}` : templateInfo.airlineCode}
                </p>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-amber-600">ยังไม่ได้เลือกสายการบิน</p>
                  <p className="text-xs text-amber-500 mt-0.5">กรุณากลับไปเลือกสายการบินจากข้อมูล Template ด้านบน</p>
                </div>
              )}
            </div>
            <div>
              <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide mb-0.5">Currency</p>
              <p className="text-sm font-semibold text-emerald-900">{templateInfo.currency || 'THB'}</p>
            </div>
            {templateInfo.ticketType && templateInfo.ticketType !== 'All' && (
              <div>
                <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide mb-0.5">ประเภทตั๋ว</p>
                <p className="text-sm font-semibold text-emerald-900">{templateInfo.ticketType}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Series mode: locked info panel ── */}
      {isSeries && seriesInfo && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-100 border-b border-blue-200">
            <Lock size={13} className="text-blue-600 shrink-0" />
            <span className="text-xs font-semibold text-blue-800">ข้อมูลดึงจาก Series โดยอัตโนมัติ — ไม่สามารถแก้ไขได้</span>
          </div>
          <div className="px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-wide mb-1">Series Code</p>
              <p className="text-sm font-mono font-bold text-blue-900">{seriesInfo.seriesCode || '—'}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-wide mb-1">Series Name</p>
              <p className="text-sm font-semibold text-blue-900">{seriesInfo.seriesName || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-wide mb-1">Currency</p>
              <p className="text-sm font-semibold text-blue-900">{seriesInfo.currency || 'THB'}</p>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-wide mb-1">Airline</p>
              <p className="text-sm font-semibold text-blue-900">
                {airlineObj ? `${airlineObj.code} — ${airlineObj.name}` : seriesInfo.airlineCode || '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Row 1: Code — always read-only (system-generated) */}
      <div>
        <Label>รหัส Condition</Label>
        <div className="flex items-center gap-2 h-9 px-3 rounded-xl border border-slate-200 bg-slate-50">
          {isSeries ? (
            <>
              <Lock size={12} className="text-slate-400 shrink-0" />
              <span className="font-mono text-sm text-slate-700 select-all">{value.conditionCode || '—'}</span>
            </>
          ) : value.conditionCode ? (
            <>
              <span className="font-mono text-sm font-semibold text-slate-800 select-all flex-1">{value.conditionCode}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(value.conditionCode)}
                className="shrink-0 text-slate-400 hover:text-slate-600 transition"
                title="คัดลอกรหัส"
              >
                <Copy size={13} />
              </button>
            </>
          ) : (
            <span className="text-xs text-slate-400 italic">ระบบจะสร้างรหัสหลังเลือกสายการบิน</span>
          )}
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          {isSeries
            ? 'รหัสสร้างอัตโนมัติจาก Series — ไม่สามารถแก้ไขได้'
            : value.conditionCode
              ? 'รหัสตัวอย่าง — รหัสจริงจะยืนยันและล็อกเมื่อบันทึก'
              : 'รหัส Condition จะสร้างอัตโนมัติ (COND-{สายการบิน}-NNNN) หลังเลือกสายการบิน'
          }
        </p>
      </div>

      {/* Row 2: Name (full width) */}
      <div>
        <Label required>ชื่อ Condition</Label>
        <FInput
          value={value.conditionName}
          onChange={v => set('conditionName', v)}
          placeholder="เช่น เงื่อนไขกรุ๊ป TG 3 งวด ตั้งแต่ ก.ย. 2026"
          disabled={readOnly}
          className={hasErr(['conditionName']) ? 'border-red-300 focus:border-red-400' : ''}
        />
      </div>

      {/* Row 3: Description (full width) */}
      <div>
        <Label>คำอธิบาย / หมายเหตุ</Label>
        <FTextarea
          value={value.description}
          onChange={v => set('description', v)}
          placeholder="รายละเอียดเพิ่มเติม เช่น ใช้กับ Series TG กรุงเทพ-โตเกียว เปิดขาย ก.ค.-ก.ย. 2026..."
          rows={4}
          disabled={readOnly}
        />
      </div>

      {/* Template mode: Airline · Currency — hidden when templateInfo provides these values */}
      {!isSeries && !hasTemplateInfo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>Airline</Label>
            <AirlineCombobox value={value.airline} onChange={v => set('airline', v)} disabled={readOnly} showAllOption={false} />
            {hasErr(['airline']) && <p className="text-[10px] text-red-500 mt-1">กรุณาเลือก Airline</p>}
          </div>
          <div>
            <Label required>Currency</Label>
            <CurrencyCombobox
              value={value.currency}
              onChange={v => set('currency', v)}
              disabled={readOnly}
              error={hasErr(['currency']) ? 'กรุณาเลือกสกุลเงิน' : undefined}
            />
          </div>
        </div>
      )}

    </div>
  )
}

// ─── § 2 Payment — helpers ───────────────────────────────────────────────────

const PT_COLOR: Record<string, string> = {
  RSVN_FEE:          'bg-purple-100 text-purple-700',
  DEPOSIT:           'bg-blue-100 text-blue-700',
  BALANCE:           'bg-emerald-100 text-emerald-700',
  FULL_PAYMENT:      'bg-green-100 text-green-700',
  TICKET_ISSUE_DATE: 'bg-orange-100 text-orange-700',
  FEE:               'bg-amber-100 text-amber-700',
  OTHER:             'bg-slate-100 text-slate-600',
  '':                'bg-red-100 text-red-500',
}

type PaymentDefaults = Partial<Pick<CondStage, 'calcType' | 'quantityBasis' | 'creditTowardFare' | 'refundable' | 'nonRefundable' | 'dueType' | 'dueDays'>>

const PAYMENT_TYPE_DEFAULTS: Record<CondPaymentType, PaymentDefaults> = {
  RSVN_FEE:          { calcType: 'PER_SEAT',        quantityBasis: 'INITIAL_SEAT',   creditTowardFare: false, refundable: 'NON_REFUNDABLE', nonRefundable: true  },
  DEPOSIT:           { calcType: 'PER_SEAT',        quantityBasis: 'REMAINING_SEAT', creditTowardFare: true,  refundable: 'UNSPECIFIED',     nonRefundable: false },
  BALANCE:           { calcType: 'PER_SEAT',        quantityBasis: 'REMAINING_SEAT', creditTowardFare: true,  refundable: 'UNSPECIFIED',     nonRefundable: false },
  FULL_PAYMENT:      { calcType: 'PER_SEAT',        quantityBasis: 'REMAINING_SEAT', creditTowardFare: true,  refundable: 'UNSPECIFIED',     nonRefundable: false },
  TICKET_ISSUE_DATE: { calcType: 'PER_SEAT',        quantityBasis: 'REMAINING_SEAT', creditTowardFare: true,  refundable: 'UNSPECIFIED',     nonRefundable: false, dueType: 'TICKET_ISSUE_MINUS_DAYS', dueDays: 0 },
  FEE:               { calcType: 'FIXED_PER_SERIES',quantityBasis: 'INITIAL_SEAT',   creditTowardFare: false, refundable: 'NON_REFUNDABLE',  nonRefundable: true  },
  OTHER:             {},
}

// Only 3 active calc types in the dropdown
const CALC_TYPE_OPTIONS: { value: CondCalcType; label: string }[] = [
  { value: 'PER_SEAT',          label: 'ต่อ Seat' },
  { value: 'FIXED_PER_PNR',    label: 'ต่อ PNR' },
  { value: 'FIXED_PER_SERIES', label: 'ต่อ Series' },
  { value: 'PERCENT_OF_BASE',  label: 'คิดเป็นเปอร์เซ็นต์' },
]

const CALC_BASE_OPTIONS: { value: CondCalcBase; label: string; desc: string }[] = [
  { value: 'FARE',     label: 'FARE',               desc: 'ค่าตั๋วอย่างเดียว' },
  { value: 'FARE_TAX', label: 'FARE + TAX (ALL IN)', desc: 'Fare รวม Tax ทั้งหมด' },
  { value: 'FARE_YQ',  label: 'FARE + YQ',           desc: 'Fare + ค่าน้ำมัน YQ' },
]

function isPercentCalc(ct: CondCalcType) {
  return ct === 'PERCENT_OF_FARE' || ct === 'PERCENT_OF_NET_FARE' || ct === 'PERCENT_OF_ALLIN' || ct === 'PERCENT_OF_BASE'
}
function isAmountCalc(ct: CondCalcType) {
  // Include FIXED_AMOUNT for backward compat with old stored data (maps to FIXED_PER_SERIES on next save)
  return ct === 'PER_SEAT' || ct === 'FIXED_PER_PNR' || ct === 'FIXED_PER_SERIES' || ct === 'FIXED_AMOUNT'
}

function buildPreview(stage: CondStage, currency: string): string {
  const c = currency
  const qty = COND_QUANTITY_BASIS_LABELS[stage.quantityBasis] ?? ''
  switch (stage.calcType) {
    case 'PER_SEAT':            return `${stage.amount.toLocaleString()} ${c} × ${qty}`
    case 'FIXED_PER_PNR':      return `${stage.amount.toLocaleString()} ${c} × จำนวน PNR`
    case 'FIXED_PER_SERIES':   return `${stage.amount.toLocaleString()} ${c} ต่อ Series`
    // Legacy values — kept for reading old stored data
    case 'FIXED_AMOUNT':        return `${stage.amount.toLocaleString()} ${c} ต่อ Series`
    case 'REMAINING_BALANCE':   return `ยอดคงเหลือ (legacy)`
    case 'PERCENT_OF_FARE':     return `${stage.percent}% × Fare × ${qty}`
    case 'PERCENT_OF_NET_FARE': return `${stage.percent}% × Net Fare × ${qty}`
    case 'PERCENT_OF_ALLIN':    return `${stage.percent}% × All-in × ${qty}`
    case 'PERCENT_OF_BASE':     return `${stage.percent}% × ${COND_CALC_BASE_LABELS[stage.calcBase ?? 'FARE']}`
    default:                    return formatStageAmount(stage, c)
  }
}

function formatDueShort(stage: CondStage): string {
  const noTime = stage.dueTimeUnspecified ?? !stage.dueTime
  const t = noTime ? '' : ` เวลา ${stage.dueTime}`
  switch (stage.dueType) {
    case 'TRAVEL_MINUS_DAYS':          return `ก่อนเดินทาง ${stage.dueDays} วัน${t}`
    case 'SEAT_CONFIRMED_PLUS_DAYS':   return `หลัง Confirm ที่นั่ง ${stage.dueDays} วัน${t}`
    case 'NAME_DEADLINE_MINUS_DAYS':   return `ก่อนวันส่งชื่อ ${stage.dueDays} วัน${t}`
    case 'TICKET_ISSUE_MINUS_DAYS':    return `ก่อนวันออกตั๋ว ${stage.dueDays} วัน${t}`
    case 'CREATED_PLUS_DAYS':          return `หลังสร้าง ${stage.dueDays} วัน`
    case 'PREV_DUE_PLUS_DAYS':         return `หลังงวดก่อน ${stage.dueDays} วัน`
    case 'PREV_PAID_PLUS_DAYS':        return `หลังชำระงวดก่อน ${stage.dueDays} วัน`
    case 'CUSTOM_DATE':                return stage.dueDate ? `${stage.dueDate}${t}` : 'ระบุวันที่'
    case 'TBD':                        return 'กำหนดภายหลัง'
    default:                           return ''
  }
}

// ─── § 2 Stage inline card ───────────────────────────────────────────────────

function StageCard({ stage, idx, total, currency, readOnly, open, onToggle, onChange, onPaymentTypeChange, onDuplicate, onDelete, onMoveUp, onMoveDown, ticketDlLabel }: {
  stage: CondStage; idx: number; total: number; currency: string; readOnly: boolean
  open: boolean; onToggle: () => void
  onChange: (patch: Partial<CondStage>) => void
  onPaymentTypeChange: (pt: CondPaymentType | '') => void
  onDuplicate: () => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void
  ticketDlLabel: string | null
}) {
  const set = <K extends keyof CondStage>(k: K, v: CondStage[K]) => onChange({ [k]: v } as Partial<CondStage>)
  const isTicketIssueDate = stage.paymentType === 'TICKET_ISSUE_DATE'
  const timeUnspecified  = stage.dueTimeUnspecified ?? !stage.dueTime
  const isPercent        = isPercentCalc(stage.calcType)
  const isAmount         = isAmountCalc(stage.calcType)
  const showQtyBasis     = stage.calcType === 'PER_SEAT'
  const dueNeedsDays     = DAY_BASED_DUE_TYPES.includes(stage.dueType) && !isTicketIssueDate
  const dueNeedsDate     = stage.dueType === 'CUSTOM_DATE' && !isTicketIssueDate
  const isMissing        = !stage.paymentType
  const stageErrs: string[] = []
  if (!stage.calcType)                                           stageErrs.push('วิธีคิดเงิน')
  if (isAmount && stage.amount < 0)                             stageErrs.push('จำนวนเงิน')
  if (isPercent && (stage.percent <= 0 || stage.percent > 100)) stageErrs.push('เปอร์เซ็นต์')
  if (dueNeedsDays && !stage.dueDays)                           stageErrs.push('จำนวนวัน')
  if (dueNeedsDate && !stage.dueDate)                           stageErrs.push('วันที่กำหนดเอง')
  if (stage.refundable === 'UNSPECIFIED')                       stageErrs.push('คืนเงินได้หรือไม่')
  const preview          = buildPreview(stage, currency)
  const needsAmount      = isAmount && !stage.amount
  const needsPercent     = isPercent && !stage.percent
  const previewText      = (needsAmount || needsPercent) ? 'กรุณาระบุจำนวนเงิน' : preview
  const [showRemark, setShowRemark] = useState(!!stage.remark)

  const cardNo    = `งวดที่ ${idx + 1}`
  const typeLabel = isMissing ? null : autoStageName(stage.paymentType, stage.customPaymentName, stage.stageNo)

  return (
    <div className={cn(
      'rounded-xl border transition-all',
      isMissing ? 'border-amber-200 bg-amber-50/40' : open ? 'border-[#05a94f]/30 bg-white shadow-sm' : 'border-slate-200 bg-white',
    )}>
      {/* ── Card header ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none rounded-xl"
        onClick={onToggle}
        role="button"
        aria-expanded={open}
      >
        <GripVertical size={13} className="text-slate-300 shrink-0" />
        <div className={cn(
          'w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0',
          PT_COLOR[stage.paymentType] ?? 'bg-slate-100 text-slate-400',
        )}>
          {idx + 1}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1 flex-wrap">
            <span className={cn('text-xs font-semibold shrink-0', isMissing ? 'text-amber-700' : 'text-slate-700')}>
              {cardNo}
            </span>
            {typeLabel && (
              <span className="text-xs text-slate-400 truncate min-w-0">| {typeLabel}</span>
            )}
            {isMissing && (
              <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-px rounded font-semibold shrink-0">เลือกประเภท</span>
            )}
            {!isMissing && stage.refundable === 'NON_REFUNDABLE' && (
              <span className="text-[9px] bg-red-50 text-red-500 px-1.5 py-px rounded shrink-0">คืนไม่ได้</span>
            )}
            {!isMissing && stage.refundable === 'REFUNDABLE' && (
              <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-px rounded shrink-0">คืนได้</span>
            )}
            {!isMissing && stage.creditTowardFare && (
              <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-px rounded shrink-0">Credit</span>
            )}
            {!isMissing && (
              stageErrs.length > 0 ? (
                <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-px rounded font-semibold shrink-0">
                  ขาด {stageErrs.length} รายการ
                </span>
              ) : (
                <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-px rounded font-semibold shrink-0">
                  ครบแล้ว
                </span>
              )
            )}
          </div>
          {!open && !isMissing && (
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              {formatStageAmount(stage, currency)} · {formatDueShort(stage)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          {!readOnly && (
            <>
              <button type="button" title="เลื่อนขึ้น" disabled={idx === 0} onClick={onMoveUp}
                className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-20 transition">
                <ArrowUp size={11} />
              </button>
              <button type="button" title="เลื่อนลง" disabled={idx === total - 1} onClick={onMoveDown}
                className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-20 transition">
                <ArrowDown size={11} />
              </button>
              <button type="button" title="ทำซ้ำงวด" onClick={onDuplicate}
                className="p-1 rounded text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition">
                <Copy size={11} />
              </button>
              <button type="button" title={total <= 1 ? 'ต้องมีอย่างน้อย 1 งวด' : 'ลบงวด'} onClick={onDelete} disabled={total <= 1}
                className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:text-slate-300 disabled:hover:bg-transparent">
                <Trash2 size={11} />
              </button>
            </>
          )}
          <ChevronDown size={13} className={cn('text-slate-300 transition-transform ml-0.5', open && 'rotate-180')} />
        </div>
      </div>

      {/* ── Card body ── */}
      {open && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-3 space-y-2.5">

          {/* Missing fields banner */}
          {!isMissing && stageErrs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center px-2.5 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <span className="text-[10px] font-medium text-amber-700 shrink-0">ข้อมูลที่ยังไม่ครบ:</span>
              {stageErrs.map(e => (
                <span key={e} className="text-[9px] bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">{e}</span>
              ))}
            </div>
          )}

          {/* ── Row 1: 5-column fixed grid — ไม่เพิ่ม/ลด column ตามเงื่อนไข ── */}
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: '2fr 1.1fr 1.5fr 1.1fr 1.5fr' }}
          >
            {/* Col 1: ประเภทการชำระเงิน */}
            <div className="space-y-1.5">
              <div>
                <Label required>ประเภทการชำระเงิน</Label>
                <FSelect<CondPaymentType | ''>
                  value={stage.paymentType}
                  onChange={v => onPaymentTypeChange(v as CondPaymentType | '')}
                  options={[
                    { value: '' as const, label: '— เลือกประเภท —' },
                    ...Object.entries(COND_PAYMENT_TYPE_LABELS).map(([v, l]) => ({ value: v as CondPaymentType, label: l })),
                  ]}
                  disabled={readOnly}
                  className={!stage.paymentType ? 'border-amber-300' : ''}
                />
              </div>
              {stage.paymentType === 'OTHER' && (
                <div>
                  <Label>ชื่อที่กำหนดเอง</Label>
                  <FInput value={stage.customPaymentName} onChange={v => set('customPaymentName', v)} placeholder="ระบุ..." disabled={readOnly} />
                </div>
              )}
            </div>

            {/* Col 2: คิดต่อ (unit basis) — disabled placeholder เมื่อเลือก % */}
            <div>
              <Label>คิดต่อ</Label>
              {isPercent ? (
                <div className="h-9 flex items-center px-3 rounded-xl border border-slate-200 bg-slate-50 text-[11px] text-slate-400 italic select-none">
                  —
                </div>
              ) : (
                <FSelect<CondCalcType>
                  value={stage.calcType}
                  onChange={v => set('calcType', v as CondCalcType)}
                  options={[
                    { value: 'PER_SEAT'         as CondCalcType, label: 'ต่อ Seat' },
                    { value: 'FIXED_PER_PNR'    as CondCalcType, label: 'ต่อ PNR' },
                    { value: 'FIXED_PER_SERIES' as CondCalcType, label: 'ต่อ Series' },
                  ]}
                  disabled={readOnly}
                />
              )}
            </div>

            {/* Col 3: วิธีคำนวณยอดเงิน (fixed vs percent) */}
            <div>
              <Label>วิธีคำนวณ</Label>
              <FSelect<'FIXED' | 'PERCENT'>
                value={isPercent ? 'PERCENT' : 'FIXED'}
                onChange={v => {
                  if (v === 'PERCENT') {
                    onChange({ calcType: 'PERCENT_OF_BASE', calcBase: stage.calcBase ?? 'FARE' })
                  } else {
                    const prevFixed: CondCalcType =
                      stage.calcType === 'PER_SEAT' || stage.calcType === 'FIXED_PER_PNR' || stage.calcType === 'FIXED_PER_SERIES'
                        ? stage.calcType : 'PER_SEAT'
                    onChange({ calcType: prevFixed })
                  }
                }}
                options={[
                  { value: 'FIXED',   label: 'จำนวนเงินคงที่' },
                  { value: 'PERCENT', label: 'คิดเป็น %' },
                ]}
                disabled={readOnly}
              />
            </div>

            {/* Col 4: จำนวนเงิน หรือ เปอร์เซ็นต์ — label เปลี่ยน value ไม่ขยับ */}
            <div>
              <Label>{isPercent ? 'เปอร์เซ็นต์ (%)' : `จำนวน (${currency})`}</Label>
              {isPercent ? (
                <FInput type="number" min={0} max={100} value={stage.percent || ''} onChange={v => set('percent', Number(v))} disabled={readOnly} placeholder="0" />
              ) : (
                <FInput type="number" min={0} value={stage.amount || ''} onChange={v => set('amount', Number(v))} disabled={readOnly} placeholder="0" />
              )}
            </div>

            {/* Col 5: คำนวณจาก — dropdown เมื่อ %, disabled placeholder เมื่อคงที่ */}
            <div>
              <Label>คำนวณจาก</Label>
              {isPercent ? (
                <FSelect<CondCalcBase>
                  value={stage.calcBase ?? 'FARE'}
                  onChange={v => set('calcBase', v as CondCalcBase)}
                  options={CALC_BASE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                  disabled={readOnly}
                />
              ) : (
                <div className="h-9 flex items-center px-3 rounded-xl border border-slate-200 bg-slate-50 text-[11px] text-slate-400 italic select-none">
                  ไม่ใช้
                </div>
              )}
            </div>
          </div>

          {/* Preview สูตรการคำนวณ — min-height คงที่ ไม่ดัน layout */}
          <div className="min-h-[36px]">
            {isPercent && (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                <Calculator size={12} className="text-slate-400 shrink-0" />
                <span>สูตร:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {stage.percent || '?'}% × {COND_CALC_BASE_LABELS[stage.calcBase ?? 'FARE']}
                </span>
                <span className="text-slate-400">→ ยอดที่ต้องชำระ</span>
                <span className="ml-auto text-[10px] text-slate-400">
                  {CALC_BASE_OPTIONS.find(o => o.value === (stage.calcBase ?? 'FARE'))?.desc}
                </span>
                {stage.calcBase === 'FARE_YQ' && (
                  <span className="w-full text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                    <Info size={10} className="shrink-0" />
                    ต้องระบุค่า YQ ใน Stock/PNR — ถ้ายังไม่มี YQ ระบบจะใช้ FARE อย่างเดียว
                  </span>
                )}
              </div>
            )}
          </div>

          {/* RSVN fee info */}
          {stage.paymentType === 'RSVN_FEE' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-100 text-[10px] text-amber-700">
              <Info size={11} className="shrink-0 text-amber-400" />
              RSVN Fee โดยปกติคืนไม่ได้ กรุณาตรวจสอบเงื่อนไขสายการบินก่อนบันทึก
            </div>
          )}

          {/* Row 2: Quantity basis + Due date method */}
          <div className={cn(
            'grid gap-2.5',
            showQtyBasis ? 'grid-cols-1 sm:grid-cols-[2fr_3fr]' : 'grid-cols-1',
          )}>
            {showQtyBasis && (
              <div>
                <Label>ใช้จำนวนจาก</Label>
                <FSelect<CondQuantityBasis>
                  value={stage.quantityBasis}
                  onChange={v => set('quantityBasis', v as CondQuantityBasis)}
                  options={(['INITIAL_SEAT', 'REMAINING_SEAT'] as CondQuantityBasis[]).map(v => ({ value: v, label: COND_QUANTITY_BASIS_LABELS[v] }))}
                  disabled={readOnly}
                />
              </div>
            )}
            <div>
              <Label>วิธีคำนวณวันครบกำหนดชำระ</Label>
              {isTicketIssueDate ? (
                <div className="h-9 flex items-center gap-2 px-3 rounded-xl border border-orange-200 bg-orange-50/60 text-xs text-orange-700 select-none">
                  <Lock size={11} className="shrink-0" />
                  <span>ตรงกับวันออกตั๋ว (อัตโนมัติ)</span>
                </div>
              ) : (
                <FSelect<CondDueType>
                  value={stage.dueType}
                  onChange={v => set('dueType', v as CondDueType)}
                  options={([
                    'TRAVEL_MINUS_DAYS',
                    'SEAT_CONFIRMED_PLUS_DAYS',
                    'NAME_DEADLINE_MINUS_DAYS',
                    'TICKET_ISSUE_MINUS_DAYS',
                    'CUSTOM_DATE',
                  ] as CondDueType[]).map(v => ({ value: v, label: COND_DUE_TYPE_LABELS[v] }))}
                  disabled={readOnly}
                />
              )}
            </div>
          </div>

          {/* TICKET_ISSUE_DATE: แสดง DL ที่ดึงมา หรือ warning ถ้ายังไม่ได้กำหนด */}
          {isTicketIssueDate && (
            ticketDlLabel ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-[11px] text-orange-700">
                <Info size={11} className="shrink-0" />
                <span>วันครบกำหนดชำระ = TICKET DL: <span className="font-semibold">{ticketDlLabel}</span></span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700">
                <AlertCircle size={11} className="shrink-0" />
                <span>กรุณากำหนดวันออกตั๋ว (TICKET DL) ในส่วน NAME DL &amp; TICKET DL ก่อน</span>
              </div>
            )
          )}

          {/* Row 3: Days/Date + Time */}
          {dueNeedsDays && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label>จำนวนวัน</Label>
                  <FInput type="number" min={0} value={stage.dueDays || ''} onChange={v => set('dueDays', Number(v))} disabled={readOnly} placeholder="7" />
                </div>
                <div>
                  <Label>เวลา Deadline</Label>
                  <TimeInput value={stage.dueTime} onChange={v => set('dueTime', v)} disabled={readOnly || timeUnspecified} />
                  {!readOnly && (
                    <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={timeUnspecified}
                        onChange={e => {
                          if (e.target.checked) {
                            onChange({ dueTimeUnspecified: true, dueTime: '' })
                          } else {
                            onChange({ dueTimeUnspecified: false, dueTime: stage.dueTime || '18:00' })
                          }
                        }}
                        className="w-3 h-3 accent-[#05a94f] cursor-pointer"
                      />
                      <span className="text-[10px] text-slate-500">ยังไม่ระบุเวลา</span>
                    </label>
                  )}
                </div>
              </div>
              {stage.dueType === 'SEAT_CONFIRMED_PLUS_DAYS' && (
                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 leading-snug">
                  Due Date จะคำนวณหลังจากมีการ Confirm ที่นั่งแล้ว — ถ้ายังไม่มีวันที่ Confirm จะแสดงสถานะ &ldquo;รอวันที่ Confirm ที่นั่ง&rdquo;
                </p>
              )}
              {stage.dueType === 'NAME_DEADLINE_MINUS_DAYS' && (
                <p className="text-[10px] text-slate-400 leading-snug px-0.5">
                  คำนวณจากวัน TTL / วันส่งชื่อผู้โดยสารของ Series — ถ้ายังไม่ได้กำหนด TTL จะไม่สามารถคำนวณได้
                </p>
              )}
              {stage.dueType === 'TICKET_ISSUE_MINUS_DAYS' && (
                <p className="text-[10px] text-slate-400 leading-snug px-0.5">
                  คำนวณจากวัน Deadline ออกตั๋วของ Series — ถ้ายังไม่ได้กำหนดจะไม่สามารถคำนวณได้
                </p>
              )}
            </div>
          )}
          {dueNeedsDate && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <Label required>วันที่กำหนดเอง</Label>
                <FInput type="date" value={stage.dueDate} onChange={v => set('dueDate', v)} disabled={readOnly} />
              </div>
              <div>
                <Label>เวลา Deadline</Label>
                <TimeInput value={stage.dueTime} onChange={v => set('dueTime', v)} disabled={readOnly || timeUnspecified} />
                {!readOnly && (
                  <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={timeUnspecified}
                      onChange={e => {
                        if (e.target.checked) {
                          onChange({ dueTimeUnspecified: true, dueTime: '' })
                        } else {
                          onChange({ dueTimeUnspecified: false, dueTime: stage.dueTime || '18:00' })
                        }
                      }}
                      className="w-3 h-3 accent-[#05a94f] cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-500">ยังไม่ระบุเวลา</span>
                  </label>
                )}
              </div>
            </div>
          )}
          {/* Row 4: Options — 2 equal mini-cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Mini-card 1: Credit toward fare */}
            <label className="flex flex-col gap-2 p-2.5 rounded-xl border border-slate-200 bg-white cursor-pointer select-none hover:border-[#05a94f]/40 hover:bg-emerald-50/20 transition h-full">
              <div className="flex items-center gap-2">
                <Toggle checked={stage.creditTowardFare} onChange={v => set('creditTowardFare', v)} disabled={readOnly} />
                <span className="text-xs text-slate-700 font-medium leading-tight">นับเป็นส่วนหนึ่งของค่าตั๋ว</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">ยอดชำระนี้จะหักออกจากค่าตั๋วส่วนที่เหลือ</p>
            </label>

            {/* Mini-card 2: Refundable */}
            <div className={cn(
              'flex flex-col gap-1.5 p-2.5 rounded-xl border h-full',
              stage.refundable === 'UNSPECIFIED' ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white',
            )}>
              <span className="text-[11px] font-medium text-slate-600">
                คืนเงินได้หรือไม่ <span className="text-amber-500">*</span>
              </span>
              <FSelect<CondRefundableType>
                value={stage.refundable}
                onChange={v => set('refundable', v as CondRefundableType)}
                options={(['UNSPECIFIED', 'REFUNDABLE', 'NON_REFUNDABLE'] as CondRefundableType[]).map(v => ({ value: v, label: COND_REFUNDABLE_LABELS[v] }))}
                disabled={readOnly}
              />
              {stage.refundable === 'UNSPECIFIED' && (
                <p className="text-[10px] text-amber-600">กรุณาเลือก</p>
              )}
            </div>
          </div>

          {/* Remark — toggleable */}
          {!showRemark && !stage.remark && !readOnly && (
            <button type="button" onClick={() => setShowRemark(true)}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#05a94f] transition">
              <Plus size={10} />
              เพิ่มหมายเหตุ
            </button>
          )}
          {(showRemark || !!stage.remark) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>หมายเหตุของงวดนี้</Label>
                {!readOnly && !stage.remark && (
                  <button type="button" onClick={() => setShowRemark(false)}
                    className="text-[10px] text-slate-400 hover:text-slate-600 transition">
                    ซ่อน
                  </button>
                )}
              </div>
              <FTextarea value={stage.remark} onChange={v => set('remark', v)} placeholder="หมายเหตุสำหรับงวดนี้..." rows={2} disabled={readOnly} />
            </div>
          )}

          {/* Preview strip */}
          {!isMissing && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-[10px]">
              <CreditCard size={11} className="text-slate-300 shrink-0" />
              <span className="text-slate-400 shrink-0">ตัวอย่างการคำนวณ:</span>
              <span className={cn(
                'font-mono truncate',
                (needsAmount || needsPercent) ? 'text-slate-400 italic' : 'text-slate-600',
              )}>
                {previewText}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── § 2 Payment Section ─────────────────────────────────────────────────────

export function PaymentSection({ value, onChange, readOnly, currency, errors = [], conditionMode, seriesInfo }: {
  value: AppCondition; onChange: (v: AppCondition) => void; readOnly: boolean; currency: string; errors?: string[]
  conditionMode?: ConditionMode; seriesInfo?: SeriesInfo
}) {
  const stages = value.stages
  const effectiveCurrency = conditionMode === 'series' ? (seriesInfo?.currency ?? currency) : currency

  // Track which stage cards are expanded
  const [openStages, setOpenStages] = useState<Set<string>>(() => {
    // Auto-expand any stage that has no paymentType yet
    const s = new Set<string>()
    value.stages.forEach(st => { if (!st.paymentType) s.add(st.stageId) })
    return s
  })

  const toggleStage = (id: string) =>
    setOpenStages(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const addStage = () => {
    const s = defaultCondStage(stages.length + 1)
    onChange({ ...value, stages: [...stages, s] })
    setOpenStages(prev => new Set([...prev, s.stageId]))
  }

  const duplicateStage = (idx: number) => {
    const copy = { ...stages[idx], stageId: newStageId() }
    const next = [...stages, copy].map((s, i) => ({ ...s, stageNo: i + 1 }))
    onChange({ ...value, stages: next })
    setOpenStages(prev => new Set([...prev, copy.stageId]))
  }

  const deleteStage = (idx: number) => {
    if (stages.length <= 1) return
    const next = stages.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stageNo: i + 1 }))
    onChange({ ...value, stages: next })
  }

  const moveStage = (idx: number, dir: -1 | 1) => {
    const to = idx + dir
    if (to < 0 || to >= stages.length) return
    const next = [...stages]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    onChange({ ...value, stages: next.map((s, i) => ({ ...s, stageNo: i + 1 })) })
  }

  const updateStage = (idx: number, patch: Partial<CondStage>) =>
    onChange({ ...value, stages: stages.map((s, i) => i === idx ? { ...s, ...patch } : s) })

  const applyPaymentTypeDefaults = (idx: number, pt: CondPaymentType | '') => {
    const defaults: Partial<CondStage> = pt ? (PAYMENT_TYPE_DEFAULTS[pt] ?? {}) : {}
    updateStage(idx, { paymentType: pt, ...defaults })
  }

  // Ticket DL label — ใช้โดย StageCard สำหรับ TICKET_ISSUE_DATE payment type
  const effectiveTicketDlRule = value.issuanceMode === 'SEPARATE' ? value.ticketDlRule : value.ttlRule
  const ticketDlIsSet = !((effectiveTicketDlRule.calcType === 'TRAVEL_MINUS_DAYS' && !effectiveTicketDlRule.daysBefore) ||
                          (effectiveTicketDlRule.calcType === 'MANUAL_DATE' && !effectiveTicketDlRule.fixedDate))
  const ticketDlLabel: string | null = ticketDlIsSet ? formatTtlRule(effectiveTicketDlRule) : null

  // TTL
  const ttlRule = value.ttlRule
  const setTtl = <K extends keyof CondTtlRule>(k: K, v: CondTtlRule[K]) =>
    onChange({ ...value, ttlRule: { ...ttlRule, [k]: v } })
  const issuanceMode = value.issuanceMode
  const setIssuanceMode = (m: CondIssuanceMode) => onChange({ ...value, issuanceMode: m })
  const ticketDlRule = value.ticketDlRule
  const setTicketDl = <K extends keyof CondTtlRule>(k: K, v: CondTtlRule[K]) =>
    onChange({ ...value, ticketDlRule: { ...ticketDlRule, [k]: v } })

  return (
    <div className="space-y-6">
      <ErrorBox errors={errors} />

      {/* ── Section 1: Stages ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CreditCard size={14} className="text-slate-500" />
            <p className="text-xs font-semibold text-slate-700">งวดชำระเงิน</p>
            {stages.length > 0 && (
              <span className="text-[10px] bg-[#05a94f]/10 text-[#05a94f] px-2 py-0.5 rounded-full font-semibold">
                {stages.length} งวด
              </span>
            )}
          </div>
          {!readOnly && (
            <button type="button" onClick={addStage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#05a94f] text-white text-xs font-medium hover:bg-[#04943e] transition shrink-0">
              <Plus size={12} /> เพิ่มงวดชำระเงิน
            </button>
          )}
        </div>

        {/* Empty state */}
        {stages.length === 0 && (
          <p className="text-xs text-slate-400 mb-3">ยังไม่มีงวดชำระเงิน</p>
        )}

        {/* Stage cards */}
        <div className="space-y-2">
          {stages.map((stage, idx) => (
            <StageCard
              key={stage.stageId}
              stage={stage}
              idx={idx}
              total={stages.length}
              currency={effectiveCurrency}
              readOnly={readOnly}
              open={openStages.has(stage.stageId)}
              onToggle={() => toggleStage(stage.stageId)}
              onChange={patch => updateStage(idx, patch)}
              onPaymentTypeChange={pt => applyPaymentTypeDefaults(idx, pt)}
              onDuplicate={() => duplicateStage(idx)}
              onDelete={() => deleteStage(idx)}
              onMoveUp={() => moveStage(idx, -1)}
              onMoveDown={() => moveStage(idx, 1)}
              ticketDlLabel={ticketDlLabel}
            />
          ))}
        </div>
      </div>

      {/* ── Section 2: NAME DL & TICKET DL ── */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white">
          <Clock size={14} className="text-slate-500" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-700">NAME DL &amp; TICKET DL</p>
            <p className="text-[10px] text-slate-400">กำหนดวันส่งรายชื่อผู้โดยสารและวันออกตั๋ว</p>
          </div>
          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium shrink-0">
            {issuanceMode === 'SIMULTANEOUS' ? `NAME & TICKET DL: ${formatTtlRule(ttlRule)}` : `NAME DL: ${formatTtlRule(ttlRule)}`}
          </span>
        </div>
        <div className="px-4 py-4 space-y-4">
          {/* Radio: issuance mode */}
          <div>
            <Label>รูปแบบการส่งชื่อและออกตั๋ว</Label>
            <div className="mt-2 space-y-2.5">
              {([
                { value: 'SIMULTANEOUS' as const, title: 'ส่งชื่อพร้อมออกตั๋ว', desc: 'เมื่อถึงกำหนด NAME DL ต้องส่งรายชื่อผู้โดยสารและออกตั๋วภายในกำหนดเดียวกัน' },
                { value: 'SEPARATE'     as const, title: 'ส่งชื่อก่อน แล้วออกตั๋วภายหลัง', desc: 'กำหนดวันส่งชื่อและวันออกตั๋วแยกจากกัน โดยต้องส่งชื่อก่อนถึงกำหนดออกตั๋ว' },
              ]).map(opt => (
                <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${issuanceMode === opt.value ? 'border-[#05a94f] bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <input type="radio" name="issuanceMode" value={opt.value} checked={issuanceMode === opt.value} onChange={() => !readOnly && setIssuanceMode(opt.value)} disabled={readOnly} className="mt-0.5 accent-[#05a94f]" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{opt.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {/* Deadline fields */}
          {issuanceMode === 'SIMULTANEOUS' ? (
            <TtlRuleForm label="NAME & TICKET DL" sublabel="วันสุดท้ายที่ต้องส่งชื่อและออกตั๋ว" rule={ttlRule} setRule={setTtl} readOnly={readOnly} />
          ) : (
            <div className="space-y-3">
              <TtlRuleForm label="NAME DL" sublabel="วันสุดท้ายที่ต้องส่งรายชื่อผู้โดยสาร" rule={ttlRule} setRule={setTtl} readOnly={readOnly} />
              <TtlRuleForm label="TICKET DL" sublabel="วันสุดท้ายที่ต้องออกตั๋วหลังจากส่งรายชื่อแล้ว" rule={ticketDlRule} setRule={setTicketDl} readOnly={readOnly} />
            </div>
          )}
          {/* Remark */}
          <div>
            <Label>หมายเหตุ</Label>
            <FTextarea value={ttlRule.remark} onChange={v => setTtl('remark', v)} rows={2} disabled={readOnly} placeholder="หมายเหตุเพิ่มเติมสำหรับการส่งรายชื่อและออกตั๋ว..." />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── § 3 Baggage — helpers ───────────────────────────────────────────────────


function StatusPills<T extends string>({ value, onChange, options, disabled }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  disabled?: boolean
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(o => (
        <label key={o.value} className={cn(
          'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs cursor-pointer transition select-none',
          value === o.value
            ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold'
            : 'border-slate-200 text-slate-600 hover:border-slate-300',
          disabled && 'pointer-events-none opacity-60',
        )}>
          <input
            type="radio"
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            disabled={disabled}
            className="sr-only"
          />
          <span className={cn(
            'w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0',
            value === o.value ? 'border-[#05a94f]' : 'border-slate-300',
          )}>
            {value === o.value && <span className="w-1.5 h-1.5 rounded-full bg-[#05a94f]" />}
          </span>
          {o.label}
        </label>
      ))}
    </div>
  )
}

interface BaggageSlot {
  status: CondBaggageStatus
  mode: CondBaggageAllowanceMode
  pieceCount: number | null
  weightPerPiece: number | null
  totalWeight: number | null
  weightUnit: 'KG' | 'LB'
  pieceList: CondBaggagePiece[]
  textDetail: string
}

function syncPieceList(count: number, current: CondBaggagePiece[], defaultUnit: 'KG' | 'LB'): CondBaggagePiece[] {
  if (count <= 0) return []
  const result = current.slice(0, count)
  while (result.length < count) result.push({ pieceNo: result.length + 1, weight: 0, weightUnit: defaultUnit })
  return result.map((p, i) => ({ ...p, pieceNo: i + 1 }))
}

function BaggageSlotCard({ title, icon, slot, onChange, readOnly }: {
  title: string
  icon: ReactNode
  slot: BaggageSlot
  onChange: (upd: Partial<BaggageSlot>) => void
  readOnly: boolean
}) {
  const set = <K extends keyof BaggageSlot>(k: K, v: BaggageSlot[K]) => onChange({ [k]: v } as Partial<BaggageSlot>)

  const badgeLabel = (): string | null => {
    if (slot.status === 'NOT_INCLUDED') return 'ไม่มีสัมภาระ'
    if (slot.status !== 'INCLUDED') return null
    switch (slot.mode) {
      case 'SAME_WEIGHT_PER_PIECE':
        return (slot.pieceCount && slot.weightPerPiece !== null) ? `${slot.pieceCount} ใบ / ใบละ ${slot.weightPerPiece} กก` : null
      case 'TOTAL_WEIGHT':
        return slot.totalWeight ? `${slot.pieceCount ? slot.pieceCount + ' ใบ / ' : ''}รวม ${slot.totalWeight} กก` : null
      case 'CUSTOM_PER_PIECE':
        return slot.pieceList.length ? `${slot.pieceList.length} ใบ (แยก)` : null
      default: return null
    }
  }
  const badge = badgeLabel()

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
        {icon}
        <p className="text-xs font-semibold text-slate-700 flex-1">{title}</p>
        {badge && (
          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold shrink-0">
            {badge}
          </span>
        )}
      </div>
      <div className="px-4 py-4 space-y-3">
        <div>
          <Label>สถานะสัมภาระ</Label>
          <StatusPills<CondBaggageStatus>
            value={slot.status}
            onChange={v => onChange({
              status: v,
              ...(v !== 'INCLUDED' && { pieceCount: null, weightPerPiece: null, totalWeight: null, pieceList: [], textDetail: '' }),
            })}
            options={[
              { value: 'UNSPECIFIED',  label: 'ไม่ระบุ' },
              { value: 'INCLUDED',     label: 'มีสัมภาระ' },
              { value: 'NOT_INCLUDED', label: 'ไม่มีสัมภาระ' },
            ]}
            disabled={readOnly}
          />
        </div>

        {slot.status === 'INCLUDED' && (
          <>
            <div>
              <Label>รูปแบบสัมภาระ</Label>
              <FSelect<CondBaggageAllowanceMode>
                value={slot.mode}
                onChange={v => onChange({ mode: v as CondBaggageAllowanceMode, pieceCount: null, weightPerPiece: null, totalWeight: null, pieceList: [], textDetail: '' })}
                options={[
                  { value: 'SAME_WEIGHT_PER_PIECE', label: 'แบบใบ น้ำหนักเท่ากันทุกใบ' },
                  { value: 'TOTAL_WEIGHT',          label: 'แบบน้ำหนักรวม' },
                  { value: 'CUSTOM_PER_PIECE',      label: 'แยกน้ำหนักแต่ละใบ' },
                  { value: 'TEXT_ONLY',             label: 'ระบุเป็นข้อความเอง' },
                ]}
                disabled={readOnly}
              />
            </div>

            {slot.mode === 'SAME_WEIGHT_PER_PIECE' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>จำนวนใบ</Label>
                    <FInput type="number" min={1} value={slot.pieceCount ?? ''} onChange={v => set('pieceCount', v === '' ? null : Number(v))} disabled={readOnly} placeholder="1" />
                  </div>
                  <div>
                    <Label required>น้ำหนักต่อใบ (กก)</Label>
                    <FInput type="number" min={0} value={slot.weightPerPiece ?? ''} onChange={v => set('weightPerPiece', v === '' ? null : Number(v))} disabled={readOnly} placeholder="23" />
                  </div>
                </div>
                {!!(slot.pieceCount && slot.weightPerPiece !== null) && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                    <Package size={12} className="shrink-0" />
                    {slot.pieceCount} ใบ / ใบละ {slot.weightPerPiece} กก
                  </div>
                )}
              </>
            )}

            {slot.mode === 'TOTAL_WEIGHT' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>จำนวนใบ</Label>
                    <FInput type="number" min={1} value={slot.pieceCount ?? ''} onChange={v => set('pieceCount', v === '' ? null : Number(v))} disabled={readOnly} placeholder="1" />
                  </div>
                  <div>
                    <Label required>น้ำหนักรวม (กก)</Label>
                    <FInput type="number" min={0.1} value={slot.totalWeight ?? ''} onChange={v => set('totalWeight', v === '' ? null : Number(v))} disabled={readOnly} placeholder="20" />
                  </div>
                </div>
                {!!slot.totalWeight && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                    <Package size={12} className="shrink-0" />
                    {slot.pieceCount ? `${slot.pieceCount} ใบ / ` : ''}รวมไม่เกิน {slot.totalWeight} กก
                  </div>
                )}
              </>
            )}

            {slot.mode === 'CUSTOM_PER_PIECE' && (
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <div className="w-28">
                    <Label required>จำนวนใบ</Label>
                    <FInput
                      type="number" min={1}
                      value={slot.pieceCount ?? ''}
                      onChange={v => {
                        const count = v === '' ? 0 : Math.max(0, Number(v))
                        onChange({ pieceCount: count || null, pieceList: syncPieceList(count, slot.pieceList, 'KG') })
                      }}
                      disabled={readOnly} placeholder="2"
                    />
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        const newPiece: CondBaggagePiece = { pieceNo: slot.pieceList.length + 1, weight: 0, weightUnit: 'KG' }
                        onChange({ pieceList: [...slot.pieceList, newPiece], pieceCount: slot.pieceList.length + 1 })
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#05a94f] text-white text-xs hover:bg-[#04943e] transition shrink-0"
                    >
                      <Plus size={11} /> เพิ่มใบ
                    </button>
                  )}
                </div>
                {slot.pieceList.length > 0 && (
                  <div className="space-y-1.5">
                    {slot.pieceList.map((piece, pi) => (
                      <div key={pi} className="grid grid-cols-[2.5rem_1fr_1.5rem] items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="text-[10px] text-slate-400 text-right">ใบ{pi + 1}</span>
                        <FInput
                          type="number" min={0}
                          value={piece.weight || ''}
                          onChange={v => {
                            const newList = slot.pieceList.map((p, i) => i === pi ? { ...p, weight: v === '' ? 0 : Number(v) } : p)
                            set('pieceList', newList)
                          }}
                          placeholder="23" disabled={readOnly}
                        />
                        {!readOnly ? (
                          <button
                            type="button"
                            onClick={() => {
                              const newList = slot.pieceList.filter((_, i) => i !== pi).map((p, i) => ({ ...p, pieceNo: i + 1 }))
                              onChange({ pieceList: newList, pieceCount: newList.length || null })
                            }}
                            className="p-1 text-red-400 hover:text-red-600 transition"
                          >
                            <Trash2 size={12} />
                          </button>
                        ) : <span />}
                      </div>
                    ))}
                  </div>
                )}
                {slot.pieceList.length > 0 && slot.pieceList.every(p => p.weight > 0) && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                    <Package size={12} className="shrink-0" />
                    {slot.pieceList.map((p, i) => (
                      <span key={i}>ใบที่ {p.pieceNo}: {p.weight} กก{i < slot.pieceList.length - 1 ? ' ·' : ''}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {slot.mode === 'TEXT_ONLY' && (
              <div>
                <Label required>รายละเอียดเงื่อนไขสัมภาระ</Label>
                <FTextarea
                  value={slot.textDetail}
                  onChange={v => set('textDetail', v)}
                  placeholder="ถือขึ้นเครื่องได้ 1 ใบ และกระเป๋าส่วนตัว 1 ใบ ตามเงื่อนไขสายการบิน..."
                  rows={2}
                  disabled={readOnly}
                />
              </div>
            )}
          </>
        )}

        {slot.status === 'NOT_INCLUDED' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-600">
            <Info size={12} className="text-slate-400 shrink-0" />
            ไม่มีสัมภาระในราคาตั๋ว
          </div>
        )}
      </div>
    </div>
  )
}

function BaggagePreviewCard({ bp: rawBp }: { bp: CondBaggagePolicy }) {
  const bp = migrateBaggagePolicy(rawBp)
  const summary = formatBaggageSummary(bp)
  const isUnset = summary === 'ยังไม่ระบุสัมภาระ'

  return (
    <div className={cn(
      'rounded-2xl border px-4 py-3',
      isUnset ? 'border-slate-200 bg-slate-50' : 'border-emerald-200 bg-emerald-50',
    )}>
      <p className="text-[10px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Preview</p>
      {isUnset ? (
        <p className="text-xs text-slate-400 italic">ยังไม่ได้ตั้งค่าเงื่อนไขสัมภาระ</p>
      ) : (
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-emerald-800">
            Baggage: {summary}
          </p>
          {bp.remark?.trim() && (
            <p className="text-[11px] text-slate-500 mt-1 border-t border-emerald-200 pt-1">{bp.remark}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── § 3 Baggage Section ─────────────────────────────────────────────────────

export function BaggageSection({ value, onChange, readOnly, errors = [] }: {
  value: AppCondition; onChange: (v: AppCondition) => void; readOnly: boolean; errors?: string[]
}) {
  // Normalize legacy baggagePolicy format on the way in — persists new format on first edit
  const bp = migrateBaggagePolicy(value.baggagePolicy)
  const patch = (p: Partial<CondBaggagePolicy>) =>
    onChange({ ...value, baggagePolicy: { ...bp, ...p } })

  const checkedSlot: BaggageSlot = {
    status:       bp.checkedBagStatus,
    mode:         bp.checkedMode,
    pieceCount:   bp.pieceCount,
    weightPerPiece: bp.weightPerPiece,
    totalWeight:  bp.totalWeight,
    weightUnit:   bp.weightUnit,
    pieceList:    bp.checkedPieceList,
    textDetail:   bp.checkedText,
  }

  const carryOnSlot: BaggageSlot = {
    status:       bp.carryOnStatus,
    mode:         bp.carryOnMode,
    pieceCount:   bp.carryOnPieces,
    weightPerPiece: bp.carryOnWeight,
    totalWeight:  bp.carryOnTotalWeight,
    weightUnit:   bp.carryOnWeightUnit,
    pieceList:    bp.carryOnPieceList,
    textDetail:   bp.carryOnText,
  }

  const applyChecked = (upd: Partial<BaggageSlot>) => {
    const p: Partial<CondBaggagePolicy> = {}
    if ('status' in upd)         p.checkedBagStatus = upd.status
    if ('mode' in upd)           p.checkedMode = upd.mode
    if ('pieceCount' in upd)     p.pieceCount = upd.pieceCount
    if ('weightPerPiece' in upd) p.weightPerPiece = upd.weightPerPiece
    if ('totalWeight' in upd)    p.totalWeight = upd.totalWeight
    if ('weightUnit' in upd)     p.weightUnit = upd.weightUnit
    if ('pieceList' in upd)      p.checkedPieceList = upd.pieceList
    if ('textDetail' in upd)     p.checkedText = upd.textDetail
    patch(p)
  }

  const applyCarryOn = (upd: Partial<BaggageSlot>) => {
    const p: Partial<CondBaggagePolicy> = {}
    if ('status' in upd)         p.carryOnStatus = upd.status
    if ('mode' in upd)           p.carryOnMode = upd.mode
    if ('pieceCount' in upd)     p.carryOnPieces = upd.pieceCount
    if ('weightPerPiece' in upd) p.carryOnWeight = upd.weightPerPiece
    if ('totalWeight' in upd)    p.carryOnTotalWeight = upd.totalWeight
    if ('weightUnit' in upd)     p.carryOnWeightUnit = upd.weightUnit
    if ('pieceList' in upd)      p.carryOnPieceList = upd.pieceList
    if ('textDetail' in upd)     p.carryOnText = upd.textDetail
    patch(p)
  }

  return (
    <div className="space-y-4">
      <ErrorBox errors={errors} />
      <BaggageSlotCard
        title="สัมภาระโหลดใต้ท้องเครื่อง"
        icon={<Package size={14} className="text-slate-500" />}
        slot={checkedSlot}
        onChange={applyChecked}
        readOnly={readOnly}
      />
      <BaggageSlotCard
        title="กระเป๋าถือขึ้นเครื่อง (Carry-on)"
        icon={<Briefcase size={14} className="text-slate-500" />}
        slot={carryOnSlot}
        onChange={applyCarryOn}
        readOnly={readOnly}
      />
      {/* ── Remark ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
          <StickyNote size={14} className="text-slate-500" />
          <p className="text-xs font-semibold text-slate-700 flex-1">หมายเหตุสัมภาระ</p>
        </div>
        <div className="px-4 py-4">
          <FTextarea
            value={bp.remark}
            onChange={v => patch({ remark: v })}
            placeholder="Baggage 1 PC 23 KG per pax / No baggage included / เงื่อนไขสัมภาระขึ้นอยู่กับสายการบิน ณ วันออกตั๋ว..."
            rows={3}
            disabled={readOnly}
          />
        </div>
      </div>

      {/* ── Preview ── */}
      <BaggagePreviewCard bp={bp} />
    </div>
  )
}

// ─── § 4 Seat Reduction ───────────────────────────────────────────────────────

const SR_ALLOW_OPTIONS: { value: CondSeatReductionAllow; label: string }[] = [
  { value: 'UNSPECIFIED', label: 'ไม่ระบุ' },
  { value: 'ALLOW',       label: 'อนุญาต' },
]

const SR_BASIS_OPTIONS: { value: CondSeatBasis; label: string }[] = [
  { value: 'INITIAL_SEAT',   label: 'Seat เริ่มต้น' },
  { value: 'REMAINING_SEAT', label: 'Seat ปัจจุบัน' },
]

const SR_NOTICE_BASE_OPTIONS: { value: CondSeatNoticeDaysBase; label: string }[] = [
  { value: 'DEPARTURE_DATE', label: 'วันเดินทางวันแรก' },
  { value: 'TICKET_ISSUE',   label: 'วันออกตั๋ว' },
  { value: 'SEAT_CONFIRMED', label: 'วันที่ Confirm ที่นั่ง' },
]

const SR_MODE_OPTIONS: { value: CondSeatReductionMode; label: string }[] = [
  { value: 'SINGLE',    label: 'เงื่อนไขเดียว' },
  { value: 'STEP_RULE', label: 'เงื่อนไข Step' },
]

const SR_SINGLE_OVER_LIMIT_OPTIONS: { value: CondSingleOverLimit; label: string }[] = [
  { value: 'UNSPECIFIED',      label: 'ยังไม่กำหนด' },
  { value: 'NO_FORFEIT',       label: 'ไม่ยึดเงิน' },
  { value: 'FORFEIT',          label: 'ยึดเงิน' },
  { value: 'PENALTY',          label: 'คิดค่าปรับ' },
  { value: 'REQUIRE_APPROVAL', label: 'ต้องขออนุมัติ' },
]

const SR_RULE_OVER_LIMIT_OPTIONS: { value: CondRuleOverLimitAction; label: string }[] = [
  { value: 'UNSPECIFIED',      label: 'ยังไม่กำหนด' },
  { value: 'NO_FORFEIT',       label: 'ไม่ยึดเงิน' },
  { value: 'FORFEIT',          label: 'ยึดเงิน' },
  { value: 'PENALTY',          label: 'คิดค่าปรับ' },
  { value: 'REQUIRE_APPROVAL', label: 'ต้องขออนุมัติ' },
]

const SR_FORFEIT_SOURCE_OPTIONS: { value: CondForfeitSource; label: string; desc: string }[] = [
  { value: 'PAID_SO_FAR', label: 'ยึดตามการจ่าย', desc: 'ยึดเฉพาะยอดที่ชำระแล้ว ณ วันที่ดำเนินการ ไม่รวมยอดที่ยังไม่ได้ชำระ' },
  { value: 'ALL',          label: 'ยึดทั้งหมด',   desc: 'ยึดเงินเต็มจำนวนตามเงื่อนไข ไม่ขึ้นกับยอดที่ชำระแล้ว' },
]

const SR_PENALTY_OPTIONS: { value: CondStepPenaltyType; label: string }[] = [
  { value: 'NONE',        label: 'ไม่มี' },
  { value: 'PERCENT',     label: '%' },
  { value: 'FIXED',       label: 'จำนวนเงิน' },
  { value: 'FORFEIT_ALL', label: 'ยึดเต็ม' },
]

const SR_CALC_BASE_LABELS: Record<CondStepCalcBase, string> = {
  GROUP_PRICE:  'Group Price',
  FARE:         'Fare',
  ALLIN:        'All-in',
  NET_FARE:     'Net Fare',
  DEPOSIT:      'Deposit',
  AMOUNT_PAID:  'Amount Paid',
}

const SR_RANGE_TYPE_OPTIONS: { value: CondSeatRangeType; label: string }[] = [
  { value: 'FROM_DAY_UP', label: 'N วันขึ้นไป' },
  { value: 'BETWEEN',     label: 'ช่วงวัน' },
  { value: 'UNTIL_DAY',   label: 'N วันหรือน้อยกว่า' },
]

function formatDayRange(rangeType: CondSeatRangeType, from: number | null, to: number | null): string {
  switch (rangeType) {
    case 'FROM_DAY_UP': return from != null ? `${from} วันขึ้นไป` : 'N วันขึ้นไป'
    case 'BETWEEN':     return (from != null && to != null) ? `${from}–${to} วัน` : 'ช่วงวัน'
    case 'UNTIL_DAY':   return to != null ? `${to} วันหรือน้อยกว่า` : 'N วันหรือน้อยกว่า'
  }
}

function findMatchingRule(rules: CondSeatReductionRule[], days: number): CondSeatReductionRule | null {
  return rules.find(r => {
    if (r.rangeType === 'FROM_DAY_UP') return days >= (r.fromDays ?? 0)
    if (r.rangeType === 'UNTIL_DAY')   return days <= (r.toDays ?? 0)
    return days >= (r.toDays ?? 0) && days <= (r.fromDays ?? Infinity)
  }) ?? null
}

function SrRuleCard({
  rule, ruleNo, currency, readOnly, onChange, onRemove, onDuplicate, onMoveUp, onMoveDown,
}: {
  rule: CondSeatReductionRule
  ruleNo: number
  currency: string
  readOnly: boolean
  onChange: (patch: Partial<CondSeatReductionRule>) => void
  onRemove: () => void
  onDuplicate: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const [expanded, setExpanded] = useState(true)

  const overLimitLabel: Record<CondRuleOverLimitAction, string> = {
    UNSPECIFIED: 'ยังไม่กำหนด', NO_FORFEIT: 'ไม่ยึดเงิน',
    FORFEIT: 'ยึดเงิน', PENALTY: 'คิดค่าปรับ', REQUIRE_APPROVAL: 'ต้องขออนุมัติ',
  }
  const penaltyLabel =
    rule.penaltyType === 'PERCENT'    ? `${rule.penaltyPercent ?? '?'}%` :
    rule.penaltyType === 'FIXED'      ? `${(rule.penaltyAmount ?? 0).toLocaleString()} ${currency}` :
    rule.penaltyType === 'FORFEIT_ALL'? 'ยึดเต็ม' : ''

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-50 border-b border-slate-100">
        <span className="text-[10px] font-bold text-[#05a94f] bg-[#05a94f]/10 px-2 py-0.5 rounded-full shrink-0">
          Step {ruleNo}
        </span>
        <button type="button" onClick={() => setExpanded(e => !e)}
          className="flex-1 flex items-center gap-2 text-left min-w-0">
          <p className="text-xs font-semibold text-slate-700 flex-1 truncate">
            {formatDayRange(rule.rangeType, rule.fromDays, rule.toDays)}
          </p>
          {(() => {
            const rCt = rule.calcType ?? null
            if (rCt === 'NOT_ALLOWED') {
              return (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium shrink-0">
                  ลดไม่ได้
                </span>
              )
            } else if (rCt === 'UNLIMITED') {
              return (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium shrink-0">
                  ต้องตรวจสอบ
                </span>
              )
            } else if (rCt === 'SEAT_COUNT') {
              return rule.maxReduceSeat != null ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium shrink-0">
                  ลด {rule.maxReduceSeat} Seat
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-medium shrink-0">
                  ยังไม่ระบุ
                </span>
              )
            } else if (rCt === 'PERCENT') {
              return rule.maxReducePercent != null ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium shrink-0">
                  ลด {rule.maxReducePercent}%
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-medium shrink-0">
                  ยังไม่ระบุ
                </span>
              )
            } else {
              return (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-medium shrink-0">
                  ยังไม่ระบุ
                </span>
              )
            }
          })()}
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
            rule.ruleOverLimitAction === 'NO_FORFEIT'       ? 'bg-slate-100 text-slate-500' :
            rule.ruleOverLimitAction === 'FORFEIT'          ? 'bg-orange-50 text-orange-600' :
            rule.ruleOverLimitAction === 'PENALTY'          ? 'bg-amber-50 text-amber-700' :
            rule.ruleOverLimitAction === 'REQUIRE_APPROVAL' ? 'bg-purple-50 text-purple-600' :
                                                              'bg-slate-100 text-slate-400',
          )}>
            {overLimitLabel[rule.ruleOverLimitAction]}
            {penaltyLabel ? ` ${penaltyLabel}` : ''}
          </span>
          <ChevronDown size={12} className={cn('text-slate-400 transition-transform shrink-0', expanded && 'rotate-180')} />
        </button>
        {!readOnly && (
          <div className="flex items-center shrink-0">
            {onMoveUp && (
              <button type="button" onClick={onMoveUp}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
                <ArrowUp size={11} />
              </button>
            )}
            {onMoveDown && (
              <button type="button" onClick={onMoveDown}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
                <ArrowDown size={11} />
              </button>
            )}
            <button type="button" onClick={onDuplicate}
              className="p-1 rounded text-slate-400 hover:text-[#05a94f] hover:bg-emerald-50 transition">
              <Copy size={11} />
            </button>
            <button type="button" onClick={onRemove}
              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition">
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-3 py-3 space-y-3">

          {/* Range type */}
          <div>
            <Label>รูปแบบช่วงวัน</Label>
            <StatusPills<CondSeatRangeType>
              value={rule.rangeType}
              onChange={v => {
                const patch: Partial<CondSeatReductionRule> = { rangeType: v }
                if (v === 'FROM_DAY_UP') patch.toDays   = null
                if (v === 'UNTIL_DAY')   patch.fromDays = null
                onChange(patch)
              }}
              options={SR_RANGE_TYPE_OPTIONS}
              disabled={readOnly}
            />
          </div>

          {/* Day inputs — context-sensitive */}
          <div className={cn('grid gap-3', rule.rangeType === 'BETWEEN' ? 'grid-cols-2' : 'grid-cols-1 max-w-[50%]')}>
            {(rule.rangeType === 'FROM_DAY_UP' || rule.rangeType === 'BETWEEN') && (
              <div>
                <Label required>ตั้งแต่ (วันก่อนเดินทาง)</Label>
                <div className="flex items-center gap-2">
                  <FInput
                    type="number" min={0}
                    value={rule.fromDays ?? ''}
                    onChange={v => onChange({ fromDays: v === '' ? null : Number(v) })}
                    placeholder="เช่น 45"
                    disabled={readOnly}
                  />
                  <span className="text-xs text-slate-500 shrink-0">วัน</span>
                </div>
              </div>
            )}
            {(rule.rangeType === 'BETWEEN' || rule.rangeType === 'UNTIL_DAY') && (
              <div>
                <Label required>ถึง (วันก่อนเดินทาง)</Label>
                <div className="flex items-center gap-2">
                  <FInput
                    type="number" min={0}
                    value={rule.toDays ?? ''}
                    onChange={v => onChange({ toDays: v === '' ? null : Number(v) })}
                    placeholder="เช่น 30"
                    disabled={readOnly}
                  />
                  <span className="text-xs text-slate-500 shrink-0">วัน</span>
                </div>
              </div>
            )}
          </div>

          {/* calcType selector (Row A) */}
          {(() => {
            const rCt: CondSeatCalcType = rule.calcType ?? 'PERCENT'
            const isLegacyUnlimited = rule.calcType === 'UNLIMITED'
            return (
              <div className="space-y-3">
                {/* Legacy UNLIMITED warning for step rules */}
                {isLegacyUnlimited && !readOnly && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                    <AlertCircle size={13} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 font-semibold">ข้อมูลเดิมใช้ "ไม่จำกัด" ซึ่งไม่รองรับอีกต่อไป — กรุณาเลือกวิธีระบุใหม่:</p>
                  </div>
                )}
                <div>
                  <Label>วิธีระบุจำนวนที่ลดได้</Label>
                  <div className="flex gap-2 mt-1">
                    {([
                      { value: 'PERCENT'     as CondSeatCalcType, label: 'เปอร์เซ็นต์ (%)' },
                      { value: 'SEAT_COUNT'  as CondSeatCalcType, label: 'จำนวน Seat' },
                      { value: 'NOT_ALLOWED' as CondSeatCalcType, label: 'ลดไม่ได้' },
                    ]).map(opt => (
                      <button key={opt.value} type="button" disabled={readOnly}
                        onClick={() => {
                          const patch: Partial<CondSeatReductionRule> = { calcType: opt.value }
                          if (opt.value === 'NOT_ALLOWED') {
                            patch.maxReducePercent = null
                            patch.maxReduceSeat = null
                            patch.scope = null
                          } else if (opt.value === 'PERCENT') {
                            patch.maxReduceSeat = null
                            if (!rule.scope) patch.scope = 'PER_PNR'
                          } else {
                            patch.maxReducePercent = null
                            if (!rule.scope) patch.scope = 'PER_PNR'
                          }
                          onChange(patch)
                        }}
                        className={cn(
                          'flex-1 px-3 py-2 rounded-xl border text-xs font-semibold transition',
                          rCt === opt.value
                            ? 'border-[#05a94f] bg-[#05a94f]/10 text-[#05a94f]'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                          readOnly && 'pointer-events-none',
                        )}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* NOT_ALLOWED note */}
                {rCt === 'NOT_ALLOWED' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <span className="text-xs text-red-700 font-medium">ช่วงนี้ไม่อนุญาตให้ลดที่นั่ง</span>
                  </div>
                )}

                {/* Row B: conditional fields (hidden for NOT_ALLOWED) */}
                {rCt !== 'NOT_ALLOWED' && (
                  <div className="grid grid-cols-2 gap-3">
                    {rCt === 'PERCENT' && (
                      <div>
                        <Label>ลดได้สูงสุด</Label>
                        <div className="flex items-center gap-2">
                          <FInput
                            type="number" min={0} max={100} step={0.01}
                            value={rule.maxReducePercent ?? ''}
                            onChange={v => onChange({ maxReducePercent: v === '' ? null : Number(v) })}
                            placeholder="เช่น 30"
                            disabled={readOnly}
                          />
                          <span className="text-xs text-slate-500 shrink-0">%</span>
                        </div>
                      </div>
                    )}
                    {rCt === 'SEAT_COUNT' && (
                      <div>
                        <Label>ลดได้สูงสุด</Label>
                        <div className="flex items-center gap-2">
                          <FInput
                            type="number" min={0} step={1}
                            value={rule.maxReduceSeat ?? ''}
                            onChange={v => onChange({ maxReduceSeat: v === '' ? null : Math.round(Number(v)) })}
                            placeholder="เช่น 5"
                            disabled={readOnly}
                          />
                          <span className="text-xs text-slate-500 shrink-0">Seat</span>
                        </div>
                      </div>
                    )}
                    <div>
                      <Label>ขอบเขต</Label>
                      <div className="flex gap-1.5">
                        {([
                          { value: 'PER_PNR'    as CondSeatScope, label: 'ต่อ PNR' },
                          { value: 'PER_SERIES'  as CondSeatScope, label: 'ต่อ Series' },
                        ]).map(opt => (
                          <button key={opt.value} type="button" disabled={readOnly}
                            onClick={() => onChange({ scope: opt.value })}
                            className={cn(
                              'flex-1 px-2 py-2 rounded-xl border text-xs font-semibold transition',
                              rule.scope === opt.value
                                ? 'border-[#05a94f] bg-[#05a94f]/10 text-[#05a94f]'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                              readOnly && 'pointer-events-none',
                            )}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ruleOverLimitAction */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>หากเกินเงื่อนไข</Label>
              <FSelect<CondRuleOverLimitAction>
                value={rule.ruleOverLimitAction}
                onChange={v => {
                  if (!v) return
                  const patch: Partial<CondSeatReductionRule> = { ruleOverLimitAction: v as CondRuleOverLimitAction }
                  if (v !== 'FORFEIT') patch.forfeitSource = null
                  if (v !== 'PENALTY') { patch.penaltyType = 'NONE'; patch.penaltyAmount = null; patch.penaltyPercent = null }
                  onChange(patch)
                }}
                options={SR_RULE_OVER_LIMIT_OPTIONS}
                disabled={readOnly}
              />
            </div>
          </div>

          {/* Description for non-input actions */}
          {rule.ruleOverLimitAction === 'UNSPECIFIED' && (
            <p className="text-[10px] text-slate-400 italic px-0.5">ยังไม่ได้กำหนดผลลัพธ์เมื่อเกินเงื่อนไข</p>
          )}
          {rule.ruleOverLimitAction === 'NO_FORFEIT' && (
            <p className="text-[10px] text-slate-400 italic px-0.5">เกินเงื่อนไขแล้วไม่เสียค่าใช้จ่ายเพิ่ม</p>
          )}
          {rule.ruleOverLimitAction === 'REQUIRE_APPROVAL' && (
            <p className="text-[10px] text-purple-500 italic px-0.5">ต้องส่งให้ผู้มีอำนาจอนุมัติก่อนดำเนินการ</p>
          )}

          {/* Forfeit source — shown when FORFEIT */}
          {rule.ruleOverLimitAction === 'FORFEIT' && (
            <div>
              <Label required>ยึดเงินจาก</Label>
              <div className="grid grid-cols-3 gap-2">
                {SR_FORFEIT_SOURCE_OPTIONS.map(opt => (
                  <label key={opt.value} className={cn(
                    'flex flex-col gap-1 p-2.5 rounded-xl border cursor-pointer select-none transition',
                    rule.forfeitSource === opt.value
                      ? 'border-orange-400 bg-orange-50'
                      : 'border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/30',
                    readOnly && 'pointer-events-none opacity-60',
                  )}>
                    <input type="radio" className="sr-only" checked={rule.forfeitSource === opt.value}
                      onChange={() => onChange({ forfeitSource: opt.value })} disabled={readOnly} />
                    <span className="text-xs font-semibold text-slate-700">{opt.label}</span>
                    <span className="text-[10px] text-slate-400 leading-snug">{opt.desc}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Penalty type — shown when PENALTY */}
          {rule.ruleOverLimitAction === 'PENALTY' && (
            <>
              <div>
                <Label>ประเภทค่าปรับ</Label>
                <StatusPills<CondStepPenaltyType>
                  value={rule.penaltyType}
                  onChange={v => {
                    const patch: Partial<CondSeatReductionRule> = { penaltyType: v }
                    if (v !== 'FIXED')   patch.penaltyAmount  = null
                    if (v !== 'PERCENT') patch.penaltyPercent = null
                    onChange(patch)
                  }}
                  options={SR_PENALTY_OPTIONS}
                  disabled={readOnly}
                />
              </div>

              {rule.penaltyType === 'FIXED' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>จำนวนเงินค่าปรับ</Label>
                    <div className="flex items-center gap-2">
                      <FInput
                        type="number" min={0}
                        value={rule.penaltyAmount ?? ''}
                        onChange={v => onChange({ penaltyAmount: v === '' ? null : Number(v) })}
                        placeholder="0"
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>สกุลเงิน</Label>
                    <FSelect<string>
                      value={rule.currency || currency}
                      onChange={v => v && onChange({ currency: v })}
                      options={getCurrencyOptions().map(c => ({ value: c.currencyCode, label: c.currencyCode }))}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              )}

              {rule.penaltyType === 'PERCENT' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>เปอร์เซ็นต์ค่าปรับ</Label>
                    <div className="flex items-center gap-2">
                      <FInput
                        type="number" min={0} max={100}
                        value={rule.penaltyPercent ?? ''}
                        onChange={v => onChange({ penaltyPercent: v === '' ? null : Number(v) })}
                        placeholder="0"
                        disabled={readOnly}
                      />
                      <span className="text-xs text-slate-500 shrink-0">%</span>
                    </div>
                  </div>
                  <div>
                    <Label>ฐานคำนวณ</Label>
                    <FSelect<CondStepCalcBase>
                      value={rule.calcBase}
                      onChange={v => v && onChange({ calcBase: v as CondStepCalcBase })}
                      options={(Object.entries(SR_CALC_BASE_LABELS) as [CondStepCalcBase, string][]).map(([val, lbl]) => ({ value: val, label: lbl }))}
                      disabled={readOnly}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Remark */}
          <div>
            <Label>หมายเหตุ (ไม่บังคับ)</Label>
            <FInput
              value={rule.remark}
              onChange={v => onChange({ remark: v })}
              placeholder="หมายเหตุเพิ่มเติม..."
              disabled={readOnly}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function SeatReductionSection({ value, onChange, readOnly, currency, errors = [], departureDate }: {
  value: AppCondition; onChange: (v: AppCondition) => void; readOnly: boolean; currency: string; errors?: string[]; departureDate?: string
}) {
  const sp = migrateSeatReductionPolicy(value.seatReductionPolicy)
  const setSp = (patch: Partial<CondSeatReductionPolicy>) =>
    onChange({ ...value, seatReductionPolicy: { ...sp, noticeDaysBase: 'DEPARTURE_DATE', ...patch } })

  const computedReduceDeadline: string | null = (() => {
    if (sp.noticeDays == null || !departureDate) return null
    try {
      const dep = parseISO(departureDate)
      if (!isValid(dep)) return null
      return format(subDays(dep, sp.noticeDays), 'dd MMM yy')
    } catch { return null }
  })()

  const setRule = (idx: number, patch: Partial<CondSeatReductionRule>) =>
    setSp({ rules: sp.rules.map((r, i) => i === idx ? { ...r, ...patch } : r) })
  const addRule      = () => setSp({ rules: [...sp.rules, defaultSeatReductionRule()] })
  const removeRule   = (idx: number) => setSp({ rules: sp.rules.filter((_, i) => i !== idx) })
  const duplicateRule = (idx: number) => {
    const dup = { ...sp.rules[idx], id: newSeatReductionRuleId() }
    const next = [...sp.rules]
    next.splice(idx + 1, 0, dup)
    setSp({ rules: next })
  }
  const moveRule = (idx: number, dir: -1 | 1) => {
    const next = [...sp.rules]
    const to = idx + dir
    if (to < 0 || to >= next.length) return
    ;[next[idx], next[to]] = [next[to], next[idx]]
    setSp({ rules: next })
  }
  const autoSort = () => {
    const upperBound = (r: CondSeatReductionRule): number =>
      r.rangeType === 'FROM_DAY_UP' ? Infinity :
      r.rangeType === 'BETWEEN'     ? (r.fromDays ?? Infinity) :
      (r.toDays ?? 0)
    setSp({ rules: [...sp.rules].sort((a, b) => upperBound(b) - upperBound(a)) })
  }
  const addPreset = () => setSp({
    rules: [
      { ...defaultSeatReductionRule(), rangeType: 'FROM_DAY_UP', fromDays: 45, toDays: null, maxReducePercent: 20 },
      { ...defaultSeatReductionRule(), rangeType: 'BETWEEN',     fromDays: 44, toDays: 30,   maxReducePercent: 15 },
      { ...defaultSeatReductionRule(), rangeType: 'BETWEEN',     fromDays: 29, toDays: 21,   maxReducePercent: 10 },
      { ...defaultSeatReductionRule(), rangeType: 'UNTIL_DAY',   fromDays: null, toDays: 20, maxReducePercent: 0, ruleOverLimitAction: 'NO_FORFEIT' },
    ],
  })

  return (
    <div className="space-y-4">
      <ErrorBox errors={errors} />

      {/* ── Master toggle ── */}
      <label className="flex items-center gap-3 cursor-pointer select-none p-4 rounded-2xl border border-slate-200 hover:bg-slate-50 transition">
        <Toggle
          checked={sp.enabled}
          onChange={v => setSp({ enabled: v, ...(v && { allowReduction: 'ALLOW' }) })}
          disabled={readOnly}
        />
        <div>
          <p className="text-sm font-semibold text-slate-800">เปิดใช้งานเงื่อนไขการลดที่นั่ง</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {sp.enabled ? 'เปิดใช้งาน — กรอกเงื่อนไขด้านล่าง' : 'ปิดอยู่ — ไม่มีเงื่อนไขการลดที่นั่ง'}
          </p>
        </div>
      </label>

      {sp.enabled && (
        <>
          {/* ── Card 1: General Settings ── */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
              <Info size={14} className="text-slate-500" />
              <p className="text-xs font-semibold text-slate-700">ตั้งค่าทั่วไป</p>
            </div>
            <div className="px-4 py-4 space-y-4">

              {/* รายละเอียดเงื่อนไขการลดที่นั่ง */}
              <div>
                <Label>รายละเอียดเงื่อนไขการลดที่นั่ง</Label>
                <FTextarea
                  value={sp.remark}
                  onChange={v => setSp({ remark: v })}
                  placeholder="เช่น อนุญาตลดได้ 30% ก่อนเดินทาง 45 วัน หากเกินเงื่อนไขไม่มีคืนเงิน"
                  rows={3}
                  maxLength={1000}
                  disabled={readOnly}
                />
                {sp.remark.length > 900 && (
                  <p className="text-[10px] text-slate-400 mt-0.5 text-right">{sp.remark.length}/1000</p>
                )}
              </div>

              <>
                  {/* mode */}
                  <div>
                    <Label>รูปแบบเงื่อนไขการลดที่นั่ง</Label>
                    <StatusPills<CondSeatReductionMode>
                      value={sp.mode}
                      onChange={v => setSp({
                        mode: v,
                        ...(v !== 'SINGLE' ? {
                          maxReducePercent: null, noticeDays: null,
                          singleOverLimitAction: 'NO_FORFEIT',
                          singlePenaltyType: 'NONE', singlePenaltyAmount: null,
                          singlePenaltyPercent: null, singleCalcBase: 'GROUP_PRICE',
                        } : { rules: [] }),
                      })}
                      options={SR_MODE_OPTIONS}
                      disabled={readOnly}
                    />
                  </div>

                  {/* ── จำนวนที่นั่งที่ลดได้ ─────────────────────────────────────────── */}
                  {sp.mode === 'SINGLE' && (() => {
                    const calcType = (sp.calcType === 'PERCENT' || sp.calcType === 'SEAT_COUNT') ? sp.calcType : null
                    const isLegacyUnlimited = sp.calcType === 'UNLIMITED'
                    return (
                      <div className="space-y-3">
                        {/* Legacy UNLIMITED warning */}
                        {isLegacyUnlimited && !readOnly && (
                          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                            <AlertCircle size={13} className="text-amber-600 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs text-amber-800 font-semibold">ข้อมูลเดิมใช้ "ไม่จำกัด" ซึ่งไม่รองรับอีกต่อไป — กรุณาเลือกวิธีระบุใหม่:</p>
                            </div>
                          </div>
                        )}
                        {/* Row 1: calcType selector */}
                        <div>
                          <Label>วิธีระบุจำนวนที่ลดได้</Label>
                          <div className="flex gap-2 mt-1">
                            {([
                              { value: 'PERCENT'    as CondSeatCalcType, label: 'เปอร์เซ็นต์ (%)' },
                              { value: 'SEAT_COUNT' as CondSeatCalcType, label: 'จำนวน Seat' },
                            ]).map(opt => (
                              <button key={opt.value} type="button" disabled={readOnly}
                                onClick={() => {
                                  const patch: Partial<CondSeatReductionPolicy> = { calcType: opt.value }
                                  if (opt.value === 'PERCENT') {
                                    patch.maxReduceSeat = null
                                    if (!sp.scope) patch.scope = 'PER_PNR'
                                  } else {
                                    patch.maxReducePercent = null
                                    if (!sp.scope) patch.scope = 'PER_PNR'
                                  }
                                  setSp(patch)
                                }}
                                className={cn(
                                  'flex-1 px-3 py-2 rounded-xl border text-xs font-semibold transition',
                                  calcType === opt.value
                                    ? 'border-[#05a94f] bg-[#05a94f]/10 text-[#05a94f]'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                                  readOnly && 'pointer-events-none',
                                )}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Row 2: conditional fields */}
                        {calcType !== null && (
                          <div className="grid grid-cols-2 gap-3">
                            {calcType === 'PERCENT' && (
                              <div>
                                <Label>ลดได้สูงสุด</Label>
                                <div className="flex items-center gap-2">
                                  <FInput
                                    type="number" min={0} max={100} step={0.01}
                                    value={sp.maxReducePercent ?? ''}
                                    onChange={v => setSp({ maxReducePercent: v === '' ? null : Number(v) })}
                                    placeholder="เช่น 30"
                                    disabled={readOnly}
                                  />
                                  <span className="text-xs text-slate-500 shrink-0">%</span>
                                </div>
                              </div>
                            )}
                            {calcType === 'SEAT_COUNT' && (
                              <div>
                                <Label>ลดได้สูงสุด</Label>
                                <div className="flex items-center gap-2">
                                  <FInput
                                    type="number" min={0} step={1}
                                    value={sp.maxReduceSeat ?? ''}
                                    onChange={v => setSp({ maxReduceSeat: v === '' ? null : Math.round(Number(v)) })}
                                    placeholder="เช่น 5"
                                    disabled={readOnly}
                                  />
                                  <span className="text-xs text-slate-500 shrink-0">Seat</span>
                                </div>
                              </div>
                            )}
                            <div>
                              <Label>ขอบเขต</Label>
                              {sp.scope === null && (
                                <div className="mb-1 flex items-center gap-1 text-[10px] text-amber-600">
                                  <AlertCircle size={10} />
                                  <span>ยังไม่ระบุขอบเขต — โปรดเลือก</span>
                                </div>
                              )}
                              <div className="flex gap-1.5">
                                {([
                                  { value: 'PER_PNR'    as CondSeatScope, label: 'ต่อ PNR',    desc: 'คิดแยกต่อ PNR' },
                                  { value: 'PER_SERIES'  as CondSeatScope, label: 'ต่อ Series',  desc: 'คิดรวมทุก PNR ใน Series' },
                                ]).map(opt => (
                                  <button key={opt.value} type="button" disabled={readOnly}
                                    onClick={() => setSp({ scope: opt.value })}
                                    className={cn(
                                      'flex flex-col gap-0.5 flex-1 px-2 py-2 rounded-xl border text-left transition',
                                      sp.scope === opt.value
                                        ? 'border-[#05a94f] bg-[#05a94f]/10'
                                        : 'border-slate-200 bg-white hover:border-slate-300',
                                      readOnly && 'pointer-events-none',
                                    )}>
                                    <span className={cn('text-xs font-semibold', sp.scope === opt.value ? 'text-[#05a94f]' : 'text-slate-700')}>{opt.label}</span>
                                    <span className="text-[10px] text-slate-400 leading-snug">{opt.desc}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Basis — shown only for PERCENT mode */}
                        {calcType === 'PERCENT' && (
                          <div>
                            <Label>คำนวณจำนวนที่นั่งจาก</Label>
                            <FSelect<CondSeatBasis>
                              value={sp.basis}
                              onChange={v => v && setSp({ basis: v as CondSeatBasis })}
                              options={SR_BASIS_OPTIONS}
                              disabled={readOnly}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Basis for STEP_RULE mode */}
                  {sp.mode === 'STEP_RULE' && (
                    <div>
                      <Label>คำนวณจำนวนที่นั่งจาก</Label>
                      <FSelect<CondSeatBasis>
                        value={sp.basis}
                        onChange={v => v && setSp({ basis: v as CondSeatBasis })}
                        options={SR_BASIS_OPTIONS}
                        disabled={readOnly}
                      />
                    </div>
                  )}

                  {/* SINGLE mode: deadline notice + overLimitAction + penalty fields */}
                  {sp.mode === 'SINGLE' && (
                    <>
                      {/* ── Deadline การแจ้งลดที่นั่ง ─────────────────────────────── */}
                      <div>
                        <Label>แจ้งลดไม่น้อยกว่า</Label>
                        <div className="flex items-center gap-2">
                          <FInput
                            type="number" min={0}
                            value={sp.noticeDays ?? ''}
                            onChange={v => setSp({ noticeDays: v === '' ? null : Number(v) })}
                            placeholder="ไม่จำกัด"
                            disabled={readOnly}
                          />
                          <span className="text-xs text-slate-500 shrink-0">วัน</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">ระบบคำนวณย้อนหลังจากวันเดินทาง Sector แรกโดยอัตโนมัติ</p>
                      </div>

                      {/* คำนวณจาก (read-only) + deadline preview */}
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-[11px]">
                        <Info size={11} className="text-slate-400 shrink-0" />
                        <span className="text-slate-500 shrink-0">คำนวณวัน Deadline จาก:</span>
                        <span className="font-medium text-slate-700 shrink-0">วันเดินทางแรก</span>
                        {sp.noticeDays != null && (
                          <>
                            <span className="text-slate-300 shrink-0">·</span>
                            <span className="text-slate-500 shrink-0">Deadline:</span>
                            {computedReduceDeadline ? (
                              <>
                                <span className="font-semibold text-[#05a94f]">{computedReduceDeadline}</span>
                                <span className="text-slate-400 ml-0.5">(วันเดินทาง − {sp.noticeDays} วัน)</span>
                              </>
                            ) : (
                              <span className="text-slate-400 italic">จะคำนวณเมื่อมีการกำหนดวันเดินทาง</span>
                            )}
                          </>
                        )}
                      </div>

                      {/* หากเกินเงื่อนไข — 3 radio-style buttons */}
                      <div>
                        <Label>หากเกินเงื่อนไข</Label>
                        <div className="flex gap-2 mt-1">
                          {([
                            { value: 'NO_FORFEIT', label: 'ไม่ยึดเงิน',  activeColor: 'border-emerald-400 bg-emerald-50', textColor: 'text-emerald-700', desc: 'เกินเงื่อนไขแล้วไม่เสียค่าใช้จ่ายเพิ่ม' },
                            { value: 'FORFEIT',    label: 'ยึดเงิน',      activeColor: 'border-orange-400 bg-orange-50',  textColor: 'text-orange-700',  desc: 'ยึดเงินตามรูปแบบที่กำหนด' },
                            { value: 'PENALTY',    label: 'คิดค่าปรับ',   activeColor: 'border-red-400 bg-red-50',        textColor: 'text-red-700',     desc: 'คำนวณค่าปรับตามเงื่อนไข' },
                          ] as { value: CondSingleOverLimit; label: string; activeColor: string; textColor: string; desc: string }[]).map(opt => {
                            const isActive = sp.singleOverLimitAction === opt.value
                            return (
                              <button key={opt.value} type="button" disabled={readOnly}
                                onClick={() => {
                                  const patch: Partial<CondSeatReductionPolicy> = { singleOverLimitAction: opt.value }
                                  if (opt.value !== 'FORFEIT') patch.singleForfeitSource = null
                                  if (opt.value !== 'PENALTY') {
                                    patch.singlePenaltyType     = 'NONE'
                                    patch.singlePenaltyPercent  = null
                                    patch.singlePenaltyAmount   = null
                                    patch.singlePenaltyCurrency = ''
                                  }
                                  setSp(patch)
                                }}
                                className={cn(
                                  'flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border-2 text-left flex-1 transition',
                                  readOnly && 'pointer-events-none',
                                  isActive ? opt.activeColor : 'border-slate-200 bg-white hover:border-slate-300',
                                )}>
                                <span className={cn('text-xs font-semibold', isActive ? opt.textColor : 'text-slate-700')}>{opt.label}</span>
                                <span className="text-[10px] text-slate-400 leading-snug">{opt.desc}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {/* Forfeit mode — shown when FORFEIT */}
                      {sp.singleOverLimitAction === 'FORFEIT' && (
                        <div>
                          <Label required>รูปแบบการยึดเงิน</Label>
                          <div className="grid grid-cols-2 gap-2">
                            {SR_FORFEIT_SOURCE_OPTIONS.map(opt => (
                              <label key={opt.value} className={cn(
                                'flex flex-col gap-1 p-2.5 rounded-xl border-2 cursor-pointer select-none transition',
                                sp.singleForfeitSource === opt.value
                                  ? 'border-orange-400 bg-orange-50'
                                  : 'border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/30',
                                readOnly && 'pointer-events-none opacity-60',
                              )}>
                                <input type="radio" className="sr-only"
                                  checked={sp.singleForfeitSource === opt.value}
                                  onChange={() => setSp({ singleForfeitSource: opt.value })}
                                  disabled={readOnly} />
                                <span className="text-xs font-semibold text-slate-700">{opt.label}</span>
                                <span className="text-[10px] text-slate-400 leading-snug">{opt.desc}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Penalty fields for SINGLE mode */}
                      {sp.singleOverLimitAction === 'PENALTY' && (
                        <>
                          <div>
                            <Label>ประเภทค่าปรับ</Label>
                            <StatusPills<CondStepPenaltyType>
                              value={sp.singlePenaltyType}
                              onChange={v => {
                                const patch: Partial<CondSeatReductionPolicy> = { singlePenaltyType: v }
                                if (v !== 'FIXED')   patch.singlePenaltyAmount  = null
                                if (v !== 'PERCENT') patch.singlePenaltyPercent = null
                                setSp(patch)
                              }}
                              options={SR_PENALTY_OPTIONS}
                              disabled={readOnly}
                            />
                          </div>
                          {sp.singlePenaltyType === 'FIXED' && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label required>จำนวนเงินค่าปรับ</Label>
                                <FInput
                                  type="number" min={0}
                                  value={sp.singlePenaltyAmount ?? ''}
                                  onChange={v => setSp({ singlePenaltyAmount: v === '' ? null : Number(v) })}
                                  placeholder="0"
                                  disabled={readOnly}
                                />
                              </div>
                              <div>
                                <Label>สกุลเงิน</Label>
                                <FSelect<string>
                                  value={sp.singlePenaltyCurrency || currency}
                                  onChange={v => v && setSp({ singlePenaltyCurrency: v })}
                                  options={getCurrencyOptions().map(c => ({ value: c.currencyCode, label: c.currencyCode }))}
                                  disabled={readOnly}
                                />
                              </div>
                            </div>
                          )}
                          {sp.singlePenaltyType === 'PERCENT' && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label required>เปอร์เซ็นต์ค่าปรับ</Label>
                                <div className="flex items-center gap-2">
                                  <FInput
                                    type="number" min={0} max={100}
                                    value={sp.singlePenaltyPercent ?? ''}
                                    onChange={v => setSp({ singlePenaltyPercent: v === '' ? null : Number(v) })}
                                    placeholder="0"
                                    disabled={readOnly}
                                  />
                                  <span className="text-xs text-slate-500 shrink-0">%</span>
                                </div>
                              </div>
                              <div>
                                <Label>ฐานคำนวณ</Label>
                                <FSelect<CondStepCalcBase>
                                  value={sp.singleCalcBase}
                                  onChange={v => v && setSp({ singleCalcBase: v as CondStepCalcBase })}
                                  options={(Object.entries(SR_CALC_BASE_LABELS) as [CondStepCalcBase, string][]).map(([val, lbl]) => ({ value: val, label: lbl }))}
                                  disabled={readOnly}
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>

            </div>
          </div>

          {/* ── Live Preview ── */}
          {(() => {
            const basisLabel = SR_BASIS_OPTIONS.find(o => o.value === sp.basis)?.label ?? sp.basis
            const lines: { text: string; missing: boolean }[] = []
            if (sp.mode === 'SINGLE') {
              const spCt = sp.calcType
              const scopeText = sp.scope === 'PER_PNR' ? ' ต่อ PNR' : sp.scope === 'PER_SERIES' ? ' รวมต่อ Series' : ' (ยังไม่ระบุขอบเขต)'
              if (spCt == null || spCt === 'UNLIMITED') {
                lines.push({ text: 'ยังไม่ได้กำหนดวิธีระบุจำนวนที่ลดได้ — กรุณาเลือกเปอร์เซ็นต์หรือจำนวน Seat', missing: true })
              } else if (spCt === 'SEAT_COUNT') {
                if (sp.maxReduceSeat != null) {
                  lines.push({ text: `อนุญาตลดที่นั่งได้ไม่เกิน ${sp.maxReduceSeat} Seat${scopeText}`, missing: false })
                } else {
                  lines.push({ text: 'อนุญาตลดที่นั่งได้ แต่ยังไม่ได้ระบุจำนวน Seat สูงสุด', missing: true })
                }
              } else {
                // PERCENT (default)
                if (sp.maxReducePercent != null) {
                  lines.push({ text: `อนุญาตลดที่นั่งได้ไม่เกิน ${sp.maxReducePercent}% ของ ${basisLabel}${scopeText}`, missing: false })
                } else {
                  lines.push({ text: 'อนุญาตลดที่นั่งได้ แต่ยังไม่ได้ระบุจำนวนสูงสุด', missing: true })
                }
              }
              if (sp.noticeDays != null) {
                lines.push({ text: `โดยต้องแจ้งลดไม่น้อยกว่า ${sp.noticeDays} วันก่อนเดินทาง`, missing: false })
              } else {
                lines.push({ text: 'ยังไม่ได้ระบุจำนวนวันที่ต้องแจ้งลดก่อนเดินทาง', missing: true })
              }
              let overLimitSuffix = ''
              let overLimitMissing = false
              if (sp.singleOverLimitAction === 'UNSPECIFIED') {
                overLimitSuffix = 'ยังไม่ได้กำหนดผลลัพธ์'
                overLimitMissing = true
              } else if (sp.singleOverLimitAction === 'NO_FORFEIT') {
                overLimitSuffix = 'ไม่เสียค่าใช้จ่ายเพิ่ม'
              } else if (sp.singleOverLimitAction === 'FORFEIT') {
                overLimitSuffix = sp.singleForfeitSource
                  ? sp.singleForfeitSource === 'PAID_SO_FAR'
                    ? 'ยึดเงินตามยอดที่ชำระแล้ว'
                    : 'ยึดเงินทั้งหมด'
                  : 'ยึดเงิน (ยังไม่ได้เลือกรูปแบบ)'
                overLimitMissing = !sp.singleForfeitSource
              } else if (sp.singleOverLimitAction === 'REQUIRE_APPROVAL') {
                overLimitSuffix = 'ต้องขออนุมัติจากผู้มีอำนาจ'
              } else {
                if (sp.singlePenaltyType === 'NONE') {
                  overLimitSuffix = 'คิดค่าปรับ (ยังไม่ได้เลือกประเภท)'
                  overLimitMissing = true
                } else if (sp.singlePenaltyType === 'FORFEIT_ALL') {
                  overLimitSuffix = 'จะถูกยึดเงินเต็มจำนวน'
                } else if (sp.singlePenaltyType === 'FIXED') {
                  const penCur = sp.singlePenaltyCurrency || currency
                  if (sp.singlePenaltyAmount != null) {
                    overLimitSuffix = `คิดค่าปรับ ${sp.singlePenaltyAmount.toLocaleString('en-US')} ${penCur} ต่อที่นั่ง`
                  } else {
                    overLimitSuffix = 'ยังไม่ได้ระบุจำนวนเงินค่าปรับ'
                    overLimitMissing = true
                  }
                } else if (sp.singlePenaltyType === 'PERCENT') {
                  const calcBaseLabel = SR_CALC_BASE_LABELS[sp.singleCalcBase] ?? sp.singleCalcBase
                  if (sp.singlePenaltyPercent != null) {
                    overLimitSuffix = `คิดค่าปรับ ${sp.singlePenaltyPercent}% ของ ${calcBaseLabel}`
                  } else {
                    overLimitSuffix = 'ยังไม่ได้ระบุเปอร์เซ็นต์ค่าปรับ'
                    overLimitMissing = true
                  }
                }
              }
              lines.push({ text: `หากแจ้งลดเกินเงื่อนไข ${overLimitSuffix}`, missing: overLimitMissing })
            } else {
              if (sp.rules.length === 0) {
                lines.push({ text: 'ใช้เงื่อนไข Step แต่ยังไม่มี Step', missing: true })
              } else {
                lines.push({ text: `ใช้เงื่อนไข Step ${sp.rules.length} ช่วง:`, missing: false })
                sp.rules.forEach((r, i) => {
                  const rCt = r.calcType ?? 'PERCENT'
                  let reductionText: string
                  let missing = false
                  if (rCt === 'NOT_ALLOWED') {
                    reductionText = 'ลดไม่ได้'
                  } else if (rCt === 'UNLIMITED') {
                    reductionText = 'ต้องตรวจสอบ (ข้อมูลเดิม)'
                    missing = true
                  } else if (rCt === 'SEAT_COUNT') {
                    reductionText = r.maxReduceSeat != null ? `${r.maxReduceSeat} Seat` : '? Seat'
                    missing = r.maxReduceSeat == null
                  } else {
                    reductionText = r.maxReducePercent != null ? `${r.maxReducePercent}%` : '?%'
                    missing = r.maxReducePercent == null
                  }
                  lines.push({
                    text: `ช่วงที่ ${i + 1}: ${formatDayRange(r.rangeType, r.fromDays, r.toDays)} — ลดได้ ${reductionText}`,
                    missing,
                  })
                })
              }
            }
            if (sp.remark.trim()) {
              lines.push({ text: `รายละเอียดเพิ่มเติม: ${sp.remark.trim()}`, missing: false })
            }
            return (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-sky-100 border-b border-sky-200">
                  <Eye size={13} className="text-sky-600 shrink-0" />
                  <span className="text-xs font-semibold text-sky-800">ตัวอย่างจากข้อมูลที่ตั้งค่า</span>
                </div>
                <div className="px-4 py-3 space-y-1">
                  {lines.map((line, i) => (
                    <p key={i} className={cn('text-sm leading-relaxed', line.missing ? 'text-amber-600 italic' : 'text-slate-700')}>
                      {line.text}
                    </p>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* ── Card 2: Step Rules (only in STEP_RULE mode) ── */}
          {sp.mode === 'STEP_RULE' && (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
                <Layers size={14} className="text-slate-500" />
                <p className="text-xs font-semibold text-slate-700 flex-1">เงื่อนไข Step การลดที่นั่ง</p>
                {!readOnly && (
                  <button type="button" onClick={addPreset}
                    className="text-[10px] text-blue-600 hover:underline font-medium shrink-0">
                    เพิ่มชุดตัวอย่าง
                  </button>
                )}
                {sp.rules.length > 1 && !readOnly && (
                  <button type="button" onClick={autoSort}
                    className="text-[10px] text-[#05a94f] hover:underline font-medium shrink-0">
                    จัดเรียง
                  </button>
                )}
                {sp.rules.length > 0 && (
                  <span className="text-[10px] bg-[#05a94f]/10 text-[#05a94f] px-2 py-0.5 rounded-full font-semibold shrink-0">
                    {sp.rules.length} ช่วง
                  </span>
                )}
              </div>
              <div className="px-4 py-4 space-y-3">

                {sp.rules.length === 0 && (
                  <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-amber-300">
                    <Layers size={24} className="text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-500">ยังไม่มี Step</p>
                    <p className="text-[11px] text-slate-400 mt-1">เพิ่ม Step เพื่อกำหนดเงื่อนไขในแต่ละช่วงวัน</p>
                  </div>
                )}

                {sp.rules.map((rule, idx) => (
                  <SrRuleCard
                    key={rule.id}
                    rule={rule}
                    ruleNo={idx + 1}
                    currency={currency}
                    readOnly={readOnly}
                    onChange={patch => setRule(idx, patch)}
                    onRemove={() => removeRule(idx)}
                    onDuplicate={() => duplicateRule(idx)}
                    onMoveUp={idx > 0 ? () => moveRule(idx, -1) : undefined}
                    onMoveDown={idx < sp.rules.length - 1 ? () => moveRule(idx, 1) : undefined}
                  />
                ))}

                {!readOnly && (
                  <button type="button" onClick={addRule}
                    className={cn(
                      'w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed text-xs transition font-medium',
                      sp.rules.length === 0
                        ? 'border-amber-400 text-amber-600 hover:bg-amber-50'
                        : 'border-[#05a94f]/40 text-[#05a94f] hover:bg-emerald-50',
                    )}>
                    <Plus size={12} /> เพิ่ม Step
                  </button>
                )}
              </div>
            </div>
          )}

        </>
      )}
    </div>
  )
}

// ─── § 5 Refund Tab v2 ───────────────────────────────────────────────────────

const POST_FEE_TYPE_OPTIONS: { value: CondPostRefundFeeType; label: string }[] = [
  { value: 'NONE',    label: 'ไม่มี' },
  { value: 'FIX',     label: 'จำนวนเงิน' },
  { value: 'PERCENT', label: '%' },
]

const POST_FEE_BASE_OPTIONS: { value: CondPostRefundFeeBase; label: string }[] = [
  { value: 'REFUNDABLE_AMOUNT', label: 'ยอดที่คืน' },
  { value: 'TOTAL_PAID',        label: 'ยอดที่ชำระ' },
  { value: 'FARE',              label: 'Fare' },
  { value: 'TAX',               label: 'Tax' },
  { value: 'FUEL',              label: 'Fuel' },
]

const POST_REFUND_APPLY_AFTER_OPTIONS: { value: CondPostRefundApplyAfter; label: string }[] = [
  { value: 'AFTER_NAME_SUBMIT',   label: 'หลังส่งชื่อ' },
  { value: 'AFTER_TICKETING',     label: 'หลังออกตั๋ว' },
  { value: 'AFTER_DEPOSIT',       label: 'หลังชำระมัดจำ' },
  { value: 'AFTER_DEADLINE',      label: 'หลังครบกำหนดออกตั๋ว' },
  { value: 'AFTER_FULL_PAYMENT',  label: 'หลังชำระเต็มจำนวน' },
]

const POST_REFUND_MAIN_POLICY_OPTIONS: { value: CondPostRefundMainPolicy; label: string; desc: string }[] = [
  { value: 'UNSPECIFIED',        label: 'ไม่ระบุ',                   desc: 'ยังไม่ได้กำหนดนโยบาย Refund' },
  { value: 'NON_REFUNDABLE',     label: 'Refund ไม่ได้',             desc: 'ไม่อนุญาตให้คืนเงิน' },
  { value: 'PARTIAL_REFUND',     label: 'Refund ได้บางส่วน',         desc: 'คืนได้เฉพาะบางรายการ' },
  { value: 'FULL_REFUND',        label: 'Refund ได้ทั้งหมด',         desc: 'คืนได้เต็มจำนวน' },
]

const NAME_CHANGE_POLICY_OPTIONS: { value: CondNameChangePolicy; label: string }[] = [
  { value: 'UNSPECIFIED',      label: 'ไม่ระบุ' },
  { value: 'ALLOW',            label: 'อนุญาตให้เปลี่ยนชื่อ' },
  { value: 'NOT_ALLOW',        label: 'ไม่อนุญาตให้เปลี่ยนชื่อ' },
  { value: 'REQUIRE_APPROVAL', label: 'ต้องขออนุมัติ' },
]


const REFUND_ITEM_OPTIONS: { value: CondRefundItem; label: string; desc?: string; tooltip?: string }[] = [
  { value: 'FARE',    label: 'Fare',    desc: 'ค่าตั๋วโดยสาร' },
  { value: 'TAX',     label: 'Tax',     desc: 'ภาษี / ค่าธรรมเนียมภาษี' },
  { value: 'YQ',      label: 'YQ',      desc: 'Fuel / Carrier Surcharge', tooltip: 'Fuel Charge / Carrier Surcharge หรือค่าธรรมเนียมน้ำมันที่สายการบินเรียกเก็บ หากเอกสารสายการบินระบุ "Fuel Charge" ให้เลือก YQ' },
  { value: 'YR',      label: 'YR',      desc: 'ค่าธรรมเนียมสายการบิน',   tooltip: 'ค่าธรรมเนียมสายการบินอีกประเภทหนึ่ง บางสายการบินไม่อนุญาตให้ Refund ต้องดูเงื่อนไขสายการบิน' },
  { value: 'DEPOSIT', label: 'Deposit', desc: 'เงินมัดจำ' },
  { value: 'OTHER',   label: 'อื่นๆ',  desc: 'รายการอื่นที่ระบุเพิ่มเติม' },
]

const REFUND_FEE_UNIT_OPTIONS: { value: CondRefundFeeUnit; label: string }[] = [
  { value: 'PER_SEAT',  label: 'ต่อที่นั่ง' },
  { value: 'PER_PNR',   label: 'ต่อ PNR' },
  { value: 'PER_GROUP', label: 'ต่อกรุ๊ป' },
]

const REFUND_PENALTY_MODE_OPTIONS: { value: CondRefundPenaltyMode; label: string }[] = [
  { value: 'NONE',      label: 'ไม่มี' },
  { value: 'SINGLE',    label: 'เงื่อนไขเดียว' },
  { value: 'STEP_RULE', label: 'เงื่อนไข Step' },
]

const REFUND_PENALTY_BASE_OPTIONS: { value: string; label: string }[] = [
  { value: 'GROUP_PRICE', label: 'ราคากรุ๊ป' },
  { value: 'FARE',        label: 'Fare' },
  { value: 'TAX',         label: 'Tax' },
  { value: 'DEPOSIT',     label: 'Deposit' },
  { value: 'TOTAL_PAID',  label: 'ยอดชำระทั้งหมด' },
]

const CURRENCY_OPTIONS = getCurrencyOptions().map(c => ({
  value:    c.currencyCode,
  label:    c.currencyCode,
  subtitle: c.displayName ? `${c.displayName} — ${c.currencyName}` : c.currencyName,
}))

const UTIL_BASE_OPTIONS: { value: CondUtilizationBase; label: string }[] = [
  { value: 'INITIAL_SEAT', label: 'จำนวนตั๋วเริ่มต้น' },
  { value: 'DEPOSIT_SEAT', label: 'จำนวนตั๋วที่มัดจำ' },
  { value: 'LATEST_SEAT',  label: 'จำนวนตั๋วล่าสุด' },
]

const UTIL_MEASURE_OPTIONS: { value: CondUtilizationMeasure; label: string; desc: string }[] = [
  { value: 'CURRENT_TICKET', label: 'จำนวนตั๋วปัจจุบัน', desc: 'นับจากจำนวนตั๋วที่มีอยู่ในระบบ ณ ขณะนั้น เหมาะกับการตรวจสอบขั้นต่ำก่อนออกตั๋ว' },
  { value: 'ISSUED_TICKET',  label: 'จำนวนที่ออกตั๋วจริง', desc: 'นับจากผู้โดยสารที่ออกตั๋วแล้วจริง เหมาะกับเงื่อนไขที่ระบุ issue ticket / ticketed' },
]

const UTIL_ACTION_OPTIONS: { value: CondUtilizationAction; label: string }[] = [
  { value: 'NO_PENALTY',      label: 'ไม่มีค่าปรับ' },
  { value: 'PENALTY',         label: 'คิดค่าปรับ' },
  { value: 'FORFEIT_DEPOSIT', label: 'ยึดเงินมัดจำ' },
]

const UTIL_FORFEIT_TYPE_OPTIONS: { value: CondUtilizationForfeitType; label: string; desc: string }[] = [
  { value: 'FULL',             label: 'ยึดเต็มจำนวน',                     desc: 'ยึดเงินมัดจำทั้งหมดที่ชำระแล้ว' },
  { value: 'PER_MISSING_SEAT', label: 'ยึดตามจำนวนที่นั่งที่ขาด',         desc: 'ยึดเงินเฉพาะส่วนที่ไม่ถึงขั้นต่ำ' },
  { value: 'PAID_AMOUNT',      label: 'ยึดตามจำนวนที่ชำระแล้ว',           desc: 'ยึดเงินตามสัดส่วนที่ชำระจริง' },
]

const UTIL_PENALTY_TYPE_OPTIONS: { value: CondUtilizationPenaltyType; label: string }[] = [
  { value: 'AMOUNT_PER_MISSING', label: 'จำนวนเงินต่อที่นั่งที่ขาด' },
  { value: 'PERCENT_GROUP',      label: '% ของราคากรุ๊ป' },
  { value: 'PERCENT_DEPOSIT',    label: '% ของ Deposit' },
  { value: 'FULL_FORFEIT',       label: 'ยึดเต็มจำนวน' },
]

// ── RefundItemCheckboxes ──────────────────────────────────────────────────────

function RefundItemCheckboxes({ selected, disabledItems = [], onChange, readOnly, colorScheme = 'green' }: {
  selected: CondRefundItem[]
  disabledItems?: CondRefundItem[]
  onChange: (items: CondRefundItem[]) => void
  readOnly: boolean
  colorScheme?: 'green' | 'orange'
}) {
  return (
    <div className="space-y-1.5">
      {REFUND_ITEM_OPTIONS.map(({ value, label, desc, tooltip }) => {
        const checked = selected.includes(value)
        const blocked = !checked && disabledItems.includes(value)
        const isDisabled = readOnly || blocked
        const isGreen = colorScheme === 'green'
        return (
          <label key={value} className={cn(
            'flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition select-none',
            checked
              ? isGreen
                ? 'border-emerald-400 bg-emerald-50 text-emerald-800 cursor-pointer'
                : 'border-orange-400 bg-orange-50 text-orange-800 cursor-pointer'
              : blocked
                ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed opacity-60'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/80 cursor-pointer',
            readOnly && 'pointer-events-none',
          )}>
            <input type="checkbox" className="sr-only" checked={checked} disabled={isDisabled}
              onChange={() => !isDisabled && onChange(checked ? selected.filter(x => x !== value) : [...selected, value])} />
            <span className={cn('w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5',
              checked
                ? isGreen ? 'border-emerald-500 bg-emerald-500' : 'border-orange-500 bg-orange-500'
                : blocked ? 'border-slate-200 bg-slate-100' : 'border-slate-300')}>
              {checked && <Check size={9} className="text-white" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1">
                <span className="text-xs font-medium">{label}</span>
                {tooltip && (
                  <span className="relative group/tip inline-flex items-center pointer-events-auto">
                    <Info size={10} className={cn('shrink-0',
                      checked ? (isGreen ? 'text-emerald-500' : 'text-orange-500') : blocked ? 'text-slate-200' : 'text-slate-400')} />
                    <span className="absolute bottom-full left-0 mb-2 w-64 px-2.5 py-2 text-[10px] leading-relaxed bg-slate-800 text-white rounded-lg shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal text-left font-normal">
                      {tooltip}
                    </span>
                  </span>
                )}
              </span>
              {desc && (
                <span className={cn('text-[10px] leading-tight block mt-0.5',
                  checked ? (isGreen ? 'text-emerald-600' : 'text-orange-600') : blocked ? 'text-slate-300' : 'text-slate-400')}>
                  {desc}
                </span>
              )}
            </span>
          </label>
        )
      })}
    </div>
  )
}

// ── RefundPenaltyStepRuleRow ──────────────────────────────────────────────────

function RefundPenaltyStepRuleRow({ rule, index, readOnly, onUpdate, onRemove, currency }: {
  rule: CondRefundPenaltyStepRule; index: number; readOnly: boolean
  onUpdate: (r: CondRefundPenaltyStepRule) => void; onRemove: () => void; currency: string
}) {
  const set = <K extends keyof CondRefundPenaltyStepRule>(k: K, v: CondRefundPenaltyStepRule[K]) => onUpdate({ ...rule, [k]: v })
  const from = rule.fromDaysBefore, to = rule.toDaysBefore
  const rangeText = from != null && to != null ? `${to}–${from} วัน` : from != null ? `${from}+ วัน` : `≤ ${to ?? 0} วัน`
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
        <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">Step {index + 1}</span>
        <span className="flex-1 text-xs text-slate-600 font-medium">{rangeText}</span>
        <span className="text-[10px] text-slate-400 shrink-0">
          {rule.penaltyType === 'PERCENT' ? `${rule.penaltyValue ?? '?'}%` : `${rule.penaltyValue?.toLocaleString() ?? '?'} ${currency}`}
        </span>
        {!readOnly && (
          <button type="button" onClick={onRemove} className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
            <Trash2 size={12} />
          </button>
        )}
      </div>
      <div className="px-3 py-3 space-y-2 border-t border-slate-100">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>จาก (วัน ก่อนเดินทาง)</Label>
            <FInput type="number" min={0} value={rule.fromDaysBefore ?? ''} disabled={readOnly}
              onChange={v => set('fromDaysBefore', v === '' ? null : Number(v))} placeholder="ไม่จำกัด" />
          </div>
          <div>
            <Label>ถึง (วัน ก่อนเดินทาง)</Label>
            <FInput type="number" min={0} value={rule.toDaysBefore ?? ''} disabled={readOnly}
              onChange={v => set('toDaysBefore', v === '' ? null : Number(v))} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label required>ประเภทค่าปรับ</Label>
            <div className="flex gap-1.5">
              {([{ value: 'PERCENT', label: '%' }, { value: 'FIXED', label: 'จำนวนเงิน' }] as const).map(opt => (
                <label key={opt.value} className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition select-none',
                  rule.penaltyType === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300',
                  readOnly && 'pointer-events-none',
                )}>
                  <input type="radio" className="sr-only" checked={rule.penaltyType === opt.value}
                    onChange={() => set('penaltyType', opt.value)} disabled={readOnly} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label required>{rule.penaltyType === 'PERCENT' ? 'เปอร์เซ็นต์' : `จำนวนเงิน (${currency})`}</Label>
            <FInput type="number" min={0} max={rule.penaltyType === 'PERCENT' ? 100 : undefined}
              value={rule.penaltyValue ?? ''} disabled={readOnly}
              onChange={v => set('penaltyValue', v === '' ? null : Number(v))}
              placeholder={rule.penaltyType === 'PERCENT' ? 'เช่น 15' : '0.00'} />
          </div>
        </div>
        {rule.penaltyType === 'PERCENT' && (
          <div>
            <Label>คำนวณจาก</Label>
            <div className="flex gap-1.5 flex-wrap">
              {REFUND_PENALTY_BASE_OPTIONS.map(opt => (
                <label key={opt.value} className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] cursor-pointer transition select-none',
                  rule.penaltyBase === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-500 hover:border-slate-300',
                  readOnly && 'pointer-events-none',
                )}>
                  <input type="radio" className="sr-only" checked={rule.penaltyBase === opt.value}
                    onChange={() => set('penaltyBase', opt.value)} disabled={readOnly} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <Label>หมายเหตุ</Label>
          <FInput value={rule.remark} onChange={v => set('remark', v)} disabled={readOnly} placeholder="เพิ่มเติม..." />
        </div>
      </div>
    </div>
  )
}

// ── ChangeSection ─────────────────────────────────────────────────────────────

const CHANGE_FEE_TYPE_OPTIONS: { value: CondChangeFeeType; label: string }[] = [
  { value: 'NONE',    label: 'ไม่มีค่าธรรมเนียม' },
  { value: 'FIXED',   label: 'จำนวนเงิน' },
  { value: 'PERCENT', label: 'เปอร์เซ็นต์' },
]
const CHANGE_FEE_BASIS_OPTIONS: { value: CondChangeFeeBasis; label: string }[] = [
  { value: 'PER_PERSON', label: 'ต่อคน' },
  { value: 'PER_CHANGE', label: 'ต่อครั้ง' },
  { value: 'PER_PNR',    label: 'ต่อ PNR' },
]

export function ChangeSection({ value, onChange, readOnly, currency, errors = [] }: {
  value: AppCondition; onChange: (v: AppCondition) => void; readOnly: boolean; currency: string; errors?: string[]
}) {
  const ct: CondChangeTerms = value.changeTerms ?? defaultChangeTerms()
  const setCt = (patch: Partial<CondChangeTerms>) =>
    onChange({ ...value, changeTerms: { ...ct, ...patch } })
  const nc = ct.nameChange
  const setNc = (patch: Partial<CondChangeSingleTerm>) =>
    setCt({ nameChange: { ...nc, ...patch } })

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <Edit2 size={14} className="text-slate-500" />
        <p className="text-xs font-semibold text-slate-700 flex-1">เงื่อนไขการเปลี่ยนชื่อ</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {errors.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 space-y-1">
            {errors.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
          </div>
        )}

        {/* Toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition">
          <Toggle checked={ct.enabled} onChange={v => setCt({ enabled: v })} disabled={readOnly} />
          <div>
            <p className="text-sm font-semibold text-slate-800">อนุญาตให้เปลี่ยนชื่อผู้โดยสาร</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {ct.enabled ? 'เปิด — กำหนดเงื่อนไขการเปลี่ยนชื่อด้านล่าง' : 'ปิด — ไม่อนุญาตให้เปลี่ยนชื่อผู้โดยสาร'}
            </p>
          </div>
        </label>

        {ct.enabled && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-4">

            {/* กำหนดเวลา */}
            <div>
              <Label>กำหนดเวลาที่เปลี่ยนชื่อได้ (แจ้งล่วงหน้าไม่น้อยกว่า)</Label>
              <div className="flex items-center gap-2 max-w-xs">
                <FInput type="number" min={0} value={nc.noticeDays ?? ''} disabled={readOnly}
                  onChange={v => setNc({ noticeDays: v === '' ? null : Number(v) })}
                  placeholder="ไม่จำกัด" />
                <span className="text-xs text-slate-500 shrink-0">วัน</span>
              </div>
            </div>

            {/* จำนวนครั้งสูงสุด */}
            <div>
              <Label>เปลี่ยนชื่อได้ไม่เกิน</Label>
              <div className="flex items-center gap-2 max-w-xs">
                <FInput type="number" min={1} value={nc.maxChanges ?? ''} disabled={readOnly}
                  onChange={v => setNc({ maxChanges: v === '' ? null : Number(v) })}
                  placeholder="ไม่จำกัด" />
                <span className="text-xs text-slate-500 shrink-0">ครั้ง</span>
              </div>
            </div>

            {/* ค่าธรรมเนียม */}
            <div>
              <Label>ค่าธรรมเนียมการเปลี่ยนชื่อ</Label>
              <StatusPills<CondChangeFeeType>
                value={nc.feeType}
                onChange={v => {
                  const patch: Partial<CondChangeSingleTerm> = { feeType: v }
                  if (v !== 'FIXED')   patch.feeAmount  = null
                  if (v !== 'PERCENT') patch.feePercent = null
                  setNc(patch)
                }}
                options={CHANGE_FEE_TYPE_OPTIONS}
                disabled={readOnly}
              />
            </div>
            {nc.feeType === 'FIXED' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label required>จำนวนเงิน</Label>
                  <FInput type="number" min={0} value={nc.feeAmount ?? ''} disabled={readOnly}
                    onChange={v => setNc({ feeAmount: v === '' ? null : Number(v) })} placeholder="0" />
                </div>
                <div>
                  <Label>สกุลเงิน</Label>
                  <FSelect<string> value={nc.feeCurrency || currency}
                    onChange={v => v && setNc({ feeCurrency: v })}
                    options={getCurrencyOptions().map(c => ({ value: c.currencyCode, label: c.currencyCode }))}
                    disabled={readOnly} />
                </div>
              </div>
            )}
            {nc.feeType === 'PERCENT' && (
              <div className="max-w-xs">
                <Label required>เปอร์เซ็นต์</Label>
                <div className="flex items-center gap-2">
                  <FInput type="number" min={0} max={100} value={nc.feePercent ?? ''} disabled={readOnly}
                    onChange={v => setNc({ feePercent: v === '' ? null : Number(v) })} placeholder="0" />
                  <span className="text-xs text-slate-500 shrink-0">%</span>
                </div>
              </div>
            )}

            {/* วิธีคิดค่าธรรมเนียม — แสดงเมื่อมีค่าธรรมเนียม */}
            {nc.feeType !== 'NONE' && (
              <div>
                <Label>วิธีคิดค่าธรรมเนียม</Label>
                <div className="flex gap-2 flex-wrap">
                  {CHANGE_FEE_BASIS_OPTIONS.map(opt => (
                    <label key={opt.value} className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition select-none',
                      nc.feeBasis === opt.value
                        ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                      readOnly && 'pointer-events-none opacity-60',
                    )}>
                      <input type="radio" className="sr-only" checked={nc.feeBasis === opt.value}
                        onChange={() => setNc({ feeBasis: opt.value })} disabled={readOnly} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* รายละเอียด */}
            <div>
              <Label>รายละเอียดเงื่อนไขการเปลี่ยนชื่อผู้โดยสาร</Label>
              <textarea
                className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2.5 bg-white resize-none outline-none focus:ring-2 focus:ring-[#05a94f]/20 focus:border-[#05a94f] transition placeholder:text-slate-300 disabled:opacity-50"
                rows={3}
                value={ct.remark}
                onChange={e => setCt({ remark: e.target.value })}
                placeholder="เช่น เปลี่ยนชื่อได้ไม่เกิน 1 ครั้ง ต้องแจ้งล่วงหน้าไม่น้อยกว่า 14 วัน ค่าธรรมเนียม 500 บาทต่อคน"
                disabled={readOnly}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── CancelGroupSection ────────────────────────────────────────────────────────

const CG_REFUNDABLE_OPTIONS: { value: CondCancelGroupRefundable; label: string }[] = [
  { value: 'UNSPECIFIED',    label: 'ยังไม่ระบุ' },
  { value: 'NON_REFUNDABLE', label: 'คืนไม่ได้' },
  { value: 'PARTIAL_REFUND', label: 'คืนได้บางส่วน' },
  { value: 'FULL_REFUND',    label: 'คืนได้ทั้งหมด' },
]

const CANCEL_RESULT_OPTIONS: { value: CondCancelResult; label: string }[] = [
  { value: 'NO_FEE',            label: 'ยกเลิกได้โดยไม่เสียค่าใช้จ่าย' },
  { value: 'FORFEIT_RSVN',      label: 'ยึด RSVN Fee' },
  { value: 'FORFEIT_DEPOSIT',   label: 'ยึด Deposit' },
  { value: 'FORFEIT_ALL_PAID',  label: 'ยึดเงินที่ชำระแล้วทั้งหมด' },
  { value: 'PARTIAL_REFUND',    label: 'คืนเงินบางส่วน' },
  { value: 'PENALTY',           label: 'คิดค่าปรับ' },
  { value: 'NOT_ALLOWED',       label: 'ไม่อนุญาตให้ยกเลิก' },
  { value: 'UNSPECIFIED',       label: 'เอกสารไม่ได้ระบุ' },
]

const CANCEL_PENALTY_BASIS_OPTIONS: { value: CondCancelPenaltyBasis; label: string }[] = [
  { value: 'PER_SEAT',   label: 'ต่อ Seat' },
  { value: 'PER_PNR',    label: 'ต่อ PNR' },
  { value: 'PER_SERIES', label: 'ต่อ Series' },
]

const CANCEL_PENALTY_BASE_OPTIONS: { value: CondCancelPenaltyBase; label: string }[] = [
  { value: 'RSVN_FEE',       label: 'RSVN Fee' },
  { value: 'DEPOSIT',        label: 'Deposit' },
  { value: 'AMOUNT_PAID',    label: 'ยอดที่ชำระแล้ว' },
  { value: 'SERIES_TOTAL',   label: 'ยอดรวมของ Series' },
  { value: 'PRICE_PER_SEAT', label: 'ราคาต่อ Seat' },
]

const CANCEL_PENALTY_REFUND_OPTIONS: { value: CondCancelPenaltyRefund; label: string }[] = [
  { value: 'NON_REFUNDABLE',   label: 'คืนไม่ได้' },
  { value: 'REFUND_REMAINDER', label: 'คืนยอดคงเหลือหลังหักค่าปรับ' },
  { value: 'FULL_REFUND',      label: 'คืนได้ทั้งหมด' },
  { value: 'UNSPECIFIED',      label: 'เอกสารไม่ได้ระบุ' },
]

const CANCEL_TYPE_DEFS: { value: CondCancelType; label: string; desc: string }[] = [
  { value: 'STEP',          label: 'ยกเลิกตามช่วงวัน (เงื่อนไข Step)', desc: 'ผลการยกเลิกแตกต่างกันตามจำนวนวันก่อนวันเดินทาง' },
  { value: 'PAYMENT_STAGE', label: 'ยกเลิกตามงวดชำระเงิน',             desc: 'ผลการยกเลิกขึ้นอยู่กับงวดล่าสุดที่ชำระแล้ว' },
  { value: 'PENALTY',       label: 'ยกเลิกตามค่าปรับ (Penalty ตามข้อตกลง)', desc: 'ค่าปรับคงที่ตามข้อตกลง ไม่ขึ้นกับช่วงวันหรืองวดชำระ' },
]

// ── StepRow sub-component (holds its own local showRemark state) ──────────────
function StepRow({ step, idx, setCg, cg, readOnly }: {
  step: CondCancelStep
  idx: number
  cg: CondCancelGroupTerms
  setCg: (patch: Partial<CondCancelGroupTerms>) => void
  readOnly: boolean
}) {
  const [showRemark, setShowRemark] = useState(!!step.remark)

  const setStep = (patch: Partial<CondCancelStep>) => {
    const next = [...(cg.stepCancels ?? [])]
    next[idx] = { ...step, ...patch }
    setCg({ stepCancels: next })
  }

  const removeStep = () => {
    setCg({ stepCancels: (cg.stepCancels ?? []).filter((_, i) => i !== idx) })
  }

  const setPR = (patch: Partial<CondCancelPartialRefundSpec>) =>
    setStep({ partialRefund: { ...(step.partialRefund ?? defaultCancelPartialRefundSpec()), ...patch } })

  const setPenalty = (patch: Partial<CondCancelPenaltyInlineSpec>) =>
    setStep({ penalty: { ...(step.penalty ?? defaultCancelPenaltyInlineSpec()), ...patch } })

  const result = step.result

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">เงื่อนไข Step {idx + 1}</span>
        {!readOnly && (
          <button type="button" onClick={removeStep}
            className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Days range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>ตั้งแต่ (วันก่อนเดินทาง)</Label>
          <div className="flex items-center gap-1.5">
            <FInput type="number" min={0} value={step.daysFrom ?? ''}
              onChange={v => setStep({ daysFrom: v === '' ? null : Number(v) })}
              placeholder="เช่น 45" disabled={readOnly} />
            <span className="text-[10px] text-slate-400 shrink-0">วัน</span>
          </div>
        </div>
        <div>
          <Label>ถึง (วันก่อนเดินทาง)</Label>
          <div className="flex items-center gap-1.5">
            <FInput type="number" min={0} value={step.daysTo ?? ''}
              onChange={v => setStep({ daysTo: v === '' ? null : Number(v) })}
              placeholder="เช่น 0" disabled={readOnly} />
            <span className="text-[10px] text-slate-400 shrink-0">วัน</span>
          </div>
        </div>
      </div>

      {/* Unified result selector */}
      <div>
        <Label required>ผลเมื่อยกเลิก</Label>
        <FSelect<CondCancelResult>
          value={result}
          onChange={v => v && setStep({
            result: v as CondCancelResult,
            partialRefund: v === 'PARTIAL_REFUND' ? (step.partialRefund ?? defaultCancelPartialRefundSpec()) : null,
            penalty: v === 'PENALTY' ? (step.penalty ?? defaultCancelPenaltyInlineSpec()) : null,
          })}
          options={CANCEL_RESULT_OPTIONS}
          disabled={readOnly}
        />
      </div>

      {/* Implied result info (auto-derived, no user input needed) */}
      {result === 'NO_FEE' && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
          <CheckCircle2 size={10} className="shrink-0" />
          คืนเงินที่ชำระแล้วทั้งหมด
        </div>
      )}
      {result === 'FORFEIT_RSVN' && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <Info size={10} className="shrink-0" />
          ยึดเฉพาะ RSVN Fee — เงินงวดอื่นที่ชำระแล้วสามารถคืนได้
        </div>
      )}
      {result === 'FORFEIT_DEPOSIT' && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <Info size={10} className="shrink-0" />
          ยึดเฉพาะ Deposit — เงินที่ชำระเกินจาก Deposit สามารถคืนได้
        </div>
      )}
      {result === 'FORFEIT_ALL_PAID' && (
        <div className="flex items-center gap-1.5 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          <X size={10} className="shrink-0" />
          ยึดเงินที่ชำระแล้วทั้งหมด — ไม่มีเงินคืน
        </div>
      )}
      {result === 'NOT_ALLOWED' && (
        <div className="flex items-center gap-1.5 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          <X size={10} className="shrink-0" />
          ไม่อนุญาตให้ยกเลิกกรุ๊ปในช่วงนี้
        </div>
      )}
      {result === 'UNSPECIFIED' && (
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
          <Info size={10} className="shrink-0" />
          เอกสารไม่ได้ระบุผลทางการเงินเมื่อยกเลิก
        </div>
      )}

      {/* PARTIAL_REFUND sub-fields */}
      {result === 'PARTIAL_REFUND' && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2.5">
          <p className="text-[10px] font-semibold text-blue-700">รายละเอียดการคืนเงินบางส่วน</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label required>วิธีคำนวณเงินคืน</Label>
              <FSelect
                value={step.partialRefund?.calcType ?? ''}
                onChange={v => setPR({ calcType: (v as 'FIXED' | 'PERCENT') || null })}
                options={[
                  { value: '', label: '— เลือก —' },
                  { value: 'FIXED', label: 'จำนวนเงินคงที่' },
                  { value: 'PERCENT', label: 'เปอร์เซ็นต์' },
                ]}
                disabled={readOnly}
              />
            </div>
            <div>
              {step.partialRefund?.calcType === 'FIXED' && (
                <>
                  <Label required>จำนวนเงินที่คืน</Label>
                  <FInput type="number" min={0} value={step.partialRefund?.amount ?? ''}
                    onChange={v => setPR({ amount: v === '' ? null : Number(v) })}
                    placeholder="0" disabled={readOnly} />
                </>
              )}
              {step.partialRefund?.calcType === 'PERCENT' && (
                <>
                  <Label required>เปอร์เซ็นต์ที่คืน</Label>
                  <div className="flex items-center gap-1.5">
                    <FInput type="number" min={0} max={100} value={step.partialRefund?.percent ?? ''}
                      onChange={v => setPR({ percent: v === '' ? null : Number(v) })}
                      placeholder="0" disabled={readOnly} />
                    <span className="text-[10px] text-slate-400 shrink-0">%</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div>
            <Label>รายละเอียดการคืนเงิน</Label>
            <FTextarea value={step.partialRefund?.detail ?? ''}
              onChange={v => setPR({ detail: v })}
              placeholder="รายละเอียด..." rows={2} disabled={readOnly} />
          </div>
        </div>
      )}

      {/* PENALTY sub-fields */}
      {result === 'PENALTY' && (
        <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/60 p-2.5">
          <p className="text-[10px] font-semibold text-orange-700">รายละเอียดค่าปรับ</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label required>คิดค่าปรับต่อ</Label>
              <FSelect
                value={step.penalty?.basis ?? ''}
                onChange={v => setPenalty({ basis: (v as CondCancelPenaltyBasis) || null })}
                options={[
                  { value: '', label: '— เลือก —' },
                  { value: 'PER_SEAT', label: 'ต่อ Seat' },
                  { value: 'PER_PNR', label: 'ต่อ PNR' },
                  { value: 'PER_SERIES', label: 'ต่อ Series' },
                ]}
                disabled={readOnly}
              />
            </div>
            <div>
              <Label required>วิธีคิดค่าปรับ</Label>
              <FSelect
                value={step.penalty?.calcType ?? ''}
                onChange={v => setPenalty({ calcType: (v as CondCancelPenaltyCalcType) || null, fixedAmount: null, percent: null })}
                options={[
                  { value: '', label: '— เลือก —' },
                  { value: 'FIXED', label: 'จำนวนเงิน' },
                  { value: 'PERCENT', label: 'เปอร์เซ็นต์' },
                ]}
                disabled={readOnly}
              />
            </div>
          </div>
          {step.penalty?.calcType === 'FIXED' && (
            <div>
              <Label required>จำนวนค่าปรับ</Label>
              <FInput type="number" min={0} value={step.penalty?.fixedAmount ?? ''}
                onChange={v => setPenalty({ fixedAmount: v === '' ? null : Number(v) })}
                placeholder="0" disabled={readOnly} />
            </div>
          )}
          {step.penalty?.calcType === 'PERCENT' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label required>เปอร์เซ็นต์ค่าปรับ</Label>
                <div className="flex items-center gap-1.5">
                  <FInput type="number" min={0} max={100} value={step.penalty?.percent ?? ''}
                    onChange={v => setPenalty({ percent: v === '' ? null : Number(v) })}
                    placeholder="0" disabled={readOnly} />
                  <span className="text-[10px] text-slate-400 shrink-0">%</span>
                </div>
              </div>
              <div>
                <Label required>คำนวณจาก</Label>
                <FSelect
                  value={step.penalty?.percentBase ?? ''}
                  onChange={v => setPenalty({ percentBase: (v as CondCancelPenaltyBase) || null })}
                  options={[
                    { value: '', label: '— เลือก —' },
                    { value: 'RSVN_FEE', label: 'RSVN Fee' },
                    { value: 'DEPOSIT', label: 'Deposit' },
                    { value: 'AMOUNT_PAID', label: 'ยอดที่ชำระแล้ว' },
                    { value: 'SERIES_TOTAL', label: 'ยอดรวมของ Series' },
                    { value: 'PRICE_PER_SEAT', label: 'ราคาต่อ Seat' },
                  ]}
                  disabled={readOnly}
                />
              </div>
            </div>
          )}
          <div>
            <Label required>การจัดการยอดคงเหลือ</Label>
            <FSelect
              value={step.penalty?.remaining ?? 'UNSPECIFIED'}
              onChange={v => setPenalty({ remaining: v as 'REFUND_REMAINDER' | 'NO_REFUND' | 'UNSPECIFIED' })}
              options={[
                { value: 'REFUND_REMAINDER', label: 'คืนยอดคงเหลือหลังหักค่าปรับ' },
                { value: 'NO_REFUND', label: 'ไม่คืนยอดคงเหลือ' },
                { value: 'UNSPECIFIED', label: 'เอกสารไม่ได้ระบุ' },
              ]}
              disabled={readOnly}
            />
          </div>
        </div>
      )}

      {/* Remark */}
      {!showRemark && !step.remark && !readOnly && (
        <button type="button" onClick={() => setShowRemark(true)}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#05a94f] transition">
          <Plus size={10} />รายละเอียดเพิ่มเติม
        </button>
      )}
      {(showRemark || !!step.remark) && (
        <div>
          <Label>รายละเอียดเพิ่มเติม</Label>
          <FTextarea value={step.remark} onChange={v => setStep({ remark: v })}
            placeholder="รายละเอียด..." rows={2} disabled={readOnly} />
        </div>
      )}
    </div>
  )
}

// ── PaymentEntryRow sub-component (holds its own local showRemark state) ──────
function PaymentEntryRow({ stageId, label, entry, readOnly, onSet }: {
  stageId: string
  label: string
  entry: CondCancelPaymentEntry | undefined
  readOnly: boolean
  onSet: (patch: Partial<Omit<CondCancelPaymentEntry, 'entryId' | 'stageId'>>) => void
}) {
  const [showRemark, setShowRemark] = useState(!!(entry?.remark))

  const result: CondCancelResult = entry?.result ?? 'UNSPECIFIED'

  const setPR = (patch: Partial<CondCancelPartialRefundSpec>) =>
    onSet({ partialRefund: { ...(entry?.partialRefund ?? defaultCancelPartialRefundSpec()), ...patch } })

  const setPenalty = (patch: Partial<CondCancelPenaltyInlineSpec>) =>
    onSet({ penalty: { ...(entry?.penalty ?? defaultCancelPenaltyInlineSpec()), ...patch } })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <p className="text-[11px] font-semibold text-slate-700">{label}</p>

      {/* Unified result selector */}
      <div>
        <Label required>ผลเมื่อยกเลิก</Label>
        <FSelect<CondCancelResult>
          value={result}
          onChange={v => v && onSet({
            result: v as CondCancelResult,
            partialRefund: v === 'PARTIAL_REFUND' ? (entry?.partialRefund ?? defaultCancelPartialRefundSpec()) : null,
            penalty: v === 'PENALTY' ? (entry?.penalty ?? defaultCancelPenaltyInlineSpec()) : null,
          })}
          options={CANCEL_RESULT_OPTIONS}
          disabled={readOnly}
        />
      </div>

      {/* Implied result info */}
      {result === 'NO_FEE' && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
          <CheckCircle2 size={10} className="shrink-0" />คืนเงินที่ชำระแล้วทั้งหมด
        </div>
      )}
      {result === 'FORFEIT_RSVN' && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <Info size={10} className="shrink-0" />ยึดเฉพาะ RSVN Fee — เงินงวดอื่นที่ชำระแล้วสามารถคืนได้
        </div>
      )}
      {result === 'FORFEIT_DEPOSIT' && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <Info size={10} className="shrink-0" />ยึดเฉพาะ Deposit — เงินที่ชำระเกินจาก Deposit สามารถคืนได้
        </div>
      )}
      {result === 'FORFEIT_ALL_PAID' && (
        <div className="flex items-center gap-1.5 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          <X size={10} className="shrink-0" />ยึดเงินที่ชำระแล้วทั้งหมด — ไม่มีเงินคืน
        </div>
      )}
      {result === 'NOT_ALLOWED' && (
        <div className="flex items-center gap-1.5 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          <X size={10} className="shrink-0" />ไม่อนุญาตให้ยกเลิกกรุ๊ปในงวดนี้
        </div>
      )}
      {result === 'UNSPECIFIED' && (
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
          <Info size={10} className="shrink-0" />เอกสารไม่ได้ระบุผลทางการเงินเมื่อยกเลิก
        </div>
      )}

      {/* PARTIAL_REFUND sub-fields */}
      {result === 'PARTIAL_REFUND' && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2.5">
          <p className="text-[10px] font-semibold text-blue-700">รายละเอียดการคืนเงินบางส่วน</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label required>วิธีคำนวณเงินคืน</Label>
              <FSelect
                value={entry?.partialRefund?.calcType ?? ''}
                onChange={v => setPR({ calcType: (v as 'FIXED' | 'PERCENT') || null })}
                options={[
                  { value: '', label: '— เลือก —' },
                  { value: 'FIXED', label: 'จำนวนเงินคงที่' },
                  { value: 'PERCENT', label: 'เปอร์เซ็นต์' },
                ]}
                disabled={readOnly}
              />
            </div>
            <div>
              {entry?.partialRefund?.calcType === 'FIXED' && (
                <>
                  <Label required>จำนวนเงินที่คืน</Label>
                  <FInput type="number" min={0} value={entry?.partialRefund?.amount ?? ''}
                    onChange={v => setPR({ amount: v === '' ? null : Number(v) })} placeholder="0" disabled={readOnly} />
                </>
              )}
              {entry?.partialRefund?.calcType === 'PERCENT' && (
                <>
                  <Label required>เปอร์เซ็นต์ที่คืน</Label>
                  <div className="flex items-center gap-1.5">
                    <FInput type="number" min={0} max={100} value={entry?.partialRefund?.percent ?? ''}
                      onChange={v => setPR({ percent: v === '' ? null : Number(v) })} placeholder="0" disabled={readOnly} />
                    <span className="text-[10px] text-slate-400 shrink-0">%</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div>
            <Label>รายละเอียดการคืนเงิน</Label>
            <FTextarea value={entry?.partialRefund?.detail ?? ''}
              onChange={v => setPR({ detail: v })}
              placeholder="รายละเอียด..." rows={2} disabled={readOnly} />
          </div>
        </div>
      )}

      {/* PENALTY sub-fields */}
      {result === 'PENALTY' && (
        <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/60 p-2.5">
          <p className="text-[10px] font-semibold text-orange-700">รายละเอียดค่าปรับ</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label required>คิดค่าปรับต่อ</Label>
              <FSelect
                value={entry?.penalty?.basis ?? ''}
                onChange={v => setPenalty({ basis: (v as CondCancelPenaltyBasis) || null })}
                options={[
                  { value: '', label: '— เลือก —' },
                  { value: 'PER_SEAT', label: 'ต่อ Seat' },
                  { value: 'PER_PNR', label: 'ต่อ PNR' },
                  { value: 'PER_SERIES', label: 'ต่อ Series' },
                ]}
                disabled={readOnly}
              />
            </div>
            <div>
              <Label required>วิธีคิดค่าปรับ</Label>
              <FSelect
                value={entry?.penalty?.calcType ?? ''}
                onChange={v => setPenalty({ calcType: (v as CondCancelPenaltyCalcType) || null, fixedAmount: null, percent: null })}
                options={[
                  { value: '', label: '— เลือก —' },
                  { value: 'FIXED', label: 'จำนวนเงิน' },
                  { value: 'PERCENT', label: 'เปอร์เซ็นต์' },
                ]}
                disabled={readOnly}
              />
            </div>
          </div>
          {entry?.penalty?.calcType === 'FIXED' && (
            <div>
              <Label required>จำนวนค่าปรับ</Label>
              <FInput type="number" min={0} value={entry?.penalty?.fixedAmount ?? ''}
                onChange={v => setPenalty({ fixedAmount: v === '' ? null : Number(v) })} placeholder="0" disabled={readOnly} />
            </div>
          )}
          {entry?.penalty?.calcType === 'PERCENT' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label required>เปอร์เซ็นต์ค่าปรับ</Label>
                <div className="flex items-center gap-1.5">
                  <FInput type="number" min={0} max={100} value={entry?.penalty?.percent ?? ''}
                    onChange={v => setPenalty({ percent: v === '' ? null : Number(v) })} placeholder="0" disabled={readOnly} />
                  <span className="text-[10px] text-slate-400 shrink-0">%</span>
                </div>
              </div>
              <div>
                <Label required>คำนวณจาก</Label>
                <FSelect
                  value={entry?.penalty?.percentBase ?? ''}
                  onChange={v => setPenalty({ percentBase: (v as CondCancelPenaltyBase) || null })}
                  options={[
                    { value: '', label: '— เลือก —' },
                    { value: 'RSVN_FEE', label: 'RSVN Fee' },
                    { value: 'DEPOSIT', label: 'Deposit' },
                    { value: 'AMOUNT_PAID', label: 'ยอดที่ชำระแล้ว' },
                    { value: 'SERIES_TOTAL', label: 'ยอดรวมของ Series' },
                    { value: 'PRICE_PER_SEAT', label: 'ราคาต่อ Seat' },
                  ]}
                  disabled={readOnly}
                />
              </div>
            </div>
          )}
          <div>
            <Label required>การจัดการยอดคงเหลือ</Label>
            <FSelect
              value={entry?.penalty?.remaining ?? 'UNSPECIFIED'}
              onChange={v => setPenalty({ remaining: v as 'REFUND_REMAINDER' | 'NO_REFUND' | 'UNSPECIFIED' })}
              options={[
                { value: 'REFUND_REMAINDER', label: 'คืนยอดคงเหลือหลังหักค่าปรับ' },
                { value: 'NO_REFUND', label: 'ไม่คืนยอดคงเหลือ' },
                { value: 'UNSPECIFIED', label: 'เอกสารไม่ได้ระบุ' },
              ]}
              disabled={readOnly}
            />
          </div>
        </div>
      )}

      {/* Remark */}
      {!showRemark && !(entry?.remark) && !readOnly && (
        <button type="button" onClick={() => setShowRemark(true)}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#05a94f] transition">
          <Plus size={10} />รายละเอียดเพิ่มเติม
        </button>
      )}
      {(showRemark || !!(entry?.remark)) && (
        <div>
          <Label>รายละเอียดเพิ่มเติม</Label>
          <FTextarea value={entry?.remark ?? ''}
            onChange={v => onSet({ remark: v })}
            placeholder="รายละเอียด..." rows={2} disabled={readOnly} />
        </div>
      )}
    </div>
  )
}

export function CancelGroupSection({ value, onChange, readOnly, currency, errors = [], departureDate }: {
  value: AppCondition; onChange: (v: AppCondition) => void; readOnly: boolean; currency: string; errors?: string[]; departureDate?: string
}) {
  const cg: CondCancelGroupTerms = value.cancelGroupTerms ?? defaultCancelGroupTerms()
  const setCg = (patch: Partial<CondCancelGroupTerms>) =>
    onChange({ ...value, cancelGroupTerms: { ...cg, deadlineBase: 'DEPARTURE_DATE', ...patch } })

  const [pendingType, setPendingType] = useState<CondCancelType | null>(null)
  const [showRemark, setShowRemark] = useState(!!cg.remark)

  const computedDeadline: string | null = (() => {
    if (cg.noticeDays == null || !departureDate) return null
    try {
      const dep = parseISO(departureDate)
      if (!isValid(dep)) return null
      return format(subDays(dep, cg.noticeDays), 'dd MMM yy')
    } catch { return null }
  })()

  const typeHasData = (t: CondCancelType): boolean => {
    if (t === 'STEP')          return (cg.stepCancels?.length ?? 0) > 0
    if (t === 'PAYMENT_STAGE') return (cg.paymentCancels?.length ?? 0) > 0
    if (t === 'PENALTY')       return !!(cg.cancelPenalty?.basis || cg.cancelPenalty?.calcType)
    return false
  }

  const handleTypeChange = (t: CondCancelType) => {
    if (cg.cancelType && cg.cancelType !== t && typeHasData(cg.cancelType)) {
      setPendingType(t)
    } else {
      setCg({ cancelType: t })
    }
  }

  const getPaymentEntry = (stageId: string): CondCancelPaymentEntry | undefined =>
    (cg.paymentCancels ?? []).find(e => e.stageId === stageId)

  const setPaymentEntry = (stageId: string, patch: Partial<Omit<CondCancelPaymentEntry, 'entryId' | 'stageId'>>) => {
    const existing = cg.paymentCancels ?? []
    const idx = existing.findIndex(e => e.stageId === stageId)
    if (idx >= 0) {
      const next = [...existing]
      next[idx] = { ...existing[idx], ...patch }
      setCg({ paymentCancels: next })
    } else {
      setCg({ paymentCancels: [...existing, { entryId: newCancelPaymentEntryId(), stageId, result: 'UNSPECIFIED', remark: '', ...patch }] })
    }
  }

  const activeStages = value.stages.filter(s => !!s.paymentType)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
        <X size={14} className="text-slate-500" />
        <p className="text-xs font-semibold text-slate-700 flex-1">เงื่อนไขการยกเลิกกรุ๊ป (No Sell)</p>
        <p className="text-[10px] text-slate-400">แยกจากเงื่อนไข Refund รายผู้โดยสาร</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition">
          <Toggle checked={cg.enabled} onChange={v => setCg({ enabled: v })} disabled={readOnly} />
          <div>
            <p className="text-sm font-semibold text-slate-800">อนุญาตให้ยกเลิกกรุ๊ป (No Sell) ตามเงื่อนไข</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {cg.enabled ? 'เปิด — กำหนดเงื่อนไขการยกเลิก (No Sell) ด้านล่าง' : 'ปิด — ไม่อนุญาตให้ยกเลิกกรุ๊ป (No Sell)'}
            </p>
          </div>
        </label>

        {cg.enabled && (
          <>
            {/* Notice days */}
            <div>
              <Label>แจ้ง No Sell ไม่น้อยกว่า</Label>
              <div className="flex items-center gap-2">
                <FInput
                  type="number" min={0}
                  value={cg.noticeDays ?? ''}
                  onChange={v => setCg({ noticeDays: v === '' ? null : Number(v) })}
                  placeholder="ไม่จำกัด"
                  disabled={readOnly}
                />
                <span className="text-xs text-slate-500 shrink-0">วัน</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">ระบบคำนวณย้อนหลังจากวันเดินทางวันแรกโดยอัตโนมัติ</p>
            </div>

            {/* Deadline preview */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-[11px]">
              <Info size={11} className="text-slate-400 shrink-0" />
              <span className="text-slate-500 shrink-0">No Sell Deadline:</span>
              {computedDeadline ? (
                <>
                  <span className="font-semibold text-[#05a94f]">{computedDeadline}</span>
                  <span className="text-slate-400 ml-0.5">(วันเดินทางวันแรก − {cg.noticeDays ?? 0} วัน)</span>
                </>
              ) : (
                <span className="text-slate-400 italic">
                  {cg.noticeDays != null ? 'จะคำนวณ Deadline เมื่อมีการกำหนดวันเดินทาง' : 'กรุณาระบุจำนวนวันแจ้ง No Sell'}
                </span>
              )}
            </div>

            {/* Cancel type selector */}
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">
                ประเภทเงื่อนไขการยกเลิก <span className="text-red-500">*</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {CANCEL_TYPE_DEFS.map(def => {
                  const isSelected = cg.cancelType === def.value
                  return (
                    <button
                      key={def.value}
                      type="button"
                      disabled={readOnly}
                      onClick={() => handleTypeChange(def.value)}
                      className={cn(
                        'text-left px-3 py-3 rounded-xl border-2 transition',
                        readOnly && 'pointer-events-none',
                        isSelected
                          ? 'border-[#05a94f] bg-emerald-50'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          'w-3.5 h-3.5 rounded-full border-2 shrink-0',
                          isSelected ? 'border-[#05a94f] bg-[#05a94f]' : 'border-slate-300 bg-white',
                        )} />
                        <span className={cn('text-xs font-semibold leading-snug', isSelected ? 'text-[#05a94f]' : 'text-slate-700')}>
                          {def.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 pl-5 leading-snug">{def.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Type 1: STEP form */}
            {cg.cancelType === 'STEP' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">เงื่อนไข Step การยกเลิกกรุ๊ป (No Sell)</p>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => setCg({
                        stepCancels: [...(cg.stepCancels ?? []), {
                          stepId: newCancelStepId(),
                          daysFrom: null, daysTo: null,
                          result: 'UNSPECIFIED' as CondCancelResult, remark: '',
                        }],
                      })}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium text-[#05a94f] hover:bg-emerald-50 border border-emerald-200 transition"
                    >
                      <Plus size={10} />
                      เพิ่ม Step
                    </button>
                  )}
                </div>

                {(cg.stepCancels ?? []).length === 0 && (
                  <div className="text-[11px] text-slate-400 italic px-3 py-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center">
                    ยังไม่มีเงื่อนไข Step — กดปุ่ม &quot;เพิ่ม Step&quot; เพื่อเริ่มต้น
                  </div>
                )}

                {(cg.stepCancels ?? []).map((step, idx) => (
                  <StepRow key={step.stepId} step={step} idx={idx} cg={cg} setCg={setCg} readOnly={readOnly} />
                ))}
              </div>
            )}

            {/* Type 2: PAYMENT_STAGE form */}
            {cg.cancelType === 'PAYMENT_STAGE' && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-700">ผลการยกเลิกตามงวดชำระเงิน</p>

                {activeStages.length === 0 && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] text-amber-700">
                    <AlertCircle size={12} className="shrink-0" />
                    ยังไม่มีงวดชำระเงิน — กรุณาตั้งค่างวดใน Tab เงื่อนไขงวดชำระเงินก่อน
                  </div>
                )}

                {[
                  { stageId: 'BEFORE_PAYMENT', label: 'ก่อนชำระเงิน' },
                  ...activeStages.map(s => ({
                    stageId: s.stageId,
                    label: `หลังชำระ${autoStageName(s.paymentType, s.customPaymentName, s.stageNo)}`,
                  })),
                ].map(row => (
                  <PaymentEntryRow
                    key={row.stageId}
                    stageId={row.stageId}
                    label={row.label}
                    entry={getPaymentEntry(row.stageId)}
                    readOnly={readOnly}
                    onSet={patch => setPaymentEntry(row.stageId, patch)}
                  />
                ))}
              </div>
            )}

            {/* Type 3: PENALTY form */}
            {cg.cancelType === 'PENALTY' && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {/* Basis */}
                <div>
                  <Label required>คิดค่าปรับต่อ</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {CANCEL_PENALTY_BASIS_OPTIONS.map(opt => {
                      const p = cg.cancelPenalty ?? defaultCancelPenaltySpec()
                      const active = p.basis === opt.value
                      return (
                        <button key={opt.value} type="button" disabled={readOnly}
                          onClick={() => setCg({ cancelPenalty: { ...(cg.cancelPenalty ?? defaultCancelPenaltySpec()), basis: opt.value } })}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-medium border transition',
                            active ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                            readOnly && 'pointer-events-none',
                          )}>
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Calc type */}
                <div>
                  <Label required>วิธีคิดค่าปรับ</Label>
                  <div className="flex gap-2 mt-1">
                    {[{ value: 'FIXED', label: 'จำนวนเงิน' }, { value: 'PERCENT', label: 'เปอร์เซ็นต์' }].map(opt => {
                      const p = cg.cancelPenalty ?? defaultCancelPenaltySpec()
                      const active = p.calcType === opt.value
                      return (
                        <button key={opt.value} type="button" disabled={readOnly}
                          onClick={() => setCg({ cancelPenalty: { ...(cg.cancelPenalty ?? defaultCancelPenaltySpec()), calcType: opt.value as CondCancelPenaltyCalcType, fixedAmount: null, percent: null, percentBase: null } })}
                          className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-medium border transition',
                            active ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                            readOnly && 'pointer-events-none',
                          )}>
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Fixed amount */}
                {(cg.cancelPenalty?.calcType === 'FIXED') && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label required>จำนวนค่าปรับ</Label>
                      <FInput type="number" min={0}
                        value={cg.cancelPenalty?.fixedAmount ?? ''}
                        onChange={v => setCg({ cancelPenalty: { ...(cg.cancelPenalty ?? defaultCancelPenaltySpec()), fixedAmount: v === '' ? null : Number(v) } })}
                        disabled={readOnly} placeholder="0" />
                    </div>
                    <div>
                      <Label>สกุลเงิน</Label>
                      <div className="h-9 flex items-center px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-600 select-none">
                        <Lock size={10} className="text-slate-400 mr-2 shrink-0" />
                        {currency}
                      </div>
                    </div>
                  </div>
                )}

                {/* Percent */}
                {(cg.cancelPenalty?.calcType === 'PERCENT') && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label required>เปอร์เซ็นต์ค่าปรับ</Label>
                      <div className="flex items-center gap-1.5">
                        <FInput type="number" min={0} max={100}
                          value={cg.cancelPenalty?.percent ?? ''}
                          onChange={v => setCg({ cancelPenalty: { ...(cg.cancelPenalty ?? defaultCancelPenaltySpec()), percent: v === '' ? null : Number(v) } })}
                          disabled={readOnly} placeholder="0" />
                        <span className="text-xs text-slate-500 shrink-0">%</span>
                      </div>
                    </div>
                    <div>
                      <Label required>คำนวณเปอร์เซ็นต์จาก</Label>
                      <FSelect<CondCancelPenaltyBase>
                        value={cg.cancelPenalty?.percentBase ?? '' as CondCancelPenaltyBase}
                        onChange={v => v && setCg({ cancelPenalty: { ...(cg.cancelPenalty ?? defaultCancelPenaltySpec()), percentBase: v as CondCancelPenaltyBase } })}
                        options={[{ value: '' as CondCancelPenaltyBase, label: '— เลือก —' }, ...CANCEL_PENALTY_BASE_OPTIONS]}
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                )}

                {/* Refund */}
                <div>
                  <Label required>การคืนเงินส่วนที่เหลือ</Label>
                  <FSelect<CondCancelPenaltyRefund>
                    value={cg.cancelPenalty?.refund ?? '' as CondCancelPenaltyRefund}
                    onChange={v => v && setCg({ cancelPenalty: { ...(cg.cancelPenalty ?? defaultCancelPenaltySpec()), refund: v as CondCancelPenaltyRefund } })}
                    options={[{ value: '' as CondCancelPenaltyRefund, label: '— เลือก —' }, ...CANCEL_PENALTY_REFUND_OPTIONS]}
                    disabled={readOnly}
                  />
                </div>

                {/* Detail */}
                <div>
                  <Label>รายละเอียดข้อตกลง</Label>
                  <FTextarea value={cg.cancelPenalty?.detail ?? ''}
                    onChange={v => setCg({ cancelPenalty: { ...(cg.cancelPenalty ?? defaultCancelPenaltySpec()), detail: v } })}
                    placeholder="รายละเอียด Penalty ตามเอกสารสายการบิน..." rows={3} disabled={readOnly} />
                </div>
              </div>
            )}

            {/* Remark */}
            {!showRemark && !cg.remark && !readOnly && (
              <button type="button" onClick={() => setShowRemark(true)}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#05a94f] transition">
                <Plus size={10} />
                เพิ่มรายละเอียดเงื่อนไขการยกเลิกกรุ๊ป (No Sell)
              </button>
            )}
            {(showRemark || !!cg.remark) && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>รายละเอียดเงื่อนไขการยกเลิกกรุ๊ป (No Sell)</Label>
                  {!readOnly && !cg.remark && (
                    <button type="button" onClick={() => setShowRemark(false)}
                      className="text-[10px] text-slate-400 hover:text-slate-600 transition">ซ่อน</button>
                  )}
                </div>
                <FTextarea value={cg.remark} onChange={v => setCg({ remark: v })}
                  placeholder="รายละเอียดเพิ่มเติม..." rows={3} disabled={readOnly} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Change type modal */}
      {pendingType && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertCircle size={16} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">เปลี่ยนประเภทเงื่อนไขการยกเลิก?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  ข้อมูลของประเภทเดิมจะไม่ถูกนำมาใช้ในการคำนวณ
                  แต่ระบบจะยังเก็บข้อมูลไว้จนกว่าคุณจะล้างข้อมูล
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setPendingType(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 transition">
                ยกเลิก
              </button>
              <button type="button" onClick={() => { setCg({ cancelType: pendingType }); setPendingType(null) }}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition">
                เปลี่ยนประเภท
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── CombinedRefundSection ─────────────────────────────────────────────────────

export function CombinedRefundSection({ value, onChange, readOnly, currency, errors = [] }: {
  value: AppCondition; onChange: (v: AppCondition) => void; readOnly: boolean; currency: string; errors?: string[]
}) {
  const rt = migrateRefundTerms(value.refundTerms)
  const setRt = (upd: Partial<CondRefundTerms>) => onChange({ ...value, refundTerms: { ...rt, ...upd } })
  const post = rt.postTicket
  const setPost = (upd: Partial<typeof post>) => setRt({ postTicket: { ...post, ...upd } })
  const isUnspecified = post.refundMainPolicy === 'UNSPECIFIED'
  const util = rt.utilization
  const setUtil = (upd: Partial<CondUtilization>) => setRt({ utilization: { ...util, ...upd } })

  const addPenaltyStepRule = () => {
    const newRule: CondRefundPenaltyStepRule = {
      id: newRefundPenaltyStepRuleId(),
      fromDaysBefore: null, toDaysBefore: null,
      penaltyType: 'PERCENT', penaltyValue: null,
      penaltyBase: 'GROUP_PRICE', currency, remark: '',
    }
    setPost({ penaltyStepRules: [...post.penaltyStepRules, newRule] })
  }

  const buildPreviewLines = (): { text: string; missing: boolean }[] => {
    const lines: { text: string; missing: boolean }[] = []
    if (post.enabled) {
      const applyAfterLabel: Record<CondPostRefundApplyAfter, string> = {
        AFTER_NAME_SUBMIT:    'หลังส่งชื่อแล้ว',
        AFTER_TICKETING:      'หลังออกตั๋วแล้ว',
        AFTER_DEPOSIT:        'หลังชำระมัดจำแล้ว',
        AFTER_DEADLINE:       'หลังครบกำหนดออกตั๋วแล้ว',
        AFTER_FULL_PAYMENT:   'หลังชำระเต็มจำนวนแล้ว',
      }
      const applyPrefix = post.applyAfter ? applyAfterLabel[post.applyAfter] + ' ' : ''
      if (post.refundMainPolicy === 'NON_REFUNDABLE') {
        lines.push({ text: `${applyPrefix}ไม่สามารถ Refund ได้`, missing: false })
      } else if (post.refundMainPolicy === 'FULL_REFUND') {
        lines.push({ text: `${applyPrefix}สามารถ Refund ได้ทั้งหมดตามเงื่อนไขสายการบิน`, missing: false })
      } else if (post.refundMainPolicy === 'PARTIAL_REFUND') {
        const itemStr = post.refundableItems.map(i => REFUND_ITEM_OPTIONS.find(o => o.value === i)?.label ?? i).join(' และ ')
        const nonStr  = post.nonRefundableItems.map(i => REFUND_ITEM_OPTIONS.find(o => o.value === i)?.label ?? i).join(' และ ')
        if (post.refundableItems.length > 0) {
          const nonPart = post.nonRefundableItems.length > 0 ? ` และไม่ Refund ค่า ${nonStr}` : ''
          lines.push({ text: `${applyPrefix}สามารถ Refund ได้บางส่วน โดยคืนได้เฉพาะ ${itemStr}${nonPart}`, missing: false })
        } else {
          lines.push({ text: `${applyPrefix}สามารถ Refund ได้บางส่วน (ยังไม่ได้เลือกรายการ)`, missing: true })
        }
      } else {
        lines.push({ text: 'ยังไม่ได้ระบุนโยบาย Refund', missing: true })
      }
      if (post.refundFeeType === 'FIX') {
        const unit = REFUND_FEE_UNIT_OPTIONS.find(o => o.value === post.refundFeeUnit)?.label ?? ''
        lines.push(post.refundFeeAmount != null
          ? { text: `ค่าธรรมเนียม Refund: ${post.refundFeeAmount.toLocaleString()} ${post.refundFeeCurrency || currency} ${unit}`, missing: false }
          : { text: 'ยังไม่ได้ระบุจำนวนเงินค่าธรรมเนียม', missing: true })
      } else if (post.refundFeeType === 'PERCENT') {
        const base = POST_FEE_BASE_OPTIONS.find(o => o.value === post.refundFeeBase)?.label ?? ''
        lines.push(post.refundFeePercent != null
          ? { text: `ค่าธรรมเนียม Refund: ${post.refundFeePercent}% ของ${base}`, missing: false }
          : { text: 'ยังไม่ได้ระบุเปอร์เซ็นต์ค่าธรรมเนียม', missing: true })
      }
      if (post.penaltyMode === 'SINGLE') {
        const sv = post.penaltySingleValue
        const base = REFUND_PENALTY_BASE_OPTIONS.find(o => o.value === post.penaltySingleBase)?.label ?? post.penaltySingleBase
        if (post.penaltySingleType === 'PERCENT')
          lines.push(sv != null ? { text: `ค่าปรับ: ${sv}% ของ${base}`, missing: false } : { text: 'ยังไม่ได้ระบุ % ค่าปรับ', missing: true })
        else if (post.penaltySingleType === 'FIXED')
          lines.push(sv != null ? { text: `ค่าปรับ: ${sv.toLocaleString()} ${currency} ต่อที่นั่ง`, missing: false } : { text: 'ยังไม่ได้ระบุจำนวนเงินค่าปรับ', missing: true })
        else lines.push({ text: 'ค่าปรับ: ยึดเงินเต็มจำนวน', missing: false })
      } else if (post.penaltyMode === 'STEP_RULE') {
        if (post.penaltyStepRules.length === 0) {
          lines.push({ text: 'ค่าปรับแบบเงื่อนไข Step: ยังไม่มี Step', missing: true })
        } else {
          lines.push({ text: `ค่าปรับตามช่วงวันก่อนเดินทาง (${post.penaltyStepRules.length} ช่วง):`, missing: false })
          post.penaltyStepRules.forEach(r => {
            const f = r.fromDaysBefore, t = r.toDaysBefore
            const range = f != null && t != null ? `${t}–${f} วัน` : f != null ? `${f}+ วัน` : `≤ ${t ?? 0} วัน`
            const base2 = REFUND_PENALTY_BASE_OPTIONS.find(o => o.value === r.penaltyBase)?.label ?? r.penaltyBase
            const val = r.penaltyValue != null ? (r.penaltyType === 'PERCENT' ? `${r.penaltyValue}% ของ${base2}` : `${r.penaltyValue.toLocaleString()} ${r.currency}`) : '?'
            lines.push({ text: `• ${range}: ${val}`, missing: r.penaltyValue == null })
          })
        }
      }
    }
    if (util.enabled) {
      const pct = util.requiredPercent
      const baseLabel    = UTIL_BASE_OPTIONS.find(o => o.value === util.calcBase)?.label ?? util.calcBase
      const measureLabel = UTIL_MEASURE_OPTIONS.find(o => o.value === util.measureBy)?.label ?? util.measureBy
      lines.push(pct != null
        ? { text: `ต้องใช้ที่นั่งไม่น้อยกว่า ${pct}% ของ${baseLabel}`, missing: false }
        : { text: 'ยังไม่ระบุเปอร์เซ็นต์การใช้ที่นั่งขั้นต่ำ', missing: true })
      lines.push({ text: `โดยตรวจสอบจาก${measureLabel}`, missing: false })
      const belowMin = `หาก${measureLabel}ต่ำกว่าขั้นต่ำ`
      if (util.exceedAction === 'NO_PENALTY') {
        lines.push({ text: `${belowMin} จะไม่มีค่าปรับ`, missing: false })
      } else if (util.exceedAction === 'PENALTY') {
        if (util.penaltyType === 'AMOUNT_PER_MISSING') {
          lines.push(util.penaltyAmount != null
            ? { text: `${belowMin} จะคิดค่าปรับ ${util.penaltyAmount.toLocaleString()} ${util.penaltyCurrency || currency} ต่อที่นั่งที่ขาด`, missing: false }
            : { text: `${belowMin} จะคิดค่าปรับตามจำนวนที่นั่งที่ขาด (ยังไม่ได้ระบุจำนวนเงิน)`, missing: true })
        } else if (util.penaltyType === 'PERCENT_GROUP') {
          lines.push(util.penaltyPercent != null
            ? { text: `${belowMin} จะคิดค่าปรับ ${util.penaltyPercent}% ของราคากรุ๊ป`, missing: false }
            : { text: `${belowMin} จะคิดค่าปรับ % ของราคากรุ๊ป (ยังไม่ได้ระบุเปอร์เซ็นต์)`, missing: true })
        } else if (util.penaltyType === 'PERCENT_DEPOSIT') {
          lines.push(util.penaltyPercent != null
            ? { text: `${belowMin} จะคิดค่าปรับ ${util.penaltyPercent}% ของ Deposit`, missing: false }
            : { text: `${belowMin} จะคิดค่าปรับ % ของ Deposit (ยังไม่ได้ระบุเปอร์เซ็นต์)`, missing: true })
        } else if (util.penaltyType === 'FULL_FORFEIT') {
          lines.push({ text: `${belowMin} จะถูกยึดเงินเต็มจำนวนตามเงื่อนไข`, missing: false })
        }
      } else if (util.exceedAction === 'FORFEIT_DEPOSIT') {
        const forfeitLabel = UTIL_FORFEIT_TYPE_OPTIONS.find(o => o.value === util.forfeitType)?.label ?? 'เต็มจำนวน'
        lines.push({ text: `${belowMin} จะถูกยึดเงินมัดจำ (${forfeitLabel})`, missing: false })
      }
    }
    return lines
  }

  const previewLines = buildPreviewLines()

  return (
    <div className="space-y-4">
      <ErrorBox errors={errors} />

      {/* ── Card 1: Master toggle ── */}
      <label className="flex items-center gap-3 cursor-pointer select-none p-4 rounded-2xl border border-slate-200 hover:bg-slate-50 transition">
        <Toggle checked={rt.enabled} onChange={v => setRt({ enabled: v })} disabled={readOnly} />
        <div>
          <p className="text-sm font-semibold text-slate-800">เปิดใช้งานเงื่อนไขการคืน</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {rt.enabled ? 'เปิดใช้งาน — กรอกนโยบายด้านล่าง' : 'ปิดอยู่ — ยังไม่ได้กำหนด'}
          </p>
        </div>
      </label>

      {rt.enabled && (
        <div className="space-y-4">

          {/* ── Card 2: Refund หลังส่งชื่อ / หลังออกตั๋ว ── */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt size={14} className="text-slate-400" />
                <div>
                  <p className="text-xs font-semibold text-slate-700">Refund หลังส่งชื่อ / หลังออกตั๋ว</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">เงื่อนไขการคืนเงินหลังจากส่งชื่อหรือออกตั๋วแล้ว</p>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                <Toggle checked={post.enabled} onChange={v => setPost({ enabled: v })} disabled={readOnly} />
                <span className="text-[11px] text-slate-500">{post.enabled ? 'เปิด' : 'ปิด'}</span>
              </label>
            </div>

            {post.enabled && (
              <div className="px-4 py-4 space-y-4">

                {/* นโยบาย Refund */}
                <div>
                  <Label>นโยบาย Refund</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                    {POST_REFUND_MAIN_POLICY_OPTIONS.map(opt => (
                      <label key={opt.value} className={cn(
                        'flex flex-col px-3 py-2 rounded-xl border cursor-pointer transition text-xs select-none',
                        post.refundMainPolicy === opt.value
                          ? 'border-[#05a94f] bg-emerald-50'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                        readOnly && 'pointer-events-none',
                      )}>
                        <input type="radio" className="sr-only" checked={post.refundMainPolicy === opt.value}
                          onChange={() => setPost({
                            refundMainPolicy: opt.value,
                            ...(opt.value === 'NON_REFUNDABLE' ? { refundableItems: [] } : {}),
                            ...(opt.value === 'UNSPECIFIED' ? {
                              applyAfter: null, refundableItems: [], nonRefundableItems: [],
                              refundFeeType: 'NONE', refundFeeAmount: null, refundFeePercent: null,
                              refundFeeBase: 'REFUNDABLE_AMOUNT', refundFeeUnit: 'PER_SEAT', refundFeeCurrency: '',
                              penaltyMode: 'NONE', penaltySingleType: 'PERCENT', penaltySingleValue: null,
                              penaltySingleBase: 'GROUP_PRICE', penaltyStepRules: [], remark: '',
                            } : {}),
                          })} disabled={readOnly} />
                        <span className={cn('font-semibold', post.refundMainPolicy === opt.value ? 'text-[#05a94f]' : 'text-slate-700')}>
                          {opt.label}
                        </span>
                        <span className={cn('text-[10px] mt-0.5', post.refundMainPolicy === opt.value ? 'text-emerald-600' : 'text-slate-400')}>
                          {opt.desc}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* ── fields 2–6: disabled when UNSPECIFIED ── */}
                <div className={cn('space-y-4', isUnspecified && 'opacity-50 pointer-events-none select-none')}>

                {/* ช่วงเวลาที่เริ่มใช้เงื่อนไข */}
                <div>
                  <Label>ช่วงเวลาที่เริ่มใช้เงื่อนไขนี้</Label>
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {POST_REFUND_APPLY_AFTER_OPTIONS.map(opt => (
                      <label key={opt.value} className={cn(
                        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition select-none',
                        post.applyAfter === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300',
                        readOnly && 'pointer-events-none',
                      )}>
                        <input type="radio" className="sr-only" checked={post.applyAfter === opt.value}
                          onChange={() => setPost({ applyAfter: opt.value })} disabled={readOnly} />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* การเปลี่ยนชื่อผู้โดยสาร */}
                <div>
                  <Label>การเปลี่ยนชื่อผู้โดยสาร</Label>
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {NAME_CHANGE_POLICY_OPTIONS.map(opt => (
                      <label key={opt.value} className={cn(
                        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition select-none',
                        post.nameChangePolicy === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300',
                        readOnly && 'pointer-events-none',
                      )}>
                        <input type="radio" className="sr-only"
                          checked={post.nameChangePolicy === opt.value}
                          onChange={() => setPost({ nameChangePolicy: opt.value })}
                          disabled={readOnly} />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* รายการที่ Refund ได้ / ไม่ได้ */}
                {post.refundMainPolicy !== 'NON_REFUNDABLE' && (
                  <div className="space-y-3">
                    {/* Rule + preset actions */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 shrink-0">
                        <Info size={10} className="shrink-0" />
                        รายการเดียวกันเลือกได้เพียงฝั่งเดียวเท่านั้น
                      </p>
                      {!readOnly && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button type="button"
                            onClick={() => setPost({ refundableItems: ['TAX', 'YQ'], nonRefundableItems: ['FARE', 'YR'] })}
                            className="px-2.5 py-1 rounded-lg border border-sky-200 bg-sky-50 text-[11px] font-medium text-sky-700 hover:bg-sky-100 transition">
                            เลือกค่าเริ่มต้น Tax + YQ
                          </button>
                          <span className="text-[10px] text-slate-400 hidden sm:inline">คืนได้เฉพาะ Tax และ YQ ไม่คืน Fare / YR</span>
                          {(post.refundableItems.length > 0 || post.nonRefundableItems.length > 0) && (
                            <button type="button"
                              onClick={() => setPost({ refundableItems: [], nonRefundableItems: [] })}
                              className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-500 hover:bg-slate-100 transition">
                              ล้างรายการ
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 2 cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Card A: Refund ได้ */}
                      <div className="rounded-xl border border-emerald-200 overflow-hidden flex flex-col">
                        <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <span className="text-sm font-semibold text-emerald-800">Refund ได้</span>
                          </div>
                          <p className="text-[11px] text-emerald-600 mt-0.5 ml-4">รายการที่สามารถขอคืนเงินได้</p>
                        </div>
                        <div className="px-4 py-3 bg-white flex-1">
                          <RefundItemCheckboxes
                            selected={post.refundableItems}
                            disabledItems={post.nonRefundableItems}
                            onChange={v => setPost({
                              refundableItems: v,
                              nonRefundableItems: post.nonRefundableItems.filter(x => !v.includes(x)),
                            })}
                            readOnly={readOnly}
                            colorScheme="green"
                          />
                        </div>
                        <div className={cn('px-4 py-2 border-t text-[11px] font-medium',
                          post.refundableItems.length > 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-400')}>
                          {post.refundableItems.length > 0
                            ? `เลือกแล้ว: ${post.refundableItems.map(i => REFUND_ITEM_OPTIONS.find(o => o.value === i)?.label ?? i).join(', ')}`
                            : 'ยังไม่ได้เลือกรายการ'}
                        </div>
                        {post.refundMainPolicy === 'PARTIAL_REFUND' && post.refundableItems.length === 0 && (
                          <div className="px-4 pb-2">
                            <p className="text-[10px] text-amber-600 flex items-center gap-1">
                              <AlertCircle size={10} /> เลือกอย่างน้อย 1 รายการ
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Card B: Refund ไม่ได้ */}
                      <div className="rounded-xl border border-orange-200 overflow-hidden flex flex-col">
                        <div className="px-4 py-3 bg-orange-50 border-b border-orange-200">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                            <span className="text-sm font-semibold text-orange-800">Refund ไม่ได้</span>
                          </div>
                          <p className="text-[11px] text-orange-600 mt-0.5 ml-4">รายการที่ไม่คืนเงินไม่ว่ากรณีใด</p>
                        </div>
                        <div className="px-4 py-3 bg-white flex-1">
                          <RefundItemCheckboxes
                            selected={post.nonRefundableItems}
                            disabledItems={post.refundableItems}
                            onChange={v => setPost({
                              nonRefundableItems: v,
                              refundableItems: post.refundableItems.filter(x => !v.includes(x)),
                            })}
                            readOnly={readOnly}
                            colorScheme="orange"
                          />
                        </div>
                        <div className={cn('px-4 py-2 border-t text-[11px] font-medium',
                          post.nonRefundableItems.length > 0 ? 'bg-orange-50 border-orange-100 text-orange-700' : 'bg-slate-50 border-slate-100 text-slate-400')}>
                          {post.nonRefundableItems.length > 0
                            ? `เลือกแล้ว: ${post.nonRefundableItems.map(i => REFUND_ITEM_OPTIONS.find(o => o.value === i)?.label ?? i).join(', ')}`
                            : 'ยังไม่ได้เลือกรายการ'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ค่าธรรมเนียม Refund */}
                <div>
                  <Label>ค่าธรรมเนียม Refund</Label>
                  <div className="flex gap-1.5 flex-wrap mt-1 mb-2">
                    {POST_FEE_TYPE_OPTIONS.map(opt => (
                      <label key={opt.value} className={cn(
                        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition select-none',
                        post.refundFeeType === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300',
                        readOnly && 'pointer-events-none',
                      )}>
                        <input type="radio" className="sr-only" checked={post.refundFeeType === opt.value}
                          onChange={() => setPost({
                            refundFeeType: opt.value,
                            ...(opt.value !== 'FIX'     ? { refundFeeAmount: null, refundFeeCurrency: '' } : {}),
                            ...(opt.value !== 'PERCENT' ? { refundFeePercent: null } : {}),
                          })} disabled={readOnly} />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                  {post.refundFeeType === 'FIX' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <FInput type="number" min={0} value={post.refundFeeAmount ?? ''} disabled={readOnly}
                        onChange={v => setPost({ refundFeeAmount: v === '' ? null : Number(v) })}
                        placeholder="0.00" className="w-[160px]" />
                      <div className="w-[160px] shrink-0">
                        <SearchableSelect
                          options={CURRENCY_OPTIONS}
                          value={post.refundFeeCurrency || currency}
                          onChange={v => setPost({ refundFeeCurrency: v })}
                          placeholder="เลือกสกุลเงิน"
                          disabled={readOnly}
                          usePortal
                        />
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {REFUND_FEE_UNIT_OPTIONS.map(opt => (
                          <label key={opt.value} className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] cursor-pointer transition select-none',
                            post.refundFeeUnit === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-500 hover:border-slate-300',
                            readOnly && 'pointer-events-none',
                          )}>
                            <input type="radio" className="sr-only" checked={post.refundFeeUnit === opt.value}
                              onChange={() => setPost({ refundFeeUnit: opt.value })} disabled={readOnly} />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {post.refundFeeType === 'PERCENT' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <FInput type="number" min={0} max={100} value={post.refundFeePercent ?? ''} disabled={readOnly}
                          onChange={v => setPost({ refundFeePercent: v === '' ? null : Number(v) })}
                          placeholder="เช่น 10" className="max-w-[140px]" />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                      <div>
                        <Label>คำนวณจาก</Label>
                        <div className="flex gap-1.5 flex-wrap">
                          {POST_FEE_BASE_OPTIONS.map(opt => (
                            <label key={opt.value} className={cn(
                              'flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] cursor-pointer transition select-none',
                              post.refundFeeBase === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-500 hover:border-slate-300',
                              readOnly && 'pointer-events-none',
                            )}>
                              <input type="radio" className="sr-only" checked={post.refundFeeBase === opt.value}
                                onChange={() => setPost({ refundFeeBase: opt.value })} disabled={readOnly} />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* รูปแบบค่าปรับ */}
                <div>
                  <Label>รูปแบบค่าปรับ</Label>
                  <p className="text-[10px] text-slate-400 mb-1">กรณีแจ้ง Refund นอกเงื่อนไขหรือนอกระยะเวลาที่กำหนด</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {REFUND_PENALTY_MODE_OPTIONS.map(opt => (
                      <label key={opt.value} className={cn(
                        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition select-none',
                        post.penaltyMode === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300',
                        readOnly && 'pointer-events-none',
                      )}>
                        <input type="radio" className="sr-only" checked={post.penaltyMode === opt.value}
                          onChange={() => setPost({
                            penaltyMode: opt.value,
                            ...(opt.value !== 'SINGLE' ? { penaltySingleType: 'PERCENT', penaltySingleValue: null, penaltySingleBase: 'GROUP_PRICE' } : {}),
                            ...(opt.value !== 'STEP_RULE' ? { penaltyStepRules: [] } : {}),
                          })} disabled={readOnly} />
                        {opt.label}
                      </label>
                    ))}
                  </div>

                  {post.penaltyMode === 'SINGLE' && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <Label>ประเภท</Label>
                        <div className="flex gap-1.5 flex-wrap">
                          {([
                            { value: 'PERCENT',      label: '%' },
                            { value: 'FIXED',        label: 'จำนวนเงิน' },
                            { value: 'FULL_FORFEIT', label: 'ยึดเต็ม' },
                          ] as const).map(opt => (
                            <label key={opt.value} className={cn(
                              'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition select-none',
                              post.penaltySingleType === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300',
                              readOnly && 'pointer-events-none',
                            )}>
                              <input type="radio" className="sr-only" checked={post.penaltySingleType === opt.value}
                                onChange={() => setPost({ penaltySingleType: opt.value })} disabled={readOnly} />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      {(post.penaltySingleType === 'PERCENT' || post.penaltySingleType === 'FIXED') && (
                        <div>
                          <Label required>{post.penaltySingleType === 'PERCENT' ? 'เปอร์เซ็นต์' : `จำนวนเงิน (${currency})`}</Label>
                          <FInput type="number" min={0} max={post.penaltySingleType === 'PERCENT' ? 100 : undefined}
                            value={post.penaltySingleValue ?? ''} disabled={readOnly}
                            onChange={v => setPost({ penaltySingleValue: v === '' ? null : Number(v) })}
                            placeholder={post.penaltySingleType === 'PERCENT' ? 'เช่น 15' : '0.00'} />
                        </div>
                      )}
                      {post.penaltySingleType === 'PERCENT' && (
                        <div className="col-span-2">
                          <Label>คำนวณจาก</Label>
                          <div className="flex gap-1.5 flex-wrap">
                            {REFUND_PENALTY_BASE_OPTIONS.map(opt => (
                              <label key={opt.value} className={cn(
                                'flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] cursor-pointer transition select-none',
                                post.penaltySingleBase === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-500 hover:border-slate-300',
                                readOnly && 'pointer-events-none',
                              )}>
                                <input type="radio" className="sr-only" checked={post.penaltySingleBase === opt.value}
                                  onChange={() => setPost({ penaltySingleBase: opt.value })} disabled={readOnly} />
                                {opt.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {post.penaltyMode === 'STEP_RULE' && (
                    <div className="mt-3 space-y-2">
                      {post.penaltyStepRules.length === 0 && (
                        <div className="text-center py-4 bg-slate-50 rounded-xl border border-dashed border-amber-300">
                          <p className="text-xs text-slate-500">ยังไม่มี Step</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">เพิ่ม Step เพื่อกำหนดค่าปรับตามช่วงวัน</p>
                        </div>
                      )}
                      {post.penaltyStepRules.map((r, i) => (
                        <RefundPenaltyStepRuleRow
                          key={r.id} rule={r} index={i} readOnly={readOnly} currency={currency}
                          onUpdate={upd => setPost({ penaltyStepRules: post.penaltyStepRules.map((x, j) => j === i ? upd : x) })}
                          onRemove={() => setPost({ penaltyStepRules: post.penaltyStepRules.filter((_, j) => j !== i) })}
                        />
                      ))}
                      {!readOnly && (
                        <button type="button" onClick={addPenaltyStepRule}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-[#05a94f]/40 text-[#05a94f] text-xs font-medium hover:bg-emerald-50 transition">
                          <Plus size={12} /> เพิ่ม Step
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* หมายเหตุ */}
                <div>
                  <Label>หมายเหตุ Refund</Label>
                  <FTextarea value={post.remark} onChange={v => setPost({ remark: v })} rows={3} disabled={readOnly}
                    placeholder="เช่น หลังส่งชื่อแล้วไม่สามารถเปลี่ยนผู้โดยสารได้ กรณีผู้โดยสารเดินทางไม่ได้ Refund ได้เฉพาะ Tax และ Fuel Charge ยกเว้น YR" />
                </div>

                </div>{/* end disabled wrapper */}

              </div>
            )}
          </div>

          {/* ── Card 3: Utilization ── */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator size={14} className="text-slate-400" />
                <div>
                  <p className="text-xs font-semibold text-slate-700">ใช้ที่นั่งขั้นต่ำ</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">กำหนดจำนวนที่นั่งขั้นต่ำที่ต้องใช้ตามเงื่อนไขสายการบิน</p>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                <Toggle checked={util.enabled} onChange={v => setUtil({ enabled: v })} disabled={readOnly} />
                <span className="text-[11px] text-slate-500">{util.enabled ? 'เปิด' : 'ปิด'}</span>
              </label>
            </div>

            {util.enabled && (
              <div className="px-4 py-4 space-y-4">

                {/* ฐานคำนวณ + % */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>เปอร์เซ็นต์การใช้ที่นั่งขั้นต่ำ</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <FInput type="number" min={0.01} max={100} step={0.01} value={util.requiredPercent ?? ''} disabled={readOnly}
                        onChange={v => setUtil({ requiredPercent: v === '' ? null : Number(v) })} placeholder="เช่น 90" />
                      <span className="text-xs text-slate-500 shrink-0">%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      เช่น 90 หมายถึงต้องใช้ที่นั่งอย่างน้อย 90% ของฐานที่เลือก
                    </p>
                  </div>
                  <div>
                    <Label required>ฐานที่ใช้คำนวณขั้นต่ำ</Label>
                    <FSelect<CondUtilizationBase>
                      value={util.calcBase}
                      onChange={v => {
                        if (!v) return
                        setUtil({
                          calcBase: v,
                          ...(v === 'LATEST_SEAT' && util.measureBy === 'CURRENT_TICKET'
                            ? { measureBy: 'ISSUED_TICKET' } : {}),
                        })
                      }}
                      options={UTIL_BASE_OPTIONS}
                      disabled={readOnly}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      เลือกจำนวนตั้งต้นที่ใช้คำนวณ % ขั้นต่ำ เช่น จำนวนตั๋วเริ่มต้น หรือจำนวนตั๋วที่มัดจำ
                    </p>
                  </div>
                </div>

                {/* จำนวนที่ใช้ตรวจสอบจริง */}
                <div>
                  <Label required>จำนวนที่ใช้ตรวจสอบจริง</Label>
                  <p className="text-[10px] text-slate-400 mt-0.5 mb-2">
                    เลือกจำนวนจริงที่ระบบจะนำมาเทียบกับขั้นต่ำ เช่น จำนวนตั๋วปัจจุบัน หรือจำนวนที่ออกตั๋วจริง
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {UTIL_MEASURE_OPTIONS.map(opt => {
                      const notAllowed = util.calcBase === 'LATEST_SEAT' && opt.value === 'CURRENT_TICKET'
                      return (
                        <label key={opt.value} className={cn(
                          'flex flex-col px-3 py-2 rounded-xl border transition select-none',
                          notAllowed
                            ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                            : util.measureBy === opt.value
                              ? 'border-[#05a94f] bg-emerald-50 cursor-pointer'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer',
                          readOnly && 'pointer-events-none',
                        )}>
                          <input type="radio" className="sr-only" checked={util.measureBy === opt.value}
                            onChange={() => !notAllowed && setUtil({ measureBy: opt.value })}
                            disabled={readOnly || notAllowed} />
                          <span className={cn('text-xs font-semibold',
                            notAllowed ? 'text-slate-300' : util.measureBy === opt.value ? 'text-[#05a94f]' : 'text-slate-700')}>
                            {opt.label}
                          </span>
                          <span className={cn('text-[10px] mt-0.5 leading-relaxed',
                            notAllowed ? 'text-slate-300' : util.measureBy === opt.value ? 'text-emerald-600' : 'text-slate-400')}>
                            {opt.desc}
                          </span>
                          {notAllowed && (
                            <span className="text-[9px] text-slate-400 mt-1">
                              ไม่รองรับเมื่อฐาน = จำนวนตั๋วล่าสุด
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                  {util.calcBase === 'LATEST_SEAT' && util.measureBy === 'CURRENT_TICKET' && (
                    <p className="text-[10px] text-amber-600 mt-1.5 flex items-center gap-1">
                      <AlertCircle size={10} />
                      ฐานคำนวณและจำนวนที่ใช้ตรวจสอบไม่ควรเป็นค่าเดียวกัน เพราะจะทำให้เงื่อนไขใช้ที่นั่งขั้นต่ำไม่มีผล
                    </p>
                  )}
                </div>

                <div>
                  <Label required>หากใช้ไม่ถึงขั้นต่ำ</Label>
                  <div className="flex gap-1.5 flex-wrap mt-1">
                    {UTIL_ACTION_OPTIONS.map(opt => (
                      <label key={opt.value} className={cn(
                        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition select-none',
                        util.exceedAction === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300',
                        readOnly && 'pointer-events-none',
                      )}>
                        <input type="radio" className="sr-only" checked={util.exceedAction === opt.value}
                          onChange={() => setUtil({
                            exceedAction: opt.value,
                            ...(opt.value !== 'PENALTY' ? { penaltyAmount: null, penaltyPercent: null, penaltyCurrency: '' } : {}),
                          })} disabled={readOnly} />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                {util.exceedAction === 'PENALTY' && (
                  <div>
                    <Label required>วิธีคิดค่าปรับ</Label>
                    <div className="flex gap-1.5 flex-wrap mt-1 mb-2">
                      {UTIL_PENALTY_TYPE_OPTIONS.map(opt => (
                        <label key={opt.value} className={cn(
                          'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition select-none',
                          util.penaltyType === opt.value ? 'border-[#05a94f] bg-emerald-50 text-[#05a94f] font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300',
                          readOnly && 'pointer-events-none',
                        )}>
                          <input type="radio" className="sr-only" checked={util.penaltyType === opt.value}
                            onChange={() => setUtil({
                              penaltyType: opt.value,
                              ...(opt.value === 'AMOUNT_PER_MISSING' ? { penaltyPercent: null } : { penaltyAmount: null, penaltyCurrency: '' }),
                            })} disabled={readOnly} />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                    {util.penaltyType === 'AMOUNT_PER_MISSING' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <FInput type="number" min={0} value={util.penaltyAmount ?? ''} disabled={readOnly}
                          onChange={v => setUtil({ penaltyAmount: v === '' ? null : Number(v) })}
                          placeholder="0.00" className="w-[160px]" />
                        <div className="w-[160px] shrink-0">
                          <SearchableSelect
                            options={CURRENCY_OPTIONS}
                            value={util.penaltyCurrency || currency}
                            onChange={v => setUtil({ penaltyCurrency: v })}
                            placeholder="เลือกสกุลเงิน"
                            disabled={readOnly}
                            usePortal
                          />
                        </div>
                        <span className="text-xs text-slate-500 shrink-0">ต่อที่นั่งที่ขาด</span>
                      </div>
                    )}
                    {(util.penaltyType === 'PERCENT_GROUP' || util.penaltyType === 'PERCENT_DEPOSIT') && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <FInput type="number" min={0} max={100} step={0.01} value={util.penaltyPercent ?? ''} disabled={readOnly}
                          onChange={v => setUtil({ penaltyPercent: v === '' ? null : Number(v) })}
                          placeholder="เช่น 10" className="w-[160px]" />
                        <span className="text-xs text-slate-500 shrink-0">%</span>
                      </div>
                    )}
                  </div>
                )}

                {util.exceedAction === 'FORFEIT_DEPOSIT' && (
                  <div>
                    <Label required>รูปแบบการยึด</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                      {UTIL_FORFEIT_TYPE_OPTIONS.map(opt => (
                        <label key={opt.value} className={cn(
                          'flex flex-col px-3 py-2 rounded-xl border cursor-pointer transition text-xs select-none',
                          util.forfeitType === opt.value
                            ? 'border-[#05a94f] bg-emerald-50'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                          readOnly && 'pointer-events-none',
                        )}>
                          <input type="radio" className="sr-only" checked={util.forfeitType === opt.value}
                            onChange={() => setUtil({ forfeitType: opt.value })} disabled={readOnly} />
                          <span className={cn('font-semibold', util.forfeitType === opt.value ? 'text-[#05a94f]' : 'text-slate-700')}>
                            {opt.label}
                          </span>
                          <span className={cn('text-[10px] mt-0.5', util.forfeitType === opt.value ? 'text-emerald-600' : 'text-slate-400')}>
                            {opt.desc}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label>หมายเหตุ</Label>
                  <FTextarea value={util.remark} onChange={v => setUtil({ remark: v })} rows={2} disabled={readOnly}
                    placeholder="เช่น ต้องออกตั๋วอย่างน้อย 90% ของ Deposit หากไม่ถึงจะคิดค่าปรับตามจำนวนที่นั่งที่ขาด" />
                </div>

              </div>
            )}
          </div>

          {/* ── Card 4: Live Preview ── */}
          {(post.enabled || util.enabled) && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-sky-100 border-b border-sky-200">
                <Eye size={13} className="text-sky-600 shrink-0" />
                <span className="text-xs font-semibold text-sky-800">ตัวอย่างจากข้อมูลที่ตั้งค่า</span>
              </div>
              <div className="px-4 py-3 space-y-1">
                {previewLines.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">ยังไม่มีข้อมูลสำหรับแสดงตัวอย่าง</p>
                ) : (
                  previewLines.map((line, i) => (
                    <p key={i} className={cn('text-sm leading-relaxed', line.missing ? 'text-amber-600 italic' : 'text-slate-700')}>
                      {line.text}
                    </p>
                  ))
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

// ─── § 6 Additional ───────────────────────────────────────────────────────────

export function AdditionalSection({ value, onChange, readOnly, errors = [] }: {
  value: AppCondition; onChange: (v: AppCondition) => void; readOnly: boolean; errors?: string[]
}) {
  return (
    <div className="space-y-4">
      <ErrorBox errors={errors} />
      <div>
        <p className="text-sm font-semibold text-slate-800 mb-1">เงื่อนไขอิสระ (Free Text Condition)</p>
        <p className="text-[11px] text-slate-400 mb-3">
          ใช้สำหรับเงื่อนไขข้อความอิสระจากสายการบิน เช่น ข้อกำหนดการเปลี่ยนชื่อ การจัดที่นั่ง เงื่อนไขเฉพาะ หรือข้อความที่ไม่ต้องนำไปคำนวณ
        </p>
        <RichTextEditor
          html={value.freeTextHtml}
          onChange={(html, plain) => onChange({ ...value, freeTextHtml: html, freeTextCondition: plain })}
          placeholder={
            'เช่น\n- ไม่สามารถเปลี่ยนแปลงชื่อผู้โดยสารได้\n- กรุณาชำระภายในวันที่กำหนด มิฉะนั้นถือว่ายกเลิกการจอง\n- ที่นั่งจะถูกจัดโดยสายการบิน\n- เงื่อนไขอื่น ๆ ตามประกาศของสายการบิน'
          }
          disabled={readOnly}
          minHeight={260}
        />
        {value.freeTextCondition.trim().length > 0 && (
          <p className="text-[10px] text-slate-400 mt-1 text-right">
            {value.freeTextCondition.trim().length} ตัวอักษร
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main ConditionBuilder — renders the active section ───────────────────────

export interface ConditionBuilderProps {
  value: AppCondition
  onChange: (v: AppCondition) => void
  activeTab?: TabKey
  onActiveTabChange?: (t: TabKey) => void
  currency?: string
  readOnly?: boolean
  showBasicInfo?: boolean
  errors?: Partial<Record<TabKey, string[]>>
  conditionMode?: ConditionMode
  seriesInfo?: SeriesInfo
  templateInfo?: TemplateInfo
}

export default function ConditionBuilder({
  value, onChange,
  activeTab: controlledTab,
  onActiveTabChange,
  currency = 'THB',
  readOnly = false,
  showBasicInfo = true,
  errors = {},
  conditionMode = 'template',
  seriesInfo,
  templateInfo,
}: ConditionBuilderProps) {
  const [internalTab, setInternalTab] = useState<TabKey>(showBasicInfo ? 'basic' : 'payment')
  const isControlled = controlledTab !== undefined
  const activeTab = isControlled ? controlledTab : internalTab
  const setTab = (t: TabKey) => { onActiveTabChange?.(t); if (!isControlled) setInternalTab(t) }

  const visibleTabs = showBasicInfo ? TABS : TABS.filter(t => t.key !== 'basic')

  const renderSection = () => {
    switch (activeTab) {
      case 'basic':   return showBasicInfo ? <BasicInfoSection value={value} onChange={onChange} readOnly={readOnly} errors={errors.basic} conditionMode={conditionMode} seriesInfo={seriesInfo} templateInfo={templateInfo} /> : null
      case 'payment': return <PaymentSection value={value} onChange={onChange} readOnly={readOnly} currency={currency} errors={errors.payment} conditionMode={conditionMode} seriesInfo={seriesInfo} />
      case 'baggage': return <BaggageSection value={value} onChange={onChange} readOnly={readOnly} errors={errors.baggage} />
      case 'reduce':  return <SeatReductionSection value={value} onChange={onChange} readOnly={readOnly} currency={currency} errors={errors.reduce} departureDate={seriesInfo?.departureDate} />
      case 'cancel':  return <CancelGroupSection value={value} onChange={onChange} readOnly={readOnly} currency={currency} errors={errors.cancel} departureDate={seriesInfo?.departureDate} />
      case 'change':  return <ChangeSection value={value} onChange={onChange} readOnly={readOnly} currency={currency} errors={errors.change} />
      case 'refund':  return <CombinedRefundSection value={value} onChange={onChange} readOnly={readOnly} currency={currency} errors={errors.refund} />
      case 'extra':   return <AdditionalSection value={value} onChange={onChange} readOnly={readOnly} errors={errors.extra} />
      default:        return null
    }
  }

  // Standalone mode: render with simple tab bar
  if (!isControlled) {
    return (
      <div className="flex flex-col">
        <div className="border-b border-slate-200 overflow-x-auto shrink-0">
          <div className="flex min-w-max">
            {visibleTabs.map(tab => {
              const isActive = activeTab === tab.key
              const status = getTabStatus(tab.key, value, errors[tab.key] ?? [], conditionMode, seriesInfo, templateInfo)
              const dotColor = status === 'error' ? 'bg-red-500' : status === 'complete' ? 'bg-emerald-400' : status === 'incomplete' ? 'bg-amber-400' : ''
              return (
                <button key={tab.key} type="button" onClick={() => setTab(tab.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3.5 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-all',
                    isActive ? 'border-[#05a94f] text-[#05a94f]' : 'border-transparent text-slate-500 hover:text-slate-700',
                  )}>
                  <span className={cn('w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold',
                    isActive ? 'bg-[#05a94f]/10 text-[#05a94f]' : 'bg-slate-100 text-slate-400')}>
                    {tab.no}
                  </span>
                  {tab.label}
                  {dotColor && <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />}
                </button>
              )
            })}
          </div>
        </div>
        <div className="py-4">{renderSection()}</div>
      </div>
    )
  }

  // Controlled mode: just section content (ConditionEditorModal handles tab bar)
  return <div>{renderSection()}</div>
}
