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
});
