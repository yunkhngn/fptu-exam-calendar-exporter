const test = require("node:test");
const assert = require("node:assert");
const {
  DEFAULT_NOTIFICATION_SETTINGS,
  buildClassAlarmItems,
  buildExamAlarmItems,
  parseAlarmName,
  formatNotificationDetails
} = require("../lib/notifications.js");

test("DEFAULT_NOTIFICATION_SETTINGS has expected initial state", () => {
  assert.strictEqual(DEFAULT_NOTIFICATION_SETTINGS.enabled, true);
  assert.strictEqual(DEFAULT_NOTIFICATION_SETTINGS.class.enabled, true);
  assert.strictEqual(DEFAULT_NOTIFICATION_SETTINGS.class.offset15, true);
  assert.strictEqual(DEFAULT_NOTIFICATION_SETTINGS.class.offset30, false);
  assert.strictEqual(DEFAULT_NOTIFICATION_SETTINGS.exam.enabled, true);
  assert.strictEqual(DEFAULT_NOTIFICATION_SETTINGS.exam.offset1Day, true);
  assert.strictEqual(DEFAULT_NOTIFICATION_SETTINGS.exam.offset1Hour, true);
});

test("parseAlarmName correctly parses encoded alarm names", () => {
  const parsedClass = parseAlarmName("fptu:class:PRJ301-2026-09-10-0730:15");
  assert.deepStrictEqual(parsedClass, {
    type: "class",
    id: "PRJ301-2026-09-10-0730",
    offsetMinutes: 15
  });

  const parsedExam = parseAlarmName("fptu:exam:SWE201-2026-09-15-1000:1440");
  assert.deepStrictEqual(parsedExam, {
    type: "exam",
    id: "SWE201-2026-09-15-1000",
    offsetMinutes: 1440
  });

  assert.strictEqual(parseAlarmName("invalid-alarm-name"), null);
});

test("buildClassAlarmItems creates alarms for upcoming classes and ignores past classes", () => {
  const now = new Date(2026, 8, 10, 7, 0, 0); // 10/09/2026 07:00:00
  const classes = [
    {
      title: "PRJ301",
      location: "AL-L302",
      description: "PRJ301 - Slot 1 (7:30-9:00)",
      slot: "Slot 1",
      date: "10/09/2026",
      rawDate: {
        year: 2026,
        month: 9,
        day: 10,
        startHour: 7,
        startMinute: 30,
        endHour: 9,
        endMinute: 0,
        timeRange: "7:30-9:00"
      }
    },
    {
      title: "MAS291",
      location: "AL-R101",
      description: "MAS291 - Slot 1 (7:30-9:00)",
      slot: "Slot 1",
      date: "09/09/2026", // Yesterday
      rawDate: {
        year: 2026,
        month: 9,
        day: 9,
        startHour: 7,
        startMinute: 30,
        endHour: 9,
        endMinute: 0,
        timeRange: "7:30-9:00"
      }
    }
  ];

  const items = buildClassAlarmItems(classes, DEFAULT_NOTIFICATION_SETTINGS, now);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].type, "class");
  assert.strictEqual(items[0].title, "PRJ301");
  // 7:30 minus 15 min = 7:15
  const expectedWhen = new Date(2026, 8, 10, 7, 15, 0).getTime();
  assert.strictEqual(items[0].when, expectedWhen);
  assert.ok(items[0].name.startsWith("fptu:class:"));
});

test("buildExamAlarmItems creates 1-day and 1-hour alarms for upcoming exams", () => {
  const now = new Date(2026, 8, 10, 8, 0, 0); // 10/09/2026 08:00
  const exams = [
    {
      title: "PRJ301",
      location: "AL-L201",
      description: "Practical Exam",
      tag: "PE",
      start: new Date(2026, 8, 12, 10, 0, 0), // 12/09/2026 10:00
      end: new Date(2026, 8, 12, 11, 30, 0)
    }
  ];

  const items = buildExamAlarmItems(exams, DEFAULT_NOTIFICATION_SETTINGS, now);
  assert.strictEqual(items.length, 2); // 1 day before (1440 min) and 1 hour before (60 min)
  const oneDayAlarm = items.find(i => i.offsetMinutes === 1440);
  const oneHourAlarm = items.find(i => i.offsetMinutes === 60);
  assert.ok(oneDayAlarm);
  assert.ok(oneHourAlarm);
  assert.strictEqual(oneDayAlarm.when, new Date(2026, 8, 11, 10, 0, 0).getTime());
  assert.strictEqual(oneHourAlarm.when, new Date(2026, 8, 12, 9, 0, 0).getTime());
});

test("formatNotificationDetails formats messages correctly", () => {
  const classItem = {
    type: "class",
    title: "PRJ301",
    location: "AL-L302",
    slot: "Slot 1",
    timeRange: "7:30-9:00",
    offsetMinutes: 15
  };
  const classDetails = formatNotificationDetails(classItem);
  assert.strictEqual(classDetails.title, "[FPTU Lịch học] PRJ301 - Slot 1 (7:30-9:00)");
  assert.ok(classDetails.message.includes("AL-L302"));
  assert.ok(classDetails.message.includes("15 phút"));

  const examItem = {
    type: "exam",
    title: "PRJ301",
    location: "BE-302",
    tag: "PE",
    offsetMinutes: 1440,
    timeText: "10:00"
  };
  const examDetails = formatNotificationDetails(examItem);
  assert.strictEqual(examDetails.title, "[FPTU Lịch thi] PRJ301 (PE)");
  assert.ok(examDetails.message.includes("ngày mai"));
});
