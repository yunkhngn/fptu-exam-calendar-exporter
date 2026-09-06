# Lịch học Dạng Tuần (Week Timetable Matrix) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng chế độ xem Thời khóa biểu Tuần (Week Timetable Matrix) 7 ngày $\times$ 6 Slot bên trong extension popup 600px, kèm thanh điều hướng tuần và nút chuyển đổi chế độ xem.

**Architecture:** 
Bổ sung các hàm helper tính tuần và ánh xạ Slot vào `lib/schedule.js`. Thêm nút chuyển đổi view và container ma trận tuần trong `popup.html`. Cung cấp styling dạng CSS Grid/Table vừa khít 600px trong `popup.css`. Tích hợp trạng thái xem (`scheduleViewMode`), điều hướng tuần và render ô môn học tương tác trong `popup.js`.

**Tech Stack:** Vanilla JavaScript (ES6+), Vanilla CSS (Flexbox / CSS Grid), Chrome Extension Manifest V3.

## Global Constraints
- Chiều rộng popup tối đa 600px, toàn bộ ma trận 7 ngày $\times$ 6 slot phải vừa vặn, không cuộn ngang.
- Tương thích hoàn toàn với Dark Mode và Light Mode hiện có.
- Trạng thái chế độ xem (`list` / `week`) và tuần xem phải được duy trì mượt mà.
- Tất cả unit tests phải pass (`npm test`).

---

### Task 1: Module tính toán Tuần và Ánh xạ Slot trong `lib/schedule.js`

**Files:**
- Modify: `lib/schedule.js`
- Test: `tests/week-matrix.test.js`

**Interfaces:**
- Produces:
  - `getWeekDateRange(refDate, weekOffset)`: `{ startMonday: Date, endSunday: Date, days: Array<{ date: Date, isoDay: number, day: number, month: number, isToday: boolean }> }`
  - `mapEventToSlot(event)`: `number | null` (1..6)
  - `groupScheduleByWeekAndSlot(schedule, weekRange)`: `{ [key: string]: Array<Event> }` với key định dạng `${isoDay}_${slotIndex}`

- [ ] **Step 1: Viết test cho các hàm tính tuần và ánh xạ Slot**

Tạo `tests/week-matrix.test.js` kiểm tra:
- Tính đúng thứ Hai và Chủ nhật của tuần bất kỳ.
- Tính đúng ngày hôm nay (`isToday`).
- Ánh xạ đúng Slot từ chuỗi `"Slot 1"`..`"Slot 6"` hoặc từ giờ bắt đầu.
- Nhóm đúng các sự kiện theo ngày và slot.

- [ ] **Step 2: Chạy test để đảm bảo test fail**

Run: `node tests/week-matrix.test.js`
Expected: FAIL vì các hàm chưa được định nghĩa trong `lib/schedule.js`.

- [ ] **Step 3: Cài đặt các hàm trong `lib/schedule.js`**

Viết `getWeekDateRange`, `mapEventToSlot`, và `groupScheduleByWeekAndSlot` trong `lib/schedule.js` và export ra API.

- [ ] **Step 4: Chạy lại test để đảm bảo pass**

Run: `node tests/week-matrix.test.js`
Expected: PASS toàn bộ test case.

- [ ] **Step 5: Commit**

```bash
git add lib/schedule.js tests/week-matrix.test.js
git commit -m "feat(schedule): add week date range and slot mapping helpers"
```

---

### Task 2: Giao diện và Bố cục CSS cho Ma trận Tuần

**Files:**
- Modify: `popup.html`
- Modify: `popup.css`

**Interfaces:**
- Consumes: Cấu trúc HTML của `#scheduleTab` và thanh `#scheduleActions`.
- Produces:
  - HTML nút toggle view: `#viewListBtn`, `#viewWeekBtn`.
  - CSS cho `.view-toggle-group`, `.week-matrix-container`, `.week-matrix-nav`, `.week-matrix`, `.week-cell`, `.week-cell--has-class`, `.week-cell__card`, `.is-today`.

- [ ] **Step 1: Thêm nút chuyển đổi chế độ xem vào `popup.html`**

Thêm cụm nút segmented toggle `[Danh sách]` và `[Lịch tuần]` vào `#scheduleActions`.

- [ ] **Step 2: Cài đặt CSS cho Ma trận Tuần trong `popup.css`**

- Định nghĩa lưới 8 cột (trục Slot 44px + 7 cột ngày ~76px).
- Styling cho `.week-matrix-nav` (nút trước, sau, hôm nay, tiêu đề dải ngày).
- Styling cho ô môn học mini `.week-cell__card` (mã môn in đậm, phòng/online, giờ, chấm trạng thái).
- Styling highlight cho cột ngày hôm nay `.is-today`.
- Hỗ trợ màu sắc biến Dark Mode (`[data-theme="dark"]`).

- [ ] **Step 3: Chạy test kiểm tra HTML/CSS không làm vỡ các thành phần hiện tại**

Run: `npm test`
Expected: 95 tests pass.

- [ ] **Step 4: Commit**

```bash
git add popup.html popup.css
git commit -m "style(ui): add layout and styling for week timetable matrix"
```

---

### Task 3: Logic Render Ma trận Tuần và Tương tác trong `popup.js`

**Files:**
- Modify: `popup.js`
- Test: `tests/popup-boot.test.js`

**Interfaces:**
- Consumes: `getWeekDateRange`, `groupScheduleByWeekAndSlot` từ `lib/schedule.js`.
- Produces:
  - `renderClassScheduleWeek(schedule, weekOffset)`
  - Sự kiện click nút toggle view, lưu vào `localStorage`.
  - Sự kiện điều hướng tuần (`<`, `>`, `Hôm nay`).
  - Tương tác click ô môn học mở chi tiết FAP.

- [ ] **Step 1: Viết test cho chế độ xem Tuần trong `tests/popup-boot.test.js`**

- Bấm nút `viewWeekBtn` chuyển đổi giao diện sang tuần.
- Kiểm tra các ô ma trận chứa đúng môn học vào đúng thứ và slot.
- Kiểm tra nút `<` và `>` thay đổi dải tuần.

- [ ] **Step 2: Chạy test để đảm bảo test fail**

Run: `npm test`
Expected: FAIL vì logic tuần chưa được kích hoạt trong `popup.js`.

- [ ] **Step 3: Cài đặt `renderClassScheduleWeek` và xử lý sự kiện trong `popup.js`**

- Đọc và lưu `scheduleViewMode` từ `localStorage`.
- Xây dựng cây DOM ma trận tuần dựa trên `groupScheduleByWeekAndSlot`.
- Gắn sự kiện click vào các ô môn học để mở trang chi tiết FAP.
- Gắn sự kiện cho các nút điều hướng tuần.

- [ ] **Step 4: Chạy test để đảm bảo pass**

Run: `npm test`
Expected: PASS toàn bộ test suite.

- [ ] **Step 5: Commit**

```bash
git add popup.js tests/popup-boot.test.js
git commit -m "feat(ui): implement week timetable matrix view and navigation in popup"
```

---

### Task 4: Kiểm thử Tích hợp & Đóng gói Bản dựng

**Files:**
- Modify: `fptu-schedule.zip`
- Test: Toàn bộ test suite

- [ ] **Step 1: Chạy toàn bộ test suite**

Run: `npm test`
Expected: 100% tests pass.

- [ ] **Step 2: Đóng gói lại extension zip**

Run: `./zip-extension.sh`
Expected: `fptu-schedule.zip` được cập nhật thành công.

- [ ] **Step 3: Commit**

```bash
git add fptu-schedule.zip
git commit -m "chore: package v3.7.0 extension with week schedule matrix"
```
