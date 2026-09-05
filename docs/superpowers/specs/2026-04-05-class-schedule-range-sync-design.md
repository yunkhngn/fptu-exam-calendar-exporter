# Design: Đồng bộ lịch học nhiều tuần (FAP ScheduleOfWeek)

**Ngày:** 2026-04-05  
**Phạm vi:** Chỉ lịch học (`ScheduleOfWeek.aspx`), không đổi luồng lịch thi.

## Bối cảnh

Extension hiện scrape **một tuần** đang hiển thị trên FAP, merge vào `localStorage.classSchedule`. Dropdown tuần dùng label dạng `DD/MM To DD/MM`.

## Mục tiêu

- Cho phép đồng bộ **khoảng tuần** (tuần bắt đầu → tuần kết thúc) theo **cùng danh sách option** với FAP.
- **Ưu tiên UX (C):** Giai đoạn 1 — đọc danh sách tuần từ tab FAP đang mở, chọn khoảng trong popup; người dùng chỉnh **năm học** trên FAP trước nếu cần. Giai đoạn sau (tùy chọn): cache danh sách tuần để gợi ý khi không mở tab.

## Kiến trúc

1. **Content script (isolated):** `getWeekScheduleControls` — đọc `<select>` năm/tuần (nếu có), trả về mảng option tuần `{ index, value, label }` và chỉ số hiện tại.
2. **Popup:** Hai `<select>` “Từ tuần / Đến tuần”, nút “Tải danh sách tuần”, nút “Đồng bộ khoảng”.
3. **Đổi tuần trên FAP:** `chrome.scripting.executeScript` với `world: 'MAIN'` — đặt `selectedIndex`, gọi `__doPostBack` theo `onchange` của control (hoặc fallback `__doPostBack(name, '')`).
4. **Sau mỗi lần đổi tuần:** Đăng ký `tabs.onUpdated` (một lần) chờ `status === 'complete'`, delay ngắn cho DOM, inject `content.js`, `extractWeeklySchedule`, merge với dedupe hiện có.

## Hành vi thống nhất

- **Nếu `startIndex > endIndex`:** Đổi chỗ tự động.
- **Nếu tuần đã đang chọn:** Không postback, chỉ extract (tránh chờ load vô ích).
- **Lỗi một tuần (timeout / extract rỗng do lỗi):** **Bỏ qua tuần đó, tiếp tục**; cuối cùng toast/alert tóm tắt số tuần thành công và danh sách tuần lỗi.
- **Trang sai / chưa đăng nhập:** Thông báo rõ; nếu phát hiện login, mở trang đăng nhập (giữ pattern hiện có).

## Ràng buộc

- V1 giả định khoảng tuần nằm trong **bộ option tuần hiện tại** sau khi người dùng chọn **năm** trên FAP (không tự đổi năm trong vòng lặp).
- `manifest.json`: thêm `content_scripts` match cho `https://fap.fpt.edu.vn/Report/*` để script gắn sẵn trên trang tuần; vẫn dùng inject khi cần (tương thích tab cũ).

## Kiểm thử thủ công

- Một tuần: kết quả tương đương “Đồng bộ lịch học” một lần.
- Ba tuần liên tiếp: không trùng slot trong storage; tổng số tiết hợp lý.
- Tab không phải `ScheduleOfWeek.aspx`: báo lỗi thân thiện.

## Giai đoạn 2 (không làm trong PR này)

- Cache snapshot `weeks[]` + cảnh báo stale nếu mở popup không có tab FAP.
