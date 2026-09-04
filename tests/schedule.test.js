const test = require("node:test");
const assert = require("node:assert");
const { classScheduleDedupeKey, mergeNewClassEventsInto } = require("../lib/schedule.js");

const ev = (title, day, startHour = 9, startMinute = 10) => ({
  title,
  rawDate: { year: 2026, month: 9, day, startHour, startMinute, endHour: 11, endMinute: 30 },
});

test("keys an event by course, date and start time", () => {
  assert.strictEqual(classScheduleDedupeKey(ev("PRJ301", 21)), "PRJ301-21/9-9:10");
  assert.strictEqual(classScheduleDedupeKey(ev("PRJ301", 21)), classScheduleDedupeKey(ev("PRJ301", 21)));
  assert.notStrictEqual(classScheduleDedupeKey(ev("PRJ301", 21)), classScheduleDedupeKey(ev("PRJ301", 22)),
    "a different day is a different slot");
  assert.notStrictEqual(classScheduleDedupeKey(ev("PRJ301", 21, 13)), classScheduleDedupeKey(ev("PRJ301", 21, 9)),
    "same day, different slot time");
});

test("falls back to start for exam-shaped events, and gives up when there is neither", () => {
  const d = new Date(2026, 8, 21, 9, 10);
  assert.strictEqual(classScheduleDedupeKey({ title: "SWP391", start: d }), "SWP391-21/9-9:10");
  assert.strictEqual(classScheduleDedupeKey({ title: "SWP391", start: d.toISOString() }),
    "SWP391-21/9-9:10", "an ISO string is accepted too");
  assert.strictEqual(classScheduleDedupeKey({ title: "SWP391", start: "not a date" }), null);
  assert.strictEqual(classScheduleDedupeKey({ title: "SWP391" }), null);
});

test("merging drops events already present and keeps the rest", () => {
  const existing = [ev("PRJ301", 21), ev("SWP391", 22)];
  const incoming = [ev("PRJ301", 21), ev("MAD101", 23)];

  const { uniqueNewEvents, merged } = mergeNewClassEventsInto(existing, incoming);
  assert.deepStrictEqual(uniqueNewEvents.map((e) => e.title), ["MAD101"]);
  assert.deepStrictEqual(merged.map((e) => e.title), ["PRJ301", "SWP391", "MAD101"]);
  assert.deepStrictEqual(existing.map((e) => e.title), ["PRJ301", "SWP391"], "input is not mutated");
});

test("re-syncing the same week adds nothing", () => {
  const week = [ev("PRJ301", 21), ev("SWP391", 22), ev("MAD101", 23)];
  const { uniqueNewEvents, merged } = mergeNewClassEventsInto(week, week.map((e) => ({ ...e })));
  assert.strictEqual(uniqueNewEvents.length, 0);
  assert.strictEqual(merged.length, 3);
});

test("un-keyable events are kept rather than silently dropped", () => {
  const odd = { title: "???" };
  const { uniqueNewEvents, merged } = mergeNewClassEventsInto([], [odd, odd]);
  assert.strictEqual(uniqueNewEvents.length, 2, "no key means no dedupe, but no data loss either");
  assert.strictEqual(merged.length, 2);
});

test("merging into an empty schedule keeps everything", () => {
  const incoming = [ev("PRJ301", 21), ev("SWP391", 22)];
  const { uniqueNewEvents, merged } = mergeNewClassEventsInto([], incoming);
  assert.strictEqual(uniqueNewEvents.length, 2);
  assert.strictEqual(merged.length, 2);
});
