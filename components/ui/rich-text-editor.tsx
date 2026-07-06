'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import {
  Bold, Italic, Underline, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Eraser, Highlighter, Type,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Sanitizer ──────────────────────────────────────────────────────────────────
// Keeps formatting tags + safe style attributes only (color, background-color).
// Strips scripts, iframes, event handlers, and any unsafe tags.

const SAFE_TAGS = new Set([
  'B', 'I', 'U', 'STRONG', 'EM', 'STRIKE', 'S',
  'UL', 'OL', 'LI', 'BR', 'P', 'DIV', 'SPAN', 'FONT',
])
const STRIP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'LINK', 'META'])

function cleanNode(node: Node) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as HTMLElement
    if (STRIP_TAGS.has(el.tagName)) { node.removeChild(el); continue }
    if (!SAFE_TAGS.has(el.tagName)) {
      // Unwrap — move children before removing
      while (el.firstChild) node.insertBefore(el.firstChild, el)
      node.removeChild(el)
      cleanNode(node) // re-walk after structure change
      return
    }
    // Strip unsafe attributes
    for (const { name } of Array.from(el.attributes)) {
      if (name.startsWith('on') || ['href', 'src', 'action', 'formaction', 'data', 'xlink:href'].includes(name)) {
        el.removeAttribute(name); continue
      }
      if (name === 'style') {
        const safe = el.getAttribute('style')!
          .split(';')
          .filter(s => {
            const prop = s.split(':')[0].trim().toLowerCase()
            return prop === 'color' || prop === 'background-color'
          })
          .join(';')
        safe ? el.setAttribute('style', safe) : el.removeAttribute('style')
      }
    }
    cleanNode(el)
  }
}

function sanitize(html: string): string {
  if (typeof document === 'undefined') return ''
  if (!html || html === '<br>') return ''
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  cleanNode(wrap)
  const result = wrap.innerHTML
  return result === '<br>' ? '' : result
}

// ── Color Presets ─────────────────────────────────────────────────────────────

const TEXT_COLORS = [
  { c: '#1a1a1a', label: 'ดำ' },
  { c: '#64748b', label: 'เทา' },
  { c: '#dc2626', label: 'แดง' },
  { c: '#ea580c', label: 'ส้ม' },
  { c: '#16a34a', label: 'เขียว' },
  { c: '#2563eb', label: 'น้ำเงิน' },
  { c: '#9333ea', label: 'ม่วง' },
]

const HIGHLIGHT_COLORS = [
  { c: '#fef08a', label: 'เหลืองอ่อน' },
  { c: '#bbf7d0', label: 'เขียวอ่อน' },
  { c: '#bfdbfe', label: 'ฟ้าอ่อน' },
  { c: '#fecaca', label: 'แดงอ่อน' },
  { c: 'transparent', label: 'ลบสีพื้น' },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'ระบุข้อความ...',
  minHeight = 160,
}: Props) {
  const editorRef   = useRef<HTMLDivElement>(null)
  const lastHtml    = useRef(value)
  const savedRange  = useRef<Range | null>(null)

  const [isEmpty,         setIsEmpty]        = useState(() => !value)
  const [showTextColors,  setShowTextColors]  = useState(false)
  const [showHighlights,  setShowHighlights]  = useState(false)
  const [active, setActive] = useState({
    bold: false, italic: false, underline: false,
    ul: false, ol: false,
    left: false, center: false, right: false,
  })

  // Sync value prop → innerHTML (only when changed externally)
  useEffect(() => {
    const el = editorRef.current
    if (!el || value === lastHtml.current) return
    el.innerHTML = value
    lastHtml.current = value
    setIsEmpty(!value)
  }, [value])

  // Track active formatting state on selection change
  useEffect(() => {
    const update = () => {
      if (!editorRef.current?.contains(document.activeElement) &&
          document.activeElement !== editorRef.current) return
      setActive({
        bold:    document.queryCommandState('bold'),
        italic:  document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        ul:      document.queryCommandState('insertUnorderedList'),
        ol:      document.queryCommandState('insertOrderedList'),
        left:    document.queryCommandState('justifyLeft'),
        center:  document.queryCommandState('justifyCenter'),
        right:   document.queryCommandState('justifyRight'),
      })
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  // Close color palettes on outside click
  useEffect(() => {
    const close = () => { setShowTextColors(false); setShowHighlights(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const handleInput = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const raw = el.innerHTML
    const empty = !raw || raw === '<br>' || raw === '<div><br></div>'
    setIsEmpty(empty)
    const html = empty ? '' : sanitize(raw)
    lastHtml.current = html
    onChange(html)
  }, [onChange])

  const saveRange = useCallback(() => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange()
  }, [])

  const restoreRange = useCallback(() => {
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (sel && savedRange.current) { sel.removeAllRanges(); sel.addRange(savedRange.current) }
  }, [])

  const exec = useCallback((cmd: string, arg?: string) => {
    restoreRange()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(document as any).execCommand(cmd, false, arg ?? undefined)
    handleInput()
  }, [restoreRange, handleInput])

  // Strip HTML on paste — keep plain text
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(document as any).execCommand('insertText', false, text)
    handleInput()
  }, [handleInput])

  // ── Toolbar button helper ─────────────────────────────────────────────────

  const Btn = ({
    title, isActive = false, onClick, children,
  }: {
    title: string
    isActive?: boolean
    onClick: () => void
    children: React.ReactNode
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); saveRange(); onClick() }}
      className={cn(
        'w-7 h-7 flex items-center justify-center rounded transition-colors duration-100',
        isActive
          ? 'bg-[#05a94f]/10 text-[#05a94f] border border-[#05a94f]/30'
          : 'text-slate-600 hover:bg-slate-100',
      )}
    >
      {children}
    </button>
  )

  const Sep = () => <div className="w-px h-5 bg-slate-200 mx-0.5 shrink-0" />

  return (
    <div className={cn(
      'border border-slate-300 rounded-lg overflow-hidden bg-white',
      'focus-within:border-[#05a94f] focus-within:ring-2 focus-within:ring-[#05a94f]/20',
      'transition-colors duration-100',
    )}>

      {/* ── Toolbar ── */}
      <div className="flex items-center flex-wrap gap-px px-2 py-1.5 border-b border-slate-200 bg-slate-50">

        <Btn title="ตัวหนา (Ctrl+B)" isActive={active.bold}    onClick={() => exec('bold')}>
          <Bold size={13} />
        </Btn>
        <Btn title="ตัวเอียง (Ctrl+I)" isActive={active.italic}  onClick={() => exec('italic')}>
          <Italic size={13} />
        </Btn>
        <Btn title="ขีดเส้นใต้ (Ctrl+U)" isActive={active.underline} onClick={() => exec('underline')}>
          <Underline size={13} />
        </Btn>

        <Sep />

        <Btn title="Bullet List" isActive={active.ul} onClick={() => exec('insertUnorderedList')}>
          <List size={13} />
        </Btn>
        <Btn title="Numbered List" isActive={active.ol} onClick={() => exec('insertOrderedList')}>
          <ListOrdered size={13} />
        </Btn>

        <Sep />

        <Btn title="จัดชิดซ้าย" isActive={active.left}   onClick={() => exec('justifyLeft')}>
          <AlignLeft size={13} />
        </Btn>
        <Btn title="จัดกลาง" isActive={active.center} onClick={() => exec('justifyCenter')}>
          <AlignCenter size={13} />
        </Btn>
        <Btn title="จัดชิดขวา" isActive={active.right}  onClick={() => exec('justifyRight')}>
          <AlignRight size={13} />
        </Btn>

        <Sep />

        {/* Text Color */}
        <div className="relative" onMouseDown={e => e.stopPropagation()}>
          <button
            type="button"
            title="สีข้อความ"
            onMouseDown={e => { e.preventDefault(); saveRange(); setShowTextColors(v => !v); setShowHighlights(false) }}
            className="w-7 h-7 flex flex-col items-center justify-center gap-px rounded text-slate-600 hover:bg-slate-100 transition-colors duration-100"
          >
            <Type size={12} />
            <div className="w-3.5 h-[3px] rounded-full bg-[#dc2626]" />
          </button>
          {showTextColors && (
            <div className="absolute top-9 left-0 z-50 flex gap-1 p-1.5 bg-white border border-slate-200 rounded-lg shadow-lg"
              onMouseDown={e => e.stopPropagation()}>
              {TEXT_COLORS.map(({ c, label }) => (
                <button
                  key={c}
                  type="button"
                  title={label}
                  onMouseDown={e => { e.preventDefault(); exec('foreColor', c); setShowTextColors(false) }}
                  className="w-5 h-5 rounded-full border-2 border-white ring-1 ring-slate-200 hover:scale-110 transition-transform duration-100 shrink-0"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Highlight */}
        <div className="relative" onMouseDown={e => e.stopPropagation()}>
          <button
            type="button"
            title="ไฮไลต์ข้อความ"
            onMouseDown={e => { e.preventDefault(); saveRange(); setShowHighlights(v => !v); setShowTextColors(false) }}
            className="w-7 h-7 flex flex-col items-center justify-center gap-px rounded text-slate-600 hover:bg-slate-100 transition-colors duration-100"
          >
            <Highlighter size={12} />
            <div className="w-3.5 h-[3px] rounded-full bg-[#fef08a] border border-yellow-200" />
          </button>
          {showHighlights && (
            <div className="absolute top-9 left-0 z-50 flex gap-1 p-1.5 bg-white border border-slate-200 rounded-lg shadow-lg"
              onMouseDown={e => e.stopPropagation()}>
              {HIGHLIGHT_COLORS.map(({ c, label }) => (
                <button
                  key={c}
                  type="button"
                  title={label}
                  onMouseDown={e => { e.preventDefault(); exec('hiliteColor', c); setShowHighlights(false) }}
                  className={cn(
                    'w-5 h-5 rounded border hover:scale-110 transition-transform duration-100 shrink-0',
                    c === 'transparent' ? 'border-slate-300 bg-white text-[9px] text-slate-500' : 'border-slate-200',
                  )}
                  style={{ backgroundColor: c === 'transparent' ? undefined : c }}
                >
                  {c === 'transparent' && '×'}
                </button>
              ))}
            </div>
          )}
        </div>

        <Sep />

        <Btn title="ล้างรูปแบบข้อความ" onClick={() => exec('removeFormat')}>
          <Eraser size={13} />
        </Btn>
      </div>

      {/* ── Editor Area ── */}
      <div className="relative" style={{ minHeight }}>
        {isEmpty && (
          <div
            className="absolute inset-0 px-3 py-2 text-sm text-slate-400 pointer-events-none leading-relaxed"
            aria-hidden
          >
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={handlePaste}
          onMouseUp={saveRange}
          onKeyUp={saveRange}
          className="w-full px-3 py-2 text-sm text-slate-900 focus:outline-none leading-relaxed prose-sm"
          style={{ minHeight }}
        />
      </div>
    </div>
  )
}
