# Design: Today's Agenda Widget (Widget Lịch trình hôm nay)

**Ngày:** 2026-09-06  
**Phạm vi:** Popup Extension (`lib/agenda.js`, `popup.html`, `popup.css`, `popup.js`).

## Bối cảnh

Sinh viên FPTU thường xuyên mở extension với nhu cầu nhanh nhất là biết: *"Bây giờ mình đang học ca nào hoặc ca học tiếp theo hôm nay diễn ra lúc mấy giờ, ở phòng học nào?"*. Hiện tại, người dùng phải tự lướt qua danh sách thẻ lớp học hoặc bấm nút lọc "Hôm nay" để tìm ca học của mình.

Việc bổ sung **Today's Agenda Widget** dưới dạng một Hero Card thông minh ở đầu tab Lịch học sẽ cung cấp thông tin tóm tắt tức thì (zero-click), tự động nhận biết thời gian thực và đếm ngược chính xác.

## Mục tiêu

1. Tự động tính toán trạng thái lịch trình hôm nay theo thời gian thực:
   - Đang diễn ra lớp học (`IN_PROGRESS`).
   - Sắp diễn ra ca tiếp theo trong ngày (`UPCOMING`).
   - Đã hoàn thành toàn bộ ca hôm nay (`COMPLETED_TODAY`).
   - Hôm nay được nghỉ không có lịch học (`FREE_TODAY`).
2. Tích hợp cảnh báo nếu hôm nay có lịch thi (`TODAY_EXAM_ALERT`).
3. Click vào thẻ Agenda để mở trực tiếp trang chi tiết buổi học FAP hoặc phòng học.
4. Đảm bảo hỗ trợ hoàn hảo cả Light Mode và Dark Mode.
5. Kiểm thử độc lập bằng unit test với các kịch bản thời gian giả lập (`mockNow`).

## Kiến trúc & Luồng dữ liệu

### 1. Phân chia module

- **`lib/agenda.js` (Mới - UMD module)**:
  - Hàm `getEventTimeRange(event)`: Trích xuất `start` (`Date`) và `end` (`Date`) từ event lịch học hoặc lịch thi.
  - Hàm `computeTodayAgenda({ classEvents, examEvents, now })`:
    - Lọc các ca học diễn ra trong ngày `now` (dựa trên cùng ngày/tháng/năm).
    - So sánh `now` với mốc thời gian của từng ca học:
      - Nếu tìm thấy ca có `start <= now <= end`: Trạng thái `IN_PROGRESS`.
      - Nếu tìm thấy ca tương lai trong ngày có `start > now`: Trạng thái `UPCOMING` (chọn ca sớm nhất, đếm tổng số ca còn lại hôm nay).
      - Nếu hôm nay có ca nhưng tất cả `end < now`: Trạng thái `COMPLETED_TODAY`, tìm ca học gần nhất của ngày tiếp theo.
      - Nếu hôm nay không có ca nào: Trạng thái `FREE_TODAY`, tìm ca học gần nhất tiếp theo.
    - Lọc danh sách kỳ thi diễn ra trong ngày `now`: Nếu có, trả về `todayExams`.
    - Trả về object kết quả:
      ```javascript
      {
        status: 'IN_PROGRESS' | 'UPCOMING' | 'COMPLETED_TODAY' | 'FREE_TODAY' | 'NO_DATA',
        currentEvent: Event | null,
        nextEvent: Event | null,
        remainingMinutes: number | null,
        totalRemainingToday: number,
        todayExams: Array<ExamEvent>,
        formattedTime: string
      }
      ```
- **`tests/agenda.test.js` (Mới)**:
  - Kiểm thử toàn diện 5 trạng thái với các mốc thời gian giả định.
- **`popup.css`**:
  - CSS cho `.agenda-card`, `.agenda-status-badge`, `.agenda-exam-alert`.
  - Thiết lập styling cho Light Mode và Dark Mode (`[data-theme="dark"]`).
- **`popup.js` & `popup.html`**:
  - Nhúng `lib/agenda.js` trong `popup.html`.
  - Trong `renderClassSchedule()`, gọi `computeTodayAgenda` và render component `.agenda-card` ở đầu `#scheduleTab`.

### 2. Thiết kế giao diện (UI Specs)

#### Cấu trúc HTML Component
```html
<div class="agenda-card agenda-card--${status.toLowerCase()}">
  <div class="agenda-card__header">
    <div class="agenda-card__badge">
      <span class="agenda-dot"></span>
      <span class="agenda-badge-text">...</span>
    </div>
    <span class="agenda-card__counter">...</span>
  </div>
  <div class="agenda-card__body">
    <div class="agenda-card__title">PRJ301</div>
    <div class="agenda-card__meta">
      <span class="agenda-slot">Slot 2 (09:30 - 11:50)</span>
      <span class="agenda-divider">·</span>
      <span class="agenda-room">Phòng AL-L302</span>
    </div>
  </div>
  <!-- Nếu hôm nay có thi -->
  <div class="agenda-card__exam-alert">
    <svg class="icon"><use href="#icon-clipboard"/></svg>
    <span>Hôm nay bạn có ca thi SWE201 lúc 13:30 (Phòng AL-R402)</span>
  </div>
</div>
```

#### Màu sắc & Thích ứng Dark Mode
- **`IN_PROGRESS` (Đang học):**
  - Light: Nền xanh lá nhạt (`#ecfdf5`), viền `#a7f3d0`, text `#065f46`, chấm xanh pulse animation.
  - Dark: Nền xanh rêu tối (`rgba(16, 185, 129, 0.15)`), viền `rgba(52, 211, 153, 0.35)`, text `#6ee7b7`.
- **`UPCOMING` (Sắp học):**
  - Light: Nền xanh dương dịu (`#eff6ff`), viền `#bfdbfe`, text `#1e40af`.
  - Dark: Nền xanh navy tối (`rgba(37, 99, 235, 0.18)`), viền `rgba(96, 165, 250, 0.35)`, text `#93c5fd`.
- **`COMPLETED_TODAY` / `FREE_TODAY`:**
  - Nền trung tính trang nhã (`--bg-card-subtle`), viền `--border`, text `--text-muted`.

## Kế hoạch kiểm thử (Verification Plan)

1. **Unit tests (`tests/agenda.test.js`)**:
   - Test case `IN_PROGRESS`: Giả lập lúc 08:00 cho ca học 07:30 - 09:00 -> nhận diện đúng `IN_PROGRESS`, còn 60 phút.
   - Test case `UPCOMING`: Giả lập lúc 07:00 cho ca học 07:30 -> nhận diện đúng `UPCOMING`, bắt đầu sau 30 phút.
   - Test case `COMPLETED_TODAY`: Giả lập lúc 18:00 khi ca cuối kết thúc lúc 17:40 -> nhận diện đã hoàn thành.
   - Test case `FREE_TODAY`: Giả lập ngày không có ca học -> nhận diện ngày nghỉ.
   - Test case `TODAY_EXAM_ALERT`: Kiểm tra nhận diện kỳ thi diễn ra trong ngày.
2. **Integration tests**:
   - `tests/popup-boot.test.js`: Kiểm tra agenda card render chính xác trong `#scheduleTab`.
   - Chạy `npm test` xác nhận toàn bộ suite pass.
