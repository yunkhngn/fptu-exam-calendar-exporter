const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const CODES = ["PRJ301", "SWP391", "MAD101", "DBI202", "JPD123", "SSL101", "OSG202"];

const cellHtml = (code, room, status) =>
  `<a href="/Report/ScheduleDetail.aspx?id=${code}">${code}-Lab (Online)</a> at ${room}<br>` +
  `<span class="label label-success">(9:10-11:30)</span><br>` +
  `<font color="green">${status}</font>`;

/**
 * shapeB is what FAP ships: the "Slot" corner cell spans both header rows, so the date row
 * has one <th> fewer. shapeA is the same table with its own corner cell in the date row.
 * The scraper must handle both without a hard-coded offset.
 */
function render({ shape = "B", dates, year = 2026, rooms = CODES.map(() => "DE-226") }) {
  const head1 =
    `<tr>${shape === "B" ? '<th rowspan="2">Slot</th>' : "<th>Slot</th>"}` +
    DAYS.map((d) => `<th>${d}</th>`).join("") + "</tr>";
  const head2 =
    `<tr>${shape === "B" ? "" : "<th></th>"}` +
    dates.map((d) => `<th>${d}</th>`).join("") + "</tr>";
  const body =
    `<tr><td>Slot 2</td>` +
    CODES.map((c, i) => `<td>${cellHtml(c, rooms[i], "attended")}</td>`).join("") + "</tr>";

  const dom = new JSDOM(
    `<select id="ctl00_mainContent_drpYear"><option value="${year}" selected>${year}</option></select>` +
    `<table><thead>${head1}${head2}</thead><tbody>${body}</tbody></table>`,
    { url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx" }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.URL = dom.window.URL;

  delete require.cache[require.resolve("../content.js")];
  return require("../content.js").extractWeeklyScheduleFromTable();
}

const ORDINARY = ["21/09", "22/09", "23/09", "24/09", "25/09", "26/09", "27/09"];
const CROSSES_MONTH = ["28/09", "29/09", "30/09", "01/10", "02/10", "03/10", "04/10"];

for (const shape of ["B", "A"]) {
  for (const [label, dates] of [["an ordinary week", ORDINARY], ["a week crossing a month", CROSSES_MONTH]]) {
    test(`shape ${shape}: ${label} maps every column to its own date`, () => {
      const { schedule: out, skipped } = render({ shape, dates });
      assert.strictEqual(skipped, 0, "nothing should be skipped on a well-formed table");

      // Regression: the last column used to be dropped because the date row was one cell short.
      assert.strictEqual(out.length, DAYS.length, "every day column produces an event");

      out.forEach((e) => {
        const col = CODES.indexOf(e.title);
        const [day, month] = dates[col].split("/").map(Number);
        assert.strictEqual(e.date, `${day}/${month}/2026`, `${e.title} date`);
        assert.deepStrictEqual(
          { y: e.rawDate.year, m: e.rawDate.month, d: e.rawDate.day },
          { y: 2026, m: month, d: day },
          `${e.title} rawDate`
        );
        assert.strictEqual(e.day, DAYS[col], `${e.title} day name aligns with the same column`);
      });
    });
  }
}

test("carries slot, room, time and attendance through", () => {
  const rooms = ["DE-226", "AL-R402", "DE-331", "BE-102", "DE-115", "AL-R301", "BE-204"];
  const { schedule: out } = render({ dates: ORDINARY, rooms });

  const first = out[0];
  assert.strictEqual(first.title, "PRJ301");
  assert.strictEqual(first.slot, "Slot 2");
  assert.strictEqual(first.location, "DE-226");
  assert.strictEqual(first.attendanceStatus, "attended");
  assert.strictEqual(first.attendanceColor, "green");
  assert.strictEqual(first.rawDate.startHour, 9);
  assert.strictEqual(first.rawDate.startMinute, 10);
  assert.strictEqual(first.rawDate.endHour, 11);
  assert.strictEqual(first.rawDate.endMinute, 30);
  assert.match(first.detailUrl, /^https:\/\/fap\.fpt\.edu\.vn\/Report\/ScheduleDetail\.aspx/);
  assert.deepStrictEqual(out.map((e) => e.location), rooms);
});

test("a class moved online is detected, and its duplicate time badges resolve to one value", () => {
  // Real markup pasted from FAP: the corner-cell subject anchor, a "View Materials" link
  // whose href carries a bearer token, an "Update Online" note, a label-primary time badge
  // next to the Meet URL, then the usual label-success time + attendance wrapper, then the
  // online-indicator block FAP renders as a sibling of the <p>, not inside it.
  const EXE201_TD = `<p><a href="../Schedule/ActivityDetail.aspx?id=2647413">EXE201-</a>` +
    `<a class="label label-warning" href="http://flm.fpt.edu.vn/gui/role/guest/ListScheduleSyllabus?subjectCode=x&SessionNo=y&token=eyJhbGciOiJSUzI1NiJ9.abc.def" target="_blank">View Materials</a>` +
    `<br> at BE-410<br>(hadtt39 Update Online: True at 11/08/2026 16:31)<br>` +
    `<span class="label label-primary">(10:00-12:20)</span> - ` +
    `<a class="label label-default" href="https://meet.google.com/aaz-nwiq-tbo" target="_blank">Meet URL</a>` +
    `<a> <br>(<font color="red">Not yet</font>)<br><span class="label label-success">(10:00-12:20)</span><br></a></p>` +
    `<div class="online-indicator"><a><span class="blink"></span></a></div>` +
    `<h3 class="online-text"><a>Online</a></h3><p></p>`;

  const dom = new JSDOM(
    `<select id="ctl00_mainContent_drpYear"><option value="2026" selected>2026</option></select>` +
    `<table><thead><tr><th rowspan="2">Slot</th><th>MON</th></tr><tr><th>21/09</th></tr></thead>` +
    `<tbody><tr><td>Slot 2</td><td>${EXE201_TD}</td></tr></tbody></table>`,
    { url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx" }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.URL = dom.window.URL;
  delete require.cache[require.resolve("../content.js")];

  const { schedule, skipped } = require("../content.js").extractWeeklyScheduleFromTable();
  assert.strictEqual(skipped, 0, "an online cell must not be counted as unparseable");
  const ev = schedule[0];
  assert.strictEqual(ev.title, "EXE201");
  assert.strictEqual(ev.isOnline, true);
  assert.strictEqual(ev.location, "BE-410");
  assert.deepStrictEqual(
    { h1: ev.rawDate.startHour, m1: ev.rawDate.startMinute, h2: ev.rawDate.endHour, m2: ev.rawDate.endMinute },
    { h1: 10, m1: 0, h2: 12, m2: 20 }
  );
  assert.strictEqual(
    ev.detailUrl.includes("token="), false,
    "the View Materials link's bearer token must never end up in stored schedule data"
  );
  assert.match(ev.detailUrl, /ActivityDetail\.aspx\?id=2647413/);
});

test("a room sharing a line with the next badge does not keep a trailing dash", () => {
  // "at AL-L302 - <a ...>Meet URL</a>" — no <br> between the room and the badge that
  // follows it on the same line, which used to leave "AL-L302 -" as the stored room.
  const MLN111_TD = `<p><a href="../Schedule/ActivityDetail.aspx?id=2647500">MLN111-</a>` +
    `<a href="" target="_blank">View Materials</a><br> at AL-L302 - ` +
    `<a class="label label-default" href="https://meet.google.com/ges-powo-ise" target="_blank">Meet URL</a>` +
    `<a> <br>(<font color="red">Not yet</font>)<br><span class="label label-success">(10:00-12:20)</span><br></a></p>` +
    `<div class="online-indicator"><a><span class="blink"></span></a></div>` +
    `<h3 class="online-text"><a>Online</a></h3><p></p>`;

  const dom = new JSDOM(
    `<select id="ctl00_mainContent_drpYear"><option value="2026" selected>2026</option></select>` +
    `<table><thead><tr><th rowspan="2">Slot</th><th>MON</th></tr><tr><th>21/09</th></tr></thead>` +
    `<tbody><tr><td>Slot 2</td><td>${MLN111_TD}</td></tr></tbody></table>`,
    { url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx" }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.URL = dom.window.URL;
  delete require.cache[require.resolve("../content.js")];

  const { schedule } = require("../content.js").extractWeeklyScheduleFromTable();
  assert.strictEqual(schedule[0].location, "AL-L302");
  assert.strictEqual(schedule[0].isOnline, true);
});

test("an ordinary offline cell is unaffected by the online-detection change", () => {
  const OFFLINE_TD =
    `<a href="../Schedule/ActivityDetail.aspx?id=1">PRJ301-Lab</a> at DE-226<br>` +
    `<span class="label label-success">(9:10-11:30)</span><br><font color="green">attended</font>`;

  const dom = new JSDOM(
    `<select id="ctl00_mainContent_drpYear"><option value="2026" selected>2026</option></select>` +
    `<table><thead><tr><th rowspan="2">Slot</th><th>MON</th></tr><tr><th>21/09</th></tr></thead>` +
    `<tbody><tr><td>Slot 2</td><td>${OFFLINE_TD}</td></tr></tbody></table>`,
    { url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx" }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.URL = dom.window.URL;
  delete require.cache[require.resolve("../content.js")];

  const { schedule } = require("../content.js").extractWeeklyScheduleFromTable();
  const ev = schedule[0];
  assert.strictEqual(ev.isOnline, false);
  assert.strictEqual(ev.location, "DE-226");
  assert.strictEqual(ev.rawDate.startHour, 9);
});

test("a table with no slot rows yields nothing instead of throwing", () => {
  const dom = new JSDOM("<table><thead></thead><tbody></tbody></table>",
    { url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.URL = dom.window.URL;
  delete require.cache[require.resolve("../content.js")];
  assert.deepStrictEqual(require("../content.js").extractWeeklyScheduleFromTable(), { schedule: [], skipped: 0 });
});

test("counts class cells it cannot parse instead of dropping them silently", () => {
  const dom = new JSDOM(
    `<select id="ctl00_mainContent_drpYear"><option value="2026" selected>2026</option></select>` +
    `<table><thead>` +
    `<tr><th rowspan="2">Slot</th><th>MON</th><th>TUE</th></tr>` +
    `<tr><th>21/09</th><th>22/09</th></tr>` +
    `</thead><tbody><tr><td>Slot 2</td>` +
    `<td><a href="/x">PRJ301-Lab</a> at DE-226 <span class="label label-success">(9:10-11:30)</span></td>` +
    // same shape, but the course code no longer matches the expected pattern
    `<td><a href="/y">Kỹ năng mềm</a> at DE-226 <span class="label label-success">(9:10-11:30)</span></td>` +
    `</tr></tbody></table>`,
    { url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx" }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.URL = dom.window.URL;
  delete require.cache[require.resolve("../content.js")];

  const { schedule, skipped } = require("../content.js").extractWeeklyScheduleFromTable();
  assert.deepStrictEqual(schedule.map((e) => e.title), ["PRJ301"]);
  assert.strictEqual(skipped, 1, "the unreadable cell is reported so the popup can warn");
});
