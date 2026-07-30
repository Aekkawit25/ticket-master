'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { normalizeTime, isValidHHmm, validateTime } from '@/lib/time-utils'

// Re-export so existing imports (e.g. test file) using './time-input' still work
export { normalizeTime, isValidHHmm, validateTime } from '@/lib/time-utils'

// ─── Popup dropdown ───────────────────────────────────────────────────────────

const MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

interface DropdownProps {
  anchorRect: DOMRect
  selH: number
  selM: number
  onHourClick: (h: number) => void
  onMinuteClick: (m: number) => void
  onClose: () => void
}

function TimeDropdown({ anchorRect, selH, selM, onHourClick, onMinuteClick, onClose }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [customMin, setCustomMin] = useState('')

  // Position: prefer below, fall back to above
  const dropH = 300
  const spaceBelow = window.innerHeight - anchorRect.bottom
  const top = spaceBelow >= dropH + 8 ? anchorRect.bottom + 4 : anchorRect.top - dropH - 4
  const left = Math.max(4, Math.min(anchorRect.left, window.innerWidth - 248))

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [onClose])

  const commitCustomMin = () => {
    const m = parseInt(customMin, 10)
    if (!isNaN(m) && m >= 0 && m <= 59) {
      onMinuteClick(m)
      setCustomMin('')
    }
  }

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top, left, width: 244, zIndex: 9999 }}
      className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 select-none"
      onMouseDown={e => e.preventDefault()}
    >
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        ชั่วโมง (00–23)
      </p>
      <div className="grid grid-cols-6 gap-0.5 mb-3">
        {Array.from({ length: 24 }, (_, i) => (
          <button
            key={i}
            type="button"
            onMouseDown={e => { e.preventDefault(); onHourClick(i) }}
            className={cn(
              'py-1 rounded text-[11px] font-mono font-medium transition-colors',
              selH === i
                ? 'bg-emerald-600 text-white'
                : 'hover:bg-slate-100 text-slate-700',
            )}
          >
            {String(i).padStart(2, '0')}
          </button>
        ))}
      </div>

      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        นาที
      </p>
      <div className="grid grid-cols-6 gap-0.5 mb-2">
        {MINUTE_STEPS.map(m => (
          <button
            key={m}
            type="button"
            onMouseDown={e => { e.preventDefault(); onMinuteClick(m) }}
            className={cn(
              'py-1 rounded text-[11px] font-mono font-medium transition-colors',
              selH >= 0 && selM === m
                ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-400'
                : 'hover:bg-slate-100 text-slate-700',
            )}
          >
            {String(m).padStart(2, '0')}
          </button>
        ))}
      </div>

      <div className="border-t border-slate-100 pt-2 flex items-center gap-1.5">
        <span className="text-[10px] text-slate-400 shrink-0">นาทีอื่น:</span>
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={customMin}
          onChange={e => setCustomMin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') commitCustomMin() }}
          placeholder="mm"
          className="w-10 border border-slate-300 rounded px-1 py-0.5 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-emerald-400"
        />
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); commitCustomMin() }}
          className="px-2 py-0.5 bg-emerald-600 text-white text-[11px] rounded hover:bg-emerald-700 transition-colors"
        >
          เลือก
        </button>
      </div>
    </div>
  )
}

// ─── TimeInput component ──────────────────────────────────────────────────────

export interface TimeInputProps {
  value: string
  onChange: (v: string) => void
  /** Classes on the outer wrapper — use for border, width, rounding */
  className?: string
  /** Compact sizing for table cells (text-xs, reduced padding) */
  compact?: boolean
  /** When true, empty input resets to 00:00 instead of staying empty */
  required?: boolean
  placeholder?: string
  disabled?: boolean
}

const RESET_WARN = 'รูปแบบเวลาไม่ถูกต้อง ระบบปรับเป็น 00:00 กรุณาตรวจสอบอีกครั้ง'

export function TimeInput({
  value,
  onChange,
  className,
  compact = false,
  required = false,
  placeholder = 'HH:mm',
  disabled = false,
}: TimeInputProps) {
  const [text, setText] = useState(() => normalizeTime(value) || value || '')
  const [open, setOpen] = useState(false)
  const [warn, setWarn] = useState('')
  const [highlight, setHighlight] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Snapshot the committed value at focus time so Escape can restore it
  const preEditValue = useRef(value)

  // Derive popup initial selection from committed value
  const selH = isValidHHmm(value) ? +value.slice(0, 2) : 8
  const selM = isValidHHmm(value) ? +value.slice(3) : 0

  // Sync display when parent resets or programmatically sets value
  useEffect(() => {
    const normalized = normalizeTime(value)
    setText(normalized || value || '')
  }, [value])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (warnTimerRef.current) clearTimeout(warnTimerRef.current) }
  }, [])

  const showWarn = useCallback((msg: string) => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
    setWarn(msg)
    setHighlight(true)
    warnTimerRef.current = setTimeout(() => {
      setWarn('')
      setHighlight(false)
    }, 4000)
  }, [])

  const clearWarn = () => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
    setWarn('')
    setHighlight(false)
  }

  /**
   * Normalize → validate → commit.
   * Invalid input resets to 00:00 and shows a temporary amber warning.
   */
  const commit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()

      // Empty input
      if (!trimmed) {
        if (required) {
          setText('00:00')
          onChange('00:00')
          showWarn(RESET_WARN)
        } else {
          clearWarn()
          onChange('')
        }
        return
      }

      const parsed = normalizeTime(trimmed)

      if (!parsed || !isValidHHmm(parsed)) {
        // Invalid → auto-reset to 00:00
        setText('00:00')
        onChange('00:00')
        showWarn(RESET_WARN)
        return
      }

      // Valid
      clearWarn()
      setText(parsed)
      onChange(parsed)
    },
    [onChange, required, showWarn],
  )

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Snapshot committed value so Escape can restore it
    preEditValue.current = value
    // Select all text after the browser finishes placing the cursor from mousedown
    const target = e.target
    requestAnimationFrame(() => target.select())
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    // 1. Allow only digits, colon, dot
    val = val.replace(/[^\d:.]/g, '')
    // 2. Reject mixed separators
    if (val.includes(':') && val.includes('.')) return
    // 3. Reject > 1 separator
    const sepCount = (val.match(/[:.]/g) || []).length
    if (sepCount > 1) return
    // 4. Length limits: with separator max 5 chars, without max 4
    if (sepCount === 1 && val.length > 5) return
    if (sepCount === 0 && val.length > 4) return
    // No auto-formatting during typing — cursor stays where user left it
    if (warn) clearWarn()
    setText(val)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')
    const normalized = normalizeTime(pasted)
    e.preventDefault()
    if (normalized && isValidHHmm(normalized)) {
      setText(normalized)
      onChange(normalized)
      clearWarn()
    } else {
      // Invalid paste → reset to 00:00
      setText('00:00')
      onChange('00:00')
      showWarn(RESET_WARN)
    }
  }

  const handleBlur = () => commit(text)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') commit(text)
    if (e.key === 'Escape') {
      // Restore the value that was committed before the user started editing
      const restored = normalizeTime(preEditValue.current) || preEditValue.current || ''
      setText(restored)
      clearWarn()
      setOpen(false)
    }
  }

  const openPopup = () => {
    if (disabled) return
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (rect) {
      setAnchorRect(rect)
      setOpen(true)
    }
  }

  const handleHourClick = (h: number) => {
    const m = isValidHHmm(value) ? +value.slice(3) : selM
    const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    setText(val)
    clearWarn()
    onChange(val)
  }

  const handleMinuteClick = (m: number) => {
    const h = isValidHHmm(value) ? +value.slice(0, 2) : selH
    const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    setText(val)
    clearWarn()
    onChange(val)
    setOpen(false)
  }

  const inputCls = compact
    ? 'flex-1 min-w-0 font-mono bg-transparent outline-none text-center text-xs px-1 py-0'
    : 'flex-1 min-w-0 font-mono bg-transparent outline-none text-center text-sm px-3 py-2'

  const iconSize = compact ? 12 : 14

  return (
    <>
      <div
        ref={wrapperRef}
        className={cn(
          // Default: looks like a standard text input — border, bg, rounded, focus ring
          'group/time flex items-center w-full border border-slate-200 rounded-xl bg-white transition-colors',
          // Focus ring on the wrapper (focus-within targets the inner input's focus state)
          'focus-within:ring-2 focus-within:ring-[#05a94f]/30 focus-within:border-[#05a94f]',
          disabled && 'bg-slate-50 opacity-70',
          highlight && 'border-amber-400 bg-amber-50/30 focus-within:border-amber-400',
          className,
        )}
      >
        <input
          type="text"
          inputMode="numeric"
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className={inputCls}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={e => { e.preventDefault(); openPopup() }}
          className={cn(
            'pr-1 shrink-0 text-slate-300 hover:text-slate-500 transition-all',
            compact && 'opacity-0 group-hover/time:opacity-100 group-focus-within/time:opacity-100',
          )}
        >
          <Clock size={iconSize} />
        </button>
      </div>

      {warn && (
        <p className={cn('text-amber-600 leading-tight mt-0.5', compact ? 'text-[9px]' : 'text-xs')}>
          {warn}
        </p>
      )}

      {open && anchorRect && typeof window !== 'undefined' &&
        createPortal(
          <TimeDropdown
            anchorRect={anchorRect}
            selH={selH}
            selM={selM}
            onHourClick={handleHourClick}
            onMinuteClick={handleMinuteClick}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  )
}
