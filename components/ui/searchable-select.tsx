'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option {
  value: string
  label: string
  subtitle?: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  helper?: string
  error?: string
  disabled?: boolean
  required?: boolean
  usePortal?: boolean
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  helper,
  error,
  disabled,
  required,
  usePortal = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)
  const filtered = options.filter(
    o =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      o.value.toLowerCase().includes(search.toLowerCase()) ||
      (o.subtitle?.toLowerCase().includes(search.toLowerCase()) ?? false)
  )

  const computePos = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const dropdownHeight = 280
    const gap = 4
    const spaceBelow = window.innerHeight - rect.bottom - gap
    const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight
    setPos(
      openUpward
        ? { bottom: window.innerHeight - rect.top + gap, left: rect.left, width: Math.max(rect.width, 200) }
        : { top: rect.bottom + gap, left: rect.left, width: Math.max(rect.width, 200) }
    )
  }, [])

  const close = useCallback(() => { setOpen(false); setSearch('') }, [])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (!containerRef.current?.contains(t) && !portalRef.current?.contains(t)) close()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [close])

  useEffect(() => {
    if (!open || !usePortal) return
    const handleClose = () => close()
    window.addEventListener('scroll', handleClose, { capture: true, passive: true })
    window.addEventListener('resize', handleClose)
    return () => {
      window.removeEventListener('scroll', handleClose, true)
      window.removeEventListener('resize', handleClose)
    }
  }, [open, usePortal, close])

  const handleToggle = () => {
    if (open) { close(); return }
    if (usePortal) computePos()
    setOpen(true)
  }

  const menu = (
    <div
      ref={usePortal ? portalRef : undefined}
      style={usePortal && pos ? { position: 'fixed', zIndex: 9999, ...pos } : undefined}
      className={cn(
        !usePortal && 'absolute z-50 mt-1 w-full',
        'bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden',
      )}
    >
      <div className="p-2 border-b border-slate-100">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-lg">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input
            autoFocus
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหา..."
            className="flex-1 bg-transparent text-sm outline-none text-slate-700 placeholder:text-slate-400"
          />
        </div>
      </div>
      <div className="max-h-[220px] overflow-y-auto scrollbar-thin">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-400 text-center">ไม่พบข้อมูล</p>
        ) : (
          filtered.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); close() }}
              className={cn(
                'w-full flex items-start gap-2 px-3 py-2 text-sm transition-colors text-left',
                opt.value === value ? 'bg-[#05a94f] text-white' : 'hover:bg-slate-50 text-slate-700',
              )}
            >
              <div>
                <div className="font-medium">{opt.label}</div>
                {opt.subtitle && (
                  <div className={cn('text-xs mt-0.5', opt.value === value ? 'text-white/70' : 'text-slate-400')}>
                    {opt.subtitle}
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-1" ref={containerRef}>
      {label && (
        <label className="block text-xs font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={handleToggle}
          className={cn(
            'w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg transition-colors bg-white',
            'focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]',
            error ? 'border-red-400' : 'border-slate-300',
            disabled && 'bg-slate-50 text-slate-400 cursor-not-allowed',
            open && 'border-[#05a94f] ring-2 ring-[#05a94f]/30',
          )}
        >
          <span className={cn('truncate text-left', !selected && 'text-slate-400')}>
            {selected ? selected.label : placeholder}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {value && !disabled && (
              <span
                onClick={e => { e.stopPropagation(); onChange('') }}
                className="p-0.5 hover:bg-slate-200 rounded cursor-pointer"
              >
                <X size={12} className="text-slate-400" />
              </span>
            )}
            <ChevronDown size={14} className={cn('text-slate-400 transition-transform', open && 'rotate-180')} />
          </div>
        </button>

        {open && (
          usePortal
            ? (pos && typeof window !== 'undefined' ? createPortal(menu, document.body) : null)
            : menu
        )}
      </div>
      {helper && !error && <p className="text-xs text-slate-400">{helper}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
