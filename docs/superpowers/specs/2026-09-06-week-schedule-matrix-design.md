# Thiết kế Tính năng: Lịch học Dạng Tuần (Week Timetable Matrix)

**Ngày:** 06/09/2026  
**Phiên bản:** v3.7.0  
**Tác giả:** Antigravity x @yunkhngn  

---

## 1. Mục tiêu & Bối cảnh

### 1.1. Vấn đề
Hiện tại, lịch học (`#scheduleTab`) trong tiện ích FPTU Schedule được hiển thị dưới dạng danh sách thẻ (List/Card view). Mặc dù danh sách thẻ chi tiết và đẹp mắt, sinh viên FPT gặp khó khăn khi muốn:
- Nhìn bao quát thời khóa biểu của cả tuần trong một cái nhìn.
- Nhanh chóng nhận diện các khoảng trống giữa các ca học (trống Slot nào trong ngày để làm bài tập, nghỉ ngơi, hẹn nhóm).
- Theo dõi lịch học quen thuộc theo mô hình ma trận Slot $\times$ Thứ mà nhà trường FAP áp dụng.

### 1.2. Giải pháp
Bổ sung chế độ xem **Lịch tuần (Week Timetable Matrix)** ngay bên trong popup (chiều rộng 600px) với:
1. **Nút chuyển đổi chế độ xem:** Chuyển đổi linh hoạt giữa `[Danh sách]` và `[Lịch tuần]`, lưu trạng thái đã chọn vào `localStorage`.
2. **Thanh điều hướng tuần:** Hỗ trợ lùi/tiến tuần (`<`, `>`), hiển thị khoảng ngày (`07/09 – 13/09/2026`), và nút `Hôm nay` để nhảy nhanh về tuần hiện tại.
3. **Ma trận Slot FPT 7 ngày:**
   - Trục dọc: 6 Slot chuẩn của FPT (Slot 1 đến Slot 6 kèm khung giờ tương ứng).
   - Trục ngang: 7 ngày trong tuần (Thứ 2 đến Chủ nhật), tự động highlight cột của ngày hiện tại.
   - Mỗi ô môn học: Hiển thị block mini gồm mã môn, phòng/online, giờ học, và chấm trạng thái điểm danh. Click vào ô để mở chi tiết buổi học trên FAP.

---

## 2. Kiến trúc & Luồng Dữ liệu

### 2.1. Quản lý trạng thái xem (`popup.js`)
- `scheduleViewMode`: Giá trị `'list'` hoặc `'week'`, lưu trong `localStorage.getItem('fptu_schedule_view_mode')` (mặc định `'list'`).
- `currentWeekOffset`: Số nguyên biểu diễn độ lệch tuần so với ngày hiện tại (mặc định `0`).
- Khi người dùng bấm nút toggle trên thanh `#scheduleActions`:
  - Cập nhật biến trạng thái và lưu `localStorage`.
  - Cập nhật giao diện nút bấm (active state).
  - Gọi hàm render tương ứng (`renderClassScheduleList` hoặc `renderClassScheduleWeek`).

### 2.2. Xử lý dữ liệu Tuần & Slot
- **Tính toán mốc thời gian Tuần:**
  - Lấy ngày Thứ 2 của tuần dựa trên ngày hiện tại + `currentWeekOffset * 7` ngày.
  - Tuần bắt đầu từ Thứ 2 (00:00:00) đến Chủ nhật (23:59:59).
  - Định dạng hiển thị dải ngày: `dd/mm – dd/mm/yyyy`.
- **Ánh xạ Slot:**
  - Mỗi sự kiện trong `classSchedule` đã có thuộc tính `ev.slot` (ví dụ: `"Slot 1"`, `"Slot 2"`...) hoặc `ev.rawDate.startHour`.
  - Chuẩn hóa về chỉ số Slot từ 1 đến 6:
    - Slot 1: 07:00 – 09:15 / 07:30 – 09:50
    - Slot 2: 09:30 – 11:45 / 10:00 – 12:20
    - Slot 3: 12:30 – 14:45 / 12:50 – 15:10
    - Slot 4: 15:00 – 17:15 / 15:20 – 17:40
    - Slot 5: 17:30 – 19:45 / 17:50 – 20:10
    - Slot 6: 19:30 – 21:00 / 20:20 – 22:40
  - Phân loại các sự kiện trong tuần theo cặp khóa: `${isoDay}_${slotNumber}` (với `isoDay` từ 1 = Thứ 2 đến 7 = Chủ nhật).

---

## 3. Giao diện & Trải nghiệm Người dùng (UI/UX)

### 3.1. Nút chuyển đổi View (`popup.html` & `popup.css`)
- Thêm cụm nút chuyển đổi kiểu segmented button trên `#scheduleActions`:
  ```html
  <div class="view-toggle-group">
    <button type="button" id="viewListBtn" class="view-toggle-btn active" title="Xem dạng danh sách">
      <svg class="icon"><use href="#icon-list"/></svg>
      <span>Danh sách</span>
    </button>
    <button type="button" id="viewWeekBtn" class="view-toggle-btn" title="Xem thời khóa biểu tuần">
      <svg class="icon"><use href="#icon-calendar-week"/></svg>
      <span>Lịch tuần</span>
    </button>
  </div>
  ```

### 3.2. Thanh điều hướng Tuần (`.week-matrix-nav`)
- Bố cục flex:
  - Cụm bên trái: Nút lùi tuần `<` (icon chevron-left), nút tiến tuần `>` (icon chevron-right).
  - Cụm ở giữa: Tiêu đề tuần (ví dụ: **`Tuần 37: 07/09 – 13/09/2026`**).
  - Cụm bên phải: Nút **`Hôm nay`** (chỉ active khi `currentWeekOffset !== 0`).

### 3.3. Bảng Ma trận Thời khóa biểu (`.week-matrix`)
- **Kích thước & Phân bổ cột:**
  - Trục Slot (Cột đầu tiên): rộng cố định `46px`.
  - 7 Cột ngày (T2, T3, T4, T5, T6, T7, CN): rộng đều nhau $\approx 76\text{px}$ mỗi cột (tổng chiều rộng bảng khít trong 600px).
- **Hàng tiêu đề ngày (`.week-matrix__head`):**
  - Hiển thị thứ viết tắt và số ngày: `T2 07`, `T3 08`, `T4 09`, `T5 10`, `T6 11`, `T7 12`, `CN 13`.
  - Nếu là ngày hiện tại (`isToday`): Thêm class `.is-today` với badge tròn nổi bật quanh số ngày và viền highlight dọc cả cột.
- **Tế bào môn học (`.week-cell`):**
  - **Ô có tiết học (`.week-cell--has-class`):**
    - Thẻ con bo góc 8px, padding 4px 6px, nền `--bg-elevated` với viền nhẹ.
    - **Mã môn:** In đậm font 10.5px, màu `--text`.
    - **Phòng / Online:** Font 8.5px; nếu online hiện chữ `Online` xanh lá, nếu offline hiện phòng `AL-R402`.
    - **Giờ:** Font 8px màu `--text-muted` (`12:50`).
    - **Điểm danh (Status dot):** Chấm 5px góc trên phải:
      - Attended: Xanh lá (`#047857`)
      - Absent: Đỏ (`#b91c1c`)
      - Not yet: Xám (`#94a3b8`)
    - **Hover & Click:** Con trỏ pointer, hiệu ứng nổi nhẹ khi rê chuột; click sẽ mở chi tiết buổi học FAP giống như card ở danh sách.
  - **Ô trống (`.week-cell--empty`):**
    - Nền trong suốt hoặc chấm mờ nhẹ, giữ bố cục phẳng và thoáng đãng.

### 3.4. Chế độ Tối (Dark Mode)
- Đồng bộ toàn bộ màu nền ô, viền bảng và văn bản với biến CSS `data-theme="dark"`.

---

## 4. Kế hoạch Kiểm thử & Xác minh

### 4.1. Kiểm thử Tự động (`tests/popup-boot.test.js`)
1. **Khởi tạo & Chuyển đổi View:**
   - Kiểm tra nút toggle `viewWeekBtn` chuyển đổi view thành công.
   - Xác nhận `localStorage.getItem('fptu_schedule_view_mode')` lưu đúng giá trị.
2. **Tính toán & Lọc theo Tuần:**
   - Kiểm tra với mảng lịch học mẫu có ngày cụ thể, ma trận hiển thị đúng môn vào đúng cột Thứ và hàng Slot.
   - Xác nhận lớp Online không hiện phòng trên thẻ tuần.
3. **Điều hướng Tuần:**
   - Bấm nút `<` / `>` cập nhật dải ngày và danh sách môn tương ứng.
   - Bấm nút `Hôm nay` khôi phục về tuần hiện tại.
4. **Tương tác Chi tiết:**
   - Click vào thẻ môn trong ô kích hoạt mở chi tiết FAP tương tự click vào class-card.

### 4.2. Kiểm thử Thủ công
- Mở popup trên trình duyệt, chuyển qua lại giữa chế độ `Danh sách` và `Lịch tuần`.
- Thử nghiệm trên cả giao diện Sáng và Tối để đảm bảo độ tương phản hoàn hảo.
