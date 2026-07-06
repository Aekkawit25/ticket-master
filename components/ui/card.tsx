import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 shadow-sm', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }: CardProps) {
  return (
    <h3 className={cn('font-semibold text-slate-800 text-sm', className)}>{children}</h3>
  )
}

export function CardContent({ children, className }: CardProps) {
  return (
    <div className={cn('p-5', className)}>{children}</div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
  color?: string
  className?: string
}

export function StatCard({ title, value, subtitle, icon, color = '#05a94f', className }: StatCardProps) {
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 shadow-sm p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 font-medium">{title}</p>
          <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {icon && (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 opacity-15"
            style={{ backgroundColor: color }}
          >
            <span style={{ color }}>{icon}</span>
          </div>
        )}
      </div>
    </div>
  )
}
