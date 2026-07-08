'use client'

import { useRouter } from 'next/navigation'
import { ListChecks, Users, Ticket, Globe, ChevronRight } from 'lucide-react'
import { Modal } from '@/components/ui/modal'

interface TypeOption {
  key: string
  label: string
  description: string
  detail: string
  minSectors: string
  icon: React.ReactNode
  iconCls: string
  cardCls: string
  btnCls: string
  href: string
  disabled?: boolean
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    key: 'group-series',
    label: 'Group Series',
    description: 'ตั๋วกรุ๊ปที่เป็น series',
    detail: 'เหมาะสำหรับซีรีส์ที่มีการวางแผนล่วงหน้า เช่น Sweden Aurora Mar 26',
    minSectors: 'ขั้นต่ำ 2 Sectors',
    icon: <ListChecks size={22} />,
    iconCls: 'text-emerald-600',
    cardCls: 'hover:border-emerald-400 hover:bg-emerald-50/60',
    btnCls: 'bg-emerald-600 hover:bg-emerald-700',
    href: '/tickets/add?type=Group&groupType=SERIES',
  },
  {
    key: 'group-adhoc',
    label: 'Group Ad Hoc',
    description: 'ตั๋วกรุ๊ปทัวร์ Ad Hoc',
    detail: 'เหมาะสำหรับกรุ๊ปที่จัดขึ้นเป็นกรณีพิเศษ ไม่ได้อยู่ใน Series ปกติ',
    minSectors: 'ขั้นต่ำ 2 Sectors',
    icon: <Users size={22} />,
    iconCls: 'text-amber-600',
    cardCls: 'hover:border-amber-400 hover:bg-amber-50/60',
    btnCls: 'bg-amber-500 hover:bg-amber-600',
    href: '/tickets/add?type=Group&groupType=ADHOC',
  },
  {
    key: 'fit',
    label: 'FIT',
    description: 'ตั๋วเดี่ยว',
    detail: 'รองรับ One-way, Round-trip และ Multi-city สำหรับผู้เดินทางอิสระ',
    minSectors: 'ขั้นต่ำ 1 Sector',
    icon: <Ticket size={22} />,
    iconCls: 'text-sky-400',
    cardCls: '',
    btnCls: '',
    href: '/tickets/add?type=FIT',
    disabled: true,
  },
  {
    key: 'ticket-land',
    label: 'Ticket + Land',
    description: 'ตั๋วพร้อมแลนด์',
    detail: 'ตั๋วเครื่องบินพร้อมบริการภาคพื้นดิน เช่น โรงแรม รถ และทัวร์',
    minSectors: 'ขั้นต่ำ 2 Sectors',
    icon: <Globe size={22} />,
    iconCls: 'text-violet-400',
    cardCls: '',
    btnCls: '',
    href: '/tickets/add?type=Ticket+Land',
    disabled: true,
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TYPE_OPTIONS.map(opt => (
          <div
            key={opt.key}
            className={`relative flex flex-col rounded-xl border-2 border-slate-200 p-4 transition-all duration-150 ${
              opt.disabled
                ? 'bg-slate-50 cursor-not-allowed'
                : `bg-white cursor-pointer hover:shadow-md ${opt.cardCls}`
            }`}
            onClick={() => !opt.disabled && handleSelect(opt.href)}
          >
            {opt.disabled && (
              <span className="absolute top-2 right-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-400 leading-none">
                Coming Soon
              </span>
            )}

            <div className={opt.disabled ? 'opacity-60' : undefined}>
              {/* Icon */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 shrink-0 bg-slate-100 ${opt.iconCls}`}>
                {opt.icon}
              </div>

              {/* Title + description */}
              <h4 className="text-sm font-bold text-slate-800 mb-0.5">{opt.label}</h4>
              <p className="text-xs text-slate-500 mb-1">{opt.description}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{opt.detail}</p>

              {/* Min sectors badge */}
              <div className="mb-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                  {opt.minSectors}
                </span>
              </div>
            </div>

            {/* CTA button */}
            {!opt.disabled && (
              <button
                className={`mt-auto w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold text-white transition-opacity ${opt.btnCls}`}
                onClick={e => { e.stopPropagation(); handleSelect(opt.href) }}
              >
                เลือกประเภทนี้
                <ChevronRight size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
