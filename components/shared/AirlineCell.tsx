'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { MASTER_AIRLINES, MASTER_AIRLINE_CODE_SET } from '@/lib/master-data'

interface AirlineCellProps {
  value: string
  onChange: (v: string) => void
  /** className applied to the wrapping div */
  wrapClassName?: string
  /** className applied to the <input> itself */
  inputClassName?: string
  placeholder?: string
  maxLength?: number
}

export function AirlineCell({
  value,
  onChange,
  wrapClassName,
  inputClassName,
  placeholder = 'TG',
  maxLength = 3,
}: AirlineCellProps) {
  const [text, setText]       = useState(value)
  const [open, setOpen]       = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos]         = useState({ top: 0, left: 0, width: 120 })
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { setText(value) }, [value])

  const q        = text.toUpperCase()
  const filtered = q.length > 0
    ? MASTER_AIRLINES.filter(a => a.code.startsWith(q)).slice(0, 20)
    : []

  const select = (code: string) => { onChange(code); setText(code); setOpen(false) }

  const reposition = () => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 2, left: r.left, width: Math.max(110, r.width) })
  }

  useEffect(() => {
    if (!open) return
    const update = () => reposition()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false)
      const upper = text.toUpperCase()
      setText(upper)
      if (upper !== value) onChange(upper)
    }, 150)
  }

  const isUnknown = !!value && !MASTER_AIRLINE_CODE_SET.has(value)

  const dropdown = mounted && open && filtered.length > 0
    ? createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-slate-300 rounded-lg shadow-xl overflow-y-auto max-h-[200px]"
        >
          {filtered.map(a => (
            <button
              key={a.code}
              type="button"
              onMouseDown={e => { e.preventDefault(); select(a.code) }}
              className={cn(
                'w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors',
                a.code === value && 'bg-blue-50'
              )}
            >
              <span className="font-mono font-bold text-xs text-[#05a94f]">{a.code}</span>
            </button>
          ))}
        </div>,
        document.body
      )
    : null

  return (
    <div className={cn('relative w-full', isUnknown && 'bg-red-50/60', wrapClassName)}>
      <input
        ref={inputRef}
        value={text}
        onChange={e => { setText(e.target.value.toUpperCase()); setOpen(true) }}
        onFocus={() => { reposition(); if (q.length > 0) setOpen(true) }}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && filtered[0]) select(filtered[0].code)
          if (e.key === 'ArrowDown') { reposition(); setOpen(true) }
        }}
        maxLength={maxLength}
        placeholder={placeholder}
        className={cn(
          'w-full h-full px-2 py-[5px] text-xs font-mono uppercase bg-transparent outline-none focus:bg-blue-50 placeholder:text-slate-300',
          isUnknown ? 'text-red-500' : 'text-slate-700',
          inputClassName
        )}
      />
      {dropdown}
    </div>
  )
}
