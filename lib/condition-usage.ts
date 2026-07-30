/**
 * Condition Template Usage
 * Tracks assignments of templates to Series (DemoStock) and PNRs (DemoPNR).
 * Demo mode: all data in localStorage.
 */

import { getDemoStocks, saveDemoStock, type DemoStock, type DemoPNR } from '@/lib/demo-storage'
import { snapshotTemplateToCondition } from '@/lib/condition-storage'
import { buildRouteText } from '@/lib/utils'
import type { AppConditionTemplate } from '@/lib/condition-schema'

const LOGS_KEY = 'app_condition_usage_logs'

// ─── Relationship types ───────────────────────────────────────────────────────

/**
 * The relationship between a PNR and a specific Condition Template:
 *
 *  INHERITED — PNR has no direct assignment; it inherits from its parent Series
 *              which has this template.
 *
 *  DIRECT    — PNR has this template assigned directly, and its parent Series
 *              does NOT have a DIFFERENT template condition (series may have
 *              no condition at all, or may redundantly have this same template).
 *
 *  OVERRIDE  — PNR has this template assigned directly, but its parent Series
 *              has a DIFFERENT template condition. The PNR overrides the series.
 */
export type ConditionRelationshipType = 'INHERITED' | 'DIRECT' | 'OVERRIDE'

export interface PnrWithRelationship {
  stock: DemoStock
  pnr: DemoPNR
  relationship: ConditionRelationshipType
}

export interface UsageStats {
  /** Series (DemoStocks) that have this template in their conditions array */
  series: DemoStock[]
  /** PNRs that inherit this template from their Series (no direct assignment) */
  inheritedPnrs: PnrWithRelationship[]
  /** PNRs with direct assignment of this template (DIRECT + OVERRIDE) */
  directPnrs: PnrWithRelationship[]
  /** Number of distinct stocks that contain direct-assigned PNRs */
  directPnrHostStockCount: number
  logs: ConditionUsageLog[]
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConditionUsageLog {
  logId: string
  action: 'assign_series' | 'remove_series' | 'assign_pnr' | 'remove_pnr'
  templateId: string
  templateCode: string
  templateName: string
  stockId: string
  stockCode: string
  stockName: string
  pnrId?: string
  pnrCode?: string
  prevTemplateId?: string | null
  prevCondCode?: string | null
  newCondCode?: string | null
  relationshipType?: ConditionRelationshipType | null
  performedAt: string
  performedBy: string
}

export interface AssignSeriesOptions {
  template: AppConditionTemplate
  stockIds: string[]
  conflictMode: 'skip' | 'replace'
  pnrOverrideMode: 'keep' | 'replace'
  performedBy?: string
}

export interface AssignPnrOptions {
  template: AppConditionTemplate
  assignments: { stockId: string; pnrId: string }[]
  conflictMode: 'skip' | 'replace'
  performedBy?: string
}

// ─── Log helpers ──────────────────────────────────────────────────────────────

function readLogs(): ConditionUsageLog[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(LOGS_KEY) ?? '[]') } catch { return [] }
}

function writeLogs(logs: ConditionUsageLog[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, 1000)))
}

function appendLog(entry: ConditionUsageLog): void {
  const logs = readLogs()
  logs.unshift(entry)
  writeLogs(logs)
}

function genLogId(): string {
  return `UL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// ─── Core relationship logic (single source of truth) ────────────────────────

/**
 * Determine how a PNR relates to a specific template.
 * Returns null when the PNR has no connection to this template.
 */
export function getPnrRelationshipType(
  pnr: DemoPNR,
  stock: DemoStock,
  templateId: string,
): ConditionRelationshipType | null {
  const stockHasThisTemplate  = stock.conditions.some(c => c.sourceTemplateId === templateId)
  const stockHasOtherTemplate = stock.conditions.some(
    c => c.source === 'template' && c.sourceTemplateId !== templateId,
  )
  const pnrDirect = pnr.conditionTemplateId === templateId

  if (!pnrDirect && !stockHasThisTemplate) return null       // no connection
  if (!pnrDirect && stockHasThisTemplate)  return 'INHERITED'
  if (pnrDirect  && !stockHasOtherTemplate) return 'DIRECT'  // series has no OTHER template
  return 'OVERRIDE'                                           // series has a different template
}

/** Route text derived from the FlightSet the PNR actually uses */
export function getPnrRoute(pnr: DemoPNR, stock: DemoStock): string {
  const fsets = stock.flightSets ?? []
  const fset  = pnr.flightSetId ? fsets.find(fs => fs.flightSetId === pnr.flightSetId) : null
  const secs  = fset?.sectors ?? fsets[0]?.sectors ?? stock.sectors ?? []
  if (secs.length < 2) return 'ยังไม่ครบ'
  const text = buildRouteText(secs.map(s => ({ dep_airport_code: s.depAirportCode, arr_airport_code: s.arrAirportCode })))
  return text || 'ยังไม่ครบ'
}

/**
 * Single source of truth for ALL usage data.
 * Every KPI, table, and log in the UI must derive from this one call.
 */
export function computeUsageStats(templateId: string): UsageStats {
  const series: DemoStock[]            = []
  const inheritedPnrs: PnrWithRelationship[] = []
  const directPnrs:   PnrWithRelationship[]  = []
  const directStockIds = new Set<string>()

  for (const stock of getDemoStocks()) {
    if (stock.ticketType !== 'Group') continue

    const stockHasThis = stock.conditions.some(c => c.sourceTemplateId === templateId)
    if (stockHasThis) series.push(stock)

    for (const pnr of stock.pnrs) {
      const rel = getPnrRelationshipType(pnr, stock, templateId)
      if (!rel) continue
      const entry: PnrWithRelationship = { stock, pnr, relationship: rel }
      if (rel === 'INHERITED') {
        inheritedPnrs.push(entry)
      } else {
        directPnrs.push(entry)
        directStockIds.add(stock.stockId)
      }
    }
  }

  return {
    series,
    inheritedPnrs,
    directPnrs,
    directPnrHostStockCount: directStockIds.size,
    logs: getConditionUsageLogs(templateId),
  }
}

// ─── Legacy point queries (kept for ConditionAssignModal compatibility) ───────

/** Group DemoStocks that have a condition snapshot from this template */
export function getSeriesUsingTemplate(templateId: string): DemoStock[] {
  return getDemoStocks().filter(
    s => s.ticketType === 'Group' &&
         s.conditions.some(c => c.sourceTemplateId === templateId)
  )
}

/** PNRs that have been directly assigned this template */
export function getPnrsWithDirectAssignment(templateId: string): { stock: DemoStock; pnr: DemoPNR }[] {
  const result: { stock: DemoStock; pnr: DemoPNR }[] = []
  for (const stock of getDemoStocks()) {
    if (stock.ticketType !== 'Group') continue
    for (const pnr of stock.pnrs) {
      if (pnr.conditionTemplateId === templateId) result.push({ stock, pnr })
    }
  }
  return result
}

/** Group stocks eligible for assignment (same airline) */
export function getAvailableSeriesForTemplate(airlineCode: string): DemoStock[] {
  if (!airlineCode) return []
  return getDemoStocks().filter(
    s => s.ticketType === 'Group' && s.airlineCode === airlineCode
  )
}

/** PNRs eligible for direct assignment */
export function getAvailablePnrsForTemplate(airlineCode: string): { stock: DemoStock; pnr: DemoPNR }[] {
  const result: { stock: DemoStock; pnr: DemoPNR }[] = []
  for (const stock of getAvailableSeriesForTemplate(airlineCode)) {
    for (const pnr of stock.pnrs) {
      if (pnr.status !== 'Cancelled') result.push({ stock, pnr })
    }
  }
  return result
}

export function getConditionUsageLogs(templateId: string): ConditionUsageLog[] {
  return readLogs().filter(l => l.templateId === templateId)
}

/** PNRs in a series that have a direct override (any template, not just this one) */
export function countPnrOverrides(stock: DemoStock): number {
  return stock.pnrs.filter(p => p.conditionOverride).length
}

/** PNRs in a series that override THIS template's assignment */
export function countPnrOverridesForTemplate(stock: DemoStock, templateId: string): number {
  return stock.pnrs.filter(
    p => p.conditionTemplateId != null && p.conditionTemplateId !== templateId
  ).length
}

/** Current template ID on the stock (first template condition found) */
export function getStockTemplateId(stock: DemoStock): string | null {
  return stock.conditions.find(c => c.source === 'template')?.sourceTemplateId ?? null
}

/** Effective template ID for a PNR: direct assignment takes precedence over inherited */
export function getPnrEffectiveTemplateId(pnr: DemoPNR, stock: DemoStock): string | null {
  if (pnr.conditionTemplateId) return pnr.conditionTemplateId
  return getStockTemplateId(stock)
}

/** General condition source (template-agnostic) — used by ConditionAssignModal */
export function getPnrConditionSource(pnr: DemoPNR, stock: DemoStock): 'direct' | 'series' | 'none' {
  if (pnr.conditionTemplateId) return 'direct'
  if (getStockTemplateId(stock)) return 'series'
  return 'none'
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function assignTemplateToSeries(opts: AssignSeriesOptions): number {
  const { template, stockIds, conflictMode, pnrOverrideMode, performedBy = 'System' } = opts
  let count = 0

  for (const stockId of stockIds) {
    const stock = getDemoStocks().find(s => s.stockId === stockId)
    if (!stock) continue

    const snapshot      = snapshotTemplateToCondition(template)
    const existingIdx   = stock.conditions.findIndex(c => c.sourceTemplateId === template.templateId)
    const hasOtherTempl = stock.conditions.some(c => c.source === 'template' && c.sourceTemplateId !== template.templateId)

    if (existingIdx < 0 && hasOtherTempl && conflictMode === 'skip') continue

    const prevCondCode = stock.conditions[0]?.condition.conditionCode ?? null

    let newConditions = existingIdx >= 0
      ? stock.conditions.map((c, i) => i === existingIdx ? snapshot : c)
      : [snapshot, ...stock.conditions.filter(c => c.source !== 'template')]

    let pnrs = stock.pnrs
    if (pnrOverrideMode === 'replace') {
      pnrs = pnrs.map(p => p.conditionOverride ? { ...p, conditionTemplateId: null, conditionOverride: false } : p)
    }

    saveDemoStock({ ...stock, conditions: newConditions, pnrs, updatedAt: new Date().toISOString() })
    appendLog({
      logId: genLogId(), action: 'assign_series',
      templateId:   template.templateId,
      templateCode: template.condition.conditionCode,
      templateName: template.condition.conditionName,
      stockId, stockCode: stock.stockCode, stockName: stock.groupName,
      prevCondCode,
      newCondCode: template.condition.conditionCode,
      performedAt: new Date().toISOString(), performedBy,
    })
    count++
  }
  return count
}

export function removeTemplateFromSeries(templateId: string, stockId: string, performedBy = 'System'): void {
  const stock = getDemoStocks().find(s => s.stockId === stockId)
  if (!stock) return
  const prevCondCode  = stock.conditions.find(c => c.sourceTemplateId === templateId)?.condition.conditionCode ?? null
  const newConditions = stock.conditions.filter(c => c.sourceTemplateId !== templateId)
  saveDemoStock({ ...stock, conditions: newConditions, updatedAt: new Date().toISOString() })
  appendLog({
    logId: genLogId(), action: 'remove_series',
    templateId, templateCode: '', templateName: '',
    stockId, stockCode: stock.stockCode, stockName: stock.groupName,
    prevCondCode, performedAt: new Date().toISOString(), performedBy,
  })
}

export function assignTemplateToPnrs(opts: AssignPnrOptions): number {
  const { template, assignments, conflictMode, performedBy = 'System' } = opts
  const byStock = new Map<string, string[]>()
  for (const a of assignments) {
    if (!byStock.has(a.stockId)) byStock.set(a.stockId, [])
    byStock.get(a.stockId)!.push(a.pnrId)
  }
  let count = 0
  for (const [stockId, pnrIds] of byStock) {
    const stock = getDemoStocks().find(s => s.stockId === stockId)
    if (!stock) continue
    let changed = false
    const newPnrs = stock.pnrs.map(pnr => {
      if (!pnrIds.includes(pnr.pnrId)) return pnr
      if (pnr.conditionTemplateId === template.templateId) return pnr
      if (pnr.conditionTemplateId && conflictMode === 'skip') return pnr

      // Determine what relationship type will be created
      const stockHasOther = stock.conditions.some(
        c => c.source === 'template' && c.sourceTemplateId !== template.templateId,
      )
      const newRel: ConditionRelationshipType = stockHasOther ? 'OVERRIDE' : 'DIRECT'

      appendLog({
        logId: genLogId(), action: 'assign_pnr',
        templateId: template.templateId,
        templateCode: template.condition.conditionCode,
        templateName: template.condition.conditionName,
        stockId, stockCode: stock.stockCode, stockName: stock.groupName,
        pnrId: pnr.pnrId, pnrCode: pnr.pnrCode || pnr.pnrDisplay,
        prevTemplateId: pnr.conditionTemplateId ?? null,
        prevCondCode: pnr.conditionCode,
        newCondCode: template.condition.conditionCode,
        relationshipType: newRel,
        performedAt: new Date().toISOString(), performedBy,
      })
      changed = true
      count++
      return { ...pnr, conditionTemplateId: template.templateId, conditionOverride: true }
    })
    if (changed) saveDemoStock({ ...stock, pnrs: newPnrs, updatedAt: new Date().toISOString() })
  }
  return count
}

export function removeTemplateFromPnr(
  pnrId: string, stockId: string, templateId: string, performedBy = 'System',
): void {
  const stock = getDemoStocks().find(s => s.stockId === stockId)
  if (!stock) return
  const pnr = stock.pnrs.find(p => p.pnrId === pnrId)
  if (!pnr) return
  const prevCondCode = pnr.conditionCode
  const newPnrs = stock.pnrs.map(p =>
    p.pnrId !== pnrId ? p : { ...p, conditionTemplateId: null, conditionOverride: false }
  )
  saveDemoStock({ ...stock, pnrs: newPnrs, updatedAt: new Date().toISOString() })
  appendLog({
    logId: genLogId(), action: 'remove_pnr',
    templateId, templateCode: '', templateName: '',
    stockId, stockCode: stock.stockCode, stockName: stock.groupName,
    pnrId, pnrCode: pnr.pnrCode || pnr.pnrDisplay,
    prevCondCode, performedAt: new Date().toISOString(), performedBy,
  })
}
