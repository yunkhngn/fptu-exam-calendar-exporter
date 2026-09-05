const test = require("node:test");
const assert = require("node:assert");
const {
  AGENDA_STATUS,
  getEventTimeBounds,
  isSameCalendarDay,
  computeTodayAgenda,
  formatMinutesCountdown
} = require("../lib/agenda.js");

test("formatMinutesCountdown formats minutes into readable Vietnamese string", () => {
  assert.strictEqual(formatMinutesCountdown(15), "15 phút");
  assert.strictEqual(formatMinutesCountdown(60), "1 giờ");
  assert.strictEqual(formatMinutesCountdown(75), "1 giờ 15 phút");
  assert.strictEqual(formatMinutesCountdown(0), "ít hơn 1 phút");
});

test("isSameCalendarDay correctly matches dates ignoring time", () => {
  const d1 = new Date(2026, 8, 10, 7, 30);
  const d2 = new Date(2026, 8, 10, 15, 45);
  const d3 = new Date(2026, 8, 11, 7, 30);
  assert.strictEqual(isSameCalendarDay(d1, d2), true);
  assert.strictEqual(isSameCalendarDay(d1, d3), false);
});

test("computeTodayAgenda detects IN_PROGRESS when current time falls within class slot", () => {
  const now = new Date(2026, 8, 10, 8, 0); // 10/09/2026 08:00
  const classEvents = [
    {
      title: "PRJ301",
      location: "AL-L302",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    }
  ];

  const result = computeTodayAgenda({ classEvents, examEvents: [], now });
  assert.strictEqual(result.status, AGENDA_STATUS.IN_PROGRESS);
  assert.strictEqual(result.currentEvent.title, "PRJ301");
  assert.strictEqual(result.remainingMinutes, 60); // 8:00 -> 9:00 = 60m
});

test("computeTodayAgenda detects UPCOMING class today with countdown", () => {
  const now = new Date(2026, 8, 10, 7, 0); // 10/09/2026 07:00
  const classEvents = [
    {
      title: "SWE201",
      location: "BE-410",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    },
    {
      title: "PRJ301",
      location: "AL-L302",
      slot: "Slot 2",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 9, startMinute: 30, endHour: 11, endMinute: 50 }
    }
  ];

  const result = computeTodayAgenda({ classEvents, examEvents: [], now });
  assert.strictEqual(result.status, AGENDA_STATUS.UPCOMING);
  assert.strictEqual(result.nextEvent.title, "SWE201");
  assert.strictEqual(result.minutesUntilStart, 30); // 7:00 -> 7:30 = 30m
  assert.strictEqual(result.totalRemainingToday, 2);
});

test("computeTodayAgenda detects COMPLETED_TODAY when all classes today have ended", () => {
  const now = new Date(2026, 8, 10, 18, 0); // 10/09/2026 18:00
  const classEvents = [
    {
      title: "SWE201",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    },
    {
      title: "PRJ301",
      slot: "Slot 2",
      rawDate: { year: 2026, month: 9, day: 11, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    }
  ];

  const result = computeTodayAgenda({ classEvents, examEvents: [], now });
  assert.strictEqual(result.status, AGENDA_STATUS.COMPLETED_TODAY);
  assert.strictEqual(result.nextEvent.title, "PRJ301"); // next upcoming day
});

test("computeTodayAgenda detects FREE_TODAY when no class scheduled today", () => {
  const now = new Date(2026, 8, 10, 10, 0);
  const classEvents = [
    {
      title: "PRJ301",
      slot: "Slot 2",
      rawDate: { year: 2026, month: 9, day: 12, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    }
  ];

  const result = computeTodayAgenda({ classEvents, examEvents: [], now });
  assert.strictEqual(result.status, AGENDA_STATUS.FREE_TODAY);
});

test("computeTodayAgenda includes today's exam alert if present", () => {
  const now = new Date(2026, 8, 10, 8, 0);
  const examEvents = [
    {
      title: "PRJ301 - PE",
      room: "AL-R402",
      time: "13:30 - 15:00",
      date: "10/09/2026",
      start: "2026-09-10T13:30:00"
    }
  ];

  const result = computeTodayAgenda({ classEvents: [], examEvents, now });
  assert.strictEqual(result.todayExams.length, 1);
  assert.strictEqual(result.todayExams[0].title, "PRJ301 - PE");
});
