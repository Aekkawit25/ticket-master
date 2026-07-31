// Card B — Flight Segments. Real data ported verbatim from the former ViewDrawer
// (stock.sectors + pnr.sectorDates) — no fields dropped, no new status invented.

import { formatDateDMY } from '@/lib/pnr-display'
import type { DemoStock, DemoPNR } from '@/lib/demo-storage'

export function FlightSegmentsCard({ stock, pnr, label }: { stock: DemoStock; pnr: DemoPNR | undefined; label?: string }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        {label && (
          <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{label}</span>
        )}
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Flight Segments</p>
      </div>
      {stock.sectors.length === 0 ? (
        <div className="bg-slate-50 rounded-xl p-6 text-center text-slate-400 text-sm">ยังไม่มีข้อมูล Flight Segments</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                {['Seq', 'Type', 'Airline', 'Flight', 'From', 'To', 'Dep Date', 'Dep', 'Arr', '+Day'].map(h => (
                  <th key={h} className="px-2.5 py-2 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stock.sectors.map((sec, i) => {
                const sd = pnr?.sectorDates?.[i]
                return (
                  <tr key={sec.sectorId} className="border-t border-slate-100">
                    <td className="px-2.5 py-2 text-slate-500">{sec.seq}</td>
                    <td className="px-2.5 py-2 font-medium text-slate-700">{sec.sectorType}</td>
                    <td className="px-2.5 py-2">{sec.airlineCode}</td>
                    <td className="px-2.5 py-2 font-mono">{sec.airlineCode}{sec.flightNo || '—'}</td>
                    <td className="px-2.5 py-2 font-medium">{sec.depAirportCode}</td>
                    <td className="px-2.5 py-2 font-medium">{sec.arrAirportCode}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{sd?.date ? formatDateDMY(sd.date) : '—'}</td>
                    <td className="px-2.5 py-2">{sec.depTime || '—'}</td>
                    <td className="px-2.5 py-2">{sec.arrTime || '—'}</td>
                    <td className="px-2.5 py-2">{sec.arrDayOffset ? `+${sec.arrDayOffset}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
