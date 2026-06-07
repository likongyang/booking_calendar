'use client';

import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { Booking } from '@/types';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Auto-detect the user's browser timezone */
const LOCAL_TZ = dayjs.tz.guess();

const COLUMN_OPTIONS = [
  'Hi-trapQ-5 mL/1 mL',
  'Hiload 16/600 superdex 200 pg',
  'Hiload 16/600 superdex 75 pg',
  'suprose6 increase',
  'S200 increase',
  'Desalting column',
];

const MODEL_OPTIONS = ['Wash', 'Elute', 'Wash+Elute'] as const;
const STORED_IN_OPTIONS = ['Buffer', 'H2O', '20% Ethanol'] as const;



interface BookingModalProps {
  deviceId: string;
  booking: Booking | null;
  initialRange: { start: Date; end: Date } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BookingModal({
  deviceId,
  booking,
  initialRange,
  onClose,
  onSuccess,
}: BookingModalProps) {
  const isEdit = !!booking;

  // Convert stored UTC time → user's local timezone for display
  // dayjs() defaults to browser local tz; .tz(LOCAL_TZ) is explicit equivalent
  const initDate = booking
    ? dayjs(booking.start_time).format('YYYY-MM-DD')
    : initialRange
      ? dayjs(initialRange.start).format('YYYY-MM-DD')
      : dayjs().format('YYYY-MM-DD');

  const initStartTime = booking
    ? dayjs(booking.start_time).format('HH:mm')
    : initialRange
      ? dayjs(initialRange.start).format('HH:mm')
      : '09:00';

  const initEndTime = booking
    ? dayjs(booking.end_time).format('HH:mm')
    : initialRange
      ? dayjs(initialRange.end).format('HH:mm')
      : '10:00';

  const [user, setUser] = useState(booking?.user || '');
  const [date, setDate] = useState(initDate);
  const [startTime, setStartTime] = useState(initStartTime);
  const [endTime, setEndTime] = useState(initEndTime);
  const [column, setColumn] = useState(booking?.column || '');
  const [model, setModel] = useState<string>(booking?.model || '');
  const [storedIn, setStoredIn] = useState<string>(booking?.stored_in || STORED_IN_OPTIONS[0]);
  const [notes, setNotes] = useState(booking?.notes || '');
  const [accessKey, setAccessKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Build full datetimes in user's local timezone from date + time parts
  const startDateTimeLocal = useMemo(
    () => dayjs.tz(`${date} ${startTime}`, LOCAL_TZ),
    [date, startTime]
  );
  const endDateTimeLocal = useMemo(
    () => dayjs.tz(`${date} ${endTime}`, LOCAL_TZ),
    [date, endTime]
  );

  // Duration in hours
  const durationHours = useMemo(() => {
    if (!date || !startTime || !endTime) return 0;
    return endDateTimeLocal.diff(startDateTimeLocal, 'hour', true);
  }, [startDateTimeLocal, endDateTimeLocal, date, startTime, endTime]);

  // --- Column + model–aware notes threshold ---
  // Only evaluate when both column and model are selected
  const bothSelected = column !== '' && model !== '';

  const isShortColumn = [
    'Hi-trapQ-5 mL/1 mL',
    'suprose6 increase',
    'S200 increase',
    'Desalting column',
  ].includes(column);

  const notesThreshold = useMemo(() => {
    if (!bothSelected) return Infinity; // not yet determinable
    if (isShortColumn) {
      return model === 'Wash+Elute' ? 3 : 2;
    }
    // Long columns (Hiload S200 / S75)
    return model === 'Wash+Elute' ? 8 : 4;
  }, [bothSelected, isShortColumn, model]);

  const exceedsThreshold = bothSelected && durationHours > notesThreshold;
  const notesRequired = exceedsThreshold;

  // Validation: end must be after start (same day only)
  const timeError = useMemo(() => {
    if (!startTime || !endTime) return '';
    if (endTime <= startTime) return 'End time must be after start time.';
    return '';
  }, [startTime, endTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validations
    if (!column) {
      setError('Please select a Column.');
      return;
    }
    if (!model) {
      setError('Please select a Method.');
      return;
    }
    if (timeError) {
      setError(timeError);
      return;
    }
    if (notesRequired && !notes.trim()) {
      setError(`Notes are required when booking exceeds ${notesThreshold} hours for this column + method combination.`);
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        device_id: deviceId,
        user,
        start_time: startDateTimeLocal.toISOString(),
        end_time: endDateTimeLocal.toISOString(),
        column,
        model,
        stored_in: storedIn,
        notes: notes || null,
        access_key: accessKey,
      };

      let res: Response;
      if (isEdit && booking) {
        res = await fetch(`/api/bookings/${booking.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Operation failed');
        return;
      }

      onSuccess();
    } catch {
      setError('Network error, please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!booking) return;
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_key: accessKey }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Delete failed');
        return;
      }

      onSuccess();
    } catch {
      setError('Network error, please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit Booking' : 'New Booking'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Device indicator */}
          <div className="text-sm text-slate-400">
            Device: <span className="text-indigo-400 font-semibold">{deviceId}</span>
          </div>

          {/* User name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              required
              className={inputCls}
              placeholder="Your name"
            />
          </div>

          {/* Date picker */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className={inputCls}
            />
          </div>

          {/* Time range — start & end on same row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Start Time <span className="text-red-400">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                step="1800"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                End Time <span className="text-red-400">*</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                step="1800"
                required
                className={inputCls}
              />
            </div>
          </div>

          {/* Time validation error */}
          {timeError && (
            <p className="text-sm text-red-400">{timeError}</p>
          )}

          {/* Duration display */}
          {durationHours > 0 && !timeError && (
            <p className="text-xs text-slate-500">
              Duration: {durationHours.toFixed(1)} hours
            </p>
          )}

          {/* Column */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Column <span className="text-red-400">*</span>
            </label>
            <select
              value={column}
              onChange={e => setColumn(e.target.value)}
              required
              className={`${inputCls} ${!column ? 'text-slate-400' : 'text-white'}`}
            >
              <option value="" disabled className="text-slate-500">Please select a column</option>
              {COLUMN_OPTIONS.map(opt => (
                <option key={opt} value={opt} className="text-white bg-slate-800">{opt}</option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Method <span className="text-red-400">*</span>
            </label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              required
              className={`${inputCls} ${!model ? 'text-slate-400' : 'text-white'}`}
            >
              <option value="" disabled className="text-slate-500">Please select a method</option>
              {MODEL_OPTIONS.map(opt => (
                <option key={opt} value={opt} className="text-white bg-slate-800">{opt}</option>
              ))}
            </select>
          </div>

          {/* Stored In */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Stored in (after used) <span className="text-red-400">*</span>
            </label>
            <select
              value={storedIn}
              onChange={e => setStoredIn(e.target.value)}
              required
              className={inputCls}
            >
              {STORED_IN_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Threshold warning — shown above Notes when applicable */}
          {exceedsThreshold && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-sm text-amber-300">
                Booking exceeds <strong>{notesThreshold}h</strong> for <strong>{column}</strong> + <strong>{model}</strong>. Notes are <strong>required</strong>.
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Notes {notesRequired && <span className="text-red-400">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              required={notesRequired}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder={notesRequired ? 'Required — explain extended use...' : 'Optional notes...'}
            />
          </div>

          {/* Access Key */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Modify/Cancel Key <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={accessKey}
              onChange={e => setAccessKey(e.target.value)}
              required
              className={inputCls}
              placeholder={isEdit ? 'Enter your access key to modify' : 'Set an access key for future edits'}
            />
            <p className="mt-1 text-xs text-slate-500">
              {isEdit
                ? 'Enter the access key you set when creating this booking.'
                : 'Remember this key — you will need it to edit or delete this booking later.'}
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : isEdit ? 'Update Booking' : 'Create Booking'}
            </button>

            {isEdit && !showDeleteConfirm && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-semibold rounded-lg transition-colors border border-red-500/30"
              >
                Delete
              </button>
            )}

            {isEdit && showDeleteConfirm && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting || !accessKey}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Confirm Delete
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
