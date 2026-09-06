const test = require("node:test");
const assert = require("node:assert");
const {
  getWeekDateRange,
  mapEventToSlot,
  groupScheduleByWeekAndSlot,
} = require("../lib/schedule.js");

test("getWeekDateRange calculates Monday to Sunday bounds and 7 day objects", () => {
  // 08/09/2026 is Tuesday
  const tuesday = new Date(2026, 8, 8); // month 8 is September
  const range = getWeekDateRange(tuesday, 0);

  assert.strictEqual(range.startMonday.getFullYear(), 2026);
  assert.strictEqual(range.startMonday.getMonth(), 8);
  assert.strictEqual(range.startMonday.getDate(), 7); // Monday is 7th
  assert.strictEqual(range.endSunday.getDate(), 13); // Sunday is 13th

  assert.strictEqual(range.days.length, 7);
  assert.strictEqual(range.days[0].isoDay, 1);
  assert.strictEqual(range.days[0].day, 7);
  assert.strictEqual(range.days[1].isoDay, 2);
  assert.strictEqual(range.days[1].day, 8);
  assert.strictEqual(range.days[6].isoDay, 7);
  assert.strictEqual(range.days[6].day, 13);
});

test("getWeekDateRange supports positive and negative week offsets", () => {
  const ref = new Date(2026, 8, 7); // Mon Sep 7, 2026
  const nextWeek = getWeekDateRange(ref, 1);
  assert.strictEqual(nextWeek.startMonday.getDate(), 14);
  assert.strictEqual(nextWeek.endSunday.getDate(), 20);

  const prevWeek = getWeekDateRange(ref, -1);
  assert.strictEqual(prevWeek.startMonday.getDate(), 31); // 31 Aug
  assert.strictEqual(prevWeek.startMonday.getMonth(), 7);
  assert.strictEqual(prevWeek.endSunday.getDate(), 6); // 6 Sep
});

test("getWeekDateRange handles Sunday properly as day 7 of its own week", () => {
  // Sunday 13 Sep 2026
  const sunday = new Date(2026, 8, 13);
  const range = getWeekDateRange(sunday, 0);
  assert.strictEqual(range.startMonday.getDate(), 7);
  assert.strictEqual(range.endSunday.getDate(), 13);
});

test("mapEventToSlot resolves slot numbers 1 to 6 from slot string or start time", () => {
  assert.strictEqual(mapEventToSlot({ slot: "Slot 1" }), 1);
  assert.strictEqual(mapEventToSlot({ slot: "Slot 3" }), 3);
  assert.strictEqual(mapEventToSlot({ type: "Slot 5" }), 5);
  assert.strictEqual(mapEventToSlot({ slot: "Slot 6" }), 6);

  // Fallback to startHour
  assert.strictEqual(mapEventToSlot({ rawDate: { startHour: 7, startMinute: 30 } }), 1);
  assert.strictEqual(mapEventToSlot({ rawDate: { startHour: 10, startMinute: 0 } }), 2);
  assert.strictEqual(mapEventToSlot({ rawDate: { startHour: 12, startMinute: 50 } }), 3);
  assert.strictEqual(mapEventToSlot({ rawDate: { startHour: 15, startMinute: 20 } }), 4);
  assert.strictEqual(mapEventToSlot({ rawDate: { startHour: 17, startMinute: 50 } }), 5);
  assert.strictEqual(mapEventToSlot({ rawDate: { startHour: 20, startMinute: 20 } }), 6);

  assert.strictEqual(mapEventToSlot({}), null);
});

test("groupScheduleByWeekAndSlot groups events by isoDay_slot and filters outside events", () => {
  const weekRange = getWeekDateRange(new Date(2026, 8, 7), 0); // Sep 7 to Sep 13, 2026

  const events = [
    {
      title: "PRM393",
      slot: "Slot 3",
      rawDate: { year: 2026, month: 9, day: 7, startHour: 12, startMinute: 50 },
    },
    {
      title: "EXE201",
      slot: "Slot 2",
      rawDate: { year: 2026, month: 9, day: 11, startHour: 10, startMinute: 0 },
    },
    {
      title: "MLN111",
      slot: "Slot 2",
      rawDate: { year: 2026, month: 9, day: 12, startHour: 10, startMinute: 0 },
    },
    // outside this week
    {
      title: "PRJ301",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 21, startHour: 9, startMinute: 10 },
    },
  ];

  const grouped = groupScheduleByWeekAndSlot(events, weekRange);

  // Sep 7 is Monday (isoDay 1), Slot 3 -> key "1_3"
  assert.ok(grouped["1_3"]);
  assert.strictEqual(grouped["1_3"].length, 1);
  assert.strictEqual(grouped["1_3"][0].title, "PRM393");

  // Sep 11 is Friday (isoDay 5), Slot 2 -> key "5_2"
  assert.ok(grouped["5_2"]);
  assert.strictEqual(grouped["5_2"].length, 1);
  assert.strictEqual(grouped["5_2"][0].title, "EXE201");

  // Sep 12 is Saturday (isoDay 6), Slot 2 -> key "6_2"
  assert.ok(grouped["6_2"]);
  assert.strictEqual(grouped["6_2"].length, 1);
  assert.strictEqual(grouped["6_2"][0].title, "MLN111");

  // Sep 21 is not in this week
  assert.strictEqual(grouped["1_1"], undefined);
});

test("getSlotTimingStatus identifies in_progress, past, and upcoming slots accurately", () => {
  const { getSlotTimingStatus, FPT_SLOT_TIMES } = require("../lib/schedule.js");
  assert.ok(FPT_SLOT_TIMES, "FPT_SLOT_TIMES exported");

  // Now is Thursday Sep 10, 2026 at 13:30 (during Slot 3: 12:50 - 15:10)
  const now = new Date(2026, 8, 10, 13, 30);

  const pastDay = { year: 2026, month: 9, day: 8 }; // Tuesday (past)
  const today = { year: 2026, month: 9, day: 10 }; // Thursday (today)
  const futureDay = { year: 2026, month: 9, day: 11 }; // Friday (future)

  // 1. A slot on a past day is past
  assert.strictEqual(getSlotTimingStatus(null, pastDay, 3, now), "past");

  // 2. Today, Slot 1 (07:30 - 09:50) ended earlier today -> past
  assert.strictEqual(getSlotTimingStatus(null, today, 1, now), "past");

  // 3. Today, Slot 2 (10:00 - 12:20) ended earlier today -> past
  assert.strictEqual(getSlotTimingStatus(null, today, 2, now), "past");

  // 4. Today, Slot 3 (12:50 - 15:10) is currently active -> in_progress
  assert.strictEqual(getSlotTimingStatus(null, today, 3, now), "in_progress");

  // 5. Today, Slot 3 with custom rawDate (12:50 - 15:10) -> in_progress
  const evSlot3 = {
    title: "PRM393",
    rawDate: { year: 2026, month: 9, day: 10, startHour: 12, startMinute: 50, endHour: 15, endMinute: 10 }
  };
  assert.strictEqual(getSlotTimingStatus(evSlot3, today, 3, now), "in_progress");

  // 6. Today, Slot 4 (15:20 - 17:40) hasn't started yet -> upcoming
  assert.strictEqual(getSlotTimingStatus(null, today, 4, now), "upcoming");

  // 7. A slot on a future day -> upcoming
  assert.strictEqual(getSlotTimingStatus(null, futureDay, 1, now), "upcoming");
});

