'use client'

import { useEffect, useState } from 'react'
import { Input, Select } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { getActiveCountries, type CountryData } from '@/lib/country-storage'

interface FilterState {
  search: string
  airline_code: string
  ticket_type: string
  country_code: string
  period_from: string
  period_to: string
}

interface TicketFilterProps {
  onFilter: (filters: FilterState) => void
  showTypeFilter?: boolean
  searchPlaceholder?: string
}

export default function TicketFilter({ onFilter, showTypeFilter = true, searchPlaceholder = 'ค้นหา Stock Code, Name, PNR...' }: TicketFilterProps) {
  const [expanded, setExpanded] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    airline_code: '',
    ticket_type: '',
    country_code: '',
    period_from: '',
    period_to: '',
  })
  const [countries, setCountries] = useState<CountryData[]>([])

  useEffect(() => {
    setCountries(getActiveCountries())
    const handler = () => setCountries(getActiveCountries())
    window.addEventListener('countries_updated', handler)
    return () => window.removeEventListener('countries_updated', handler)
  }, [])

  const set = (key: keyof FilterState, value: string) =>
    setFilters(prev => ({ ...prev, [key]: value }))

  const reset = () => {
    const empty: FilterState = {
      search: '', airline_code: '',
      ticket_type: '', country_code: '', period_from: '', period_to: '',
    }
    setFilters(empty)
    onFilter(empty)
  }

  const hasFilters = Object.values(filters).some(v => v !== '')

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.search}
            onChange={e => set('search', e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onFilter(filters)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f]"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<SlidersHorizontal size={14} />}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="hidden sm:inline">Filter</span>
        </Button>
        <Button size="sm" onClick={() => onFilter(filters)}>
          <Search size={14} />
          <span className="hidden sm:inline">ค้นหา</span>
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={reset}>
            <span className="hidden sm:inline">ล้าง</span>
          </Button>
        )}
      </div>

      {expanded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3 pt-3 border-t border-slate-100">
          {showTypeFilter && (
            <Select
              label="Ticket Type"
              value={filters.ticket_type}
              onChange={e => set('ticket_type', e.target.value)}
              options={[
                { value: 'Group', label: 'Group (Series / Ad Hoc)' },
                { value: 'FIT', label: 'FIT' },
                { value: 'Ticket + Land', label: 'Ticket Only' },
              ]}
              placeholder="ทุกประเภท"
            />
          )}
          <Input
            label="Airline Code"
            value={filters.airline_code}
            onChange={e => set('airline_code', e.target.value)}
            placeholder="เช่น TG, JL"
          />
          <Select
            label="ประเทศปลายทาง"
            value={filters.country_code}
            onChange={e => set('country_code', e.target.value)}
            options={countries.map(c => ({ value: c.countryCode, label: `${c.countryCode} — ${c.displayName}` }))}
            placeholder="ทุกประเทศ"
          />
          <Input
            label="Period จาก"
            type="date"
            value={filters.period_from}
            onChange={e => set('period_from', e.target.value)}
          />
          <Input
            label="Period ถึง"
            type="date"
            value={filters.period_to}
            onChange={e => set('period_to', e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
