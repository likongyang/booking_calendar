/**
 * Environment-aware table name mapping.
 * In development (`npm run dev`), use the _dev suffixed tables.
 * In production (`npm run build` / Vercel), use the production tables.
 */

const isDev = process.env.NODE_ENV === 'development';

export const TABLE_BOOKINGS = isDev ? 'bookings_dev' : 'bookings';
export const TABLE_BOOKING_EVENT = isDev ? 'booking_event_dev' : 'booking_event';
