'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MASTER_AIRLINES } from '@/lib/master-data'

type DropPos = { top: number; left: number; minWidth: number }

export interface AirlineComboboxProps {
  value: string
  onChange: (code: string) => void
  /** Prepend "ทุกสายการบิน" as first option (value = ''). Default: true */
  showAllOption?: boolean
  label?: string
  required?: boolean
  disabled?: boolean
  error?: string
  helper?: string
  /** Placeholder shown on the trigger button when nothing is selected */
  buttonPlaceholder?: string
  /** Placeholder shown inside the search input */
  placeholder?: string
  className?: string
}

type AirlineOption = { code: string; name: string; nameTh?: string }

const ALL_CODE = ''
const ALL_OPTION: AirlineOption = { code: ALL_CODE, name: 'ทุกสายการบิน', nameTh: 'ทุกสายการบิน' }

export function AirlineCombobox({
  value,
  onChange,
  showAllOption = true,
  label,
  required,
  disabled = false,
  error,
  helper,
  buttonPlaceholder,
  placeholder = 'ค้นหา Code หรือชื่อสายการบิน',
  className,
}: AirlineComboboxProps) {
  const [open, setOpen]               = useState(false)
  const [query, setQuery]             = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [dropPos, setDropPos]         = useState<DropPos | null>(null)
  const containerRef                  = useRef<HTMLDivElement>(null)
  const dropRef                       = useRef<HTMLDivElement>(null)
  const itemRefs                      = useRef<(HTMLDivElement | null)[]>([])

  const options: AirlineOption[] = useMemo(
    () => (showAllOption ? [ALL_OPTION, ...MASTER_AIRLINES] : [...MASTER_AIRLINES]),
    [showAllOption],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(a => {
      if (a.code === ALL_CODE)
        return 'ทุกสายการบิน'.includes(q) || 'all'.startsWith(q)
      return (
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.nameTh?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [query, options])

  useEffect(() => {
    itemRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  useEffect(() => {
    if (!open) return
    const close = () => { setOpen(false); setQuery('') }
    window.addEventListener('scroll', close, { capture: true, passive: true })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (containerRef.current?.contains(t) || dropRef.current?.contains(t)) return
      setOpen(false); setQuery('')
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const computePos = () => {
    const el = containerRef.current
    if (!el) return
    const rect  = el.getBoundingClientRect()
    const dropH = 280
    const below = window.innerHeight - rect.bottom - 4
    const top   = below >= dropH ? rect.bottom + 2 : Math.max(4, rect.top - dropH - 2)
    const minW  = Math.max(rect.width, 260)
    const left  = Math.max(4, Math.min(rect.left, window.innerWidth - minW - 4))
    setDropPos({ top, left, minWidth: minW })
  }

  const handleOpen = () => {
    if (disabled) return
    computePos()
    setQuery('')
    setHighlighted(Math.max(0, options.findIndex(a => a.code === value)))
    setOpen(true)
  }

  const commit = (code: string) => {
    if (code !== value) onChange(code)
    setOpen(false); setQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const last = Math.max(0, filtered.length - 1)
    if (e.key === 'Escape')    { e.preventDefault(); setOpen(false); setQuery(''); return }
    if (e.key === 'Enter')     { e.preventDefault(); if (filtered.length) commit(filtered[Math.min(highlighted, last)].code); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, last)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); return }
    if (e.key === 'Tab') {
      if (filtered.length) { e.preventDefault(); commit(filtered[Math.min(highlighted, last)].code) }
      else { setOpen(false); setQuery('') }
    }
  }

  const found    = options.find(a => a.code === value)
  const isOrphan = value !== ALL_CODE && !found
  const displayText = found
    ? (found.code === ALL_CODE ? 'ทุกสายการบิน' : `${found.code} — ${found.name}`)
    : (isOrphan ? value : '')

  const dropdown = dropPos && (
    <div
      ref={dropRef}
      role="listbox"
      style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, minWidth: dropPos.minWidth, zIndex: 9999 }}
      className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
      onMouseDown={e => e.preventDefault()}
    >
      <div className="p-2 border-b border-slate-100">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-lg">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlighted(0) }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label="ค้นหาสายการบิน"
            className="flex-1 bg-transparent text-sm outline-none text-slate-700 placeholder:text-slate-400"
          />
        </div>
      </div>
      <div className="max-h-[220px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-xs text-slate-400 text-center">ไม่พบสายการบิน</div>
        ) : filtered.map((a, i) => (
          <div
            key={a.code === ALL_CODE ? '__all__' : a.code}
            ref={el => { itemRefs.current[i] = el }}
            role="option"
            aria-selected={a.code === value}
            onClick={() => commit(a.code)}
            onMouseEnter={() => setHighlighted(i)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 cursor-pointer select-none',
              i === highlighted ? 'bg-emerald-50' : 'hover:bg-slate-50',
            )}
          >
            {a.code === ALL_CODE ? (
              <span className={cn('text-sm italic flex-1', i === highlighted ? 'text-emerald-700' : 'text-slate-500')}>
                ทุกสายการบิน
              </span>
            ) : (
              <>
                <span className={cn('font-mono font-bold text-sm w-8 shrink-0', i === highlighted ? 'text-emerald-700' : 'text-[#05a94f]')}>
                  {a.code}
                </span>
                <span className={cn('text-sm truncate flex-1', i === highlighted ? 'text-emerald-800' : 'text-slate-700')}>
                  {a.name}
                </span>
                {a.nameTh && (
                  <span className="text-[11px] text-slate-400 shrink-0 truncate max-w-[90px]">{a.nameTh}</span>
                )}
              </>
            )}
            {a.code === value && (
              <span className="ml-auto shrink-0 text-[#05a94f] text-xs font-bold">✓</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="block text-xs font-medium text-slate-500 mb-1">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div ref={containerRef}>
        <button
          type="button"
          disabled={disabled}
          onClick={handleOpen}
          className={cn(
            'w-full flex items-center justify-between px-3 h-9 rounded-lg border text-sm transition-colors',
            disabled
              ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
              : error
                ? 'border-red-300 hover:border-red-400 bg-white cursor-pointer'
                : 'border-slate-300 hover:border-slate-400 bg-white cursor-pointer',
          )}
        >
          <span className={cn('truncate flex items-center gap-2 text-left min-w-0', !displayText && 'text-slate-400')}>
            {isOrphan ? (
              <>
                <span className="font-mono text-amber-700">{value}</span>
                <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">Inactive</span>
              </>
            ) : (
              displayText || buttonPlaceholder || placeholder
            )}
          </span>
          <ChevronDown size={14} className="text-slate-400 shrink-0 ml-1" />
        </button>
      </div>
      {error  && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
      {helper && !error && <p className="text-[10px] text-slate-400 mt-1">{helper}</p>}
      {open && dropdown && typeof window !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  )
}
