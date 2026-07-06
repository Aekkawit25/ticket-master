'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Ticket,
  Users,
  Globe,
  Plane,
  Building2,
  FileSpreadsheet,
  Settings,
  ChevronDown,
  ChevronRight,
  List,
  ClipboardList,
  Map,
  FileText,
  Package,
} from 'lucide-react'
import { useState } from 'react'

interface NavItem {
  label: string
  href?: string
  icon: React.ReactNode
  children?: NavItem[]
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard size={18} />,
  },
  {
    label: 'Ticket Stock',
    icon: <Ticket size={18} />,
    children: [
      { label: 'All Tickets', href: '/tickets', icon: <List size={16} /> },
      { label: 'Group Tickets', href: '/tickets/group', icon: <Users size={16} /> },
      { label: 'FIT Tickets', href: '/tickets/fit', icon: <Ticket size={16} /> },
      { label: 'Ticket + Land', href: '/tickets/land', icon: <Globe size={16} /> },
      { label: 'Template Condition', href: '/tickets/condition-templates', icon: <FileSpreadsheet size={16} /> },
    ],
  },
  {
    label: 'List PNR',
    href: '/pnr',
    icon: <ClipboardList size={18} />,
  },
  {
    label: 'ใบเบิก',
    href: '/requisitions',
    icon: <FileText size={18} />,
  },
  {
    label: 'Map Program',
    href: '/map-program',
    icon: <Map size={18} />,
  },
  {
    label: 'Settings',
    icon: <Settings size={18} />,
    children: [
      { label: 'Airlines', href: '/settings/airlines', icon: <Plane size={16} /> },
      { label: 'Suppliers', href: '/settings/suppliers', icon: <Package size={16} /> },
      { label: 'Airports', href: '/settings/airports', icon: <Building2 size={16} /> },
      { label: 'Countries', href: '/settings/countries', icon: <Globe size={16} /> },
      { label: 'Users', href: '/settings/users', icon: <Users size={16} /> },
    ],
  },
]

function NavGroup({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(() => {
    if (!item.children) return false
    const base = item.children.find(c => c.href)?.href?.split('/').slice(0, 2).join('/')
    return !!base && (pathname === base || pathname.startsWith(base + '/'))
  })

  if (!item.children) {
    // Exact-match only — prevents /tickets matching /tickets/group, etc.
    const isActive = item.href ? pathname === item.href : false
    return (
      <Link
        href={item.href!}
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
          depth > 0 ? 'pl-9' : '',
          isActive
            ? 'bg-[#05a94f] text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        )}
      >
        <span className={cn('flex-shrink-0', isActive ? 'text-white' : 'text-slate-400')}>
          {item.icon}
        </span>
        {item.label}
      </Link>
    )
  }

  // Parent is "in-section" when the current path exactly matches a child OR is a sub-path of the parent section
  const parentBase = item.children.find(c => c.href)?.href?.split('/').slice(0, 2).join('/')
  const isGroupActive = !!parentBase && (pathname === parentBase || pathname.startsWith(parentBase + '/'))

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all',
          isGroupActive ? 'text-[#05a94f] bg-green-50' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        )}
      >
        <span className="flex items-center gap-2.5">
          <span className={cn('flex-shrink-0', isGroupActive ? 'text-[#05a94f]' : 'text-slate-400')}>
            {item.icon}
          </span>
          {item.label}
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="mt-0.5 ml-2 border-l border-slate-200 pl-2 space-y-0.5">
          {item.children.map(child => (
            <NavGroup key={child.label} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  mobileOpen: boolean
  onClose: () => void
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-[260px] bg-white border-r border-slate-200 z-50 flex flex-col transition-transform duration-300',
          'lg:translate-x-0 lg:z-30',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200">
          <div className="w-8 h-8 bg-[#05a94f] rounded-lg flex items-center justify-center flex-shrink-0">
            <Plane size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 leading-tight text-sm">Air Ticket</p>
            <p className="text-[11px] text-slate-500 leading-tight">Stock Management</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5 scrollbar-thin">
          {navItems.map(item => (
            <NavGroup key={item.label} item={item} />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200">
          <p className="text-[11px] text-slate-400 text-center">Air Ticket Stock v1.0</p>
        </div>
      </aside>
    </>
  )
}
