const test = require("node:test");
const assert = require("node:assert");
const { icsEscapeText, icsFoldLine, createExamCalendar, createClassCalendar } = require("../lib/ics.js");

const octets = (s) => new TextEncoder().encode(s).length;
const unfold = (s) => s.split("\r\n ").join("");
const UTC = /^\d{8}T\d{6}Z$/;
const LOCAL = /^\d{8}T\d{6}$/;

test("escapes the RFC 5545 TEXT separators", () => {
  assert.strictEqual(icsEscapeText("SWP391, Slot 2; DE-226"), String.raw`SWP391\, Slot 2\; DE-226`);
  assert.strictEqual(icsEscapeText("a\\b"), String.raw`a\\b`, "backslash escaped once, not twice");
  assert.strictEqual(icsEscapeText("line1\r\nline2"), String.raw`line1\nline2`);
  assert.strictEqual(icsEscapeText("Lập trình Java"), "Lập trình Java", "diacritics untouched");
  assert.strictEqual(icsEscapeText(null), "");
  assert.strictEqual(icsEscapeText(undefined), "");
});

test("folds long lines without splitting a UTF-8 codepoint", () => {
  assert.strictEqual(icsFoldLine("SUMMARY:PRJ301"), "SUMMARY:PRJ301", "short lines untouched");
  assert.ok(!icsFoldLine("A".repeat(75)).includes("\r\n"), "75 octets still fits");
  assert.ok(icsFoldLine("A".repeat(76)).includes("\r\n"), "76 octets must fold");

  for (const body of [
    "x".repeat(300),
    "SUMMARY:" + "Lập trình hướng đối tượng ".repeat(12),
    "DESCRIPTION:" + "ế".repeat(200), // 3-byte chars: worst case for a naive split
  ]) {
    const folded = icsFoldLine(body);
    assert.strictEqual(unfold(folded), body, "folding must be lossless");
    assert.ok(!folded.includes("�"), "no replacement char, so no codepoint was split");
    folded.split("\r\n").forEach((line, i) => {
      if (i > 0) assert.ok(line.startsWith(" "), "continuation lines start with a space");
      assert.ok(octets(line) <= 75, `line ${i} is ${octets(line)} octets`);
    });
  }
});

const nasty = {
  title: "SWP391 - FE",
  desc: "MULTIPLE_CHOICES, ESSAY; thi trên máy tại phòng máy của trường đại học FPT Hòa Lạc",
  loc: "DE-226, tầng 2",
};

function calendars() {
  const exam = createExamCalendar();
  exam.addEvent(nasty.title, nasty.desc, nasty.loc,
    new Date(Date.UTC(2026, 8, 20, 3, 0)), new Date(Date.UTC(2026, 8, 20, 4, 30)));

  const cls = createClassCalendar();
  cls.addEvent("PRJ301", nasty.desc, nasty.loc, {
    rawDate: { year: 2026, month: 9, day: 20, startHour: 9, startMinute: 10, endHour: 11, endMinute: 30 },
    slot: "Slot 2",
  }, true);

  const fallback = createClassCalendar();
  fallback.addEvent("X", "d", "l", { slot: "Slot 1" }, true); // event with no rawDate

  return [["exam", exam.build()], ["class", cls.build()], ["class-fallback", fallback.build()]];
}

test("both calendars emit well-formed iCalendar", () => {
  for (const [name, out] of calendars()) {
    const lines = out.split("\r\n");
    assert.ok(out.endsWith("\r\n"), `${name}: file ends with CRLF`);
    assert.strictEqual(lines[0], "BEGIN:VCALENDAR", `${name}: opens the calendar`);
    assert.strictEqual(lines.at(-2), "END:VCALENDAR", `${name}: closes the calendar`);
    assert.ok(!/[^\r]\n/.test(out), `${name}: no bare LF`);
    for (const l of lines) assert.ok(octets(l) <= 75, `${name}: ${octets(l)} octets: ${l.slice(0, 40)}`);
  }
});

test("timestamps are valid DATE-TIME values (regression: the '…ZZ' stamps)", () => {
  for (const [name, out] of calendars()) {
    const u = unfold(out).split("\r\n");
    const val = (k) => { const l = u.find((x) => x.startsWith(k)); return l && l.slice(l.indexOf(":") + 1); };

    assert.ok(!out.includes("ZZ"), `${name}: no doubled Z`);
    assert.match(val("DTSTAMP:"), UTC, `${name}: DTSTAMP`);
    assert.match(val("UID:").split("-")[0], UTC, `${name}: UID timestamp prefix`);

    const dtstart = u.find((l) => l.startsWith("DTSTART"));
    const start = dtstart.slice(dtstart.indexOf(":") + 1);
    assert.ok(UTC.test(start) || LOCAL.test(start), `${name}: DTSTART shape -> ${start}`);
  }
});

test("separators inside values never leak as separators", () => {
  for (const [name, out] of calendars()) {
    const u = unfold(out).split("\r\n");
    const leaked = u.filter((l) =>
      /^(SUMMARY|LOCATION|DESCRIPTION):/.test(l) && /(^|[^\\])[,;]/.test(l.slice(l.indexOf(":") + 1)));
    assert.deepStrictEqual(leaked, [], `${name}: unescaped , or ; leaked`);

    if (name !== "class-fallback") {
      assert.strictEqual(u.find((l) => l.startsWith("LOCATION:")),
        "LOCATION:" + icsEscapeText(nasty.loc), `${name}: LOCATION round-trips`);
    }
  }
});

test("exam events carry both reminders, class events only on the first slot", () => {
  const [[, exam], [, cls]] = calendars();
  assert.strictEqual((exam.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.strictEqual((cls.match(/BEGIN:VALARM/g) || []).length, 1);

  const noAlarm = createClassCalendar();
  noAlarm.addEvent("PRJ301", "d", "l", {
    rawDate: { year: 2026, month: 9, day: 20, startHour: 13, startMinute: 0, endHour: 15, endMinute: 0 },
    slot: "Slot 3",
  }, false);
  assert.strictEqual((noAlarm.build().match(/BEGIN:VALARM/g) || []).length, 0);
});
