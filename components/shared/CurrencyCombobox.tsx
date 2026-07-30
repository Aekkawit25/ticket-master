'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCurrencyOptions, type CurrencyData } from '@/lib/currency-storage'

// ── Types ─────────────────────────────────────────────────────────────────────

type DropPos = { top: number; left: number; minWidth: number; maxWidth?: number }

export interface CurrencyComboboxProps {
  value: string
  onChange: (code: string) => void
  /** Pass pre-loaded list to avoid reloading per row. Auto-loads from getCurrencyOptions() if omitted. */
  currencies?: CurrencyData[]
  /** 'inline': compact table-cell style  |  'field': full form field (default) */
  variant?: 'inline' | 'field'
  /** Inline only: show amber dot indicator when value differs from stock currency */
  stockDefault?: string
  /** Field only */
  label?: string
  required?: boolean
  error?: string
  helper?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CurrencyCombobox({
  value,
  onChange,
  currencies: currenciesProp,
  variant = 'field',
  stockDefault,
  label,
  required,
  error,
  helper,
  placeholder = 'ค้นหารหัสหรือชื่อสกุลเงิน',
  disabled = false,
  className,
}: CurrencyComboboxProps) {
  // If prop provided use it directly; otherwise load from master and listen for updates
  const [localCurrencies, setLocalCurrencies] = useState<CurrencyData[]>(
    () => (currenciesProp ? [] : getCurrencyOptions()),
  )
  const currencies = currenciesProp ?? localCurrencies
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [dropPos, setDropPos] = useState<DropPos | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  // Listen for master updates only when currencies are managed internally (no prop)
  useEffect(() => {
    if (currenciesProp) return
    const update = () => setLocalCurrencies(getCurrencyOptions())
    window.addEventListener('currencies_updated', update)
    return () => window.removeEventListener('currencies_updated', update)
  }, [currenciesProp])

  // ── Filter: code-starts-with first, then code/name contains ──────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return currencies
    const q = query.trim().toUpperCase()
    const starts = currencies.filter(c => c.currencyCode.startsWith(q))
    const contains = currencies.filter(
      c =>
        !c.currencyCode.startsWith(q) &&
        (c.currencyCode.includes(q) ||
          c.currencyName.toUpperCase().includes(q) ||
          (c.displayName?.toUpperCase().includes(q) ?? false)),
    )
    return [...starts, ...contains]
  }, [query, currencies])

  // Scroll highlighted item into view
  useEffect(() => {
    itemRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  // Close on scroll / resize
  useEffect(() => {
    if (!open) return
    const onClose = () => { setOpen(false); setQuery('') }
    window.addEventListener('scroll', onClose, { capture: true, passive: true })
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [open])

  // Close on outside click (field variant — inline uses onBlur)
  useEffect(() => {
    if (variant !== 'field' || !open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (containerRef.current?.contains(t) || dropRef.current?.contains(t)) return
      setOpen(false); setQuery('')
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [variant, open])

  // ── Positioning ───────────────────────────────────────────────────────────
  const computePos = () => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vh = window.innerHeight
    const vw = window.innerWidth
    const dropH = 280
    const spaceBelow = vh - rect.bottom - 4
    const top = spaceBelow >= dropH ? rect.bottom + 2 : Math.max(4, rect.top - dropH - 2)

    if (variant === 'inline') {
      const minW = 280; const maxW = 340
      const left = Math.max(4, Math.min(rect.left, vw - maxW - 4))
      setDropPos({ top, left, minWidth: minW, maxWidth: maxW })
    } else {
      const minW = Math.max(rect.width, 260)
      const left = Math.max(4, Math.min(rect.left, vw - minW - 4))
      setDropPos({ top, left, minWidth: minW })
    }
  }

  const handleOpen = () => {
    if (disabled) return
    computePos()
    setQuery('')
    setHighlighted(0)
    setOpen(true)
  }

  const commit = (code: string) => {
    if (code !== value) onChange(code)
    setOpen(false); setQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const last = Math.max(0, filtered.length - 1)
    switch (e.key) {
      case 'Escape':   e.preventDefault(); setOpen(false); setQuery(''); return
      case 'Enter':    e.preventDefault(); if (filtered.length > 0) commit(filtered[Math.min(highlighted, last)].currencyCode); return
      case 'ArrowDown': e.preventDefault(); setHighlighted(h => Math.min(h + 1, last)); return
      case 'ArrowUp':   e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); return
      case 'Tab':
        if (filtered.length > 0) { e.preventDefault(); commit(filtered[Math.min(highlighted, last)].currencyCode) }
        else { setOpen(false); setQuery('') }
    }
  }

  const selectedCurrency = currencies.find(c => c.currencyCode === value)
  const isDiff = stockDefault !== undefined && value !== stockDefault

  // ── Shared dropdown ───────────────────────────────────────────────────────
  const dropdown = dropPos ? (
    <div
      ref={dropRef}
      role="listbox"
      aria-label="สกุลเงิน"
      style={{
        position: 'fixed',
        top: dropPos.top,
        left: dropPos.left,
        minWidth: dropPos.minWidth,
        maxWidth: dropPos.maxWidth,
        zIndex: 9999,
      }}
      className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
      onMouseDown={e => e.preventDefault()}
    >
      {variant === 'field' && (
        <div className="p-2 border-b border-slate-100">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-lg">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setHighlighted(0) }}
              onKeyDown={handleKeyDown}
              placeholder="ค้นหารหัสหรือชื่อสกุลเงิน"
              aria-label="ค้นหาสกุลเงิน"
              className="flex-1 bg-transparent text-sm outline-none text-slate-700 placeholder:text-slate-400"
            />
          </div>
        </div>
      )}
      <div className="max-h-[210px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-xs text-slate-400 text-center">ไม่พบสกุลเงิน</div>
        ) : (
          filtered.map((c, i) => (
            <div
              key={c.currencyCode}
              ref={el => { itemRefs.current[i] = el }}
              role="option"
              aria-selected={c.currencyCode === value}
              onClick={() => commit(c.currencyCode)}
              onMouseEnter={() => setHighlighted(i)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-xs cursor-pointer select-none',
                i === highlighted ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              <span className="font-mono font-bold w-10 shrink-0">{c.currencyCode}</span>
              <span className="truncate text-[11px] text-slate-500">
                {c.currencyName}{c.displayName ? ` / ${c.displayName}` : ''}
              </span>
              {c.currencyCode === value && (
                <span className="ml-auto shrink-0 text-[#05a94f] font-bold">✓</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  ) : null

  // ── Inline variant (table cell) ───────────────────────────────────────────
  if (variant === 'inline') {
    return (
      <div
        ref={containerRef}
        className={cn('relative', className)}
        onClick={() => { if (!open) handleOpen() }}
      >
        {open ? (
          <>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setHighlighted(0) }}
              onKeyDown={handleKeyDown}
              onBlur={() => { setOpen(false); setQuery('') }}
              placeholder={value || 'THB'}
              aria-label="สกุลเงิน"
              className="w-full px-1 py-[6px] text-center text-[11px] font-semibold bg-blue-50/80 outline-none placeholder:text-slate-400"
            />
            {dropdown && typeof window !== 'undefined' && createPortal(dropdown, document.body)}
          </>
        ) : (
          <span
            title={
              isDiff
                ? `${value}${selectedCurrency ? ` — ${selectedCurrency.currencyName}` : ''} (Stock default: ${stockDefault})`
                : selectedCurrency?.currencyName
            }
            className={cn(
              'block w-full px-1 py-[6px] text-center text-[11px] font-semibold cursor-pointer select-none hover:bg-slate-50 transition-colors',
              isDiff ? 'text-amber-700' : 'text-slate-700',
            )}
          >
            {value || '—'}
          </span>
        )}
        {isDiff && !open && (
          <span className="absolute top-1 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 pointer-events-none" />
        )}
      </div>
    )
  }

  // ── Field variant (form field) ────────────────────────────────────────────
  return (
    <div className={cn('space-y-1', className)} ref={containerRef}>
      {label && (
        <label className="block text-xs font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-label={label ?? 'สกุลเงิน'}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => { if (open) { setOpen(false); setQuery('') } else handleOpen() }}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg transition-colors bg-white text-left min-h-[40px]',
          'focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]',
          error ? 'border-red-400' : 'border-slate-300',
          disabled && 'bg-slate-50 text-slate-400 cursor-not-allowed',
          !error && open && 'border-[#05a94f] ring-2 ring-[#05a94f]/30',
        )}
      >
        {selectedCurrency ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-semibold text-slate-800 shrink-0">{selectedCurrency.currencyCode}</span>
            <span className="text-slate-400 text-xs truncate">
              {selectedCurrency.currencyName}
              {selectedCurrency.displayName ? ` / ${selectedCurrency.displayName}` : ''}
            </span>
          </span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <ChevronDown size={14} className={cn('text-slate-400 transition-transform shrink-0 ml-2', open && 'rotate-180')} />
      </button>
      {open && dropdown && typeof window !== 'undefined' && createPortal(dropdown, document.body)}
      {helper && !error && <p className="text-xs text-slate-400">{helper}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
