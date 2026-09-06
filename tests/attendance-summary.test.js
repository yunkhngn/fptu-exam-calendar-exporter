const test = require("node:test");
const assert = require("node:assert");
const {
  computeCourseAttendanceStats,
  computeAttendanceByCourse,
} = require("../lib/schedule.js");

const sess = (title, status) => ({ title, attendanceStatus: status });

test("computeCourseAttendanceStats calculates detailed attendance and remaining absences for full schedule", () => {
  // Course with 20 scheduled sessions (e.g. multi-week sync)
  // 10 attended, 2 absent, 8 not yet -> totalScheduled = 20, maxAllowed = 4, remaining = 2
  const schedule = [
    ...Array(10).fill(null).map(() => sess("PRM393", "attended")),
    ...Array(2).fill(null).map(() => sess("PRM393", "absent")),
    ...Array(8).fill(null).map(() => sess("PRM393", "not yet")),
  ];

  const stats = computeCourseAttendanceStats(schedule);
  assert.ok(stats.PRM393);
  assert.strictEqual(stats.PRM393.attended, 10);
  assert.strictEqual(stats.PRM393.absent, 2);
  assert.strictEqual(stats.PRM393.notYet, 8);
  assert.strictEqual(stats.PRM393.totalGraded, 12);
  assert.strictEqual(stats.PRM393.totalScheduled, 20);
  assert.strictEqual(stats.PRM393.rate, 2 / 12);
  assert.strictEqual(stats.PRM393.hasFullSchedule, true);
  assert.strictEqual(stats.PRM393.maxAllowedAbsent, 4); // floor(20 * 0.20)
  assert.strictEqual(stats.PRM393.remainingAbsent, 2);  // 4 - 2
});

test("computeCourseAttendanceStats marks hasFullSchedule false when totalScheduled < 10", () => {
  // Only 1 week synced (e.g. 2 sessions)
  const schedule = [sess("EXE201", "attended"), sess("EXE201", "absent")];
  const stats = computeCourseAttendanceStats(schedule);

  assert.ok(stats.EXE201);
  assert.strictEqual(stats.EXE201.attended, 1);
  assert.strictEqual(stats.EXE201.absent, 1);
  assert.strictEqual(stats.EXE201.totalGraded, 2);
  assert.strictEqual(stats.EXE201.totalScheduled, 2);
  assert.strictEqual(stats.EXE201.hasFullSchedule, false);
});

test("computeCourseAttendanceStats handles 0 remaining absences (at 20% limit) and negative (past 20%)", () => {
  // 15 sessions total: max allowed = floor(15 * 0.2) = 3
  // 3 absent -> remaining = 0
  const atLimit = [
    ...Array(7).fill(null).map(() => sess("MLN111", "attended")),
    ...Array(3).fill(null).map(() => sess("MLN111", "absent")),
    ...Array(5).fill(null).map(() => sess("MLN111", "not yet")),
  ];
  const statsLimit = computeCourseAttendanceStats(atLimit);
  assert.strictEqual(statsLimit.MLN111.remainingAbsent, 0);

  // 4 absent -> remaining = -1 (past limit)
  const pastLimit = [
    ...Array(6).fill(null).map(() => sess("MLN111", "attended")),
    ...Array(4).fill(null).map(() => sess("MLN111", "absent")),
    ...Array(5).fill(null).map(() => sess("MLN111", "not yet")),
  ];
  const statsPast = computeCourseAttendanceStats(pastLimit);
  assert.strictEqual(statsPast.MLN111.remainingAbsent, -1);
});

test("computeCourseAttendanceStats omits course if all sessions are not yet", () => {
  const schedule = [sess("SWP391", "not yet"), sess("SWP391", "not yet")];
  const stats = computeCourseAttendanceStats(schedule);
  assert.strictEqual(stats.SWP391, undefined);
});
