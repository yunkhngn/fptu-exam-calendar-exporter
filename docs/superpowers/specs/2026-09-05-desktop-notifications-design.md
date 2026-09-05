# Design: Desktop Notifications (Thông báo đẩy trên màn hình)

**Ngày:** 2026-09-05  
**Phạm vi:** Cả Lịch học (`ScheduleOfWeek.aspx`) và Lịch thi (`ScheduleExams.aspx`).

## Bối cảnh

Hiện tại FPTU Schedule hỗ trợ xuất file `.ics` có cài sẵn chuông báo (reminders) cho Apple Calendar / Google Calendar. Tuy nhiên, nhiều sinh viên chỉ sử dụng trình duyệt Chrome khi học tập hoặc không đồng bộ file `.ics` vào ứng dụng Calendar của máy tính. Việc thiếu thông báo đẩy trực tiếp từ Chrome khiến sinh viên dễ quên giờ học (bị vắng mặt) hoặc trễ giờ thi.

## Mục tiêu

1. Cho phép Chrome tự động gửi **Desktop Notification** cảnh báo trước giờ học và giờ thi.
2. Cung cấp modal **Cài đặt thông báo** trong popup:
   - Master switch bật/tắt toàn bộ.
   - Nhắc lịch học: trước 15 phút, trước 30 phút.
   - Nhắc lịch thi: trước 1 ngày, trước 1 tiếng.
   - Nút test thử nghiệm thông báo để xác nhận quyền hiển thị.
3. Nhấp chuột vào thông báo sẽ mở trang FAP tương ứng (`ScheduleOfWeek.aspx` hoặc `ScheduleExams.aspx`).
4. Tối ưu hiệu năng: dùng `chrome.alarms` kết hợp Service Worker Manifest V3, không giữ worker chạy nền liên tục.

## Kiến trúc & Luồng dữ liệu

### 1. Phân chia module

- **`manifest.json`**:
  - Thêm permissions: `"alarms"`, `"notifications"`.
- **`lib/notifications.js` (Mới - UMD module)**:
  - Logic tính toán thời điểm kích hoạt alarm từ danh sách lịch.
  - Parse/Format định dạng alarm name: `fptu:class:<id>:<offsetMinutes>` và `fptu:exam:<id>:<offsetMinutes>`.
  - Format nội dung thông báo (`title`, `message`, `iconUrl`).
  - Lọc sự kiện tương lai (bỏ qua sự kiện đã qua trong quá khứ) và giới hạn trong phạm vi 30 ngày (tránh vượt giới hạn 1000 alarms của Chrome).
  - Thuần JS, không phụ thuộc DOM hay Chrome API trực tiếp để có thể chạy unit test trong `tests/`.
- **`background.js` (Service Worker)**:
  - Import `lib/notifications.js`.
  - Đăng ký listener `chrome.alarms.onAlarm`: trích xuất sự kiện và bắn `chrome.notifications.create`.
  - Đăng ký listener `chrome.notifications.onClicked`: mở tab FAP tương ứng.
  - Lắng nghe message `RESCHEDULE_ALARMS` và `TEST_NOTIFICATION` từ popup.
  - Tự động lập lịch lại sau khi đồng bộ thành công lịch học hoặc lịch thi.
- **`popup.html / .css / .js`**:
  - Thêm nút icon chuông (`#notificationBtn`) ở header.
  - Thêm modal `#notificationModal` chứa các toggles và nút Test notification.
  - Lưu và đọc cấu hình từ `chrome.storage.local.notificationSettings`.

### 2. Cấu trúc dữ liệu cấu hình (`notificationSettings`)

```json
{
  "enabled": true,
  "class": {
    "enabled": true,
    "offset15": true,
    "offset30": false
  },
  "exam": {
    "enabled": true,
    "offset1Day": true,
    "offset1Hour": true
  }
}
```

### 3. Quy ước định danh Alarms (`chrome.alarms`)

- Lịch học: `fptu:class:<encodedKey>:<offsetMinutes>`
  - Ví dụ: `fptu:class:PRJ301-20260910-0730:15`
- Lịch thi: `fptu:exam:<encodedKey>:<offsetMinutes>`
  - Ví dụ: `fptu:exam:PRJ301-20260920-1000:60`
  - Nhắc trước 1 ngày: `offsetMinutes = 1440`.

### 4. Nội dung thông báo (`chrome.notifications`)

- **Lịch học**:
  - **Title:** `[FPTU Lịch học] PRJ301 - Slot 1 (07:30 - 09:00)`
  - **Message:** `Sắp đến giờ học tại phòng AL-L302 (sau 15 phút).`
  - **Icon:** `icon-128.png`
- **Lịch thi**:
  - **Title:** `[FPTU Lịch thi] PRJ301 - PE`
  - **Message:** `Thi ngày mai lúc 07:30 tại phòng AL-L302.` (hoặc `Thi sau 1 giờ nữa tại phòng AL-L302.`)
  - **Icon:** `icon-128.png`

### 5. Xử lý tương tác nhấp chuột (`chrome.notifications.onClicked`)

- Khi nhấp vào notification:
  - Nếu là lịch học: Tìm tab đang mở `fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx` hoặc `fap.fpt.edu.vn/Schedule/*` để kích hoạt; nếu chưa mở, tạo tab mới dẫn tới `https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx`.
  - Nếu là lịch thi: Tìm tab `fap.fpt.edu.vn/Exam/ScheduleExams.aspx` để kích hoạt; nếu chưa mở, tạo tab mới tới `https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx`.
  - Đóng thông báo sau khi click.

## Ràng buộc & Xử lý biên

1. **Giới hạn số lượng Alarms**: Chrome giới hạn tối đa khoảng 1000 alarms cho một extension. Tiện ích sẽ chỉ lập lịch cho các sự kiện sắp diễn ra trong vòng 30 ngày tới.
2. **Sự kiện đã qua**: Bỏ qua các sự kiện có timestamp tính ra nhỏ hơn thời điểm hiện tại (`Date.now()`).
3. **Cập nhật dữ liệu**: Bất cứ khi nào lịch học hoặc lịch thi được sync mới hoặc xóa (`handleClearClassSchedule`), extension sẽ kích hoạt lại hàm tính toán và lập lịch lại toàn bộ alarms.
4. **Không có quyền thông báo hệ thống**: Nếu OS đang ở chế độ Tập trung (Focus Mode / Do Not Disturb) hoặc người dùng tắt quyền thông báo của Chrome ở cấp OS, thông báo vẫn được tạo từ extension nhưng có thể bị OS giữ lại trong Notification Center.

## Kế hoạch kiểm thử

1. **Unit tests (`tests/notifications.test.js`)**:
   - Kiểm tra hàm sinh alarm items từ `classSchedule` và `examEvents`.
   - Kiểm tra loại trừ sự kiện quá khứ và sự kiện ngoài phạm vi 30 ngày.
   - Kiểm tra mã hóa và giải mã tên alarm.
   - Kiểm tra định dạng message thông báo theo từng mốc thời gian (15p, 30p, 1h, 1 ngày).
2. **Popup UI test (`tests/popup-boot.test.js`)**:
   - Mở và đóng modal cài đặt thông báo.
   - Lưu settings vào storage và đồng bộ trạng thái toggles.
   - Nút test notification gửi đúng message tới background.
3. **Kiểm thử thủ công**:
   - Bấm nút "Thử thông báo" trên giao diện popup.
   - Nhấp vào thông báo kiểm tra điều hướng tab FAP.
