/**
 * Class-schedule dedupe/merge, shared by the popup and the background service worker
 * so the two cannot drift apart. Required directly by tests/.
 */
(function (root, factory) {
  const api = factory();
  Object.assign(root, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
"use strict";

function classScheduleDedupeKey(event) {
  if (event.rawDate) {
    return `${event.title}-${event.rawDate.day}/${event.rawDate.month}-${event.rawDate.startHour}:${event.rawDate.startMinute}`;
  }
  if (event.start) {
    const start = typeof event.start === "string" ? new Date(event.start) : event.start;
    if (!isNaN(start.getTime())) {
      return `${event.title}-${start.getDate()}/${start.getMonth() + 1}-${start.getHours()}:${start.getMinutes()}`;
    }
  }
  return null;
}

function mergeNewClassEventsInto(allSchedule, newEvents) {
  const existingKeys = new Set();
  allSchedule.forEach((event) => {
    const k = classScheduleDedupeKey(event);
    if (k) existingKeys.add(k);
  });
  const uniqueNewEvents = newEvents.filter((event) => {
    const k = classScheduleDedupeKey(event);
    if (k) return !existingKeys.has(k);
    return true;
  });
  return { uniqueNewEvents, merged: allSchedule.concat(uniqueNewEvents) };
}

/** Valid values for the class-schedule range filter, in the order the popup lists them. */
const CLASS_RANGE_MODES = ["all", "today", "week", "2weeks", "month"];

/** Midnight of the day an event falls on, or null when it carries no usable date. */
function classEventDay(event) {
  if (event && event.rawDate) {
    const rd = event.rawDate;
    const d = new Date(rd.year, (rd.month || 1) - 1, rd.day || 1);
    return isNaN(d.getTime()) ? null : d;
  }
  if (event && event.start) {
    const d = new Date(event.start);
    if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return null;
}

/**
 * Inclusive day bounds for a range mode, or null for "all".
 *
 * Ranges follow the calendar the way FAP does — weeks run Monday to Sunday — but always
 * start at today, so a filter never shows classes that have already happened.
 */
function classScheduleRangeBounds(mode, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (mode === "today") return { from: today, to: today };

  // getDay() is 0 for Sunday; treat Sunday as the 7th day so weeks end on it.
  const isoDay = today.getDay() === 0 ? 7 : today.getDay();
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - isoDay));

  if (mode === "week") return { from: today, to: endOfWeek };
  if (mode === "2weeks") {
    const end = new Date(endOfWeek);
    end.setDate(endOfWeek.getDate() + 7);
    return { from: today, to: end };
  }
  if (mode === "month") {
    return { from: today, to: new Date(today.getFullYear(), today.getMonth() + 1, 0) };
  }
  return null; // "all", and anything unrecognised
}

/** Events inside the range, dateless ones kept so nothing disappears without explanation. */
function filterClassScheduleByRange(schedule, mode, now = new Date()) {
  if (!Array.isArray(schedule)) return [];
  const bounds = classScheduleRangeBounds(mode, now);
  if (!bounds) return schedule.slice();
  return schedule.filter((event) => {
    const day = classEventDay(event);
    if (!day) return true;
    return day >= bounds.from && day <= bounds.to;
  });
}

/**
 * FPTU bans a student from the final exam of a course once unauthorized absences pass 20%
 * of its graded sessions. 15% is an early warning before that line.
 */
const ATTENDANCE_WARNING_THRESHOLD = 0.15;
const ATTENDANCE_DANGER_THRESHOLD = 0.2;

/**
 * Detailed attendance stats per course code, including attended, absent, total scheduled,
 * and maximum/remaining absences permitted under the FPT 20% limit.
 * A course with no graded session is left out of the result entirely.
 */
function computeCourseAttendanceStats(schedule) {
  if (!Array.isArray(schedule)) return {};
  const counts = {};
  schedule.forEach((event) => {
    const title = event && event.title;
    if (!title) return;
    const status = (event && event.attendanceStatus || "").toLowerCase();
    if (!counts[title]) {
      counts[title] = { attended: 0, absent: 0, notYet: 0, totalScheduled: 0 };
    }
    counts[title].totalScheduled += 1;
    if (status.includes("absent")) counts[title].absent += 1;
    else if (status.includes("attended")) counts[title].attended += 1;
    else counts[title].notYet += 1;
  });

  const byCourse = {};
  Object.keys(counts).forEach((title) => {
    const { attended, absent, notYet, totalScheduled } = counts[title];
    const totalGraded = attended + absent;
    if (totalGraded === 0) return;

    const rate = absent / totalGraded;
    const hasFullSchedule = totalScheduled >= 10;
    const maxAllowedAbsent = Math.floor(totalScheduled * 0.20);
    const remainingAbsent = maxAllowedAbsent - absent;

    byCourse[title] = {
      attended,
      absent,
      notYet,
      totalGraded,
      totalScheduled,
      rate,
      hasFullSchedule,
      maxAllowedAbsent,
      remainingAbsent,
    };
  });
  return byCourse;
}

/**
 * Absence rate per course code, counting only sessions that have actually been graded
 * ("attended" or "absent") — "not yet" sessions are future/unknown and never enter the
 * denominator, so the rate reflects standing as of today rather than a diluted worst case.
 * A course with no graded session at all is left out of the result entirely, not reported
 * as 0%, since there is nothing yet to judge it by.
 */
function computeAttendanceByCourse(schedule) {
  const stats = computeCourseAttendanceStats(schedule);
  const byCourse = {};
  Object.keys(stats).forEach((title) => {
    const { attended, absent, rate } = stats[title];
    byCourse[title] = { attended, absent, rate };
  });
  return byCourse;
}

/** null below the warning threshold; "warning" or "danger" (both bounds inclusive) above it. */
function attendanceRiskLevel(rate) {
  if (typeof rate !== "number" || Number.isNaN(rate)) return null;
  if (rate >= ATTENDANCE_DANGER_THRESHOLD) return "danger";
  if (rate >= ATTENDANCE_WARNING_THRESHOLD) return "warning";
  return null;
}

/**
 * Returns Monday to Sunday date range and day details for a week given refDate and weekOffset.
 */
function getWeekDateRange(refDate = new Date(), weekOffset = 0) {
  const now = new Date(refDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay();
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday + (weekOffset * 7));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const realToday = new Date();
  const realTodayStr = `${realToday.getFullYear()}-${realToday.getMonth()}-${realToday.getDate()}`;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    days.push({
      date: d,
      isoDay: i + 1,
      day: d.getDate(),
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      isToday: dStr === realTodayStr,
    });
  }
  return { startMonday: monday, endSunday: sunday, days };
}

/**
 * Maps an event to a FPT standard slot number (1 to 6) based on slot text or start time.
 */
function mapEventToSlot(event) {
  if (!event) return null;
  const rawSlot = String(event.slot || event.type || "").trim();
  const match = rawSlot.match(/slot\s*([1-6])/i);
  if (match) return parseInt(match[1], 10);

  let startHour = null;
  if (event.rawDate && typeof event.rawDate.startHour === "number") {
    startHour = event.rawDate.startHour;
  } else if (event.start) {
    const d = new Date(event.start);
    if (!isNaN(d.getTime())) startHour = d.getHours();
  }

  if (typeof startHour === "number") {
    if (startHour < 10) return 1;
    if (startHour < 12) return 2;
    if (startHour < 15) return 3;
    if (startHour < 17) return 4;
    if (startHour < 19) return 5;
    return 6;
  }

  return null;
}

/**
 * Groups events occurring within a weekRange by key "${isoDay}_${slot}".
 */
function groupScheduleByWeekAndSlot(schedule, weekRange) {
  if (!Array.isArray(schedule) || !weekRange) return {};
  const grouped = {};
  schedule.forEach((event) => {
    const day = classEventDay(event);
    if (!day) return;
    if (day < weekRange.startMonday || day > weekRange.endSunday) return;
    const isoDay = day.getDay() === 0 ? 7 : day.getDay();
    const slot = mapEventToSlot(event);
    if (!slot) return;
    const key = `${isoDay}_${slot}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(event);
  });
  return grouped;
}

const FPT_SLOT_TIMES = {
  1: { startHour: 7, startMinute: 30, endHour: 9, endMinute: 50 },
  2: { startHour: 10, startMinute: 0, endHour: 12, endMinute: 20 },
  3: { startHour: 12, startMinute: 50, endHour: 15, endMinute: 10 },
  4: { startHour: 15, startMinute: 20, endHour: 17, endMinute: 40 },
  5: { startHour: 17, startMinute: 50, endHour: 20, endMinute: 10 },
  6: { startHour: 20, startMinute: 20, endHour: 22, endMinute: 40 },
};

function getEventOrSlotBounds(event, dayObj, slotNumber) {
  let start = null;
  let end = null;

  if (event && event.rawDate) {
    const rd = event.rawDate;
    const y = rd.year || (dayObj && dayObj.year);
    const m = typeof rd.month === "number" ? rd.month - 1 : (dayObj ? dayObj.month - 1 : 0);
    const d = rd.day || (dayObj && dayObj.day);
    start = new Date(y, m, d, rd.startHour || 0, rd.startMinute || 0, 0);
    if (typeof rd.endHour === "number") {
      end = new Date(y, m, d, rd.endHour, rd.endMinute || 0, 0);
    } else {
      end = new Date(start.getTime() + 140 * 60 * 1000);
    }
  } else if (event && event.start) {
    start = new Date(event.start);
    end = event.end ? new Date(event.end) : new Date(start.getTime() + 140 * 60 * 1000);
  }

  if (!start || isNaN(start.getTime())) {
    const sConf = FPT_SLOT_TIMES[slotNumber] || FPT_SLOT_TIMES[1];
    const y = dayObj ? dayObj.year : new Date().getFullYear();
    const m = dayObj ? dayObj.month - 1 : new Date().getMonth();
    const d = dayObj ? dayObj.day : new Date().getDate();
    start = new Date(y, m, d, sConf.startHour, sConf.startMinute, 0);
    end = new Date(y, m, d, sConf.endHour, sConf.endMinute, 0);
  }

  return { start, end };
}

function getSlotTimingStatus(event, dayObj, slotNumber, now = new Date()) {
  const bounds = getEventOrSlotBounds(event, dayObj, slotNumber);
  const nowMs = now.getTime();
  if (nowMs >= bounds.start.getTime() && nowMs <= bounds.end.getTime()) {
    return "in_progress";
  }
  if (nowMs > bounds.end.getTime()) {
    return "past";
  }
  return "upcoming";
}

return {
  classScheduleDedupeKey,
  mergeNewClassEventsInto,
  classEventDay,
  classScheduleRangeBounds,
  filterClassScheduleByRange,
  CLASS_RANGE_MODES,
  computeAttendanceByCourse,
  computeCourseAttendanceStats,
  attendanceRiskLevel,
  ATTENDANCE_WARNING_THRESHOLD,
  ATTENDANCE_DANGER_THRESHOLD,
  getWeekDateRange,
  mapEventToSlot,
  groupScheduleByWeekAndSlot,
  FPT_SLOT_TIMES,
  getEventOrSlotBounds,
  getSlotTimingStatus
};
});

