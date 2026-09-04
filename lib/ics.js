/**
 * iCalendar (RFC 5545) output shared by the exam and class-schedule exports.
 * Loaded as a plain script in the popup and required directly by tests/.
 */
(function (root, factory) {
  const api = factory();
  Object.assign(root, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
"use strict";

/**
 * RFC 5545 UTC DATE-TIME, e.g. 20260920T030000Z. toISOString() already ends in "Z" —
 * appending another produced the invalid "…ZZ" stamps in the class-schedule export.
 */
function icsUtcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * RFC 5545 §3.3.11 — escape a TEXT value so a comma, semicolon, backslash or newline
 * in a course name / room / method cannot terminate the property early.
 */
function icsEscapeText(value) {
  return String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 — fold a content line at 75 octets; continuations start with one space.
 * Counts bytes, not characters, and never splits a multi-byte UTF-8 sequence.
 */
function icsFoldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const decoder = new TextDecoder();
  const parts = [];
  let pos = 0;
  while (pos < bytes.length) {
    const limit = parts.length === 0 ? 75 : 74; // continuations spend one octet on the leading space
    let end = Math.min(pos + limit, bytes.length);
    while (end > pos && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(decoder.decode(bytes.subarray(pos, end)));
    pos = end;
  }
  return parts.join("\r\n ");
}

/** Exam calendar: absolute UTC times, reminders a day and an hour ahead. */
function createExamCalendar(prod = "examination") {
  const SEPARATOR = '\r\n';
  let eventsData = [];
  const calendarStart = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:' + prod,
    'CALSCALE:GREGORIAN'
  ].join(SEPARATOR);
  const calendarEnd = 'END:VCALENDAR';

  return {
    addEvent: function (title, desc, loc, start, end) {
      const now = new Date();
      const fmt = icsUtcStamp;
      const stamp = icsUtcStamp(now);
      const uidStr = fmt(now) + '-' + Math.random().toString(36).substring(2, 8) + '@' + prod;
      eventsData.push([
        'BEGIN:VEVENT',
        'UID:' + uidStr,
        'DTSTAMP:' + stamp,
        'DTSTART:' + fmt(start),
        'DTEND:' + fmt(end),
        'SUMMARY:' + icsEscapeText(title),
        'DESCRIPTION:' + icsEscapeText(desc),
        'LOCATION:' + icsEscapeText(loc),
        'BEGIN:VALARM',
        'TRIGGER:-P1D',
        'ACTION:DISPLAY',
        'DESCRIPTION:Nhắc nhở: Thi vào ngày mai',
        'END:VALARM',
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        'DESCRIPTION:Nhắc nhở: Thi trong 1 giờ nữa',
        'END:VALARM',
        'END:VEVENT'
      ].join(SEPARATOR));
    },
    build: function () {
      const raw = calendarStart + SEPARATOR + eventsData.join(SEPARATOR) + SEPARATOR + calendarEnd;
      return raw.split(SEPARATOR).map(icsFoldLine).join(SEPARATOR) + SEPARATOR;
    }
  };
}

/** Class calendar: floating local times, one reminder on the day's first slot. */
function createClassCalendar(prod = "class-schedule") {
  const SEPARATOR = '\r\n';
  let eventsData = [];
  const calendarStart = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:' + prod,
    'CALSCALE:GREGORIAN'
  ].join(SEPARATOR);
  const calendarEnd = 'END:VCALENDAR';

  return {
    addEvent: function (title, desc, loc, event, isFirstSlot = false) {
      const now = new Date();

      // Format date for ICS file - without timezone adjustment
      const formatDate = (year, month, day, hour, minute) => {
        // Format as YYYYMMDDTHHMMSS (local time, not UTC)
        return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}00`;
      };

      const timestamp = icsUtcStamp(now);
      const uidStr = `${timestamp}-${Math.random().toString(36).substring(2, 8)}@${prod}`;

      // Generate start and end times directly from raw values
      let startDate, endDate;

      if (event.rawDate) {
        const rd = event.rawDate;
        startDate = formatDate(rd.year, rd.month, rd.day, rd.startHour, rd.startMinute);
        endDate = formatDate(rd.year, rd.month, rd.day, rd.endHour, rd.endMinute);
      } else {
        // Fallback (should not happen with new data)
        const start = new Date();
        const end = new Date();
        end.setHours(end.getHours() + 1);

        startDate = icsUtcStamp(start);
        endDate = icsUtcStamp(end);
      }

      // Build the event with potential alarms
      let eventArray = [
        'BEGIN:VEVENT',
        'UID:' + uidStr,
        'DTSTAMP:' + timestamp,
        'DTSTART;VALUE=DATE-TIME:' + startDate,  // Specify as DATE-TIME with no Z for local time
        'DTEND;VALUE=DATE-TIME:' + endDate,      // Specify as DATE-TIME with no Z for local time
        'SUMMARY:' + icsEscapeText(title),
        'DESCRIPTION:' + icsEscapeText(desc),
        'LOCATION:' + icsEscapeText(loc)
      ];

      if (isFirstSlot || event.slot === "Slot 1") {
        eventArray = eventArray.concat([
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          'DESCRIPTION:Sắp đến giờ học! (Nhắc nhở 30 phút)',
          'TRIGGER:-PT30M',
          'END:VALARM'
        ]);
      }

      // End the event
      eventArray.push('END:VEVENT');

      // Join all lines with separator and add to events data
      eventsData.push(eventArray.join(SEPARATOR));
    },
    build: function () {
      const raw = calendarStart + SEPARATOR + eventsData.join(SEPARATOR) + SEPARATOR + calendarEnd;
      return raw.split(SEPARATOR).map(icsFoldLine).join(SEPARATOR) + SEPARATOR;
    }
  };
}

return { icsUtcStamp, icsEscapeText, icsFoldLine, createExamCalendar, createClassCalendar };
});
