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
