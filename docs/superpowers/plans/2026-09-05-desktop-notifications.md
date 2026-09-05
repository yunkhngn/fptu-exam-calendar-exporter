# Desktop Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide desktop notifications for upcoming classes and exams via Chrome Alarms and Notifications APIs, with a user settings modal in the extension popup.

**Architecture:** A standalone UMD module `lib/notifications.js` computes alarm trigger timestamps and notification messages from timetable datasets. `background.js` manages `chrome.alarms` and `chrome.notifications`, waking up on alarms and dispatching clicks to FAP tabs. `popup.html/js/css` adds a bell button and settings modal to toggle schedules and offsets.

**Tech Stack:** JavaScript (ES6+), Manifest V3 Service Worker, Chrome Alarms API, Chrome Notifications API, `node:test` + `jsdom`.

## Global Constraints

- Must work in Manifest V3 without build steps (vanilla JS, UMD exports for Node tests & browser).
- Must avoid runtime errors if `chrome.alarms` or `chrome.notifications` is unavailable in stubs.
- Alarms must only be created for future events within 30 days. Max alarms capped to avoid Chrome quota limits.
- `popup.html` must load `lib/notifications.js` before `popup.js`.
- `zip-extension.sh` must package `lib/notifications.js`.

---

### Task 1: Notifications Domain Model (`lib/notifications.js`) & Tests

**Files:**
- Create: `lib/notifications.js`
- Create: `tests/notifications.test.js`

**Interfaces:**
- Produces:
  - `DEFAULT_NOTIFICATION_SETTINGS`: `{ enabled: boolean, class: { enabled: boolean, offset15: boolean, offset30: boolean }, exam: { enabled: boolean, offset1Day: boolean, offset1Hour: boolean } }`
  - `buildClassAlarmItems(classEvents, settings, now)`: Returns array of `{ id, name, when, type: 'class', title, message, url }`
  - `buildExamAlarmItems(examEvents, settings, now)`: Returns array of `{ id, name, when, type: 'exam', title, message, url }`
  - `parseAlarmName(alarmName)`: `{ type, id, offsetMinutes }` or `null`
  - `formatNotificationDetails(item)`: `{ title: string, message: string, iconUrl: string }`

- [ ] **Step 1: Write failing tests for notifications domain model**

```javascript
// tests/notifications.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/notifications.test.js`
Expected: FAIL with "Cannot find module '../lib/notifications.js'"

- [ ] **Step 3: Implement `lib/notifications.js`**

```javascript
// lib/notifications.js
(function (root, factory) {
  const api = factory();
  Object.assign(root, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_NOTIFICATION_SETTINGS = {
    enabled: true,
    class: {
      enabled: true,
      offset15: true,
      offset30: false
    },
    exam: {
      enabled: true,
      offset1Day: true,
      offset1Hour: true
    }
  };

  const MAX_FUTURE_DAYS = 30;

  function parseAlarmName(name) {
    if (!name || typeof name !== "string" || !name.startsWith("fptu:")) return null;
    const parts = name.split(":");
    if (parts.length < 4) return null;
    const [, type, id, offsetStr] = parts;
    const offsetMinutes = parseInt(offsetStr, 10);
    if (isNaN(offsetMinutes)) return null;
    return { type, id, offsetMinutes };
  }

  function serializeAlarmName(type, id, offsetMinutes) {
    return `fptu:${type}:${id}:${offsetMinutes}`;
  }

  function getClassEventStartTime(event) {
    if (event.rawDate) {
      const rd = event.rawDate;
      const d = new Date(rd.year, rd.month - 1, rd.day, rd.startHour, rd.startMinute, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }
    if (event.start) {
      const d = new Date(event.start);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function getExamEventStartTime(event) {
    if (event.start) {
      const d = new Date(event.start);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function buildClassAlarmItems(classEvents, settings, now = new Date()) {
    if (!settings || !settings.enabled || !settings.class || !settings.class.enabled) {
      return [];
    }
    if (!Array.isArray(classEvents)) return [];

    const nowMs = now.getTime();
    const maxFutureMs = nowMs + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000;
    const offsets = [];
    if (settings.class.offset15) offsets.push(15);
    if (settings.class.offset30) offsets.push(30);
    if (offsets.length === 0) return [];

    const items = [];

    for (const event of classEvents) {
      const start = getClassEventStartTime(event);
      if (!start) continue;
      const startMs = start.getTime();
      if (startMs < nowMs || startMs > maxFutureMs) continue;

      const timeRange = (event.rawDate && event.rawDate.timeRange) || "";
      const baseId = `${event.title || "class"}-${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, "0")}${String(start.getDate()).padStart(2, "0")}-${String(start.getHours()).padStart(2, "0")}${String(start.getMinutes()).padStart(2, "0")}`;

      for (const offset of offsets) {
        const when = startMs - offset * 60 * 1000;
        if (when <= nowMs) continue;

        items.push({
          id: baseId,
          name: serializeAlarmName("class", baseId, offset),
          when,
          offsetMinutes: offset,
          type: "class",
          title: event.title || "Môn học",
          location: event.location || "",
          slot: event.slot || "",
          timeRange,
          url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx"
        });
      }
    }

    return items;
  }

  function buildExamAlarmItems(examEvents, settings, now = new Date()) {
    if (!settings || !settings.enabled || !settings.exam || !settings.exam.enabled) {
      return [];
    }
    if (!Array.isArray(examEvents)) return [];

    const nowMs = now.getTime();
    const maxFutureMs = nowMs + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000;
    const offsets = [];
    if (settings.exam.offset1Day) offsets.push(1440);
    if (settings.exam.offset1Hour) offsets.push(60);
    if (offsets.length === 0) return [];

    const items = [];

    for (const event of examEvents) {
      const start = getExamEventStartTime(event);
      if (!start) continue;
      const startMs = start.getTime();
      if (startMs < nowMs || startMs > maxFutureMs) continue;

      const timeText = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
      const baseId = `${event.title || "exam"}-${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, "0")}${String(start.getDate()).padStart(2, "0")}-${String(start.getHours()).padStart(2, "0")}${String(start.getMinutes()).padStart(2, "0")}`;

      for (const offset of offsets) {
        const when = startMs - offset * 60 * 1000;
        if (when <= nowMs) continue;

        items.push({
          id: baseId,
          name: serializeAlarmName("exam", baseId, offset),
          when,
          offsetMinutes: offset,
          type: "exam",
          title: event.title || "Kỳ thi",
          location: event.location || "",
          tag: event.tag || "",
          timeText,
          url: "https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx"
        });
      }
    }

    return items;
  }

  function formatNotificationDetails(item) {
    if (!item) return { title: "FPTU Schedule", message: "", iconUrl: "icon-128.png" };

    if (item.type === "class") {
      const slotText = item.slot ? ` - ${item.slot}` : "";
      const timeText = item.timeRange ? ` (${item.timeRange})` : "";
      const title = `[FPTU Lịch học] ${item.title}${slotText}${timeText}`;
      const locText = item.location ? ` tại phòng ${item.location}` : "";
      const message = `Sắp đến giờ học${locText} (sau ${item.offsetMinutes} phút).`;
      return { title, message, iconUrl: "icon-128.png" };
    }

    if (item.type === "exam") {
      const tagText = item.tag ? ` (${item.tag})` : "";
      const title = `[FPTU Lịch thi] ${item.title}${tagText}`;
      const locText = item.location ? ` tại phòng ${item.location}` : "";
      let timeDesc = `lúc ${item.timeText || ""}`;
      if (item.offsetMinutes === 1440) {
        timeDesc = `ngày mai ${timeDesc}`;
      } else {
        timeDesc = `trong 1 giờ nữa (${timeDesc})`;
      }
      const message = `Lịch thi ${timeDesc}${locText}. Nhấp để xem FAP.`;
      return { title, message, iconUrl: "icon-128.png" };
    }

    return {
      title: "FPTU Schedule",
      message: item.message || "Bạn có lịch mới từ FPTU Schedule.",
      iconUrl: "icon-128.png"
    };
  }

  return {
    DEFAULT_NOTIFICATION_SETTINGS,
    parseAlarmName,
    serializeAlarmName,
    buildClassAlarmItems,
    buildExamAlarmItems,
    formatNotificationDetails
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/notifications.test.js`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notifications.js tests/notifications.test.js
git commit -m "feat(notifications): add notification domain model and tests"
```

---

### Task 2: Service Worker Alarms & Notifications Integration (`background.js`) + `manifest.json`

**Files:**
- Modify: `manifest.json:6-10`
- Modify: `background.js`
- Test: `tests/notifications.test.js`

**Interfaces:**
- Consumes:
  - `buildClassAlarmItems`, `buildExamAlarmItems`, `parseAlarmName`, `formatNotificationDetails` from `lib/notifications.js`
  - `chrome.storage.local`: keys `classSchedule`, `examSchedule`, `notificationSettings`, `activeAlarmsMetadata`
- Produces:
  - Message handler for `{ type: "RESCHEDULE_ALARMS" }`
  - Message handler for `{ type: "TEST_NOTIFICATION" }`
  - Listener `chrome.alarms.onAlarm`
  - Listener `chrome.notifications.onClicked`

- [ ] **Step 1: Update `manifest.json` with permissions**

Add `"alarms"` and `"notifications"` to `manifest.json` `permissions` array:
```json
  "permissions": [
    "scripting",
    "tabs",
    "storage",
    "alarms",
    "notifications"
  ],
```

- [ ] **Step 2: Add alarm and notification scheduling logic to `background.js`**

In `background.js`:
- Wrap `importScripts("lib/notifications.js")` in try/catch next to `importScripts("lib/schedule.js")`.
- Implement `rescheduleAllAlarms()`:
  - Reads `classSchedule`, `examSchedule`, `notificationSettings` from `chrome.storage.local`.
  - Calculates class alarms and exam alarms.
  - Clears existing alarms with prefix `fptu:` (or `chrome.alarms.clearAll()`).
  - Creates alarms via `chrome.alarms.create(item.name, { when: item.when })`.
  - Stores metadata map `activeAlarmsMetadata[item.name] = item` in storage so `onAlarm` can format the notification with full details.
- Add `chrome.alarms.onAlarm` listener:
  - If alarm name starts with `fptu:`, look up item in metadata or fallback to `parseAlarmName`.
  - Call `chrome.notifications.create(alarm.name, { type: "basic", iconUrl, title, message, priority: 2 })`.
- Add `chrome.notifications.onClicked` listener:
  - If notification starts with `fptu:class:`, find/open `https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx`.
  - If notification starts with `fptu:exam:`, find/open `https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx`.
  - Clear notification via `chrome.notifications.clear(notificationId)`.
- Handle runtime messages `RESCHEDULE_ALARMS` and `TEST_NOTIFICATION`:
  - `RESCHEDULE_ALARMS`: triggers `rescheduleAllAlarms()`.
  - `TEST_NOTIFICATION`: calls `chrome.notifications.create` immediately with a test notification.
- In `runWeekRangeSync` `finish()` function: call `rescheduleAllAlarms()` after updating `classSchedule`.

- [ ] **Step 3: Run existing test suite to ensure no regressions**

Run: `npm test`
Expected: PASS 40/40 tests

- [ ] **Step 4: Commit**

```bash
git add manifest.json background.js
git commit -m "feat(background): wire chrome alarms and notifications in service worker"
```

---

### Task 3: Notification Settings Modal UI & Logic (`popup.html`, `popup.css`, `popup.js`)

**Files:**
- Modify: `popup.html`
- Modify: `popup.css`
- Modify: `popup.js`
- Modify: `tests/popup-boot.test.js`

**Interfaces:**
- Consumes:
  - `DEFAULT_NOTIFICATION_SETTINGS` from `lib/notifications.js`
  - `chrome.storage.local`: `notificationSettings`
- Produces:
  - Button `#notificationBtn` in header
  - Modal `#notificationModal`
  - Mirrored `examSchedule` in `chrome.storage.local` to allow background scheduling

- [ ] **Step 1: Write tests in `tests/popup-boot.test.js` for notification modal**

Add subtests in `tests/popup-boot.test.js`:
```javascript
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
  assert.ok(doc.getElementById("notifMasterToggle"));
  assert.ok(doc.getElementById("notifClassEnabled"));
  assert.ok(doc.getElementById("notifClass15"));
  assert.ok(doc.getElementById("notifClass30"));
  assert.ok(doc.getElementById("notifExamEnabled"));
  assert.ok(doc.getElementById("notifExam1Day"));
  assert.ok(doc.getElementById("notifExam1Hour"));
  assert.ok(doc.getElementById("testNotificationBtn"));
  assert.ok(doc.getElementById("saveNotificationBtn"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/popup-boot.test.js`
Expected: FAIL with "notificationBtn should exist"

- [ ] **Step 3: Update `popup.html`**

1. In the SVG sprite `<svg class="icon-sprite">`, add `#icon-bell`:
```html
    <symbol id="icon-bell" viewBox="0 0 24 24">
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
    </symbol>
```
2. In `<header class="popup-header">`, add a button next to `.popup-header__brand`:
```html
      <button type="button" id="notificationBtn" class="header-icon-btn" title="Cài đặt thông báo" aria-label="Cài đặt thông báo">
        <svg class="icon" aria-hidden="true"><use href="#icon-bell"/></svg>
      </button>
```
3. Add modal `#notificationModal` right before `popup-footer`:
```html
    <div id="notificationModal" class="modal" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="notificationModalTitle">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="notificationModalTitle">Cài đặt thông báo</h3>
          <button type="button" id="closeNotificationModal" class="close-btn" aria-label="Đóng">
            <svg class="icon" aria-hidden="true"><use href="#icon-x"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="notif-section">
            <label class="notif-switch-label">
              <input type="checkbox" id="notifMasterToggle" checked>
              <span class="notif-switch-text"><strong>Bật thông báo trên màn hình</strong></span>
            </label>
          </div>

          <fieldset class="notif-fieldset" id="notifClassGroup">
            <legend class="notif-legend">
              <label><input type="checkbox" id="notifClassEnabled" checked> Nhắc nhở Lịch học</label>
            </legend>
            <div class="notif-sub-options">
              <label class="filter-item"><input type="checkbox" id="notifClass15" checked> <span>Trước 15 phút</span></label>
              <label class="filter-item"><input type="checkbox" id="notifClass30"> <span>Trước 30 phút</span></label>
            </div>
          </fieldset>

          <fieldset class="notif-fieldset" id="notifExamGroup">
            <legend class="notif-legend">
              <label><input type="checkbox" id="notifExamEnabled" checked> Nhắc nhở Lịch thi</label>
            </legend>
            <div class="notif-sub-options">
              <label class="filter-item"><input type="checkbox" id="notifExam1Day" checked> <span>Trước 1 ngày</span></label>
              <label class="filter-item"><input type="checkbox" id="notifExam1Hour" checked> <span>Trước 1 tiếng</span></label>
            </div>
          </fieldset>

          <div class="notif-test-row">
            <button type="button" id="testNotificationBtn" class="filter-btn">Thử thông báo</button>
          </div>

          <div class="filter-actions">
            <button type="button" id="saveNotificationBtn" class="filter-btn apply-btn">Lưu &amp; Áp dụng</button>
          </div>
        </div>
      </div>
    </div>
```
4. Add script tag `<script src="lib/notifications.js"></script>` before `popup.js`.

- [ ] **Step 4: Update `popup.css`**

Add styling for header icon button and notification modal controls:
```css
.header-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.header-icon-btn:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
  border-color: var(--border-hover);
}
.notif-section {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 12px;
}
.notif-fieldset {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-bottom: 12px;
}
.notif-legend {
  font-weight: 600;
  padding: 0 4px;
}
.notif-sub-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  padding-left: 8px;
}
.notif-test-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
```

- [ ] **Step 5: Wire modal logic and storage mirroring in `popup.js`**

1. Add helper `mirrorExamScheduleToStorage(events)`:
```javascript
function mirrorExamScheduleToStorage(events) {
  const loc = getChromeStorageLocal();
  if (!loc) return;
  try {
    loc.set({ examSchedule: JSON.stringify(events) }, () => {
      chrome.runtime.sendMessage({ type: "RESCHEDULE_ALARMS" }).catch(() => {});
    });
  } catch (_) {}
}
```
2. When exam schedule is fetched in `renderExamList` or `autoSyncSchedule`, mirror to storage.
3. Wire notification modal open/close, load settings from `chrome.storage.local.get(["notificationSettings"])`, populate checkboxes.
4. Save settings on `saveNotificationBtn` click -> `loc.set({ notificationSettings: current })` -> notify background `RESCHEDULE_ALARMS` -> `showToast("Đã lưu cài đặt thông báo!")`.
5. Wire `testNotificationBtn`: sends message `{ type: "TEST_NOTIFICATION" }` to runtime -> `showToast("Đã gửi thông báo thử nghiệm!")`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add popup.html popup.css popup.js tests/popup-boot.test.js
git commit -m "feat(popup): add notification settings modal and header button"
```

---

### Task 4: Packaging Update & Final Verification

**Files:**
- Modify: `zip-extension.sh`
- Test: `npm test`, `./zip-extension.sh`

- [ ] **Step 1: Update `zip-extension.sh` to package `lib/notifications.js`**

Modify line 8 of `zip-extension.sh`:
```bash
zip -r fptu-schedule.zip manifest.json background.js popup.html popup.js popup.css content.js lib/schedule.js lib/ics.js lib/notifications.js study-sources.json study-suggestions.js icon-16.png icon-48.png icon-128.png -x "*.DS_Store" "*.git*"
```

- [ ] **Step 2: Run test suite**

Run: `npm test`
Expected: PASS all test files

- [ ] **Step 3: Run package script and inspect zip**

Run: `./zip-extension.sh && unzip -l fptu-schedule.zip`
Expected: `fptu-schedule.zip` created containing `lib/notifications.js`

- [ ] **Step 4: Commit**

```bash
git add zip-extension.sh
git commit -m "chore: include lib/notifications.js in extension zip package"
```
