# Phone Sync via QR Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai tính năng quét mã QR đồng bộ trực tiếp lịch học & lịch thi sang điện thoại (iPhone / Android), tự động kích hoạt trình thêm sự kiện vào Apple Calendar hoặc Google Calendar, 100% offline không cần server.

**Architecture:** Tạo module thuần JS `lib/qrcode.js` (UMD) sinh mã QR chuẩn ISO/IEC 18004 dưới dạng chuỗi SVG vector và sinh payload iCalendar 2.0 rút gọn; bổ sung modal `#qrSyncModal` cùng các nút kích hoạt `#qrExamBtn` và `#qrScheduleBtn` trong `popup.html`; viết styling tương thích Dark/Light mode trong `popup.css`; tích hợp xử lý sự kiện trong `popup.js` và kiểm thử toàn diện với `node:test`.

**Tech Stack:** Vanilla JavaScript (ES6+, UMD pattern), Pure Vanilla CSS (CSS Custom Properties), Chrome Extension MV3, Node.js test runner (`node:test`).

## Global Constraints

- Không dùng bất kỳ thư viện npm runtime ngoài hay framework CSS nào.
- Mọi module trong `lib/` tuân thủ định dạng UMD để chạy tốt cả trong Node.js (test) và trình duyệt.
- Duy trì toàn bộ 90 unit test hiện có luôn pass 100%.
- **TUYỆT ĐỐI KHÔNG** chạy lệnh `./zip-extension.sh` cho tới khi người dùng yêu cầu đóng gói.

---

### Task 1: Module QR Engine & Compact iCalendar Generator (`lib/qrcode.js` & `tests/qrcode.test.js`)

**Files:**
- Create: `lib/qrcode.js`
- Create: `tests/qrcode.test.js`

**Interfaces:**
- Produces:
  - `QRCode.generateMatrix(text: string, ecLevel?: string): boolean[][]`
  - `QRCode.toSvgString(text: string, options?: { size?: number, margin?: number, fgColor?: string, bgColor?: string }): string`
  - `buildQrCalendarPayload(options: { type: 'exam' | 'schedule', events: Array, scope?: 'today' | 'week' | 'next_week', now?: Date }): string`

- [ ] **Step 1: Viết failing test trong `tests/qrcode.test.js`**

```javascript
const test = require("node:test");
const assert = require("node:assert");
const { QRCode, buildQrCalendarPayload } = require("../lib/qrcode.js");

test("QRCode.generateMatrix generates a valid square boolean grid", () => {
  const matrix = QRCode.generateMatrix("HELLO", "M");
  assert.ok(Array.isArray(matrix), "matrix is an array");
  assert.ok(matrix.length > 0, "matrix has rows");
  assert.strictEqual(matrix.length, matrix[0].length, "matrix is square");
  assert.strictEqual(typeof matrix[0][0], "boolean", "cells are boolean");
});

test("QRCode.toSvgString outputs valid SVG string with viewBox and rect elements", () => {
  const svg = QRCode.toSvgString("BEGIN:VCALENDAR", { size: 200, margin: 4 });
  assert.ok(svg.startsWith("<svg"), "starts with <svg");
  assert.ok(svg.includes("viewBox="), "contains viewBox");
  assert.ok(svg.includes("<rect") || svg.includes("<path"), "contains graphic elements");
  assert.ok(svg.endsWith("</svg>"), "ends with </svg>");
});

test("buildQrCalendarPayload for exams formats upcoming exams with rooms into compact iCal", () => {
  const now = new Date(2026, 8, 10, 8, 0); // 10/09/2026
  const exams = [
    {
      title: "PRJ301",
      tag: "FE",
      location: "AL-R402",
      start: "2026-09-15T09:00:00",
      end: "2026-09-15T10:30:00",
      description: "Final exam"
    },
    {
      title: "SWE201",
      location: "", // no room, should be skipped
      start: "2026-09-16T09:00:00",
      end: "2026-09-16T10:30:00"
    }
  ];

  const payload = buildQrCalendarPayload({ type: "exam", events: exams, now });
  assert.ok(payload.startsWith("BEGIN:VCALENDAR\r\n"), "starts with VCALENDAR");
  assert.ok(payload.endsWith("END:VCALENDAR\r\n") || payload.endsWith("END:VCALENDAR"), "ends with VCALENDAR");
  assert.ok(payload.includes("SUMMARY:PRJ301 - FE"), "includes formatted title");
  assert.ok(payload.includes("LOCATION:AL-R402"), "includes room");
  assert.ok(!payload.includes("SWE201"), "skips exam without room");
});

test("buildQrCalendarPayload for schedule filters by scope 'today', 'week', 'next_week'", () => {
  const now = new Date(2026, 8, 10, 8, 0); // Thursday 10/09/2026
  const classes = [
    // Today
    {
      title: "PRJ301",
      location: "AL-L302",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 10, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    },
    // This week, different day (Friday 11/09/2026)
    {
      title: "SWE201",
      location: "BE-410",
      slot: "Slot 2",
      rawDate: { year: 2026, month: 9, day: 11, startHour: 9, startMinute: 30, endHour: 11, endMinute: 0 }
    },
    // Next week (Monday 14/09/2026)
    {
      title: "MAD101",
      location: "DE-201",
      slot: "Slot 1",
      rawDate: { year: 2026, month: 9, day: 14, startHour: 7, startMinute: 30, endHour: 9, endMinute: 0 }
    }
  ];

  // Scope: today
  const todayPayload = buildQrCalendarPayload({ type: "schedule", events: classes, scope: "today", now });
  assert.ok(todayPayload.includes("PRJ301"));
  assert.ok(!todayPayload.includes("SWE201"));
  assert.ok(!todayPayload.includes("MAD101"));

  // Scope: week
  const weekPayload = buildQrCalendarPayload({ type: "schedule", events: classes, scope: "week", now });
  assert.ok(weekPayload.includes("PRJ301"));
  assert.ok(weekPayload.includes("SWE201"));
  assert.ok(!weekPayload.includes("MAD101"));

  // Scope: next_week
  const nextWeekPayload = buildQrCalendarPayload({ type: "schedule", events: classes, scope: "next_week", now });
  assert.ok(!nextWeekPayload.includes("PRJ301"));
  assert.ok(!nextWeekPayload.includes("SWE201"));
  assert.ok(nextWeekPayload.includes("MAD101"));
});
```

- [ ] **Step 2: Chạy test để xác nhận test fail do chưa có module**

Run: `node --test tests/qrcode.test.js`  
Expected: FAIL (Cannot find module '../lib/qrcode.js')

- [ ] **Step 3: Viết module `lib/qrcode.js` (UMD)**

Tạo file `lib/qrcode.js` chứa bộ sinh mã QR độc lập chuẩn ISO/IEC 18004 (Reed-Solomon Galois Field GF(256), Byte Mode, 8 Mask Patterns) và hàm `buildQrCalendarPayload`.

- [ ] **Step 4: Chạy toàn bộ test suite**

Run: `npm test`  
Expected: PASS (tất cả các bài test mới và cũ đều pass 100%)

- [ ] **Step 5: Commit**

```bash
git add lib/qrcode.js tests/qrcode.test.js
git commit -m "feat: add pure js qr code engine and icalendar payload builder"
```

---

### Task 2: CSS Styles cho QR Modal & Trigger Buttons (`popup.css`)

**Files:**
- Modify: `popup.css`

**Interfaces:**
- Produces: CSS classes `#qrSyncModal`, `.qr-scope-selector`, `.qr-scope-btn`, `.qr-display-card`, `.qr-display-card svg`, `.qr-instructions`, `.qr-empty-msg`

- [ ] **Step 1: Thêm CSS styles cho modal và giao diện hiển thị QR**

```css
/* QR Sync Modal Styles */
.qr-modal-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.qr-scope-selector {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--bg-subtle);
  padding: 3px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  width: 100%;
  max-width: 290px;
}

.qr-scope-btn {
  flex: 1;
  padding: 5px 10px;
  font-size: 11.5px;
  font-weight: 600;
  border-radius: var(--radius-pill);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.qr-scope-btn:hover {
  color: var(--text);
}

.qr-scope-btn.active {
  background: var(--accent);
  color: #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.qr-display-card {
  position: relative;
  background: #ffffff;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 210px;
  min-height: 210px;
}

.qr-display-card svg {
  display: block;
  width: 200px;
  height: 200px;
}

.qr-instructions {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
  max-width: 280px;
}

.qr-meta-count {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
}

.qr-empty-msg {
  font-size: 12.5px;
  color: var(--text-muted);
  padding: 24px 12px;
  text-align: center;
}
```

- [ ] **Step 2: Thêm Dark Mode styling cho QR Modal**

```css
[data-theme="dark"] .qr-scope-selector {
  background: var(--bg-card-subtle);
  border-color: var(--border);
}

[data-theme="dark"] .qr-scope-btn {
  color: var(--text-muted);
}

[data-theme="dark"] .qr-scope-btn:hover {
  color: var(--text);
}

[data-theme="dark"] .qr-scope-btn.active {
  background: var(--accent);
  color: #ffffff;
}

[data-theme="dark"] .qr-display-card {
  background: #ffffff; /* Luôn giữ nền trắng tinh để camera bắt nét tốt */
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
}
```

- [ ] **Step 3: Chạy test suite**

Run: `npm test`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add popup.css
git commit -m "feat: add qr sync modal and responsive styles"
```

---

### Task 3: Markup Nút bấm, SVG Icon & Modal (`popup.html`)

**Files:**
- Modify: `popup.html`

- [ ] **Step 1: Thêm SVG `#icon-qrcode` vào SVG sprite**

```html
<symbol id="icon-qrcode" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="7" height="7"></rect>
  <rect x="14" y="3" width="7" height="7"></rect>
  <rect x="14" y="14" width="7" height="7"></rect>
  <rect x="3" y="14" width="7" height="7"></rect>
</symbol>
```

- [ ] **Step 2: Thêm nút `#qrExamBtn` vào `#examActions` và `#qrScheduleBtn` vào `#scheduleActions`**

Trong `#examActions`:
```html
<button type="button" id="qrExamBtn" class="action-btn action-btn--secondary action-btn--compact" title="Quét mã QR đồng bộ sang điện thoại">
  <svg class="icon" aria-hidden="true"><use href="#icon-qrcode"/></svg>
  <span class="action-btn__label">Quét QR</span>
</button>
```

Trong `#scheduleActions`:
```html
<button type="button" id="qrScheduleBtn" class="action-btn action-btn--secondary action-btn--compact" title="Quét mã QR đồng bộ sang điện thoại">
  <svg class="icon" aria-hidden="true"><use href="#icon-qrcode"/></svg>
  <span class="action-btn__label">Quét QR</span>
</button>
```

- [ ] **Step 3: Thêm Modal `#qrSyncModal` và thẻ `<script src="lib/qrcode.js"></script>`**

Thêm modal `#qrSyncModal` trước đóng thẻ `</main>`.  
Thêm `<script src="lib/qrcode.js"></script>` trước `popup.js`.

- [ ] **Step 4: Chạy test suite**

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add popup.html
git commit -m "feat: add qr sync trigger buttons, svg icon and modal markup"
```

---

### Task 4: Tích hợp logic hiển thị và tạo QR trong `popup.js`

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Viết hàm `openQrSyncModal(mode)` và các bộ xử lý sự kiện trong `popup.js`**

Xử lý:
- Mở modal theo chế độ `exam` hoặc `schedule`.
- Render mã QR qua `QRCode.toSvgString(payload)`.
- Gắn sự kiện chuyển đổi scope (`Hôm nay`, `Tuần này`, `Tuần tới`).
- Gắn sự kiện sao chép nội dung iCal (`#copyIcalPayloadBtn`).
- Gắn sự kiện đóng modal (nút X, phím Escape, click ra ngoài).

- [ ] **Step 2: Chạy test suite**

Run: `npm test`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add popup.js
git commit -m "feat: wire qr sync modal interactions and scope switching in popup.js"
```

---

### Task 5: Integration Tests trong DOM Boot (`tests/popup-boot.test.js`)

**Files:**
- Modify: `tests/popup-boot.test.js`

- [ ] **Step 1: Thêm test case kiểm tra QR modal và các nút bấm**

Kiểm tra:
- `QRCode` và `buildQrCalendarPayload` có sẵn trên window.
- `#qrExamBtn` và `#qrScheduleBtn` hiện diện trên DOM.
- Click `#qrScheduleBtn` mở `#qrSyncModal`, render thẻ `<svg>` bên trong `.qr-display-card`.
- Click nút scope "Hôm nay" cập nhật mã QR.
- Đóng modal thành công.

- [ ] **Step 2: Chạy toàn bộ test suite**

Run: `npm test`  
Expected: PASS 100%

- [ ] **Step 3: Commit**

```bash
git add tests/popup-boot.test.js
git commit -m "test: add qr sync modal integration tests in popup-boot"
```

---

### Task 6: Xác minh tổng thể (Final Verification)

- [ ] **Step 1: Chạy toàn bộ test suite**
Run: `npm test`  
Expected: PASS 100%

- [ ] **Step 2: Kiểm tra git status sạch sẽ**
Run: `git status`  
Expected: clean working tree

*(Nhắc nhở: Không chạy lệnh `./zip-extension.sh`)*
