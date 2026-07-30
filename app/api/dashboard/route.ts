import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = getServerSupabase()

    const [
      { count: total_stocks },
      { count: group_count },
      { count: fit_count },
      { count: land_count },
      { data: pnrData },
    ] = await Promise.all([
      supabase.from('flight_series').select('*', { count: 'exact', head: true }),
      supabase.from('flight_series').select('*', { count: 'exact', head: true }).eq('ticket_type', 'Group'),
      supabase.from('flight_series').select('*', { count: 'exact', head: true }).eq('ticket_type', 'FIT'),
      supabase.from('flight_series').select('*', { count: 'exact', head: true }).eq('ticket_type', 'Ticket + Land'),
      supabase.from('flight_series_pnr').select('seat_total, seat_used, status, next_ttl_datetime'),
    ])

    const pnrs = pnrData || []
    const now = new Date()
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const summary = {
      total_stocks: total_stocks || 0,
      group_tickets: group_count || 0,
      fit_tickets: fit_count || 0,
      land_tickets: land_count || 0,
      total_pnr: pnrs.length,
      seat_total: pnrs.reduce((s, p) => s + (p.seat_total || 0), 0),
      seat_used: pnrs.reduce((s, p) => s + (p.seat_used || 0), 0),
      seat_balance: pnrs.reduce((s, p) => s + ((p.seat_total || 0) - (p.seat_used || 0)), 0),
      pnr_near_ttl: pnrs.filter(p => p.next_ttl_datetime && new Date(p.next_ttl_datetime) <= sevenDaysLater && new Date(p.next_ttl_datetime) >= now).length,
      pnr_pending: pnrs.filter(p => p.status === 'Pending').length,
      pnr_confirmed: pnrs.filter(p => p.status === 'Confirmed').length,
      pnr_ticketed: pnrs.filter(p => p.status === 'Ticketed').length,
    }

    return NextResponse.json({ data: summary, error: null })
  } catch {
    return NextResponse.json({ data: null, error: 'Server error' }, { status: 500 })
  }
}
