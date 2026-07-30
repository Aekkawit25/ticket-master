import { cn } from '@/lib/utils'

interface TableProps {
  children: React.ReactNode
  className?: string
}

export function Table({ children, className }: TableProps) {
  return (
    <div className="overflow-x-auto w-full">
      <table className={cn('w-full text-sm', className)}>
        {children}
      </table>
    </div>
  )
}

export function TableHead({ children, className }: TableProps) {
  return (
    <thead className={cn('bg-slate-50 border-b border-slate-200', className)}>
      {children}
    </thead>
  )
}

export function TableBody({ children, className }: TableProps) {
  return <tbody className={cn('divide-y divide-slate-100', className)}>{children}</tbody>
}

interface ThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode
}

export function Th({ children, className, ...props }: ThProps) {
  return (
    <th
      {...props}
      className={cn(
        'px-3 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap',
        className
      )}
    >
      {children}
    </th>
  )
}

interface TdProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode
}

export function Td({ children, className, ...props }: TdProps) {
  return (
    <td
      {...props}
      className={cn('px-3 py-2.5 text-slate-700 align-middle', className)}
    >
      {children}
    </td>
  )
}

export function TableRow({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'hover:bg-slate-50 transition-colors',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </tr>
  )
}

export function EmptyRow({ cols, message = 'ไม่พบข้อมูล' }: { cols: number; message?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-10 text-center text-slate-400 text-sm">
        {message}
      </td>
    </tr>
  )
}
