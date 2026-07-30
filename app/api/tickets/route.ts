import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { calcSectorDate, calcTravelEndFromSectors } from '@/lib/utils'
import { isValidHHmm, sameAirport } from '@/lib/time-utils'

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const { searchParams } = new URL(request.url)
    const ticket_type = searchParams.get('ticket_type')
    const search = searchParams.get('search')

    let query = supabase
      .from('flight_series')
      .select(`
        *,
        airline:airlines(airline_code, airline_name),
        country:countries(id, country_name),
        pnr_count:flight_series_pnr(count),
        seat_total:flight_series_pnr(seat_total.sum()),
        seat_used:flight_series_pnr(seat_used.sum())
      `)
      .order('created_at', { ascending: false })

    if (ticket_type) query = query.eq('ticket_type', ticket_type)
    if (search) query = query.or(`stock_code.ilike.%${search}%,group_name.ilike.%${search}%`)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, error: null })
  } catch (err) {
    return NextResponse.json({ data: null, error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const body = await request.json()

    const { stockInfo, sectors, conditions, pnrs } = body

    // Validate sector times before any DB inserts
    if (sectors?.length) {
      for (let i = 0; i < sectors.length; i++) {
        const s = sectors[i]
        if (s.dep_time && !isValidHHmm(s.dep_time)) {
          return NextResponse.json({
            data: null,
            error: 'Invalid time format',
            fieldErrors: [{ field: `sectors[${i}].dep_time`, message: 'Invalid time format. Expected HH:mm' }],
          }, { status: 400 })
        }
        if (s.arr_time && !isValidHHmm(s.arr_time)) {
          return NextResponse.json({
            data: null,
            error: 'Invalid time format',
            fieldErrors: [{ field: `sectors[${i}].arr_time`, message: 'Invalid time format. Expected HH:mm' }],
          }, { status: 400 })
        }
        if (sameAirport(s.dep_airport_code ?? '', s.arr_airport_code ?? '')) {
          return NextResponse.json({
            data: null,
            error: 'Origin and destination airports must be different',
            fieldErrors: [{ field: `sectors[${i}].to`, message: 'Origin and destination airports must be different' }],
          }, { status: 400 })
        }
      }
    }

    // 1. Insert flight_series
    const { data: series, error: seriesError } = await supabase
      .from('flight_series')
      .insert({
        stock_code: stockInfo.stock_code,
        ticket_type: stockInfo.ticket_type,
        trip_type: stockInfo.trip_type,
        group_name: stockInfo.group_name,
        country_id: stockInfo.country_id || null,
        destination: stockInfo.destination || null,
        airline_code: stockInfo.airline_code,
        currency: stockInfo.currency,
        remark: stockInfo.remark || null,
      })
      .select()
      .single()

    if (seriesError) {
      return NextResponse.json({ data: null, error: seriesError.message }, { status: 400 })
    }

    // 2. Insert sectors (เก็บ id กลับมาเพื่อสร้างวันที่ของแต่ละ Sector ต่อ PNR)
    type SectorMeta = { id: string | null; seq: number; sector_type: string; day_offset: number }
    let insertedSectors: SectorMeta[] = []
    if (sectors?.length) {
      const sectorRows = sectors.map((s: any) => ({
        series_id: series.id,
        seq: s.seq,
        sector_type: s.sector_type,
        airline_code: s.airline_code,
        flight_no: s.flight_no,
        dep_airport_code: s.dep_airport_code,
        arr_airport_code: s.arr_airport_code,
        dep_time: s.dep_time,
        arr_time: s.arr_time,
        day_offset: s.day_offset || 0,
        remark: s.remark || null,
      }))
      const { data: sectorData, error: sectorError } = await supabase
        .from('flight_series_sector')
        .insert(sectorRows)
        .select('id, seq, sector_type, day_offset')
      if (sectorError) console.error('Sector insert error:', sectorError)
      if (sectorData) insertedSectors = sectorData
    }

    // 3. Insert conditions & stages
    const conditionIdMap: Record<string, string> = {}
    if (conditions?.length) {
      for (const cond of conditions) {
        const { data: condData, error: condError } = await supabase
          .from('flight_series_condition')
          .insert({
            series_id: series.id,
            condition_code: cond.condition_code,
            condition_name: cond.condition_name,
            description: cond.description || null,
            status: cond.status,
          })
          .select()
          .single()

        if (condError) { console.error('Condition error:', condError); continue }
        conditionIdMap[cond.condition_code] = condData.id

        if (cond.stages?.length) {
          const stageRows = cond.stages.map((s: any) => ({
            condition_id: condData.id,
            stage_no: s.stage_no,
            stage_name: s.stage_name,
            payment_type: s.payment_type,
            amount_type: s.amount_type,
            amount_value: s.amount_value,
            payment_base_date_type: s.payment_base_date_type,
            payment_due_days_before: s.payment_due_days_before,
            payment_due_time: s.payment_due_time,
            status: s.status,
          }))
          await supabase.from('flight_series_condition_stage').insert(stageRows)
        }
      }
    }

    // 4. Insert PNRs
    //    - Travel End คำนวณจาก Sector (Return ตัวสุดท้าย หรือ Sector สุดท้าย)
    //    - seat_used เริ่มต้น 0, seat_balance เป็นคอลัมน์คำนวณใน DB
    //    - บันทึกวันที่จริงของแต่ละ Sector ลง flight_pnr_sector_date
    if (pnrs?.length) {
      const sectorMeta: SectorMeta[] = insertedSectors.length
        ? insertedSectors
        : (sectors || []).map((s: any): SectorMeta => ({ id: null, seq: s.seq, sector_type: s.sector_type, day_offset: s.day_offset || 0 }))

      for (const pnr of pnrs) {
        // Validate price fields match price_format
        // Tax valid for ALL_IN only; YQ valid for FARE_YQ and ALL_IN
        const priceFmt = pnr.price_format ?? 'FARE'
        if (priceFmt !== 'ALL_IN' && pnr.tax != null) {
          return NextResponse.json({
            data: null, error: 'FARE/FARE_YQ: tax must be null',
            fieldErrors: [{ field: 'pnrs.tax', message: 'Tax is only valid for ALL_IN price format' }]
          }, { status: 400 })
        }
        if (priceFmt === 'FARE' && pnr.yq != null) {
          return NextResponse.json({
            data: null, error: 'FARE: yq must be null',
            fieldErrors: [{ field: 'pnrs.yq', message: 'YQ must be null for FARE price format' }]
          }, { status: 400 })
        }

        const conditionId = pnr.condition_id ? (conditionIdMap[pnr.condition_id] || null) : null
        const travelEnd = pnr.travel_end || calcTravelEndFromSectors(pnr.travel_start || null, sectorMeta)

        const { data: pnrData, error: pnrError } = await supabase
          .from('flight_series_pnr')
          .insert({
            series_id: series.id,
            condition_id: conditionId,
            pnr_code: pnr.pnr_code || null,
            dummy_pnr: pnr.dummy_pnr || null,
            travel_start: pnr.travel_start || null,
            travel_end: travelEnd || null,
            seat_total: pnr.seat_total || 0,
            seat_used: 0,
            fare: pnr.fare || 0,
            tax: pnr.tax || 0,
            status: pnr.status || 'Pending',
            remark: pnr.remark || null,
          })
          .select('id')
          .single()

        if (pnrError) { console.error('PNR insert error:', pnrError); continue }

        // 4b. วันที่จริงของแต่ละ Sector ต่อ PNR
        if (pnr.travel_start && pnrData?.id) {
          const sectorDateRows = sectorMeta
            .filter(s => s.id)
            .map(s => ({
              series_id: series.id,
              pnr_id: pnrData.id,
              sector_id: s.id,
              sector_type: s.sector_type,
              travel_date: calcSectorDate(pnr.travel_start, s.day_offset),
            }))
            .filter(r => r.travel_date)
          if (sectorDateRows.length) {
            const { error: sdError } = await supabase.from('flight_pnr_sector_date').insert(sectorDateRows)
            if (sdError) console.error('Sector date insert error:', sdError)
          }
        }
      }
    }

    // 5. Log activity
    await supabase.from('activity_logs').insert({
      module_name: 'flight_series',
      ref_id: series.id,
      action: 'Create Stock',
      new_value: JSON.stringify({ stock_code: series.stock_code, ticket_type: series.ticket_type }),
    })

    return NextResponse.json({ data: series, error: null }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ data: null, error: 'Server error' }, { status: 500 })
  }
}
