import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { hashAccessKey } from '@/lib/hash';
import { TABLE_BOOKINGS, TABLE_BOOKING_EVENT } from '@/lib/tables';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// GET /api/bookings?device=LEFT-FPLC&month=2026-06
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const device = searchParams.get('device');
  const month = searchParams.get('month'); // format: YYYY-MM

  if (!device || !month) {
    return NextResponse.json(
      { error: 'Missing required parameters: device, month' },
      { status: 400 }
    );
  }

  const startOfMonth = dayjs.utc(`${month}-01`).startOf('month').toISOString();
  const endOfMonth = dayjs.utc(`${month}-01`).endOf('month').toISOString();

  const { data, error } = await supabase
    .from(TABLE_BOOKINGS)
    .select('*')
    .eq('device_id', device)
    .eq('is_deleted', false)
    .gte('start_time', startOfMonth)
    .lte('start_time', endOfMonth)
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
