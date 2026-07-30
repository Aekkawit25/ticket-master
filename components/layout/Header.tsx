'use client'

import { Menu, Bell, User } from 'lucide-react'

interface HeaderProps {
  onMenuToggle: () => void
  title?: string
}

export default function Header({ onMenuToggle, title }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200 h-14 flex items-center px-4 gap-3">
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg hover:bg-slate-100 transition-colors lg:hidden"
      >
        <Menu size={20} className="text-slate-600" />
      </button>

      {title && (
        <h1 className="font-semibold text-slate-800 text-sm hidden sm:block">{title}</h1>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <Bell size={18} className="text-slate-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
          <div className="w-7 h-7 bg-[#05a94f] rounded-full flex items-center justify-center">
            <User size={14} className="text-white" />
          </div>
          <span className="text-sm text-slate-700 font-medium hidden sm:block">Admin</span>
        </button>
      </div>
    </header>
  )
}
