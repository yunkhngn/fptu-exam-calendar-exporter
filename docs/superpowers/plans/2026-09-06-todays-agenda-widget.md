# Today's Agenda Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai widget "Lịch trình hôm nay" (Today's Agenda Widget) hiển thị ở đầu tab Lịch học, tự động tính toán ca học đang diễn ra / ca sắp tới theo thời gian thực và cảnh báo lịch thi nếu có.

**Architecture:** Xây dựng module thuần JavaScript `lib/agenda.js` (UMD) trích xuất khoảng thời gian và phân loại trạng thái ngày hôm nay (`IN_PROGRESS`, `UPCOMING`, `COMPLETED_TODAY`, `FREE_TODAY`, `NO_DATA`); tạo giao diện Hero Card `.agenda-card` tương thích hoàn hảo với cả Light Mode và Dark Mode trong `popup.css`; tích hợp vào hàm render lịch học trong `popup.js` và `popup.html`.

**Tech Stack:** Vanilla JavaScript (ES6+), Pure Vanilla CSS (CSS Custom Properties), Chrome Extension MV3, Node.js test runner (`node:test`).

## Global Constraints

- Không dùng thư viện ngoài hay framework CSS.
- Mọi module trong `lib/` dùng định dạng UMD để chạy được cả trong Node.js (test) và trình duyệt.
- Duy trì toàn bộ 82 unit test hiện có luôn pass 100%.
- **TUYỆT ĐỐI KHÔNG** chạy lệnh `./zip-extension.sh` cho tới khi người dùng yêu cầu đóng gói.

---

### Task 1: Module tính toán Agenda (`lib/agenda.js`) và Unit Tests (`tests/agenda.test.js`)

**Files:**
- Create: `lib/agenda.js`
- Create: `tests/agenda.test.js`

**Interfaces:**
- Produces:
  - `AGENDA_STATUS: { IN_PROGRESS: 'IN_PROGRESS', UPCOMING: 'UPCOMING', COMPLETED_TODAY: 'COMPLETED_TODAY', FREE_TODAY: 'FREE_TODAY', NO_DATA: 'NO_DATA' }`
  - `getEventTimeBounds(event: object): { start: Date, end: Date } | null`
  - `isSameCalendarDay(d1: Date, d2: Date): boolean`
  - `computeTodayAgenda(options: { classEvents: Array, examEvents: Array, now?: Date }): object`
  - `formatMinutesCountdown(minutes: number): string`

- [ ] **Step 1: Viết failing test trong `tests/agenda.test.js`**

```javascript
const test = require("node:test");
const assert = require("node:assert");
const {
  AGENDA_STATUS,
  getEventTimeBounds,
  isSameCalendarDay,
  computeTodayAgenda,
  formatMinutesCountdown
} = require("../lib/agenda.js");

test("formatMinutesCountdown formats minutes into readable Vietnamese string", () => {
  assert.strictEqual(formatMinutesCountdown(15), "15 phút");
  assert.strictEqual(formatMinutesCountdown(60), "1 giờ");
  assert.strictEqual(formatMinutesCountdown(75), "1 giờ 15 phút");
  assert.strictEqual(formatMinutesCountdown(0), "ít hơn 1 phút");
});

test("isSameCalendarDay correctly matches dates ignoring time", () => {
  const d1 = new Date(2026, 8, 10, 7, 30);
  const d2 = new Date(2026, 8, 10, 15, 45);
  const d3 = new Date(2026, 8, 11, 7, 30);
  assert.strictEqual(isSameCalendarDay(d1, d2), true);
  assert.strictEqual(isSameCalendarDay(d1, d3), false);
});

test("computeTodayAgenda detects IN_PROGRESS when current time falls within class slot", () => {
  const now = new Date(2026, 8, 10, 8, 0); // 10/09/2026 08:00
  const classEvents = [
    {
      title: "PRJ301",
      location: "AL-L302",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    }
  ];

  const result = computeTodayAgenda({ classEvents, examEvents: [], now });
  assert.strictEqual(result.status, AGENDA_STATUS.IN_PROGRESS);
  assert.strictEqual(result.currentEvent.title, "PRJ301");
  assert.strictEqual(result.remainingMinutes, 60); // 8:00 -> 9:00 = 60m
});

test("computeTodayAgenda detects UPCOMING class today with countdown", () => {
  const now = new Date(2026, 8, 10, 7, 0); // 10/09/2026 07:00
  const classEvents = [
    {
      title: "SWE201",
      location: "BE-410",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    },
    {
      title: "PRJ301",
      location: "AL-L302",
      slot: "Slot 2",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 9, startMinute: 30, endHour: 11, endMinute: 50 }
    }
  ];

  const result = computeTodayAgenda({ classEvents, examEvents: [], now });
  assert.strictEqual(result.status, AGENDA_STATUS.UPCOMING);
  assert.strictEqual(result.nextEvent.title, "SWE201");
  assert.strictEqual(result.minutesUntilStart, 30); // 7:00 -> 7:30 = 30m
  assert.strictEqual(result.totalRemainingToday, 2);
});

test("computeTodayAgenda detects COMPLETED_TODAY when all classes today have ended", () => {
  const now = new Date(2026, 8, 10, 18, 0); // 10/09/2026 18:00
  const classEvents = [
    {
      title: "SWE201",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    },
    {
      title: "PRJ301",
      slot: "Slot 2",
      rawDate: { year: 2026, month: 9, day: 11, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    }
  ];

  const result = computeTodayAgenda({ classEvents, examEvents: [], now });
  assert.strictEqual(result.status, AGENDA_STATUS.COMPLETED_TODAY);
  assert.strictEqual(result.nextEvent.title, "PRJ301"); // next upcoming day
});

test("computeTodayAgenda detects FREE_TODAY when no class scheduled today", () => {
  const now = new Date(2026, 8, 10, 10, 0);
  const classEvents = [
    {
      title: "PRJ301",
      slot: "Slot 2",
      rawDate: { year: 2026, month: 9, day: 12, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    }
  ];

  const result = computeTodayAgenda({ classEvents, examEvents: [], now });
  assert.strictEqual(result.status, AGENDA_STATUS.FREE_TODAY);
});

test("computeTodayAgenda includes today's exam alert if present", () => {
  const now = new Date(2026, 8, 10, 8, 0);
  const examEvents = [
    {
      title: "PRJ301 - PE",
      room: "AL-R402",
      time: "13:30 - 15:00",
      date: "10/09/2026",
      start: "2026-09-10T13:30:00"
    }
  ];

  const result = computeTodayAgenda({ classEvents: [], examEvents, now });
  assert.strictEqual(result.todayExams.length, 1);
  assert.strictEqual(result.todayExams[0].title, "PRJ301 - PE");
});
```

- [ ] **Step 2: Chạy test để xác nhận test fail do chưa có module**

Run: `node --test tests/agenda.test.js`  
Expected: FAIL (Cannot find module '../lib/agenda.js')

- [ ] **Step 3: Viết module `lib/agenda.js` (UMD)**

```javascript
(function (root, factory) {
  const api = factory();
  Object.assign(root, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const AGENDA_STATUS = {
    IN_PROGRESS: "IN_PROGRESS",
    UPCOMING: "UPCOMING",
    COMPLETED_TODAY: "COMPLETED_TODAY",
    FREE_TODAY: "FREE_TODAY",
    NO_DATA: "NO_DATA"
  };

  function getEventTimeBounds(event) {
    if (!event) return null;
    if (event.rawDate) {
      const rd = event.rawDate;
      const start = new Date(rd.year, (rd.month || 1) - 1, rd.day || 1, rd.startHour || 0, rd.startMinute || 0, 0);
      const end = new Date(rd.year, (rd.month || 1) - 1, rd.day || 1, rd.endHour || 0, rd.endMinute || 0, 0);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return { start, end };
      }
    }
    if (event.start) {
      const start = typeof event.start === "string" ? new Date(event.start) : event.start;
      let end = event.end ? (typeof event.end === "string" ? new Date(event.end) : event.end) : null;
      if (!end || isNaN(end.getTime())) {
        end = new Date(start.getTime() + 90 * 60 * 1000); // 90 min fallback
      }
      if (!isNaN(start.getTime())) {
        return { start, end };
      }
    }
    return null;
  }

  function isSameCalendarDay(d1, d2) {
    if (!d1 || !d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  function formatMinutesCountdown(minutes) {
    if (minutes <= 0) return "ít hơn 1 phút";
    if (minutes < 60) return `${minutes} phút`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`;
  }

  function computeTodayAgenda(options) {
    const { classEvents = [], examEvents = [], now = new Date() } = options || {};

    // 1. Identify today's exams
    const todayExams = examEvents.filter((exam) => {
      const bounds = getEventTimeBounds(exam);
      if (bounds && isSameCalendarDay(bounds.start, now)) return true;
      if (exam.date) {
        const parts = exam.date.split("/");
        if (parts.length === 3) {
          const examDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          return isSameCalendarDay(examDate, now);
        }
      }
      return false;
    });

    if (!classEvents || classEvents.length === 0) {
      return {
        status: AGENDA_STATUS.NO_DATA,
        currentEvent: null,
        nextEvent: null,
        remainingMinutes: null,
        minutesUntilStart: null,
        totalRemainingToday: 0,
        todayExams
      };
    }

    // 2. Extract valid class events with bounds and sort chronologically
    const mapped = classEvents
      .map((ev) => ({ event: ev, bounds: getEventTimeBounds(ev) }))
      .filter((item) => item.bounds !== null)
      .sort((a, b) => a.bounds.start.getTime() - b.bounds.start.getTime());

    // 3. Separate today's classes
    const todayClasses = mapped.filter((item) => isSameCalendarDay(item.bounds.start, now));

    if (todayClasses.length === 0) {
      // Free today - find next upcoming class in the future
      const futureClasses = mapped.filter((item) => item.bounds.start.getTime() > now.getTime());
      const nextEvent = futureClasses.length > 0 ? futureClasses[0].event : null;
      return {
        status: AGENDA_STATUS.FREE_TODAY,
        currentEvent: null,
        nextEvent,
        remainingMinutes: null,
        minutesUntilStart: null,
        totalRemainingToday: 0,
        todayExams
      };
    }

    // 4. Check if currently in progress
    const inProgress = todayClasses.find((item) => item.bounds.start <= now && now <= item.bounds.end);
    if (inProgress) {
      const remainingMs = inProgress.bounds.end.getTime() - now.getTime();
      const remainingMinutes = Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
      return {
        status: AGENDA_STATUS.IN_PROGRESS,
        currentEvent: inProgress.event,
        nextEvent: null,
        remainingMinutes,
        minutesUntilStart: null,
        totalRemainingToday: todayClasses.filter((item) => item.bounds.start > now).length,
        todayExams
      };
    }

    // 5. Check upcoming classes today
    const upcomingToday = todayClasses.filter((item) => item.bounds.start > now);
    if (upcomingToday.length > 0) {
      const nextItem = upcomingToday[0];
      const diffMs = nextItem.bounds.start.getTime() - now.getTime();
      const minutesUntilStart = Math.max(0, Math.ceil(diffMs / (60 * 1000)));
      return {
        status: AGENDA_STATUS.UPCOMING,
        currentEvent: null,
        nextEvent: nextItem.event,
        remainingMinutes: null,
        minutesUntilStart,
        totalRemainingToday: upcomingToday.length,
        todayExams
      };
    }

    // 6. Completed all classes today
    const futureClasses = mapped.filter((item) => item.bounds.start.getTime() > now.getTime());
    const nextDayEvent = futureClasses.length > 0 ? futureClasses[0].event : null;
    return {
      status: AGENDA_STATUS.COMPLETED_TODAY,
      currentEvent: null,
      nextEvent: nextDayEvent,
      remainingMinutes: null,
      minutesUntilStart: null,
      totalRemainingToday: 0,
      todayExams
    };
  }

  return {
    AGENDA_STATUS,
    getEventTimeBounds,
    isSameCalendarDay,
    computeTodayAgenda,
    formatMinutesCountdown
  };
});
```

- [ ] **Step 4: Chạy toàn bộ unit test**

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/agenda.js tests/agenda.test.js
git commit -m "feat: add agenda calculation engine and unit tests"
```

---

### Task 2: Giao diện & CSS Styling cho Today's Agenda Widget (`popup.css`)

**Files:**
- Modify: `popup.css`

**Interfaces:**
- Produces: CSS classes `.agenda-banner`, `.agenda-card`, `.agenda-card--*`, `.agenda-dot`, `.agenda-exam-alert`

- [ ] **Step 1: Định nghĩa base styles cho Agenda Widget**

```css
.agenda-banner {
  margin-bottom: 12px;
}

.agenda-card {
  position: relative;
  background: var(--bg-elevated);
  border-radius: 14px;
  padding: 13px 15px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  cursor: default;
}

.agenda-card--clickable {
  cursor: pointer;
}

.agenda-card--clickable:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
  border-color: var(--accent);
}

.agenda-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agenda-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.agenda-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.agenda-dot--pulse {
  animation: agenda-pulse 2s infinite;
}

@keyframes agenda-pulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 6px currentColor; }
  100% { transform: scale(0.95); opacity: 0.8; }
}

.agenda-counter {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}

.agenda-title {
  font-size: 16px;
  font-weight: 750;
  color: var(--text);
  line-height: 1.2;
}

.agenda-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
  flex-wrap: wrap;
}

.agenda-meta strong {
  color: var(--text);
}

/* Agenda Status variants */
.agenda-card--in_progress {
  background: linear-gradient(135deg, #ecfdf5 0%, #f8fafc 100%);
  border-color: #a7f3d0;
}
.agenda-card--in_progress .agenda-badge {
  background: #d1fae5;
  color: #065f46;
}

.agenda-card--upcoming {
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
  border-color: #bfdbfe;
}
.agenda-card--upcoming .agenda-badge {
  background: #dbeafe;
  color: #1e40af;
}

.agenda-card--completed_today,
.agenda-card--free_today {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-color: var(--border-strong);
}
.agenda-card--completed_today .agenda-badge,
.agenda-card--free_today .agenda-badge {
  background: var(--bg-subtle);
  color: var(--text-muted);
}

/* Today exam alert sub-row */
.agenda-exam-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #c2410c;
  font-size: 12px;
  font-weight: 600;
  margin-top: 4px;
}
```

- [ ] **Step 2: Bổ sung Dark Mode styling cho `.agenda-card`**

```css
[data-theme="dark"] .agenda-card {
  background: var(--bg-elevated);
  border-color: var(--border);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}

[data-theme="dark"] .agenda-card--in_progress {
  background: linear-gradient(135deg, rgba(6, 78, 59, 0.35) 0%, #1e293b 100%);
  border-color: rgba(52, 211, 153, 0.4);
}
[data-theme="dark"] .agenda-card--in_progress .agenda-badge {
  background: rgba(16, 185, 129, 0.2);
  color: #6ee7b7;
}

[data-theme="dark"] .agenda-card--upcoming {
  background: linear-gradient(135deg, rgba(30, 58, 138, 0.35) 0%, #1e293b 100%);
  border-color: rgba(96, 165, 250, 0.4);
}
[data-theme="dark"] .agenda-card--upcoming .agenda-badge {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
}

[data-theme="dark"] .agenda-card--completed_today,
[data-theme="dark"] .agenda-card--free_today {
  background: linear-gradient(135deg, #1e293b 0%, #162032 100%);
  border-color: var(--border);
}
[data-theme="dark"] .agenda-card--completed_today .agenda-badge,
[data-theme="dark"] .agenda-card--free_today .agenda-badge {
  background: rgba(100, 116, 139, 0.25);
  color: #cbd5e1;
}

[data-theme="dark"] .agenda-exam-alert {
  background: rgba(234, 88, 12, 0.2);
  border-color: rgba(251, 146, 60, 0.35);
  color: #fdba74;
}
```

- [ ] **Step 3: Chạy test kiểm tra toàn bộ suite**

Run: `npm test`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add popup.css
git commit -m "feat: add agenda widget css styles for light and dark mode"
```

---

### Task 3: Tích hợp Agenda Widget vào `popup.html` và `popup.js`

**Files:**
- Modify: `popup.html`
- Modify: `popup.js`

**Interfaces:**
- Consumes: `lib/agenda.js` (`computeTodayAgenda`, `AGENDA_STATUS`, `formatMinutesCountdown`)
- Produces: Dynamic DOM element `.agenda-banner` at the top of `#scheduleTab`

- [ ] **Step 1: Thêm script `lib/agenda.js` vào `popup.html`**

```html
  <script src="lib/agenda.js"></script>
```
Đặt trước `study-suggestions.js` và `popup.js`.

- [ ] **Step 2: Viết hàm render Agenda Widget trong `popup.js`**

```javascript
function renderTodayAgendaBanner(schedule, examEvents = []) {
  if (typeof computeTodayAgenda !== "function") return "";
  const agenda = computeTodayAgenda({ classEvents: schedule, examEvents, now: new Date() });
  if (agenda.status === AGENDA_STATUS.NO_DATA) return "";

  let badgeHtml = "";
  let titleHtml = "";
  let metaHtml = "";
  let counterHtml = "";
  let clickableClass = "";
  let targetUrl = "";

  if (agenda.status === AGENDA_STATUS.IN_PROGRESS && agenda.currentEvent) {
    const ev = agenda.currentEvent;
    badgeHtml = `<span class="agenda-dot agenda-dot--pulse"></span><span>Đang diễn ra • Còn ${formatMinutesCountdown(agenda.remainingMinutes)}</span>`;
    titleHtml = `${ev.title || "Buổi học"}`;
    metaHtml = `<span>${ev.slot || ""}</span><span>·</span><strong>${ev.isOnline ? "Học Online" : (ev.location || "Chưa rõ phòng")}</strong>`;
    if (agenda.totalRemainingToday > 0) {
      counterHtml = `Hôm nay còn ${agenda.totalRemainingToday} ca`;
    }
    if (ev.detailUrl) {
      clickableClass = "agenda-card--clickable";
      targetUrl = ev.detailUrl;
    }
  } else if (agenda.status === AGENDA_STATUS.UPCOMING && agenda.nextEvent) {
    const ev = agenda.nextEvent;
    badgeHtml = `<span class="agenda-dot"></span><span>Ca tiếp theo • Bắt đầu sau ${formatMinutesCountdown(agenda.minutesUntilStart)}</span>`;
    titleHtml = `${ev.title || "Buổi học"}`;
    metaHtml = `<span>${ev.slot || ""}</span><span>·</span><strong>${ev.isOnline ? "Học Online" : (ev.location || "Chưa rõ phòng")}</strong>`;
    counterHtml = `Hôm nay còn ${agenda.totalRemainingToday} ca`;
    if (ev.detailUrl) {
      clickableClass = "agenda-card--clickable";
      targetUrl = ev.detailUrl;
    }
  } else if (agenda.status === AGENDA_STATUS.COMPLETED_TODAY) {
    badgeHtml = `<span>✅ Đã xong lịch học hôm nay</span>`;
    titleHtml = "Nghỉ ngơi thôi!";
    if (agenda.nextEvent) {
      const rd = agenda.nextEvent.rawDate;
      const dateStr = rd ? `${rd.day}/${rd.month}` : "ngày tiếp theo";
      metaHtml = `<span>Ca tiếp theo: <strong>${agenda.nextEvent.title}</strong> (${dateStr} • ${agenda.nextEvent.slot || ""})</span>`;
    } else {
      metaHtml = `<span>Bạn không còn ca học nào trong tuần này.</span>`;
    }
  } else if (agenda.status === AGENDA_STATUS.FREE_TODAY) {
    badgeHtml = `<span>🎉 Hôm nay được nghỉ!</span>`;
    titleHtml = "Không có ca học nào hôm nay";
    if (agenda.nextEvent) {
      const rd = agenda.nextEvent.rawDate;
      const dateStr = rd ? `${rd.day}/${rd.month}` : "sắp tới";
      metaHtml = `<span>Ca học gần nhất: <strong>${agenda.nextEvent.title}</strong> (${dateStr} • ${agenda.nextEvent.slot || ""})</span>`;
    } else {
      metaHtml = `<span>Tận hưởng ngày nghỉ của bạn nhé!</span>`;
    }
  }

  let examAlertHtml = "";
  if (agenda.todayExams && agenda.todayExams.length > 0) {
    const exam = agenda.todayExams[0];
    examAlertHtml = `
      <div class="agenda-exam-alert">
        <svg class="icon" aria-hidden="true" style="width:14px;height:14px;flex-shrink:0;"><use href="#icon-clipboard"/></svg>
        <span>Lịch thi hôm nay: <strong>${exam.title}</strong> (${exam.time || ""} • ${exam.room || ""})</span>
      </div>
    `;
  }

  return `
    <div class="agenda-banner">
      <div class="agenda-card agenda-card--${agenda.status.toLowerCase()} ${clickableClass}" ${targetUrl ? `data-url="${targetUrl}"` : ""}>
        <div class="agenda-card__header">
          <div class="agenda-badge">${badgeHtml}</div>
          ${counterHtml ? `<span class="agenda-counter">${counterHtml}</span>` : ""}
        </div>
        <div class="agenda-card__body">
          <div class="agenda-title">${titleHtml}</div>
          <div class="agenda-meta">${metaHtml}</div>
        </div>
        ${examAlertHtml}
      </div>
    </div>
  `;
}
```

- [ ] **Step 3: Chèn Agenda Banner vào đầu `renderClassSchedule` trong `popup.js`**

Trong `renderClassSchedule(schedule)`:
Chèn html của `renderTodayAgendaBanner` ngay trước danh sách thẻ lớp học. Nếu có `data-url`, gắn sự kiện mở FAP.

- [ ] **Step 4: Chạy test kiểm tra toàn bộ suite**

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: render today agenda banner in popup schedule tab"
```

---

### Task 4: Kiểm thử Boot & Tích hợp DOM (`tests/popup-boot.test.js`)

**Files:**
- Modify: `tests/popup-boot.test.js`

- [ ] **Step 1: Thêm integration test cho Agenda banner trong `tests/popup-boot.test.js`**

Kiểm tra:
- `computeTodayAgenda` có sẵn trên window.
- Gọi `renderClassSchedule` với dữ liệu hôm nay sinh ra `.agenda-card`.

- [ ] **Step 2: Chạy toàn bộ test suite**

Run: `npm test`  
Expected: PASS (Tất cả bài test đều pass 100%)

- [ ] **Step 3: Commit**

```bash
git add tests/popup-boot.test.js
git commit -m "test: add agenda integration test in popup-boot"
```

---

### Task 5: Xác minh tổng thể (Final Verification)

- [ ] **Step 1: Chạy toàn bộ unit test**
Run: `npm test`  
Expected: PASS 100%

- [ ] **Step 2: Kiểm tra Git status sạch sẽ**
Run: `git status`  
Expected: Clean working tree

*(Nhắc nhở: Không chạy lệnh `./zip-extension.sh`)*
