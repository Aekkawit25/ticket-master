import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  className?: string
  variant?: 'green' | 'orange' | 'red' | 'gray' | 'blue' | 'purple' | 'yellow'
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

export function StockStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'green' | 'gray' | 'blue' | 'red'> = {
    Draft: 'gray',
    Active: 'green',
    Closed: 'blue',
    Cancelled: 'red',
  }
  return <Badge variant={map[status] || 'gray'}>{status}</Badge>
}

export function PNRStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'yellow' | 'blue' | 'green' | 'red' | 'orange' | 'gray'> = {
    Pending: 'yellow',
    Confirmed: 'blue',
    Ticketed: 'green',
    Cancelled: 'red',
    Expired: 'orange',
    Closed: 'gray',
  }
  return <Badge variant={map[status] || 'gray'}>{status}</Badge>
}

export function TicketTypeBadge({ type, groupType }: { type: string; groupType?: string }) {
  if (type === 'Group') {
    if (groupType === 'ADHOC') return <Badge variant="orange">Ad Hoc</Badge>
    return <Badge variant="green">Series</Badge>
  }
  if (type === 'FIT') return <Badge variant="blue">FIT</Badge>
  if (type === 'Ticket + Land') return <Badge variant="purple">Ticket Only</Badge>
  return <Badge variant="gray">{type}</Badge>
}
