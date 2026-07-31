import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  className?: string
  variant?: 'green' | 'orange' | 'red' | 'gray' | 'blue' | 'purple' | 'yellow' | 'indigo'
}

export function Badge({ children, className, variant = 'gray' }: BadgeProps) {
  const variantClass = `badge-${variant}`
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        variantClass,
        className
      )}
    >
      {children}
    </span>
  )
}

/** แสดงสถานะ PNR เป็นภาษาไทย — Confirmed → ยืนยันแล้ว, ค่าอื่น (รวมค่าเก่า) → รอยืนยัน */
export function pnrStatusLabel(status: string): string {
  return status === 'Confirmed' ? 'ยืนยันแล้ว' : 'รอยืนยัน'
}

export function PNRStatusBadge({ status }: { status: string }) {
  const confirmed = status === 'Confirmed'
  return <Badge variant={confirmed ? 'green' : 'orange'}>{pnrStatusLabel(status)}</Badge>
}

/** สถานะการใช้งาน PNR (Operational) */
export function PnrOperationalStatusBadge({ status, label }: { status: string; label?: string }) {
  const map: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    PENDING:   { label: 'รอเปิดใช้งาน', variant: 'gray' },
    ACTIVE:    { label: 'เปิดใช้งาน',    variant: 'green' },
    CLOSED:    { label: 'ปิดแล้ว',       variant: 'blue' },
    CANCELLED: { label: 'ยกเลิก',        variant: 'red' },
  }
  const c = map[status] ?? { label: status, variant: 'gray' as const }
  return <Badge variant={c.variant}>{label ?? c.label}</Badge>
}

/** สถานะการยืนยัน PNR (Confirmation) */
export function PnrConfirmationStatusBadge({ status }: { status: string }) {
  const confirmed = status === 'CONFIRMED' || status === 'Confirmed'
  return <Badge variant={confirmed ? 'green' : 'orange'} className="whitespace-nowrap">{confirmed ? 'ยืนยันแล้ว' : 'รอยืนยัน'}</Badge>
}

export function TicketTypeBadge({ type, groupType, sourceType, className }: { type: string; groupType?: string; sourceType?: string; className?: string }) {
  if (sourceType === 'AD_HOC') return <Badge variant="indigo" className={className}>Ad Hoc ใน Series</Badge>
  if (type === 'Group') {
    if (groupType === 'ADHOC') return <Badge variant="orange" className={className}>Ad Hoc</Badge>
    return <Badge variant="green" className={className}>Series</Badge>
  }
  if (type === 'FIT') return <Badge variant="blue" className={className}>FIT</Badge>
  if (type === 'Ticket + Land') return <Badge variant="purple" className={className}>Ticket (Land)</Badge>
  return <Badge variant="gray" className={className}>{type}</Badge>
}
