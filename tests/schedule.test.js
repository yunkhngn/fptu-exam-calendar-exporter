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

const {
  classScheduleRangeBounds,
  filterClassScheduleByRange,
  CLASS_RANGE_MODES,
} = require("../lib/schedule.js");

const at = (y, m, d) => new Date(y, m - 1, d);
const span = (mode, now) => {
  const b = classScheduleRangeBounds(mode, now);
  return b && [b.from.getDate(), b.from.getMonth() + 1, b.to.getDate(), b.to.getMonth() + 1];
};

test("ranges run from today to a calendar boundary", () => {
  const wed = at(2026, 9, 2); // Wednesday
  assert.strictEqual(classScheduleRangeBounds("all", wed), null, "'all' means no bounds");
  assert.deepStrictEqual(span("today", wed), [2, 9, 2, 9]);
  assert.deepStrictEqual(span("week", wed), [2, 9, 6, 9], "to Sunday of this week");
  assert.deepStrictEqual(span("2weeks", wed), [2, 9, 13, 9], "to Sunday of next week");
  assert.deepStrictEqual(span("month", wed), [2, 9, 30, 9], "to the last day of the month");
});

test("a Sunday is still the end of its own week, not the start of the next", () => {
  const sun = at(2026, 9, 6);
  assert.deepStrictEqual(span("week", sun), [6, 9, 6, 9], "week collapses to today");
  assert.deepStrictEqual(span("2weeks", sun), [6, 9, 13, 9]);
});

test("a Monday spans its full week", () => {
  const mon = at(2026, 9, 7);
  assert.deepStrictEqual(span("week", mon), [7, 9, 13, 9]);
});

test("ranges cross month and year boundaries", () => {
  assert.deepStrictEqual(span("week", at(2026, 9, 30)), [30, 9, 4, 10], "week runs into October");
  assert.deepStrictEqual(span("month", at(2026, 9, 30)), [30, 9, 30, 9], "month stops at the 30th");
  assert.deepStrictEqual(span("month", at(2026, 2, 10)), [10, 2, 28, 2], "February, non-leap");
  assert.deepStrictEqual(span("month", at(2024, 2, 10)), [10, 2, 29, 2], "February, leap year");
  assert.deepStrictEqual(span("week", at(2026, 12, 31)), [31, 12, 3, 1], "week runs into January");
});

const onDay = (title, y, m, d) => ({
  title,
  rawDate: { year: y, month: m, day: d, startHour: 9, startMinute: 10, endHour: 11, endMinute: 30 },
});

test("filtering keeps only what falls inside the range", () => {
  const wed = at(2026, 9, 2);
  const schedule = [
    onDay("PAST", 2026, 9, 1),   // yesterday
    onDay("TODAY", 2026, 9, 2),
    onDay("FRI", 2026, 9, 4),
    onDay("NEXT_WEEK", 2026, 9, 9),
    onDay("LATER", 2026, 9, 25),
    onDay("NEXT_MONTH", 2026, 10, 5),
  ];
  const titles = (mode) => filterClassScheduleByRange(schedule, mode, wed).map((e) => e.title);

  assert.deepStrictEqual(titles("all"), schedule.map((e) => e.title), "'all' keeps everything, past included");
  assert.deepStrictEqual(titles("today"), ["TODAY"]);
  assert.deepStrictEqual(titles("week"), ["TODAY", "FRI"]);
  assert.deepStrictEqual(titles("2weeks"), ["TODAY", "FRI", "NEXT_WEEK"]);
  assert.deepStrictEqual(titles("month"), ["TODAY", "FRI", "NEXT_WEEK", "LATER"]);

  for (const mode of CLASS_RANGE_MODES) {
    if (mode === "all") continue;
    assert.ok(!titles(mode).includes("PAST"), `${mode} hides classes that already happened`);
  }
});

test("filtering never mutates the stored schedule", () => {
  const schedule = [onDay("A", 2026, 9, 1), onDay("B", 2026, 9, 2)];
  filterClassScheduleByRange(schedule, "today", at(2026, 9, 2));
  assert.strictEqual(schedule.length, 2);
});

test("events with no usable date are kept rather than vanishing", () => {
  const wed = at(2026, 9, 2);
  const odd = { title: "NO_DATE" };
  assert.deepStrictEqual(filterClassScheduleByRange([odd], "today", wed).map((e) => e.title), ["NO_DATE"]);
  assert.deepStrictEqual(filterClassScheduleByRange(null, "today", wed), []);
});

test("an unknown mode falls back to showing everything", () => {
  const schedule = [onDay("A", 2026, 9, 1), onDay("B", 2026, 9, 20)];
  assert.strictEqual(filterClassScheduleByRange(schedule, "nonsense", at(2026, 9, 2)).length, 2);
});

const {
  computeAttendanceByCourse,
  attendanceRiskLevel,
  ATTENDANCE_WARNING_THRESHOLD,
  ATTENDANCE_DANGER_THRESHOLD,
} = require("../lib/schedule.js");

const sess = (title, status) => ({ title, attendanceStatus: status });

test("computes an absence rate per course, ignoring events with no course code", () => {
  const schedule = [
    sess("PRJ301", "attended"), sess("PRJ301", "attended"), sess("PRJ301", "attended"), sess("PRJ301", "absent"),
    sess("SWP391", "attended"), sess("SWP391", "not yet"),
  ];
  const byCourse = computeAttendanceByCourse(schedule);
  assert.deepStrictEqual(byCourse.PRJ301, { attended: 3, absent: 1, rate: 0.25 });
  assert.deepStrictEqual(byCourse.SWP391, { attended: 1, absent: 0, rate: 0 });
});

test("a course with no graded session yet is left out entirely, not shown as 0%", () => {
  const schedule = [sess("MAD101", "not yet"), sess("MAD101", "not yet")];
  const byCourse = computeAttendanceByCourse(schedule);
  assert.strictEqual(byCourse.MAD101, undefined, "no attended/absent sessions means no rate to report");
});

test("\"not yet\" sessions never count toward the denominator", () => {
  const schedule = [sess("DBI202", "attended"), sess("DBI202", "absent"), sess("DBI202", "not yet"), sess("DBI202", "not yet")];
  assert.strictEqual(computeAttendanceByCourse(schedule).DBI202.rate, 0.5, "rate is 1/2, not 2/4");
});

test("events with no course code or no attendance status are ignored", () => {
  const schedule = [{ attendanceStatus: "absent" }, { title: "PRJ301" }, sess("PRJ301", "attended")];
  const byCourse = computeAttendanceByCourse(schedule);
  assert.deepStrictEqual(byCourse.PRJ301, { attended: 1, absent: 0, rate: 0 });
  assert.strictEqual(Object.keys(byCourse).length, 1);
});

test("risk thresholds are constants, and the boundaries are inclusive", () => {
  assert.strictEqual(ATTENDANCE_WARNING_THRESHOLD, 0.15);
  assert.strictEqual(ATTENDANCE_DANGER_THRESHOLD, 0.2);

  assert.strictEqual(attendanceRiskLevel(0), null);
  assert.strictEqual(attendanceRiskLevel(0.1), null);
  assert.strictEqual(attendanceRiskLevel(0.149), null);
  assert.strictEqual(attendanceRiskLevel(0.15), "warning", "the 15% boundary itself is already a warning");
  assert.strictEqual(attendanceRiskLevel(0.18), "warning");
  assert.strictEqual(attendanceRiskLevel(0.2), "danger", "the 20% boundary itself is already danger, not a warning");
  assert.strictEqual(attendanceRiskLevel(0.35), "danger");
  assert.strictEqual(attendanceRiskLevel(null), null);
  assert.strictEqual(attendanceRiskLevel(undefined), null);
});
