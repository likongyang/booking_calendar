import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyAccessKey } from '@/lib/hash';
import { TABLE_BOOKINGS, TABLE_BOOKING_EVENT } from '@/lib/tables';

type RouteContext = { params: Promise<{ id: string }> };

// PUT /api/bookings/:id
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const { access_key, device_id, user, start_time, end_time, column, model, notes, stored_in } = body;

  if (!access_key) {
    return NextResponse.json({ error: 'access_key is required' }, { status: 400 });
  }

  // Verify access_key
  const { data: existing, error: fetchError } = await supabase
    .from(TABLE_BOOKINGS)
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (!verifyAccessKey(access_key, existing.access_key)) {
    return NextResponse.json({ error: 'Invalid access key' }, { status: 403 });
  }

  // Conflict check excluding self
  const checkDeviceId = device_id || existing.device_id;
  const checkStartTime = start_time || existing.start_time;
  const checkEndTime = end_time || existing.end_time;

  const { data: conflicts, error: conflictError } = await supabase
    .from(TABLE_BOOKINGS)
    .select('id, user, start_time, end_time')
    .eq('device_id', checkDeviceId)
    .eq('is_deleted', false)
    .neq('id', id)
    .lt('start_time', checkEndTime)
    .gt('end_time', checkStartTime);

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

  // Build update object with only provided fields
  const updateData: Record<string, unknown> = {};
  if (device_id !== undefined) updateData.device_id = device_id;
  if (user !== undefined) updateData.user = user;
  if (start_time !== undefined) updateData.start_time = start_time;
  if (end_time !== undefined) updateData.end_time = end_time;
  if (column !== undefined) updateData.column = column;
  if (model !== undefined) updateData.model = model;
  if (notes !== undefined) updateData.notes = notes;
  if (stored_in !== undefined) updateData.stored_in = stored_in;

  // access_key is never updated — it is set once at creation time

  const { data: updated, error: updateError } = await supabase
    .from(TABLE_BOOKINGS)
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Write event log
  const { error: eventError } = await supabase.from(TABLE_BOOKING_EVENT).insert({
    booking_id: id,
    event_type: 'update',
    device_id: updated.device_id,
    user: updated.user,
    operated_at: new Date().toISOString(),
  });

  if (eventError) {
    console.error('[booking_event] Failed to write update event:', eventError.message, eventError.details, eventError.hint);
  }

  return NextResponse.json({ data: updated });
}

// DELETE /api/bookings/:id
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const { access_key } = body;

  if (!access_key) {
    return NextResponse.json({ error: 'access_key is required' }, { status: 400 });
  }

  // Verify access_key
  const { data: existing, error: fetchError } = await supabase
    .from(TABLE_BOOKINGS)
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (!verifyAccessKey(access_key, existing.access_key)) {
    return NextResponse.json({ error: 'Invalid access key' }, { status: 403 });
  }

  // Soft delete
  const { error: deleteError } = await supabase
    .from(TABLE_BOOKINGS)
    .update({ is_deleted: true })
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Write event log
  const { error: eventError } = await supabase.from(TABLE_BOOKING_EVENT).insert({
    booking_id: id,
    event_type: 'delete',
    device_id: existing.device_id,
    user: existing.user,
    operated_at: new Date().toISOString(),
  });

  if (eventError) {
    console.error('[booking_event] Failed to write delete event:', eventError.message, eventError.details, eventError.hint);
  }

  return NextResponse.json({ message: 'Booking deleted successfully' });
}
