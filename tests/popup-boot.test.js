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
                    "classScheduleDedupeKey", "mergeNewClassEventsInto"]) {
    assert.strictEqual(typeof window[fn], "function", `${fn} is available to popup.js`);
  }

  assert.ok(window.document.querySelector(".tab-bar"), "sticky tab bar exists");
  assert.ok(window.document.getElementById("scheduleTab"), "schedule pane exists");
  assert.strictEqual(window.document.querySelectorAll(".tab-btn").length, 2);
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
  assert.ok(online.querySelector(".chip.room"), "the room chip stays even though the class is online");
  assert.strictEqual(offline.querySelector(".chip.online"), null, "PRJ301 gets no Online chip");

  const badges = online.querySelector(".class-card__badges");
  assert.ok(badges, "Online and the attendance status share a header badge group");
  const badgeChips = [...badges.children];
  assert.strictEqual(badgeChips[0].className.includes("online"), true, "Online sits to the left of attendance");
  assert.strictEqual(badgeChips[1].className.includes("attendance"), true, "attendance status sits to its right");
  assert.strictEqual(online.querySelector(".class-tags .chip.online"), null, "Online no longer duplicated in the tag row");
});
