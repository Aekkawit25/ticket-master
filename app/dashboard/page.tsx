'use client'

import AppLayout from '@/components/layout/AppLayout'
import { StatCard } from '@/components/ui/card'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { Badge, PNRStatusBadge, TicketTypeBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Ticket, Users, Globe, Plane, CreditCard, AlertTriangle,
  TrendingUp, Clock, CheckCircle2, BarChart3, RefreshCw
} from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'

const summary = {
  total_stocks: 0,
  group_tickets: 0,
  fit_tickets: 0,
  land_tickets: 0,
  total_pnr: 0,
  seat_total: 0,
  seat_used: 0,
  seat_balance: 0,
  pnr_near_ttl: 0,
  pnr_pending: 0,
  pnr_confirmed: 0,
  pnr_ticketed: 0,
}

const nearTTL: { pnr_code: string; stock: string; travel_start: string; next_ttl: string; status: string; days_left: number }[] = []

const lowSeat: { stock_code: string; group_name: string; airline: string; seat_total: number; seat_balance: number; pct: number }[] = []

const topAirlines: { airline_code: string; airline_name: string; count: number; pct: number }[] = []

export default function DashboardPage() {
  const seatPct = summary.seat_total > 0
    ? Math.round((summary.seat_used / summary.seat_total) * 100)
    : 0

  return (
    <AppLayout title="Dashboard">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">ภาพรวมสต็อกตั๋วเครื่องบิน</p>
        </div>
        <Button variant="outline" size="sm" icon={<RefreshCw size={14} />}>
          รีเฟรช
        </Button>
      </div>

      {/* Summary Cards Row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-4">
        <StatCard title="Stock ทั้งหมด" value={summary.total_stocks} icon={<BarChart3 size={20} />} />
        <StatCard title="Group Tickets" value={summary.group_tickets} color="#05a94f" icon={<Users size={20} />} />
        <StatCard title="FIT Tickets" value={summary.fit_tickets} color="#3b82f6" icon={<Ticket size={20} />} />
        <StatCard title="Ticket + Land" value={summary.land_tickets} color="#8b5cf6" icon={<Globe size={20} />} />
        <StatCard title="PNR ทั้งหมด" value={summary.total_pnr} color="#f59e0b" icon={<CreditCard size={20} />} />
        <StatCard title="ใกล้ TTL" value={summary.pnr_near_ttl} color="#ef4444" icon={<AlertTriangle size={20} />} />
      </div>

      {/* Summary Cards Row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard title="Seat ทั้งหมด" value={summary.seat_total.toLocaleString()} icon={<Plane size={20} />} />
        <StatCard title="Seat ใช้แล้ว" value={summary.seat_used.toLocaleString()} color="#f59e0b" icon={<TrendingUp size={20} />} />
        <StatCard title="Seat คงเหลือ" value={summary.seat_balance.toLocaleString()} color="#05a94f" icon={<CheckCircle2 size={20} />} />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs text-slate-500 font-medium mb-2">อัตราการใช้ Seat</p>
          <p className="text-2xl font-bold text-slate-800">{seatPct}%</p>
          <div className="progress-bar mt-2">
            <div
              className="progress-fill"
              style={{
                width: `${seatPct}%`,
                background: seatPct >= 80 ? '#ef4444' : seatPct >= 60 ? '#f59e0b' : '#05a94f'
              }}
            />
          </div>
        </div>
      </div>

      {/* PNR Status Cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-xs text-amber-700 font-medium">PNR Pending</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{summary.pnr_pending}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-xs text-blue-700 font-medium">PNR Confirmed</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{summary.pnr_confirmed}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-xs text-green-700 font-medium">PNR Ticketed</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{summary.pnr_ticketed}</p>
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        {/* Near TTL */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-orange-500" />
              PNR ใกล้ครบกำหนด TTL
            </CardTitle>
            <span className="text-xs text-slate-400">{nearTTL.length} รายการ</span>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHead>
                <tr>
                  <Th>PNR</Th>
                  <Th>Stock</Th>
                  <Th>Dep Date</Th>
                  <Th>TTL Date</Th>
                  <Th>เหลือ</Th>
                  <Th>Status</Th>
                </tr>
              </TableHead>
              <TableBody>
                {nearTTL.length === 0 ? (
                  <EmptyRow cols={6} message="ไม่มี PNR ที่ใกล้ครบกำหนด" />
                ) : (
                  nearTTL.map((r, i) => (
                    <TableRow key={i}>
                      <Td className="font-mono font-medium text-slate-800">{r.pnr_code}</Td>
                      <Td className="text-xs">{r.stock}</Td>
                      <Td className="text-xs">{formatDate(r.travel_start)}</Td>
                      <Td className="text-xs font-medium text-orange-600">{formatDateTime(r.next_ttl)}</Td>
                      <Td>
                        <span className={`text-xs font-bold ${r.days_left <= 3 ? 'text-red-600' : 'text-orange-500'}`}>
                          {r.days_left} วัน
                        </span>
                      </Td>
                      <Td><PNRStatusBadge status={r.status} /></Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Low Seat */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plane size={14} className="text-orange-500" />
              Stock ที่ Seat ใกล้เต็ม
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHead>
                <tr>
                  <Th>Series Code</Th>
                  <Th>Series Name</Th>
                  <Th>Airline</Th>
                  <Th>Bal.</Th>
                  <Th>%</Th>
                </tr>
              </TableHead>
              <TableBody>
                {lowSeat.length === 0 ? (
                  <EmptyRow cols={5} />
                ) : (
                  lowSeat.map((r, i) => (
                    <TableRow key={i}>
                      <Td className="font-mono text-xs">{r.stock_code}</Td>
                      <Td className="text-xs truncate max-w-[150px]">{r.group_name}</Td>
                      <Td><Badge variant="blue">{r.airline}</Badge></Td>
                      <Td>
                        <span className="text-orange-600 font-bold">{r.seat_balance}</span>
                        <span className="text-slate-400 text-xs">/{r.seat_total}</span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="progress-bar w-16">
                            <div className="progress-fill bg-orange-400" style={{ width: `${r.pct}%` }} />
                          </div>
                          <span className="text-xs text-orange-500">{r.pct}%</span>
                        </div>
                      </Td>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Top Airlines */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 สายการบิน</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topAirlines.map((a, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">
                      <span className="font-bold text-slate-900 mr-1">{a.airline_code}</span>
                      {a.airline_name}
                    </span>
                    <span className="text-xs text-slate-500">{a.count} PNR ({a.pct}%)</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${a.pct}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  )
}
