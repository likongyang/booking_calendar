'use client';

import { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, DateSelectArg, EventContentArg } from '@fullcalendar/core';
import dayjs from 'dayjs';
import type { Booking } from '@/types';
import BookingModal from './BookingModal';

const DEVICE_COLORS: Record<string, string> = {
  'LEFT-FPLC': '#6366f1',
  'RIGHT-FPLC': '#f59e0b',
};

export default function CalendarView() {
  const [currentDevice, setCurrentDevice] = useState<string>('LEFT-FPLC');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(dayjs().format('YYYY-MM'));
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: Date; end: Date } | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

  const fetchBookings = async (device: string, month: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings?device=${device}&month=${month}`);
      const json = await res.json();
      if (json.data) {
        setBookings(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings(currentDevice, currentMonth);
  }, [currentDevice, currentMonth]);

  const handleDateSelect = (selectInfo: DateSelectArg) => {
    setSelectedBooking(null);
    setSelectedRange({ start: selectInfo.start, end: selectInfo.end });
    setModalOpen(true);
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const booking = bookings.find(b => b.id === clickInfo.event.id);
    if (booking) {
      setSelectedBooking(booking);
      setSelectedRange(null);
      setModalOpen(true);
    }
  };

  const handleDatesSet = (dateInfo: { start: Date }) => {
    const newMonth = dayjs(dateInfo.start).add(7, 'day').format('YYYY-MM');
    if (newMonth !== currentMonth) {
      setCurrentMonth(newMonth);
    }
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedBooking(null);
    setSelectedRange(null);
  };

  const handleBookingSuccess = () => {
    handleModalClose();
    fetchBookings(currentDevice, currentMonth);
  };

  const calendarEvents = bookings.map(b => ({
    id: b.id,
    title: b.user,
    start: b.start_time,
    end: b.end_time,
    backgroundColor: DEVICE_COLORS[b.device_id] || '#6366f1',
    borderColor: DEVICE_COLORS[b.device_id] || '#6366f1',
    extendedProps: {
      booking: b,
      columnName: b.column,
    },
  }));

  /**
   * Custom event rendering.
   * - Month (dayGrid) view: show time range, name, and column each on its own line.
   * - Week/Day (timeGrid) views: default rendering is fine, keep compact.
   */
  const renderEventContent = (eventInfo: EventContentArg) => {
    const b = eventInfo.event.extendedProps.booking as Booking | undefined;
    if (!b) return true; // fallback to default rendering for non-booking events
    const startLocal = dayjs(b.start_time).format('HH:mm');
    const endLocal = dayjs(b.end_time).format('HH:mm');

    // Month view → multi-line custom rendering
    if (eventInfo.view.type === 'dayGridMonth') {
      return (
        <div className="fc-month-event">
          <div className="fc-month-event-time">{startLocal}–{endLocal}</div>
          <div className="fc-month-event-user">{b.user}</div>
          <div className="fc-month-event-column">{b.column} - {b.model}</div>
          <div className="fc-month-event-stored">{b.stored_in}</div>
        </div>
      );
    }

    // Week / Day views — show column, stored_in, and notes
    return (
      <div className="fc-custom-event">
        <div className="fc-event-time-custom">{startLocal}–{endLocal}</div>
        <div className="fc-event-title-custom">{b.user}</div>
        <div className="fc-event-column-custom">{b.column} - {b.model}</div>
        <div className="fc-event-stored-custom">{b.stored_in}</div>
        {b.notes && <div className="fc-event-notes-custom">{b.notes}</div>}
      </div>
    );
  };

  return (
    <div className="calendar-container">
      {/* Device Selector */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm font-medium text-slate-400">Device:</span>
        {['LEFT-FPLC', 'RIGHT-FPLC'].map(device => (
          <button
            key={device}
            onClick={() => setCurrentDevice(device)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              currentDevice === device
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {device}
          </button>
        ))}
        {loading && (
          <div className="ml-3">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="fc-wrapper rounded-xl overflow-hidden bg-slate-900/50 border border-slate-700/50 p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          timeZone="local"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          selectable={true}
          selectMirror={true}
          editable={false}
          events={calendarEvents}
          eventContent={renderEventContent}
          select={handleDateSelect}
          eventClick={handleEventClick}
          datesSet={handleDatesSet}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          slotDuration="00:30:00"
          allDaySlot={false}
          height="auto"
          nowIndicator={true}
          buttonText={{
            today: 'Today',
            month: 'Month',
            week: 'Week',
            day: 'Day',
          }}
          dayMaxEventRows={false}
        />
      </div>

      {/* Booking Modal */}
      {modalOpen && (
        <BookingModal
          deviceId={currentDevice}
          booking={selectedBooking}
          initialRange={selectedRange}
          onClose={handleModalClose}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  );
}
