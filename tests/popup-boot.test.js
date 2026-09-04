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

test("no blocking alert() survives in the popup", () => {
  const src = fs.readFileSync(path.join(root, "popup.js"), "utf8");
  assert.strictEqual(/\balert\s*\(/.test(src), false, "errors go through showError/showToast");
});
