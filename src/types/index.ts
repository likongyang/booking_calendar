/**
 * FPLC Device Booking System — Type Definitions
 */

/** Column options for FPLC devices */
export type ColumnType =
  | 'Hi-trapQ-5 mL/1 mL'
  | 'Hiload 16/600 superdex 200 pg'
  | 'Hiload 16/600 superdex 75 pg'
  | 'suprose6 increase'
  | 'S200 increase'
  | 'Desalting column';

/** Run model options */
export type ModelType = 'Wash' | 'Elute' | 'Wash+Elute';

/** Column storage solution options */
export type StoredInType = 'Buffer' | 'H2O' | '20% Ethanol';

/** Device identifier */
export type DeviceId = 'LEFT-FPLC' | 'RIGHT-FPLC';

/** Booking event types for audit trail */
export type EventType = 'create' | 'update' | 'delete';

/** Booking record — matches the `bookings` table in Supabase */
export interface Booking {
  id: string;                // UUID, auto-generated
  device_id: DeviceId;       // 'LEFT-FPLC' or 'RIGHT-FPLC'
  user: string;              // Booker's name
  start_time: string;        // ISO 8601 timestamp with timezone
  end_time: string;          // ISO 8601 timestamp with timezone
  column: ColumnType;        // Column type
  model: ModelType;          // Run mode
  notes: string | null;      // Optional notes
  stored_in: StoredInType;   // Column storage solution
  is_deleted: boolean;       // Soft delete flag, default false
  access_key: string;        // Key required to modify/delete
  created_at: string;        // Auto-populated creation timestamp
  updated_at: string;        // Auto-maintained update timestamp
}

/** Booking event record — matches the `booking_events` table in Supabase */
export interface BookingEvent {
  id: string;                // UUID
  booking_id: string;        // References bookings.id
  event_type: EventType;     // 'create' | 'update' | 'delete'
  device_id: DeviceId;       // Device identifier
  user: string;              // Name of the person who performed the operation
  operated_at: string;       // ISO 8601 timestamp of the operation
}

/** Payload for creating a new booking (POST /api/bookings) */
export interface CreateBookingPayload {
  device_id: DeviceId;
  user: string;
  start_time: string;
  end_time: string;
  column: ColumnType;
  model: ModelType;
  notes?: string | null;
  stored_in: StoredInType;
  access_key: string;
}

/** Payload for updating a booking (PUT /api/bookings/:id) */
export interface UpdateBookingPayload {
  access_key: string;
  device_id?: DeviceId;
  user?: string;
  start_time?: string;
  end_time?: string;
  column?: ColumnType;
  model?: ModelType;
  notes?: string | null;
  stored_in?: StoredInType;
}

/** Payload for deleting a booking (DELETE /api/bookings/:id) */
export interface DeleteBookingPayload {
  access_key: string;
}
