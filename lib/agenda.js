(function (root, factory) {
  const api = factory();
  Object.assign(root, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const AGENDA_STATUS = {
    IN_PROGRESS: "IN_PROGRESS",
    UPCOMING: "UPCOMING",
    COMPLETED_TODAY: "COMPLETED_TODAY",
    FREE_TODAY: "FREE_TODAY",
    NO_DATA: "NO_DATA"
  };

  function getEventTimeBounds(event) {
    if (!event) return null;
    if (event.rawDate) {
      const rd = event.rawDate;
      const start = new Date(rd.year, (rd.month || 1) - 1, rd.day || 1, rd.startHour || 0, rd.startMinute || 0, 0);
      const end = new Date(rd.year, (rd.month || 1) - 1, rd.day || 1, rd.endHour || 0, rd.endMinute || 0, 0);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return { start, end };
      }
    }
    if (event.start) {
      const start = typeof event.start === "string" ? new Date(event.start) : event.start;
      let end = event.end ? (typeof event.end === "string" ? new Date(event.end) : event.end) : null;
      if (!end || isNaN(end.getTime())) {
        end = new Date(start.getTime() + 90 * 60 * 1000); // 90 min fallback
      }
      if (!isNaN(start.getTime())) {
        return { start, end };
      }
    }
    return null;
  }

  function isSameCalendarDay(d1, d2) {
    if (!d1 || !d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  function formatMinutesCountdown(minutes) {
    if (minutes <= 0) return "ít hơn 1 phút";
    if (minutes < 60) return `${minutes} phút`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`;
  }

  function computeTodayAgenda(options) {
    const { classEvents = [], examEvents = [], now = new Date() } = options || {};

    // 1. Identify today's exams
    const todayExams = (examEvents || []).filter((exam) => {
      const bounds = getEventTimeBounds(exam);
      if (bounds && isSameCalendarDay(bounds.start, now)) return true;
      if (exam.date) {
        const parts = exam.date.split("/");
        if (parts.length === 3) {
          const examDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          return isSameCalendarDay(examDate, now);
        }
      }
      return false;
    });

    if (!classEvents || classEvents.length === 0) {
      return {
        status: AGENDA_STATUS.NO_DATA,
        currentEvent: null,
        nextEvent: null,
        remainingMinutes: null,
        minutesUntilStart: null,
        totalRemainingToday: 0,
        todayExams
      };
    }

    // 2. Extract valid class events with bounds and sort chronologically
    const mapped = classEvents
      .map((ev) => ({ event: ev, bounds: getEventTimeBounds(ev) }))
      .filter((item) => item.bounds !== null)
      .sort((a, b) => a.bounds.start.getTime() - b.bounds.start.getTime());

    // 3. Separate today's classes
    const todayClasses = mapped.filter((item) => isSameCalendarDay(item.bounds.start, now));

    if (todayClasses.length === 0) {
      // Free today - find next upcoming class in the future
      const futureClasses = mapped.filter((item) => item.bounds.start.getTime() > now.getTime());
      const nextEvent = futureClasses.length > 0 ? futureClasses[0].event : null;
      return {
        status: AGENDA_STATUS.FREE_TODAY,
        currentEvent: null,
        nextEvent,
        remainingMinutes: null,
        minutesUntilStart: null,
        totalRemainingToday: 0,
        todayExams
      };
    }

    // 4. Check if currently in progress
    const inProgress = todayClasses.find((item) => item.bounds.start <= now && now <= item.bounds.end);
    if (inProgress) {
      const remainingMs = inProgress.bounds.end.getTime() - now.getTime();
      const remainingMinutes = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
      return {
        status: AGENDA_STATUS.IN_PROGRESS,
        currentEvent: inProgress.event,
        nextEvent: null,
        remainingMinutes,
        minutesUntilStart: null,
        totalRemainingToday: todayClasses.filter((item) => item.bounds.start > now).length,
        todayExams
      };
    }

    // 5. Check upcoming classes today
    const upcomingToday = todayClasses.filter((item) => item.bounds.start > now);
    if (upcomingToday.length > 0) {
      const nextItem = upcomingToday[0];
      const diffMs = nextItem.bounds.start.getTime() - now.getTime();
      const minutesUntilStart = Math.max(0, Math.ceil(diffMs / (60 * 1000)));
      return {
        status: AGENDA_STATUS.UPCOMING,
        currentEvent: null,
        nextEvent: nextItem.event,
        remainingMinutes: null,
        minutesUntilStart,
        totalRemainingToday: upcomingToday.length,
        todayExams
      };
    }

    // 6. Completed all classes today
    const futureClasses = mapped.filter((item) => item.bounds.start.getTime() > now.getTime());
    const nextDayEvent = futureClasses.length > 0 ? futureClasses[0].event : null;
    return {
      status: AGENDA_STATUS.COMPLETED_TODAY,
      currentEvent: null,
      nextEvent: nextDayEvent,
      remainingMinutes: null,
      minutesUntilStart: null,
      totalRemainingToday: 0,
      todayExams
    };
  }

  return {
    AGENDA_STATUS,
    getEventTimeBounds,
    isSameCalendarDay,
    computeTodayAgenda,
    formatMinutesCountdown
  };
});
