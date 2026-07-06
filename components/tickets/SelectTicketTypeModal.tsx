'use client'

import { useRouter } from 'next/navigation'
import { Users, Ticket, Globe, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

interface TicketTypeOption {
  label: string
  description: string
  detail: string
  minSectors: string
  icon: React.ReactNode
  color: string
  bg: string
  href: string
}

const TICKET_TYPE_OPTIONS: TicketTypeOption[] = [
  {
    label: 'Group Ticket',
    description: 'สำหรับตั๋วกรุ๊ปหรือซีรีส์',
    detail: 'จัดการ Stock ตั๋วสำหรับกรุ๊ปทัวร์ พร้อมระบบ PNR และ Seat Management',
    minSectors: 'ขั้นต่ำ 2 Sectors',
    icon: <Users size={24} />,
    color: '#05a94f',
    bg: '#f0fdf4',
    href: '/tickets/add?type=Group',
  },
  {
    label: 'FIT Ticket',
    description: 'สำหรับตั๋วรายบุคคล',
    detail: 'รองรับ One-way, Round-trip และ Multi-city สำหรับผู้เดินทางอิสระ',
    minSectors: 'ขั้นต่ำ 1 Sector',
    icon: <Ticket size={24} />,
    color: '#3b82f6',
    bg: '#eff6ff',
    href: '/tickets/add?type=FIT',
  },
  {
    label: 'Ticket + Land',
    description: 'สำหรับแพ็กเกจรวม',
    detail: 'ตั๋วเครื่องบินพร้อมบริการภาคพื้นดิน เช่น โรงแรม รถ และทัวร์',
    minSectors: 'ขั้นต่ำ 2 Sectors',
    icon: <Globe size={24} />,
    color: '#8b5cf6',
    bg: '#f5f3ff',
    href: '/tickets/add?type=Ticket + Land',
  },
]

interface SelectTicketTypeModalProps {
  open: boolean
  onClose: () => void
}

export function SelectTicketTypeModal({ open, onClose }: SelectTicketTypeModalProps) {
  const router = useRouter()

  const handleSelect = (href: string) => {
    onClose()
    router.push(href)
  }

  return (
    <Modal open={open} onClose={onClose} title="เลือกประเภท Stock" size="xl">
      <p className="text-sm text-slate-500 mb-5">กรุณาเลือกประเภทตั๋วที่ต้องการสร้าง</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TICKET_TYPE_OPTIONS.map(opt => (
          <TicketTypeCard key={opt.label} option={opt} onSelect={handleSelect} />
        ))}
      </div>
    </Modal>
  )
}

function TicketTypeCard({
  option,
  onSelect,
}: {
  option: TicketTypeOption
  onSelect: (href: string) => void
}) {
  return (
    <div
      className="group relative flex flex-col rounded-xl border-2 border-slate-200 p-5 cursor-pointer
                 transition-all duration-150 hover:shadow-lg"
      style={{ '--hover-color': option.color } as React.CSSProperties}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = option.color
        ;(e.currentTarget as HTMLDivElement).style.backgroundColor = option.bg
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = ''
        ;(e.currentTarget as HTMLDivElement).style.backgroundColor = ''
      }}
      onClick={() => onSelect(option.href)}
    >
      {/* Icon */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 shrink-0"
        style={{ background: option.bg, color: option.color, border: `1.5px solid ${option.color}30` }}
      >
        {option.icon}
      </div>

      {/* Title + description */}
      <h4 className="text-base font-bold text-slate-800 mb-1">{option.label}</h4>
      <p className="text-sm text-slate-600 mb-1">{option.description}</p>
      <p className="text-xs text-slate-400 leading-relaxed mb-4">{option.detail}</p>

      {/* Min sectors badge */}
      <div className="mb-4">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ background: `${option.color}18`, color: option.color }}
        >
          {option.minSectors}
        </span>
      </div>

      {/* CTA button */}
      <button
        className="mt-auto w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: option.color }}
        onClick={e => {
          e.stopPropagation()
          onSelect(option.href)
        }}
      >
        เลือกประเภทนี้
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
