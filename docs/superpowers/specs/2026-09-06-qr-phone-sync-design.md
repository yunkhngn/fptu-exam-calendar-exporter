# Design Spec: Phone Sync via QR Code (Đồng bộ điện thoại qua QR Code)

**Goal:** Cung cấp tính năng đồng bộ lịch học và lịch thi trực tiếp sang điện thoại (iPhone / Android) thông qua việc quét mã QR, không cần máy chủ trung gian, 100% offline và tự động kích hoạt trình nhập lịch gốc (Apple Calendar / Google Calendar) trên điện thoại của sinh viên.

**Created Date:** 2026-09-06  
**Status:** Approved  
**Author:** Pair programming with User

---

## 1. Background & User Needs

Sinh viên FPT University thường sử dụng máy tính xách tay để mở trang FAP và xem lịch qua extension FPTU Schedule. Tuy nhiên, khi đi học tại giảng đường hoặc di chuyển, sinh viên thường phụ thuộc vào điện thoại thông minh (iPhone hoặc điện thoại Android) để tra cứu phòng học, ca học và giờ thi.

Hiện tại, extension chỉ hỗ trợ xuất file `.ics` tải về máy tính. Việc chuyển file này sang điện thoại thường đòi hỏi gửi qua email, tin nhắn hoặc cắm cáp, gây bất tiện. 

**Giải pháp:** Sinh mã QR chứa chuẩn dữ liệu iCalendar 2.0 (`BEGIN:VCALENDAR...`). Khi mở ứng dụng Camera gốc trên iOS (iPhone) hoặc Android (Google Lens / Camera Samsung), hệ điều hành sẽ tự động nhận diện sự kiện lịch và hiển thị nút "Thêm vào Lịch" (Add to Calendar) ngay lập tức mà không cần cài đặt thêm bất kỳ ứng dụng nào khác.

---

## 2. Core Architecture & Components

```
┌────────────────────────────────────────────────────────┐
│                        Popup UI                        │
│                                                        │
│  [Exam Tab]                   [Schedule Tab]           │
│   └─> #qrExamBtn               └─> #qrScheduleBtn      │
│            \                         /                 │
│             ▼                       ▼                  │
│       ┌──────────────────────────────────────┐         │
│       │       QR Sync Modal (#qrSyncModal)   │         │
│       │  - Scope Switcher (Today/Week/Next)  │         │
│       │  - SVG QR Display Card               │         │
│       │  - Copy iCal Text Button             │         │
│       └──────────────────┬───────────────────┘         │
└──────────────────────────┼─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│                    lib/qrcode.js                       │
│  - Pure Vanilla JS ISO/IEC 18004 QR Generator          │
│  - Reed-Solomon Error Correction                       │
│  - Byte Mode & Mask Evaluation                         │
│  - toSvgString(text, options) -> Crisp Vector SVG      │
└────────────────────────────────────────────────────────┘
```

### 2.1. Module QR Engine (`lib/qrcode.js`)
- **Định dạng:** UMD (Universal Module Definition), hỗ trợ chạy trong cả Node.js (test runner) và Trình duyệt.
- **Không phụ thuộc:** 100% Vanilla JavaScript, không cần thư viện ngoài.
- **Chức năng chính:**
  - `generateQrMatrix(text, errorCorrectionLevel = 'M')`: Tạo ma trận 2D boolean biểu diễn các điểm đen/trắng của mã QR.
  - `toSvgString(text, options)`: Chuyển ma trận thành thẻ `<svg>` vector độc lập với các thông số tùy biến (`size`, `margin`, `foregroundColor`, `backgroundColor`).

### 2.2. Module tạo Payload iCal cho QR (`buildQrCalendarPayload`)
Chuỗi dữ liệu đưa vào mã QR cần được tối giản để giữ kích thước vừa vặn (dưới 1.500 ký tự) giúp camera quét nhạy:
- Loại bỏ các trường rườm rà (PRODID dài dòng, VALARM phức tạp, UID dài).
- Định dạng thời gian theo chuẩn `YYYYMMDDTHHMMSS` (local time).
- Các trường thiết yếu cho mỗi `VEVENT`:
  ```
  BEGIN:VEVENT
  SUMMARY:PRJ301 - Slot 1
  DTSTART:20260910T073000
  DTEND:20260910T090000
  LOCATION:AL-L302
  DESCRIPTION:Lịch học FPTU
  END:VEVENT
  ```

---

## 3. UI/UX Design & User Flow

### 3.1. Các nút kích hoạt
- **SVG Symbol:** Bổ sung `#icon-qrcode` vào SVG sprite trong `popup.html`.
- **Thanh thao tác Lịch thi (`#examActions`):**
  - Thêm nút `#qrExamBtn` (Nhãn: "Quét QR", icon: `#icon-qrcode`, class: `action-btn action-btn--secondary action-btn--compact`).
- **Thanh thao tác Lịch học (`#scheduleActions`):**
  - Thêm nút `#qrScheduleBtn` (Nhãn: "Quét QR", icon: `#icon-qrcode`, class: `action-btn action-btn--secondary action-btn--compact`).

### 3.2. Cấu trúc Modal `#qrSyncModal`
- **Header:**
  - Tiêu đề: `Đồng bộ điện thoại qua QR`
  - Nút đóng: `#closeQrSyncModal` (phím Esc hoặc click nút hoặc click ngoài nền modal đều đóng được).
- **Phần chọn phạm vi (`.qr-scope-selector`):**
  - Khi mở từ **Lịch học**: Cung cấp 3 nút bấm dạng viên thuốc (Pill tabs):
    - `Hôm nay`: 1 - 3 buổi học hôm nay (QR rất thưa, quét siêu tốc).
    - `Tuần này` *(Mặc định)*: Toàn bộ các buổi học trong tuần hiện tại.
    - `Tuần tới`: Các buổi học trong tuần tiếp theo.
  - Khi mở từ **Lịch thi**: Hiển thị nhãn tĩnh: `Tất cả môn thi sắp tới (n môn)`.
- **Khung hiển thị mã QR (`.qr-display-card`):**
  - Kích thước: 210px x 210px.
  - Nền: Luôn là màu trắng `#ffffff` với viền mềm và đổ bóng nhẹ, bất kể đang ở chế độ Light Mode hay Dark Mode (đảm bảo độ tương phản 100% cho camera điện thoại).
  - Khung SVG căn giữa, có lề bảo vệ (Quiet Zone) 4 module đúng chuẩn QR quốc tế.
- **Hướng dẫn & Hành động phụ:**
  - Dòng chỉ dẫn: *"Dùng camera điện thoại (iPhone/Android) quét mã để thêm sự kiện vào lịch máy."*
  - Nút sao chép `#copyIcalPayloadBtn`: Cho phép sao chép nhanh chuỗi dữ liệu iCal vào clipboard (có toast phản hồi).

---

## 4. Dark Mode & Responsive Styling

- Khung Modal `.modal-content` sử dụng biến `--bg-elevated` và `--text`.
- Thanh chọn phạm vi `.qr-scope-btn`:
  - Trạng thái thường: Nền `--bg-subtle`, viền `--border`, chữ `--text-muted`.
  - Trạng thái chọn: Nền `--accent`, viền `--accent`, chữ trắng (`#ffffff`), in đậm.
- Khung QR `.qr-display-card`:
  - Nền cố định `#ffffff`, viền `1px solid rgba(0,0,0,0.1)`, bo góc `12px`, padding `12px`.
  - Giúp quét nhạy cả trong phòng tối lẫn môi trường ánh sáng mạnh.

---

## 5. Error Handling & Edge Cases

1. **Chưa có dữ liệu lịch (Empty Data):**
   - Không sinh QR rỗng.
   - Hiển thị thông báo thân thiện: *"Chưa có dữ liệu lịch để tạo mã QR. Hãy đồng bộ từ FAP trước."* kèm nút hướng dẫn.
2. **Kích thước payload lớn (Too many events):**
   - Nếu số lượng tiết học trong tuần vượt quá dung lượng an toàn (> 1.500 ký tự), tự động chuyển sang mức sửa lỗi Level L (Low) để giữ mật độ điểm ảnh ở mức dễ quét nhất.
3. **Sao chép nội dung iCal:**
   - Dùng `navigator.clipboard.writeText` với fallback nếu clipboard bị chặn.

---

## 6. Testing Strategy

### 6.1. Unit Tests (`tests/qrcode.test.js`)
- Kiểm tra tính toán ma trận QR cho các độ dài chuỗi khác nhau.
- Kiểm tra `QRCode.toSvgString()` sinh đúng chuỗi `<svg ...>` có `viewBox` và các thẻ `rect`/`path`.
- Kiểm tra hàm sinh payload iCal rút gọn cho lịch thi và lịch học.
- Kiểm tra lọc theo phạm vi (hôm nay, tuần này, tuần tới).

### 6.2. DOM Boot Integration Tests (`tests/popup-boot.test.js`)
- Kiểm tra `QRCode` có sẵn trên `window`.
- Kiểm tra `#qrExamBtn` và `#qrScheduleBtn` hiện diện trên giao diện.
- Kiểm tra thao tác click mở modal `#qrSyncModal`, render thẻ `<svg>` bên trong `.qr-display-card`.
- Kiểm tra chuyển đổi scope (`Hôm nay`, `Tuần này`, `Tuần tới`) tự động vẽ lại SVG.
- Kiểm tra đóng modal.
- Đảm bảo toàn bộ 90+ tests pass 100%.

---

## 7. Operational Constraints
- Tuyệt đối không chạy lệnh `./zip-extension.sh`.
- Giữ nguyên toàn bộ mã nguồn unpacked và sạch sẽ.
