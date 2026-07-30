'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import {
  Bold, Italic, Underline, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Undo, Redo,
} from 'lucide-react'

// ─── Sanitize HTML — strip dangerous tags and event handlers ──────────────────

function sanitizeHtml(html: string): string {
  if (typeof document === 'undefined') return html
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll('script,iframe,object,embed,form,input,select,textarea,button,link,meta,style,base').forEach(el => el.remove())
  div.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (
        attr.name.startsWith('on') ||
        (attr.name === 'href' && /^(javascript:|data:)/i.test(attr.value)) ||
        (attr.name === 'src' && !['img'].includes(el.tagName.toLowerCase()))
      ) {
        el.removeAttribute(attr.name)
      }
    })
  })
  return div.innerHTML
}

function toPlainText(html: string): string {
  if (typeof document === 'undefined') return html
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || div.innerText || '').trim()
}

// ─── Color palettes ────────────────────────────────────────────────────────────

const TEXT_COLORS = ['#000000','#DC2626','#D97706','#16A34A','#2563EB','#7C3AED','#DB2777','#64748B']
const HIGHLIGHT_COLORS = ['transparent','#FEF08A','#BBF7D0','#BAE6FD','#DDD6FE','#FCA5A5','#FED7AA']

// ─── Sub-components ────────────────────────────────────────────────────────────

function ToolBtn({
  icon, active = false, onClick, title, disabled = false,
}: {
  icon: React.ReactNode
  active?: boolean
  onClick: () => void
  title?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={e => e.preventDefault()} // keep focus in editor
      onClick={onClick}
      className={[
        'p-1.5 rounded transition-colors',
        active
          ? 'bg-[#05a94f] text-white'
          : 'text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed',
      ].join(' ')}
    >
      {icon}
    </button>
  )
}

function Sep() {
  return <span className="inline-block w-px h-4 bg-slate-200 mx-0.5 self-center" />
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  html: string
  onChange: (html: string, plain: string) => void
  placeholder?: string
  disabled?: boolean
  minHeight?: number
}

// ─── RichTextEditor ────────────────────────────────────────────────────────────

export default function RichTextEditor({
  html,
  onChange,
  placeholder,
  disabled = false,
  minHeight = 240,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false })
  const [colorMenu, setColorMenu]     = useState<'text' | 'highlight' | null>(null)

  // Sync external value → DOM only when not focused
  useEffect(() => {
    const el = editorRef.current
    if (!el || focused) return
    if (el.innerHTML !== html) el.innerHTML = html
  }, [html, focused])

  const updateFmt = useCallback(() => {
    setFmt({
      bold:      document.queryCommandState('bold'),
      italic:    document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    })
  }, [])

  const emit = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const clean = sanitizeHtml(el.innerHTML)
    onChange(clean, toPlainText(clean))
  }, [onChange])

  const exec = useCallback((cmd: string, val?: string) => {
    if (disabled) return
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
    updateFmt()
    emit()
    setColorMenu(null)
  }, [disabled, emit, updateFmt])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const html  = e.clipboardData.getData('text/html')
    const plain = e.clipboardData.getData('text/plain')
    const content = html ? sanitizeHtml(html) : plain.replace(/\n/g, '<br>')
    document.execCommand('insertHTML', false, content)
    emit()
  }, [emit])

  const isEmpty = !html || html === '<br>' || html.replace(/<[^>]*>/g, '').trim() === ''

  return (
    <div
      className={[
        'rounded-xl border overflow-hidden',
        focused ? 'border-[#05a94f] ring-2 ring-[#05a94f]/20' : 'border-slate-200',
      ].join(' ')}
      onClick={() => setColorMenu(null)}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-slate-50 flex-wrap">
        <ToolBtn icon={<Undo size={13} />}        onClick={() => exec('undo')}             title="Undo"       disabled={disabled} />
        <ToolBtn icon={<Redo size={13} />}        onClick={() => exec('redo')}             title="Redo"       disabled={disabled} />
        <Sep />
        <ToolBtn icon={<Bold size={13} />}        active={fmt.bold}      onClick={() => exec('bold')}      title="ตัวหนา"     disabled={disabled} />
        <ToolBtn icon={<Italic size={13} />}      active={fmt.italic}    onClick={() => exec('italic')}    title="ตัวเอียง"   disabled={disabled} />
        <ToolBtn icon={<Underline size={13} />}   active={fmt.underline} onClick={() => exec('underline')} title="ขีดเส้นใต้" disabled={disabled} />
        <Sep />
        <ToolBtn icon={<List size={13} />}        onClick={() => exec('insertUnorderedList')} title="Bullet list"  disabled={disabled} />
        <ToolBtn icon={<ListOrdered size={13} />} onClick={() => exec('insertOrderedList')}   title="Number list"  disabled={disabled} />
        <Sep />
        <ToolBtn icon={<AlignLeft size={13} />}   onClick={() => exec('justifyLeft')}   title="ชิดซ้าย"  disabled={disabled} />
        <ToolBtn icon={<AlignCenter size={13} />} onClick={() => exec('justifyCenter')} title="กึ่งกลาง" disabled={disabled} />
        <ToolBtn icon={<AlignRight size={13} />}  onClick={() => exec('justifyRight')}  title="ชิดขวา"   disabled={disabled} />
        <Sep />

        {/* Text color */}
        <div className="relative">
          <button
            type="button"
            title="สีตัวอักษร"
            disabled={disabled}
            onMouseDown={e => e.preventDefault()}
            onClick={e => { e.stopPropagation(); setColorMenu(p => p === 'text' ? null : 'text') }}
            className="px-1.5 py-1 rounded hover:bg-slate-200 transition text-[12px] font-bold text-slate-700 disabled:opacity-40"
          >
            A<span className="block h-0.5 w-full bg-red-500 mt-px rounded-full" />
          </button>
          {colorMenu === 'text' && (
            <div
              className="absolute top-full left-0 z-50 mt-1 p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg flex gap-1"
              onClick={e => e.stopPropagation()}
            >
              {TEXT_COLORS.map(c => (
                <button key={c} type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => exec('foreColor', c)}
                  className="w-5 h-5 rounded-full border border-slate-300 hover:scale-110 transition shrink-0"
                  style={{ background: c }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Highlight */}
        <div className="relative">
          <button
            type="button"
            title="Highlight"
            disabled={disabled}
            onMouseDown={e => e.preventDefault()}
            onClick={e => { e.stopPropagation(); setColorMenu(p => p === 'highlight' ? null : 'highlight') }}
            className="px-1.5 py-1 rounded hover:bg-slate-200 transition text-[12px] font-bold text-slate-700 disabled:opacity-40"
          >
            H<span className="block h-0.5 w-full bg-yellow-400 mt-px rounded-full" />
          </button>
          {colorMenu === 'highlight' && (
            <div
              className="absolute top-full left-0 z-50 mt-1 p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg flex gap-1"
              onClick={e => e.stopPropagation()}
            >
              {HIGHLIGHT_COLORS.map(c => (
                <button key={c} type="button" onMouseDown={e => e.preventDefault()}
                  onClick={() => exec('hiliteColor', c)}
                  className="w-5 h-5 rounded-full border border-slate-300 hover:scale-110 transition shrink-0"
                  style={{ background: c === 'transparent' ? 'white' : c }}
                  title={c === 'transparent' ? 'ลบสี' : c}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Editable area ── */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onFocus={() => { setFocused(true); updateFmt() }}
          onBlur={() => setFocused(false)}
          onInput={emit}
          onPaste={handlePaste}
          onKeyUp={updateFmt}
          onMouseUp={updateFmt}
          className={[
            'px-3 py-3 text-sm text-slate-800 outline-none overflow-x-hidden',
            '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
            '[&_li]:my-0.5',
            disabled ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white',
          ].join(' ')}
          style={{ minHeight }}
        />
        {/* Placeholder */}
        {isEmpty && !focused && (
          <div
            className="absolute inset-0 px-3 py-3 text-sm text-slate-300 pointer-events-none whitespace-pre-line select-none"
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  )
}
