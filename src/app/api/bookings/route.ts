import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { hashAccessKey } from '@/lib/hash';
import { TABLE_BOOKINGS, TABLE_BOOKING_EVENT } from '@/lib/tables';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// GET /api/bookings?device=LEFT-FPLC&month=2026-06
// OR GET /api/bookings?device=LEFT-FPLC&start=2026-06-29T00:00:00.000Z&end=2026-07-06T00:00:00.000Z
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const device = searchParams.get('device');
  const month = searchParams.get('month'); // format: YYYY-MM
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!device || (!month && !(start && end))) {
    return NextResponse.json(
      { error: 'Missing required parameters: device, and either month or (start and end)' },
      { status: 400 }
    );
  }

  let queryStart: string;
  let queryEnd: string;

  if (start && end) {
    queryStart = dayjs(start).toISOString();
    queryEnd = dayjs(end).toISOString();
  } else {
    queryStart = dayjs.utc(`${month}-01`).startOf('month').toISOString();
    queryEnd = dayjs.utc(`${month}-01`).endOf('month').toISOString();
  }

  const { data, error } = await supabase
    .from(TABLE_BOOKINGS)
    .select('*')
    .eq('device_id', device)
    .eq('is_deleted', false)
    .gte('start_time', queryStart)
    .lte('start_time', queryEnd)
    .order('start_time', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// POST /api/bookings
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { device_id, user, start_time, end_time, column, model, notes, stored_in, access_key } = body;

  // Validate required fields
  if (!device_id || !user || !start_time || !end_time || !column || !model || !stored_in || !access_key) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  // Conflict check: same device, not deleted, overlapping time range
  const { data: conflicts, error: conflictError } = await supabase
    .from(TABLE_BOOKINGS)
    .select('id, user, start_time, end_time')
    .eq('device_id', device_id)
    .eq('is_deleted', false)
    .lt('start_time', end_time)
    .gt('end_time', start_time);

  if (conflictError) {
    return NextResponse.json({ error: conflictError.message }, { status: 500 });
  }

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json(
      {
        error: 'Time slot conflict detected',
        conflicts: conflicts.map(c => ({
          id: c.id,
          user: c.user,
          start_time: c.start_time,
          end_time: c.end_time,
        })),
      },
      { status: 409 }
    );
  }

  // Hash the access key before storing
  const hashedKey = hashAccessKey(access_key);

  // Insert booking
  const { data: booking, error: insertError } = await supabase
    .from(TABLE_BOOKINGS)
    .insert({
      device_id,
      user,
      start_time,
      end_time,
      column,
      model,
      notes: notes || null,
      stored_in,
      access_key: hashedKey,
      create_at: new Date().toISOString(),
      update_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Write event log
  const { error: eventError } = await supabase.from(TABLE_BOOKING_EVENT).insert({
    booking_id: booking.id,
    event_type: 'create',
    device_id,
    user,
    operated_at: new Date().toISOString(),
  });

  if (eventError) {
    console.error('[booking_event] Failed to write create event:', eventError.message, eventError.details, eventError.hint);
  }

  return NextResponse.json({ data: booking }, { status: 201 });
}
