const test = require("node:test");
const assert = require("node:assert");
const { QRCode, buildQrCalendarPayload } = require("../lib/qrcode.js");

test("QRCode.generateMatrix generates a valid square boolean grid", () => {
  const matrix = QRCode.generateMatrix("HELLO", "M");
  assert.ok(Array.isArray(matrix), "matrix is an array");
  assert.ok(matrix.length > 0, "matrix has rows");
  assert.strictEqual(matrix.length, matrix[0].length, "matrix is square");
  assert.strictEqual(typeof matrix[0][0], "boolean", "cells are boolean");
});

test("QRCode.toSvgString outputs valid SVG string with viewBox and rect elements", () => {
  const svg = QRCode.toSvgString("BEGIN:VCALENDAR", { size: 200, margin: 4 });
  assert.ok(svg.startsWith("<svg"), "starts with <svg");
  assert.ok(svg.includes("viewBox="), "contains viewBox");
  assert.ok(svg.includes("<rect") || svg.includes("<path"), "contains graphic elements");
  assert.ok(svg.endsWith("</svg>"), "ends with </svg>");
});

test("buildQrCalendarPayload for exams formats upcoming exams with rooms into compact iCal", () => {
  const now = new Date(2026, 8, 10, 8, 0); // 10/09/2026
  const exams = [
    {
      title: "PRJ301",
      tag: "FE",
      location: "AL-R402",
      start: "2026-09-15T09:00:00",
      end: "2026-09-15T10:30:00",
      description: "Final exam"
    },
    {
      title: "SWE201",
      location: "", // no room, should be skipped
      start: "2026-09-16T09:00:00",
      end: "2026-09-16T10:30:00"
    }
  ];

  const payload = buildQrCalendarPayload({ type: "exam", events: exams, now });
  assert.ok(payload.startsWith("BEGIN:VCALENDAR\r\n"), "starts with VCALENDAR");
  assert.ok(payload.endsWith("END:VCALENDAR\r\n") || payload.endsWith("END:VCALENDAR"), "ends with VCALENDAR");
  assert.ok(payload.includes("SUMMARY:PRJ301 - FE"), "includes formatted title");
  assert.ok(payload.includes("LOCATION:AL-R402"), "includes room");
  assert.ok(!payload.includes("SWE201"), "skips exam without room");
});

test("buildQrCalendarPayload for schedule filters by scope 'today', 'week', 'next_week'", () => {
  const now = new Date(2026, 8, 10, 8, 0); // Thursday 10/09/2026
  const classes = [
    // Today
    {
      title: "PRJ301",
      location: "AL-L302",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    },
    // This week, different day (Friday 11/09/2026)
    {
      title: "SWE201",
      location: "BE-410",
      slot: "Slot 2",
      rawDate: { year: 2026, month: 9, day: 11, startHour: 9, startMinute: 30, endHour: 11, endMinute: 0 }
    },
    // Next week (Monday 14/09/2026)
    {
      title: "MAD101",
      location: "DE-201",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 14, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    }
  ];

  // Scope: today
  const todayPayload = buildQrCalendarPayload({ type: "schedule", events: classes, scope: "today", now });
  assert.ok(todayPayload.includes("PRJ301"));
  assert.ok(!todayPayload.includes("SWE201"));
  assert.ok(!todayPayload.includes("MAD101"));

  // Scope: week
  const weekPayload = buildQrCalendarPayload({ type: "schedule", events: classes, scope: "week", now });
  assert.ok(weekPayload.includes("PRJ301"));
  assert.ok(weekPayload.includes("SWE201"));
  assert.ok(!weekPayload.includes("MAD101"));

  // Scope: next_week
  const nextWeekPayload = buildQrCalendarPayload({ type: "schedule", events: classes, scope: "next_week", now });
  assert.ok(!nextWeekPayload.includes("PRJ301"));
  assert.ok(!nextWeekPayload.includes("SWE201"));
  assert.ok(nextWeekPayload.includes("MAD101"));

  // Scope: 2weeks
  const twoWeeksPayload = buildQrCalendarPayload({ type: "schedule", events: classes, scope: "2weeks", now });
  assert.ok(twoWeeksPayload.includes("PRJ301"), "includes this week");
  assert.ok(twoWeeksPayload.includes("SWE201"), "includes this week Friday");
  assert.ok(twoWeeksPayload.includes("MAD101"), "includes next week");

  // Scope: all
  const allPayload = buildQrCalendarPayload({ type: "schedule", events: classes, scope: "all", now });
  assert.ok(allPayload.includes("PRJ301"));
  assert.ok(allPayload.includes("SWE201"));
  assert.ok(allPayload.includes("MAD101"));
});

test("every VEVENT in buildQrCalendarPayload has distinct UID and DTSTAMP compliant with RFC 5545", () => {
  const now = new Date(2026, 8, 10, 8, 0);
  const classes = [
    {
      title: "PRJ301",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    },
    {
      title: "PRJ301",
      slot: "Slot 3",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 12, startMinute: 50, endHour: 15, endMinute: 10 }
    }
  ];

  const payload = buildQrCalendarPayload({ type: "schedule", events: classes, scope: "today", now });
  const uids = payload.match(/^UID:.+$/gm) || [];
  const dtstamps = payload.match(/^DTSTAMP:.+$/gm) || [];

  assert.strictEqual(uids.length, 2, "must have 2 UID lines for 2 events");
  assert.strictEqual(dtstamps.length, 2, "must have 2 DTSTAMP lines for 2 events");
  assert.notStrictEqual(uids[0], uids[1], "UIDs must be distinct across events");
});

test("buildQrCalendarPayload caps events to maxEvents and sorts chronologically", () => {
  const now = new Date(2026, 8, 10, 8, 0);
  // Create 25 events in reverse chronological order
  const classes = Array.from({ length: 25 }, (_, i) => ({
    title: `SUBJ${i}`,
    slot: "Slot 1",
    rawDate: { year: 2026, month: 9, day: 25 - i, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
  }));

  const payload = buildQrCalendarPayload({
    type: "schedule",
    events: classes,
    scope: "all",
    now,
    maxEvents: 16
  });

  const eventCount = (payload.match(/BEGIN:VEVENT/g) || []).length;
  assert.strictEqual(eventCount, 16, "capped to 16 events");
  // Check that the earliest date appears first
  const firstEventIndex = payload.indexOf("SUBJ24"); // day 1
  const laterEventIndex = payload.indexOf("SUBJ20"); // day 5
  assert.ok(firstEventIndex !== -1 && laterEventIndex !== -1 && firstEventIndex < laterEventIndex, "sorted chronologically");
});

