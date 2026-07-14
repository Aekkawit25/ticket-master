import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('flight_series')
      .select(`
        *,
        airline:airlines(*),
        country:countries(*),
        sectors:flight_series_sector(*),
        conditions:flight_series_condition(*, stages:flight_series_condition_stage(*)),
        pnrs:flight_series_pnr(*, condition:flight_series_condition(*), payment_schedule:flight_pnr_payment_schedule(*))
      `)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
    return NextResponse.json({ data, error: null })
  } catch {
    return NextResponse.json({ data: null, error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = getServerSupabase()
    const body = await request.json()

    const { data, error } = await supabase
      .from('flight_series')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

    await supabase.from('activity_logs').insert({
      module_name: 'flight_series',
      ref_id: id,
      action: 'Update Stock',
      new_value: JSON.stringify(body),
    })

    return NextResponse.json({ data, error: null })
  } catch {
    return NextResponse.json({ data: null, error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = getServerSupabase()

    // Check if stock has seat_used > 0
    const { data: pnrs } = await supabase
      .from('flight_series_pnr')
      .select('seat_used')
      .eq('series_id', id)
      .gt('seat_used', 0)

    if (pnrs && pnrs.length > 0) {
      return NextResponse.json(
        { data: null, error: 'ไม่สามารถลบ Stock ที่มีการใช้ Seat แล้ว ใช้ Cancel แทน' },
        { status: 400 }
      )
    }

    const { error } = await supabase.from('flight_series').delete().eq('id', id)
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 400 })

    await supabase.from('activity_logs').insert({
      module_name: 'flight_series',
      ref_id: id,
      action: 'Delete Stock',
    })

    return NextResponse.json({ data: { id }, error: null })
  } catch {
    return NextResponse.json({ data: null, error: 'Server error' }, { status: 500 })
  }
}
