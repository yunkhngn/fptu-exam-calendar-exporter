# Thiết kế: Thống kê Điểm danh & Cảnh báo Số buổi được nghỉ trên Thẻ Môn học

- **Ngày tạo:** 2026-09-06
- **Trạng thái:** Đã phê duyệt (Approved)
- **Phiên bản mục tiêu:** v3.7.0

---

## 1. Mục tiêu & Bối cảnh

Sinh viên FPT University phải tuân thủ nghiêm ngặt quy chế điểm danh: nếu số buổi vắng vượt quá 20% tổng số buổi của môn học, sinh viên sẽ bị cấm thi (Failed due to Attendance).

Hiện tại extension đã có chip cảnh báo tỷ lệ vắng khi chạm ngưỡng $\ge 15\%$ và $\ge 20\%$. Tuy nhiên:
- Thẻ môn học chưa cho biết chi tiết: đã học bao nhiêu buổi, có mặt bao nhiêu buổi, vắng bao nhiêu buổi.
- Chưa tính toán cụ thể sinh viên **còn được phép nghỉ tối đa bao nhiêu buổi** trước khi bị cấm thi.

Tính năng này bổ sung dòng thống kê điểm danh chi tiết ngay trong vùng thông tin (`class-meta`) của thẻ môn học (`.class-card`).

---

## 2. Logic nghiệp vụ (`lib/schedule.js`)

### 2.1. Nâng cấp hàm `computeAttendanceByCourse(schedule)`

Duyệt qua danh sách `schedule` và tổng hợp theo mã môn (`title`):
- `attended`: Đếm số buổi có `attendanceStatus` chứa `"attended"`.
- `absent`: Đếm số buổi có `attendanceStatus` chứa `"absent"`.
- `notYet`: Đếm số buổi có `attendanceStatus` là `"not yet"` hoặc rỗng.
- `totalGraded = attended + absent`: Tổng số buổi đã diễn ra và có kết quả điểm danh.
- `totalScheduled = attended + absent + notYet`: Tổng số buổi học của môn được tìm thấy trong lịch.
- `rate = totalGraded > 0 ? (absent / totalGraded) : 0`: Tỷ lệ vắng trên các buổi đã học.

### 2.2. Tính toán số buổi được phép nghỉ (`maxAllowedAbsent`, `remainingAbsent`)

- Theo quy chế FPT: Tỷ lệ vắng tối đa cho phép là $20\%$.
- Do số buổi học là số nguyên, số buổi vắng tối đa được phép trước khi cấm thi là:
  $$\text{maxAllowedAbsent} = \lfloor \text{totalScheduled} \times 0.20 \rfloor$$
- Số buổi vắng còn lại được phép nghỉ:
  $$\text{remainingAbsent} = \text{maxAllowedAbsent} - \text{absent}$$
- **Điều kiện xác định "Đã đồng bộ đủ cả kỳ"**:
  - Khi $\text{totalScheduled} \ge 10$, hệ thống coi là lịch đã đồng bộ nhiều tuần / cả kỳ, đủ cơ sở tính $\text{maxAllowedAbsent}$ và $\text{remainingAbsent}$.
  - Khi $\text{totalScheduled} < 10$, hệ thống chỉ hiển thị số buổi có mặt / vắng và tỷ lệ $\%$, không đoán mò số buổi còn được nghỉ để tránh gây nhầm lẫn cho sinh viên.

---

## 3. Quy tắc hiển thị giao diện (`popup.js`, `popup.css`)

### 3.1. Vị trí hiển thị
- Nằm trong `.class-meta` của thẻ môn học (`.class-card`), ngay dưới dòng *Ngày* và *Giờ*.
- Nhãn hiển thị: `Điểm danh:`
- Giá trị hiển thị:
  - Nếu `totalGraded === 0`: Không render dòng này (giữ thẻ gọn gàng).
  - Nếu `totalScheduled < 10`:
    `{attended} có mặt • {absent} vắng ({pct}%)`
  - Nếu `totalScheduled >= 10`:
    - Khi `remainingAbsent > 0`: `{attended} có mặt • {absent} vắng ({pct}%) • Còn được nghỉ {remainingAbsent} buổi`
    - Khi `remainingAbsent === 0`: `{attended} có mặt • {absent} vắng ({pct}%) • ⚠️ Đã chạm trần, không được nghỉ thêm`
    - Khi `remainingAbsent < 0`: `{attended} có mặt • {absent} vắng ({pct}%) • ⛔ Nguy cơ cấm thi (quá 20%)`

### 3.2. Màu sắc & Trực quan (`popup.css`)
- `.meta-value.attendance-safe`: Màu chữ phụ mặc định, chấm xanh nhỏ hoặc text trung tính khi `rate < 0.15`.
- `.meta-value.attendance-warning`: Màu cam cảnh báo (`#f59e0b` / `var(--warning)`) khi $0.15 \le \text{rate} < 0.20$.
- `.meta-value.attendance-danger`: Màu đỏ cảnh báo (`#ef4444` / `var(--danger)`) khi $\text{rate} \ge 0.20$ hoặc $\text{remainingAbsent} \le 0$.

---

## 4. Kế hoạch kiểm thử (Test Plan)

1. **Unit tests (`tests/attendance-summary.test.js`)**:
   - Kiểm tra `computeAttendanceByCourse` tính đúng `attended`, `absent`, `totalGraded`, `totalScheduled`, `rate`, `maxAllowedAbsent`, `remainingAbsent`.
   - Kiểm tra môn chưa có buổi điểm danh nào (`attended = 0, absent = 0`).
   - Kiểm tra môn có lịch cả kỳ ($\ge 10$ buổi) và môn có lịch ngắn hạn ($< 10$ buổi).
   - Kiểm tra các mốc chạm trần (`remainingAbsent = 0`) và quá trần (`remainingAbsent < 0`).
2. **Integration tests (`tests/popup-boot.test.js`)**:
   - Kiểm tra `renderClassSchedule` render đúng dòng `Điểm danh:` với đầy đủ số buổi và text cảnh báo.
   - Kiểm tra không render dòng `Điểm danh:` khi môn chưa có buổi nào điểm danh.
