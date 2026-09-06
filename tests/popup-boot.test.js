const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");

/** Inline every <script src> so jsdom runs them in the order popup.html declares. */
function popupDocument() {
  return fs.readFileSync(path.join(root, "popup.html"), "utf8").replace(
    /<script src="([^"]+)"><\/script>/g,
    (_, src) => `<script>${fs.readFileSync(path.join(root, src), "utf8")}</script>`
  );
}

function chromeStub(calls) {
  const noop = () => {};
  return {
    runtime: {
      lastError: undefined,
      onMessage: { addListener: noop },
      sendMessage: (_m, cb) => cb && cb({ ok: true }),
      getURL: (p) => `chrome-extension://test/${p}`,
    },
    storage: {
      local: {
        get: (_keys, cb) => cb && cb({}),
        set: (items, cb) => { calls.storageSet.push(items); cb && cb(); },
        remove: noop,
      },
    },
    tabs: {
      query: (_q, cb) => cb && cb([]),
      create: (opts) => calls.tabsCreated.push(opts),
      sendMessage: (_id, _msg, cb) => cb && cb(undefined),
      onUpdated: { addListener: noop, removeListener: noop },
      update: noop,
    },
    scripting: { executeScript: (_o, cb) => cb && cb([]) },
  };
}

/** jsdom fires DOMContentLoaded asynchronously, so wait for popup.js to wire itself up. */
async function boot() {
  const calls = { storageSet: [], tabsCreated: [], errors: [] };
  const dom = new JSDOM(popupDocument(), {
    runScripts: "dangerously",
    url: "https://localhost/popup.html",
    beforeParse(window) {
      window.chrome = chromeStub(calls);
      window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      window.addEventListener("error", (e) => calls.errors.push(e.error || e.message));
    },
  });
  await new Promise((resolve) => {
    if (dom.window.document.readyState === "complete") return resolve();
    dom.window.addEventListener("load", resolve, { once: true });
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { dom, window: dom.window, calls };
}

test("popup boots with no uncaught error and wires its controls", async () => {
  const { window, calls } = await boot();
  assert.deepStrictEqual(calls.errors, [], "no script threw during load");

  // the modules the popup now loads from lib/ must be on the page
  for (const fn of ["icsEscapeText", "icsFoldLine", "icsUtcStamp",
                    "createExamCalendar", "createClassCalendar",
                    "classScheduleDedupeKey", "mergeNewClassEventsInto",
                    "parseFapGradeTable", "calculateCurrentScore", "calculateRequiredExamScore",
                    "getNextTheme", "resolveEffectiveTheme",
                    "computeTodayAgenda", "formatMinutesCountdown", "getEventTimeBounds",
                    "buildQrCalendarPayload"]) {
    assert.strictEqual(typeof window[fn], "function", `${fn} is available to popup.js`);
  }
  assert.strictEqual(typeof window.QRCode, "object", "QRCode is available to popup.js");

  assert.ok(window.document.querySelector(".tab-bar"), "sticky tab bar exists");
  assert.ok(window.document.getElementById("scheduleTab"), "schedule pane exists");
  assert.strictEqual(window.document.querySelectorAll(".tab-btn").length, 3);
});

test("switching tabs swaps the action rows", async () => {
  const { window } = await boot();
  const doc = window.document;
  const examActions = doc.getElementById("examActions");
  const scheduleActions = doc.getElementById("scheduleActions");

  assert.strictEqual(scheduleActions.hidden, false, "starts on Lịch học");
  assert.strictEqual(examActions.hidden, true);

  doc.getElementById("upcomingTab").dispatchEvent(new window.Event("click"));
  assert.strictEqual(examActions.hidden, false, "exam actions show on the Kỳ thi tab");
  assert.strictEqual(scheduleActions.hidden, true);

  doc.getElementById("scheduleTabBtn").dispatchEvent(new window.Event("click"));
  assert.strictEqual(scheduleActions.hidden, false);
});

test("the tab bar only takes its shadow once the list scrolls", async () => {
  const { window } = await boot();
  const doc = window.document;
  const bar = doc.querySelector(".tab-bar");
  const list = doc.getElementById("examList");

  assert.strictEqual(bar.classList.contains("is-stuck"), false, "flat at rest");
  list.scrollTop = 120;
  list.dispatchEvent(new window.Event("scroll"));
  assert.strictEqual(bar.classList.contains("is-stuck"), true, "shadow once scrolled");

  list.scrollTop = 0;
  list.dispatchEvent(new window.Event("scroll"));
  assert.strictEqual(bar.classList.contains("is-stuck"), false, "flat again at the top");
});

test("no blocking alert() or confirm() survives in the popup", () => {
  const src = fs.readFileSync(path.join(root, "popup.js"), "utf8");
  assert.strictEqual(/\balert\s*\(/.test(src), false, "errors go through showError/showToast");
  // the definition/JSDoc mentioning window.confirm() is fine; a call to the bare global is not
  assert.strictEqual(/[^.]\bconfirm\s*\(/.test(src.replace(/window\.confirm/g, "")), false,
    "yes/no prompts go through showConfirm(), not the native dialog");
});

test("showConfirm resolves true/false instead of blocking, and reflects title/label/danger", async () => {
  const { window } = await boot();
  const doc = window.document;
  const modal = doc.getElementById("confirmModal");
  assert.strictEqual(modal.style.display, "none");

  const pending = window.showConfirm("Xoá hết?", { title: "Xoá lịch học", okLabel: "Xoá", danger: true });
  assert.strictEqual(modal.style.display, "block", "showConfirm opens the modal itself");
  assert.strictEqual(doc.getElementById("confirmModalTitle").textContent, "Xoá lịch học");
  assert.strictEqual(doc.getElementById("confirmModalMessage").textContent, "Xoá hết?");
  const okBtn = doc.getElementById("confirmModalOk");
  assert.strictEqual(okBtn.textContent, "Xoá");
  assert.strictEqual(okBtn.classList.contains("danger-btn"), true);

  okBtn.dispatchEvent(new window.Event("click"));
  assert.strictEqual(await pending, true, "OK resolves true");
  assert.strictEqual(modal.style.display, "none", "and closes the modal");

  const pending2 = window.showConfirm("Chắc không?");
  doc.getElementById("confirmModalCancel").dispatchEvent(new window.Event("click"));
  assert.strictEqual(await pending2, false, "Huỷ resolves false");

  const pending3 = window.showConfirm("Chắc không?");
  // a click whose target is the backdrop itself, not a descendant, must also cancel
  const backdropClick = new window.Event("click");
  Object.defineProperty(backdropClick, "target", { value: modal });
  modal.dispatchEvent(backdropClick);
  assert.strictEqual(await pending3, false, "clicking the backdrop resolves false");
});

test("the class filter button opens its modal and applies a range", async () => {
  const { window } = await boot();
  const doc = window.document;
  const btn = doc.getElementById("scheduleFilterBtn");
  const modal = doc.getElementById("scheduleFilterModal");

  assert.ok(btn, "Lọc sits beside Xoá in the schedule actions");
  assert.strictEqual(btn.classList.contains("action-btn--compact"), true,
    "secondary actions size to icon + short label, matching the exam row's toolbar shape");
  assert.strictEqual(btn.querySelector(".action-btn__label").textContent.trim(), "Lọc",
    "label stays visible so the icon alone doesn't have to carry the meaning");
  assert.strictEqual(modal.style.display, "none");
  assert.strictEqual(btn.classList.contains("action-btn--filtering"), false, "untinted while showing all");

  btn.dispatchEvent(new window.Event("click"));
  assert.strictEqual(modal.style.display, "block", "clicking Lọc opens the modal");

  // Same interaction as the exam filter: pick, then Áp dụng.
  doc.querySelector('input[name="classRange"][value="week"]').checked = true;
  assert.strictEqual(window.localStorage.getItem("classRangeFilter"), null,
    "nothing is applied until the button is pressed");

  doc.getElementById("applyClassFilter").dispatchEvent(new window.Event("click"));
  assert.strictEqual(window.localStorage.getItem("classRangeFilter"), "week", "choice is remembered");
  assert.strictEqual(modal.style.display, "none", "applying closes the modal");
  assert.strictEqual(btn.classList.contains("action-btn--filtering"), true, "button shows a range is active");
});

test("Đặt lại puts the range back to Tất cả", async () => {
  const { window } = await boot();
  const doc = window.document;
  const btn = doc.getElementById("scheduleFilterBtn");

  doc.querySelector('input[name="classRange"][value="month"]').checked = true;
  doc.getElementById("applyClassFilter").dispatchEvent(new window.Event("click"));
  assert.strictEqual(window.localStorage.getItem("classRangeFilter"), "month");
  assert.strictEqual(btn.classList.contains("action-btn--filtering"), true);

  btn.dispatchEvent(new window.Event("click"));
  doc.getElementById("resetClassFilter").dispatchEvent(new window.Event("click"));
  assert.strictEqual(doc.querySelector('input[name="classRange"][value="all"]').checked, true,
    "reset only moves the selection");
  assert.strictEqual(window.localStorage.getItem("classRangeFilter"), "month",
    "and still waits for Áp dụng");

  doc.getElementById("applyClassFilter").dispatchEvent(new window.Event("click"));
  assert.strictEqual(window.localStorage.getItem("classRangeFilter"), "all");
  assert.strictEqual(btn.classList.contains("action-btn--filtering"), false, "tint clears");
});

test("reopening the modal shows the range currently in force", async () => {
  const { window } = await boot();
  const doc = window.document;

  doc.querySelector('input[name="classRange"][value="2weeks"]').checked = true;
  doc.getElementById("applyClassFilter").dispatchEvent(new window.Event("click"));

  // leave a stale selection behind, as a user abandoning the modal would
  doc.querySelector('input[name="classRange"][value="today"]').checked = true;
  doc.getElementById("scheduleFilterBtn").dispatchEvent(new window.Event("click"));

  assert.strictEqual(doc.querySelector('input[name="classRange"][value="2weeks"]').checked, true);
  assert.strictEqual(doc.querySelector('input[name="classRange"][value="today"]').checked, false);
});

test("both filter modals offer the same controls", async () => {
  const { window } = await boot();
  const doc = window.document;
  for (const id of ["filterModal", "scheduleFilterModal"]) {
    const modal = doc.getElementById(id);
    assert.ok(modal.querySelector(".modal-header .close-btn"), `${id}: close button`);
    assert.ok(modal.querySelector(".filter-group"), `${id}: option list`);
    assert.ok(modal.querySelector(".filter-actions .filter-btn.apply-btn"), `${id}: Áp dụng`);
  }
});

test("every range in the modal is one the filter understands", async () => {
  const { window } = await boot();
  const { CLASS_RANGE_MODES } = require("../lib/schedule.js");
  const offered = [...window.document.querySelectorAll('input[name="classRange"]')].map((i) => i.value);
  assert.deepStrictEqual(offered, CLASS_RANGE_MODES,
    "the radio list and lib/schedule.js must not drift apart");
});

test("secondary action buttons show a short label, not just an icon", async () => {
  const { window } = await boot();
  const doc = window.document;
  const expected = {
    syncButton: "Đồng bộ",
    settingsButton: "Lọc",
    syncScheduleBtn: "Đồng bộ",
    weekRangeBtn: "Nhiều tuần",
    scheduleFilterBtn: "Lọc",
    clearBtn: "Xoá",
  };
  for (const [id, text] of Object.entries(expected)) {
    const btn = doc.getElementById(id);
    assert.strictEqual(btn.classList.contains("action-btn--compact"), true, `${id} sizes to its content`);
    assert.ok(btn.title.length > text.length, `${id} keeps the fuller phrase as a tooltip via title`);
    const label = btn.querySelector(".action-btn__label");
    assert.strictEqual(label.textContent.trim(), text, `${id} shows a visible short label`);
    assert.notStrictEqual(window.getComputedStyle(label).position, "absolute", `${id} label is not visually hidden`);
  }
  // Tải lịch is the one full-width, fully-labeled primary action in each row
  for (const id of ["exportBtn", "downloadBtn"]) {
    assert.strictEqual(doc.getElementById(id).classList.contains("action-btn--compact"), false, `${id} stays the growing primary`);
  }
});

test("Đồng bộ nhiều tuần moved into the row as an icon button that opens a modal", async () => {
  const { window } = await boot();
  const doc = window.document;
  const btn = doc.getElementById("weekRangeBtn");
  const modal = doc.getElementById("weekRangeModal");

  assert.ok(btn, "trigger sits in the schedule action row");
  assert.strictEqual(btn.classList.contains("action-btn--compact"), true, "icon + short label, like the other secondary actions");
  assert.strictEqual(btn.querySelector(".action-btn__label").textContent.trim(), "Nhiều tuần");
  assert.strictEqual(btn.closest("#scheduleActions") !== null, true, "hidden/shown together with the schedule row");
  assert.strictEqual(modal.style.display, "none");

  // controls inside must keep their ids: background.js and the sync handlers address them directly
  for (const id of ["loadWeekOptionsBtn", "weekRangeStart", "weekRangeEnd", "syncWeekRangeBtn", "weekRangeStatus"]) {
    assert.ok(modal.querySelector(`#${id}`), `#${id} still lives inside the modal`);
  }

  btn.dispatchEvent(new window.Event("click"));
  assert.strictEqual(modal.style.display, "block", "clicking the icon opens the modal");

  doc.getElementById("closeWeekRangeModal").dispatchEvent(new window.Event("click"));
  assert.strictEqual(modal.style.display, "none", "the close button closes it");
});

test("the week-range modal follows the same shape as the other modals", async () => {
  const { window } = await boot();
  const modal = window.document.getElementById("weekRangeModal");
  assert.ok(modal.querySelector(".modal-header .close-btn"));
  assert.ok(modal.querySelector(".modal-body"));
  assert.strictEqual(modal.getAttribute("role"), "dialog");
});

test("the week-range fields sit in their own row, not the wrapping toolbar", async () => {
  const { window } = await boot();
  const doc = window.document;
  const fields = doc.querySelector(".week-range-fields");
  assert.ok(fields, "Từ/Đến are wrapped so they lay out as a pair, independent of Tải tuần/Đồng bộ");
  assert.strictEqual(fields.querySelector("#weekRangeStart").closest(".week-range-fields"), fields);
  assert.strictEqual(fields.querySelector("#weekRangeEnd").closest(".week-range-fields"), fields);
  // load/sync stay direct children of the toolbar, one per row, not squeezed beside the fields
  const toolbar = doc.querySelector(".week-range-toolbar");
  assert.strictEqual(doc.getElementById("loadWeekOptionsBtn").parentElement, toolbar);
  assert.strictEqual(doc.getElementById("syncWeekRangeBtn").parentElement, toolbar);
});

test("an online class gets an Online chip; an offline one does not", async () => {
  const { window } = await boot();
  const schedule = [
    {
      title: "EXE201", isOnline: true, location: "BE-410", slot: "Slot 2",
      rawDate: { year: 2026, month: 9, day: 21, startHour: 10, startMinute: 0, endHour: 12, endMinute: 20 },
    },
    {
      title: "PRJ301", isOnline: false, location: "DE-226", slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 21, startHour: 9, startMinute: 10, endHour: 11, endMinute: 30 },
    },
  ];
  window.renderClassSchedule(schedule);
  const cards = window.document.querySelectorAll("#scheduleTab .class-card");
  assert.strictEqual(cards.length, 2);

  const [online, offline] = [...cards].sort((a, b) =>
    a.querySelector(".class-code").textContent === "EXE201" ? -1 : 1
  );
  assert.ok(online.querySelector(".chip.online"), "EXE201 shows the Online chip");
  assert.strictEqual(online.querySelector(".chip.online").textContent.trim(), "Online");
  assert.strictEqual(online.querySelector(".chip.room"), null, "the room chip is hidden when class is online");
  assert.strictEqual(offline.querySelector(".chip.online"), null, "PRJ301 gets no Online chip");
  assert.ok(offline.querySelector(".chip.room"), "PRJ301 offline class shows room chip");

  const badges = online.querySelector(".class-card__badges");
  assert.ok(badges, "All chips share the header badge group");
  const badgeChips = [...badges.children];
  assert.strictEqual(badgeChips[0].className.includes("type"), true, "Slot sits first");
  assert.strictEqual(badgeChips[1].className.includes("online"), true, "Online sits second");
  assert.strictEqual(badgeChips[2].className.includes("attendance"), true, "attendance status sits to the right");
  assert.strictEqual(online.querySelector(".class-tags"), null, "class-tags element is removed");

  const offlineBadges = offline.querySelector(".class-card__badges");
  const offlineChips = [...offlineBadges.children];
  assert.strictEqual(offlineChips[0].className.includes("type"), true, "Slot sits first for offline");
  assert.strictEqual(offlineChips[1].className.includes("room"), true, "Room sits second for offline");
  assert.strictEqual(offlineChips[2].className.includes("attendance"), true, "Attendance sits third for offline");
});

test("notification button exists in header and opens notification modal", async () => {
  const { dom } = await boot();
  const doc = dom.window.document;
  const btn = doc.getElementById("notificationBtn");
  const modal = doc.getElementById("notificationModal");
  assert.ok(btn, "notificationBtn should exist");
  assert.ok(modal, "notificationModal should exist");
  assert.strictEqual(modal.style.display, "none");

  btn.click();
  assert.strictEqual(modal.style.display, "block");

  const closeBtn = doc.getElementById("closeNotificationModal");
  assert.ok(closeBtn);
  closeBtn.click();
  assert.strictEqual(modal.style.display, "none");
});

test("notification modal contains master toggle, class offsets, exam offsets and test button", async () => {
  const { dom } = await boot();
  const doc = dom.window.document;
  assert.ok(doc.getElementById("notifMasterToggle"), "master toggle exists");
  assert.ok(doc.getElementById("notifClassEnabled"), "class enabled exists");
  assert.ok(doc.getElementById("notifClass15"), "class 15 offset exists");
  assert.ok(doc.getElementById("notifClass30"), "class 30 offset exists");
  assert.ok(doc.getElementById("notifExamEnabled"), "exam enabled exists");
  assert.ok(doc.getElementById("notifExam1Day"), "exam 1 day offset exists");
  assert.ok(doc.getElementById("notifExam1Hour"), "exam 1 hour offset exists");
  assert.ok(doc.getElementById("testNotificationBtn"), "test button exists");
  assert.ok(doc.getElementById("saveNotificationBtn"), "save button exists");
});


test("a course past the danger threshold gets a risk chip on every one of its cards", async () => {
  const { window } = await boot();
  const schedule = [
    // 1 attended, 3 absent -> 75% for SWP391, well past both thresholds
    { title: "SWP391", isOnline: false, location: "AL-R402", slot: "Slot 1", attendanceStatus: "attended",
      rawDate: { year: 2026, month: 9, day: 8, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 } },
    { title: "SWP391", isOnline: false, location: "AL-R402", slot: "Slot 2", attendanceStatus: "absent",
      rawDate: { year: 2026, month: 9, day: 9, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 } },
    { title: "SWP391", isOnline: false, location: "AL-R402", slot: "Slot 3", attendanceStatus: "absent",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 } },
    { title: "SWP391", isOnline: false, location: "AL-R402", slot: "Slot 4", attendanceStatus: "absent",
      rawDate: { year: 2026, month: 9, day: 11, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 } },
    // safe course: no risk chip
    { title: "PRJ301", isOnline: false, location: "DE-226", slot: "Slot 1", attendanceStatus: "attended",
      rawDate: { year: 2026, month: 9, day: 8, startHour: 9, startMinute: 10, endHour: 11, endMinute: 30 } },
  ];
  window.renderClassSchedule(schedule);
  const cards = window.document.querySelectorAll("#scheduleTab .class-card");
  assert.strictEqual(cards.length, 5);

  const swp391Cards = [...cards].filter((c) => c.querySelector(".class-code").textContent === "SWP391");
  assert.strictEqual(swp391Cards.length, 4, "every SWP391 session card, not just one");
  swp391Cards.forEach((card) => {
    const risk = card.querySelector(".chip.risk-danger");
    assert.ok(risk, "each SWP391 card shows the danger chip");
    assert.strictEqual(risk.textContent.trim(), "75% vắng");
  });

  const prj301 = [...cards].find((c) => c.querySelector(".class-code").textContent === "PRJ301");
  assert.strictEqual(prj301.querySelector(".chip.risk-warning"), null);
  assert.strictEqual(prj301.querySelector(".chip.risk-danger"), null);
});

test("a course between the two thresholds gets the warning chip, not danger", async () => {
  const { window } = await boot();
  // 1 absent out of 6 -> ~16.7%, between 15% and 20%
  const schedule = Array.from({ length: 6 }, (_, i) => ({
    title: "MAD101", location: "BE-102", slot: `Slot ${i + 1}`,
    attendanceStatus: i === 0 ? "absent" : "attended",
    rawDate: { year: 2026, month: 9, day: 8 + i, startHour: 9, startMinute: 10, endHour: 11, endMinute: 30 },
  }));
  window.renderClassSchedule(schedule);
  const risk = window.document.querySelector("#scheduleTab .class-card .chip.risk-warning");
  assert.ok(risk, "16.7% sits in the warning band");
  assert.strictEqual(risk.textContent.trim(), "17% vắng", "rounded to the nearest percent");
  assert.strictEqual(window.document.querySelector("#scheduleTab .chip.risk-danger"), null);
});

test("a class card with a detail link is itself the click target, not a separate chip", async () => {
  const { window, calls } = await boot();
  const ev = {
    title: "PRJ301", location: "DE-226", slot: "Slot 1", detailUrl: "https://fap.fpt.edu.vn/Report/ActivityDetail.aspx?id=1",
    rawDate: { year: 2026, month: 9, day: 21, startHour: 9, startMinute: 10, endHour: 11, endMinute: 30 },
  };
  window.renderClassSchedule([ev]);
  const card = window.document.querySelector("#scheduleTab .class-card");

  assert.strictEqual(card.querySelector(".chip.link"), null, "no separate Chi tiết chip");
  assert.strictEqual(card.classList.contains("class-card--clickable"), true);
  assert.strictEqual(card.getAttribute("role"), "button");
  assert.strictEqual(card.tabIndex, 0, "reachable by keyboard, like the anchor it replaces");
  assert.match(card.getAttribute("aria-label"), /PRJ301/);

  card.dispatchEvent(new window.Event("click"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(calls.tabsCreated.length, 1, "clicking anywhere on the card opens the detail page");
  assert.strictEqual(calls.tabsCreated[0].url, ev.detailUrl);
});

test("Enter and Space on a focused card also open the detail page", async () => {
  const { window, calls } = await boot();
  const ev = {
    title: "SWP391", location: "AL-R402", slot: "Slot 2", detailUrl: "https://fap.fpt.edu.vn/Report/ActivityDetail.aspx?id=2",
    rawDate: { year: 2026, month: 9, day: 22, startHour: 9, startMinute: 10, endHour: 11, endMinute: 30 },
  };
  window.renderClassSchedule([ev]);
  const card = window.document.querySelector("#scheduleTab .class-card");

  card.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(calls.tabsCreated.length, 1);

  card.dispatchEvent(new window.KeyboardEvent("keydown", { key: " " }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(calls.tabsCreated.length, 2, "Space opens it too");
});

test("a class card with no detail link is not clickable", async () => {
  const { window } = await boot();
  const ev = {
    title: "MAD101", location: "BE-102", slot: "Slot 1",
    rawDate: { year: 2026, month: 9, day: 21, startHour: 9, startMinute: 10, endHour: 11, endMinute: 30 },
  };
  window.renderClassSchedule([ev]);
  const card = window.document.querySelector("#scheduleTab .class-card");
  assert.strictEqual(card.classList.contains("class-card--clickable"), false);
  assert.strictEqual(card.hasAttribute("role"), false);
});

test("popup supports 3 tabs: schedule, exams, grades", async () => {
  const { dom } = await boot();
  const doc = dom.window.document;
  const schedBtn = doc.getElementById("scheduleTabBtn");
  const examBtn = doc.getElementById("upcomingTab");
  const gradeBtn = doc.getElementById("gradesTabBtn");
  const gradesTab = doc.getElementById("gradesTab");
  const gradeActions = doc.getElementById("gradeActions");

  assert.ok(gradeBtn, "gradesTabBtn should exist");
  assert.ok(gradesTab, "gradesTab should exist");
  assert.ok(gradeActions, "gradeActions should exist");

  gradeBtn.click();
  assert.ok(gradeBtn.classList.contains("active"));
  assert.ok(gradesTab.classList.contains("active"));
  assert.strictEqual(gradeActions.hidden, false);
});

test("renderStudentGrades renders courses, progress bar, and pass predictor with slider", async () => {
  const { dom, window } = await boot();
  const doc = dom.window.document;

  const sampleGrades = {
    PRN211: {
      courseCode: "PRN211",
      courseName: "Basic Cross-Platform Application Programming With .NET",
      term: "Summer2024",
      categories: [
        { category: "Lab 1", weight: 10, value: 8.0, items: [] },
        { category: "Progress Test 1", weight: 10, value: 7.0, items: [] },
        { category: "Assignment", weight: 20, value: 8.5, items: [] },
        { category: "Final Exam", weight: 60, value: null, items: [] }
      ],
      bonus: 0.5,
      average: null,
      status: null
    },
    SWT301: {
      courseCode: "SWT301",
      courseName: "Software Testing",
      term: "Summer2024",
      categories: [
        { category: "Assignments", weight: 60, value: 8.0, items: [] },
        { category: "Final Exam", weight: 40, value: 7.5, items: [] }
      ],
      bonus: 0,
      average: 7.8,
      status: "Passed"
    }
  };

  window.renderStudentGrades(sampleGrades);

  const cards = doc.querySelectorAll("#gradesTab .grade-card");
  assert.strictEqual(cards.length, 2, "renders 2 course cards");

  // Tab count
  const gradeBtn = doc.getElementById("gradesTabBtn");
  assert.ok(gradeBtn.textContent.includes("(2)"), "tab reflects course count");

  // First card: PRN211 (in-progress)
  const prnCard = cards[0];
  assert.ok(prnCard.querySelector(".grade-card__code").textContent.includes("PRN211"));
  assert.ok(prnCard.querySelector(".grade-badge--inprogress"), "shows in-progress badge");

  // Current score: 0.8 + 0.7 + 1.7 + 0.5 = 3.7
  assert.ok(prnCard.querySelector(".grade-summary-val").textContent.includes("3.70"));

  // Pass predictor slider
  const slider = prnCard.querySelector(".grade-slider");
  const predictResult = prnCard.querySelector(".grade-predict-result");
  assert.ok(slider, "slider exists");
  assert.ok(predictResult, "prediction result exists");

  // At target 5.0: needed = 5.0 - 3.7 = 1.3. 1.3 / 0.6 = 2.167 <= 4.0 -> minRequired = 4.0, pass_guaranteed
  assert.ok(predictResult.textContent.includes("Chắc chắn qua môn"));
  assert.ok(predictResult.classList.contains("grade-predict-result--guaranteed"));

  // Change slider to 8.0: needed = 8.0 - 3.7 = 4.3. 4.3 / 0.6 = 7.167 -> achievable (7.2)
  slider.value = "8.0";
  slider.dispatchEvent(new window.Event("input"));
  assert.ok(predictResult.textContent.includes("7.2"), "updates required score to 7.2");
  assert.ok(predictResult.classList.contains("grade-predict-result--achievable"));

  // Second card: SWT301 (passed)
  const swtCard = cards[1];
  assert.ok(swtCard.querySelector(".grade-badge--passed"), "shows passed badge");
  assert.ok(swtCard.textContent.includes("Passed") || swtCard.textContent.includes("7.8"));
});

test("theme toggle button exists and cycles through auto -> light -> dark -> auto", async () => {
  const { dom, calls } = await boot();
  const doc = dom.window.document;
  const btn = doc.getElementById("themeToggleBtn");
  assert.ok(btn, "themeToggleBtn should exist in header");

  const html = doc.documentElement;
  // Initially starts on auto
  assert.strictEqual(html.getAttribute("data-theme-preference"), "auto");

  // First click: auto -> light
  btn.click();
  assert.strictEqual(html.getAttribute("data-theme-preference"), "light");
  assert.strictEqual(html.getAttribute("data-theme"), "light");
  assert.strictEqual(btn.querySelector("use").getAttribute("href"), "#icon-sun");

  // Second click: light -> dark
  btn.click();
  assert.strictEqual(html.getAttribute("data-theme-preference"), "dark");
  assert.strictEqual(html.getAttribute("data-theme"), "dark");
  assert.strictEqual(btn.querySelector("use").getAttribute("href"), "#icon-moon");

  // Third click: dark -> auto
  btn.click();
  assert.strictEqual(html.getAttribute("data-theme-preference"), "auto");
  assert.strictEqual(btn.querySelector("use").getAttribute("href"), "#icon-theme-auto");
});

test("Today's agenda widget renders hero card at top of schedule tab and reflects ongoing/upcoming status", async () => {
  const { window, calls } = await boot();
  const doc = window.document;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // 1. An upcoming class today
  const upcomingEvent = {
    title: "PRJ301",
    location: "AL-L302",
    slot: "Slot 5",
    detailUrl: "https://fap.fpt.edu.vn/Report/ActivityDetail.aspx?id=123",
    rawDate: { year, month, day, startHour: 23, startMinute: 0, endHour: 23, endMinute: 59 },
  };

  window.renderClassSchedule([upcomingEvent]);

  const banner = doc.querySelector("#scheduleTab .agenda-banner");
  assert.ok(banner, "agenda banner is rendered");
  const card = banner.querySelector(".agenda-card");
  assert.ok(card, "agenda card exists");
  assert.ok(
    card.classList.contains("agenda-card--upcoming") ||
    card.classList.contains("agenda-card--in_progress") ||
    card.classList.contains("agenda-card--completed_today")
  );
  assert.ok(card.textContent.includes("PRJ301"));
  assert.strictEqual(card.classList.contains("agenda-card--clickable"), true);

  // Click card to open detail
  card.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(calls.tabsCreated.some((t) => t.url === upcomingEvent.detailUrl), true);

  // 2. Empty schedule yields no banner
  window.renderClassSchedule([]);
  assert.strictEqual(doc.querySelector("#scheduleTab .agenda-banner"), null, "no banner when schedule is empty");

  // 3. Exam alert appears if an exam is scheduled today
  const examDateStr = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  const exam = [{ title: "SWP391 - Final Exam", room: "BE-301", time: "14:00 - 16:00", date: examDateStr }];
  window.localStorage.setItem("examSchedule", JSON.stringify(exam));

  window.renderClassSchedule([upcomingEvent]);
  const alertEl = doc.querySelector("#scheduleTab .agenda-exam-alert");
  assert.ok(alertEl, "today exam alert is displayed");
  assert.ok(alertEl.textContent.includes("SWP391 - Final Exam"));
});

test("Export & QR sync modal opens from downloadBtn and exportBtn, renders SVG QR code and provides .ics download button", async () => {
  const { dom } = await boot();
  const doc = dom.window.document;
  const win = dom.window;

  const exportBtn = doc.getElementById("exportBtn");
  const downloadBtn = doc.getElementById("downloadBtn");
  const qrSyncModal = doc.getElementById("qrSyncModal");
  const qrSyncTitle = doc.getElementById("qrSyncTitle");
  const closeQrSyncModal = doc.getElementById("closeQrSyncModal");
  const qrDisplayCard = doc.getElementById("qrDisplayCard");
  const qrScopeContainer = doc.getElementById("qrScopeContainer");
  const modalDownloadIcsBtn = doc.getElementById("modalDownloadIcsBtn");
  const copyIcalPayloadBtn = doc.getElementById("copyIcalPayloadBtn");

  assert.ok(exportBtn, "exportBtn exists");
  assert.ok(downloadBtn, "downloadBtn exists");
  assert.ok(qrSyncModal, "qrSyncModal exists");
  assert.ok(modalDownloadIcsBtn, "modalDownloadIcsBtn exists in export modal");
  assert.ok(copyIcalPayloadBtn, "copyIcalPayloadBtn exists in export modal");
  assert.strictEqual(qrSyncModal.style.display, "none", "modal initially hidden");

  // 1. Open QR in schedule mode with sample classes
  const now = new Date();
  const sampleClass = [
    {
      title: "PRJ301",
      location: "AL-L302",
      slot: "Slot 1",
      rawDate: { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    }
  ];
  win.localStorage.setItem("classSchedule", JSON.stringify(sampleClass));

  downloadBtn.click();
  assert.strictEqual(qrSyncModal.style.display, "block", "modal opens on download button click");
  assert.strictEqual(qrSyncTitle.textContent, "Xuất lịch học");
  assert.strictEqual(qrScopeContainer.style.display, "flex", "scope selector visible for schedule");
  assert.ok(qrDisplayCard.querySelector("svg"), "SVG QR code rendered in display card");
  assert.strictEqual(modalDownloadIcsBtn.disabled, false, "download ics button is enabled when payload exists");

  // Switch scope to "today"
  const todayBtn = doc.querySelector('.qr-scope-btn[data-scope="today"]');
  assert.ok(todayBtn, "today scope button exists");
  todayBtn.click();
  assert.strictEqual(todayBtn.classList.contains("active"), true, "today button becomes active");
  assert.ok(qrDisplayCard.querySelector("svg"), "SVG updated for today scope");

  // 2. Open QR in exam mode
  const sampleExam = [
    {
      title: "PRJ301",
      tag: "FE",
      location: "AL-R402",
      start: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      end: new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString()
    }
  ];
  win.localStorage.setItem("examSchedule", JSON.stringify(sampleExam));

  exportBtn.click();
  assert.strictEqual(qrSyncTitle.textContent, "Xuất lịch thi");
  assert.strictEqual(qrScopeContainer.style.display, "none", "scope selector hidden for exam mode");
  assert.ok(qrDisplayCard.querySelector("svg"), "SVG QR code rendered for exam mode");
  assert.strictEqual(modalDownloadIcsBtn.disabled, false, "download ics button is enabled for exam mode");

  // 3. Close modal
  closeQrSyncModal.click();
  assert.strictEqual(qrSyncModal.style.display, "none", "modal closes on close button click");
});




