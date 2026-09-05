# Design: Dark Mode Theme Support

**Ngày:** 2026-09-06  
**Phạm vi:** Giao diện Popup Extension (`popup.html`, `popup.css`, `popup.js`).

## Bối cảnh

FPTU Schedule hiện tại sử dụng giao diện nền sáng (Light mode) với tông màu xám nhạt (`#eef1f6`) và thẻ nổi màu trắng (`#ffffff`). Khi sinh viên tra cứu lịch thi, lịch học hoặc bảng điểm vào buổi tối, giao diện sáng dễ gây chói mắt. Việc bổ sung Dark Mode giúp tăng tính thẩm mỹ, bảo vệ mắt và đáp ứng xu hướng thiết kế hiện đại.

Khảo sát mã nguồn cho thấy:
- ~75% màu sắc cốt lõi đã được định nghĩa tại `:root` trong `popup.css` (`--bg-app`, `--bg-elevated`, `--text`, `--accent`, `--border`...).
- ~25% màu sắc đang được fix cứng rải rác: khung chi tiết (`.exam-detail`, `.class-meta`, `.grade-predictor-box`), các nhãn trạng thái (`.tag.*`, `.chip.*`, `.grade-badge--*`), thanh trượt và tiến độ điểm.
- Extension không có CSS framework cồng kềnh, toàn bộ là Pure Vanilla CSS, rất thuận lợi để chuẩn hóa Design Tokens.

## Mục tiêu

1. Hỗ trợ 3 chế độ giao diện:
   - **Tự động (Auto / System):** Tự động thích ứng theo chế độ giao diện của hệ điều hành (`prefers-color-scheme`).
   - **Sáng (Light):** Luôn áp dụng giao diện nền sáng.
   - **Tối (Dark):** Luôn áp dụng giao diện nền tối với độ tương phản cao, dịu mắt (WCAG AA).
2. Thêm nút chuyển đổi nhanh (Theme Toggle Button) tại thanh Header của popup (ngay cạnh nút chuông Thông báo 🔔).
3. Lưu cấu hình lựa chọn vào `chrome.storage.local` với khóa `theme: 'auto' | 'light' | 'dark'`.
4. Không làm nháy trắng (FOUC) khi mở popup.
5. Chuẩn hóa toàn bộ các màu fix cứng thành Design Tokens nhất quán.

## Kiến trúc & Hệ thống Design Tokens

### 1. Phân cấp Tokens trong `popup.css`

#### Base Tokens (`:root` - Mặc định Light)
```css
:root {
  --bg-app: #eef1f6;
  --bg-elevated: #ffffff;
  --bg-subtle: #f4f6f9;
  --bg-card-subtle: #f8fafc;
  --border: #e5e7eb;
  --border-strong: #d1d5db;
  --border-card-subtle: #e2e8f0;
  --text: #111827;
  --text-muted: #6b7280;
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-soft: #eff6ff;
  --danger: #dc2626;
  --danger-soft: #fef2f2;
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-md: 0 4px 16px rgba(15, 23, 42, 0.08);
}
```

#### Dark Tokens (`[data-theme="dark"]` và `@media (prefers-color-scheme: dark)` khi `data-theme="auto"`)
```css
[data-theme="dark"],
[data-theme="auto"] {
  /* Khi auto, sử dụng media query prefers-color-scheme: dark */
}
```
Chi tiết bảng màu Dark Mode:
- `--bg-app: #0f172a;` (Slate 900 - Nền sâu)
- `--bg-elevated: #1e293b;` (Slate 800 - Nền card, header, modal)
- `--bg-subtle: #273549;` (Slate 700 - Hover, tab inactive hover)
- `--bg-card-subtle: #162032;` (Nền lồng trong sub-box)
- `--border: #334155;` (Slate 700)
- `--border-strong: #475569;` (Slate 600)
- `--border-card-subtle: #293548;`
- `--text: #f8fafc;` (Slate 50)
- `--text-muted: #94a3b8;` (Slate 400)
- `--accent: #3b82f6;` (Blue 500 sáng)
- `--accent-hover: #60a5fa;`
- `--accent-soft: rgba(59, 130, 246, 0.2);`
- `--danger: #ef4444;`
- `--danger-soft: rgba(239, 68, 68, 0.2);`
- `--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);`
- `--shadow-md: 0 4px 20px rgba(0, 0, 0, 0.45);`

### 2. Chuẩn hóa các Badge, Tag, Chip

Tại Dark Mode:
- `.tag.fe`: `background: rgba(37, 99, 235, 0.2); color: #93c5fd; border-color: rgba(96, 165, 250, 0.3);`
- `.tag.pe`: `background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border-color: rgba(52, 211, 153, 0.3);`
- `.tag.secondfe`: `background: rgba(234, 88, 12, 0.2); color: #fdba74; border-color: rgba(251, 146, 60, 0.3);`
- `.tag.secondpe`: `background: rgba(124, 58, 237, 0.2); color: #d8b4fe; border-color: rgba(192, 132, 252, 0.3);`
- `.tag.today, .tag.urgent`: `background: rgba(239, 68, 68, 0.2); color: #fca5a5; border-color: rgba(248, 113, 113, 0.3);`
- `#scheduleTab .chip.type`: Đồng bộ màu tương ứng tag.
- `#scheduleTab .chip.online`: `background: rgba(16, 185, 129, 0.2); color: #6ee7b7;`
- `#scheduleTab .chip.attendance.attended`: `background: rgba(16, 185, 129, 0.2); color: #6ee7b7;`
- `#scheduleTab .chip.attendance.absent`: `background: rgba(239, 68, 68, 0.2); color: #fca5a5;`
- `#scheduleTab .chip.attendance.notyet`: `background: rgba(100, 116, 139, 0.2); color: #cbd5e1;`
- Grade Badges (`.grade-badge--passed`, `--inprogress`, `--failed`): Áp dụng dải màu tương tự.
- Grade Predictor Results (`.grade-predict-result--*`): Chuyển nền và border sang màu tương thích dark mode.

### 3. Sub-boxes & Form Elements

- `.exam-detail`, `.class-meta`, `.grade-predictor-box`:
  ```css
  background: var(--bg-card-subtle);
  border: 1px solid var(--border-card-subtle);
  ```
- `.meta-label`: `color: var(--text-muted);`
- `.meta-value`: `color: var(--text);`
- `.grade-slider`: Track chuyển thành `background: var(--border-strong);`
- `.grade-progress-wrap`: `background: var(--border);`
- Select inputs & buttons trong modal: kế thừa `var(--bg-elevated)`, `var(--text)`, `var(--border-strong)`.

## Giao diện & Tương tác (UI & Interaction)

### 1. Nút bấm trên Header

Trong `popup.html`:
```html
<div class="popup-header__actions">
  <button type="button" id="themeToggleBtn" class="header-icon-btn" title="Chế độ giao diện: Tự động" aria-label="Chế độ giao diện">
    <svg class="icon" aria-hidden="true"><use href="#icon-theme-auto"/></svg>
  </button>
  <button type="button" id="notificationBtn" class="header-icon-btn" ...>
    ...
  </button>
</div>
```

SVG Icons mới bổ sung vào `<svg class="icon-sprite">`:
- `#icon-sun`: Hình mặt trời (chế độ sáng).
- `#icon-moon`: Hình mặt trăng (chế độ tối).
- `#icon-theme-auto`: Hình kết hợp hoặc màn hình desktop (chế độ tự động/hệ thống).

### 2. Chu trình chuyển đổi (State Cycle)

Khi người dùng click vào `#themeToggleBtn`:
1. Đọc theme hiện tại (`auto` ➔ `light` ➔ `dark` ➔ `auto`).
2. Cập nhật thuộc tính `data-theme` trên thẻ `<html>`:
   - Nếu `theme === 'auto'`: set `data-theme="auto"` (hoặc tự động kiểm tra `window.matchMedia('(prefers-color-scheme: dark)').matches` để gán `dark` hay `light`).
   - Nếu `theme === 'light'`: set `data-theme="light"`.
   - Nếu `theme === 'dark'`: set `data-theme="dark"`.
3. Cập nhật icon và `title` trên `#themeToggleBtn`:
   - `auto`: Icon theme-auto, tooltip "Giao diện: Tự động (theo hệ thống)".
   - `light`: Icon sun, tooltip "Giao diện: Sáng".
   - `dark`: Icon moon, tooltip "Giao diện: Tối".
4. Lưu vào `chrome.storage.local.set({ theme })`.
5. Hiển thị thông báo toast ngắn (ví dụ: "Đã chuyển sang giao diện Tối").

### 3. Lắng nghe thay đổi hệ điều hành

Nếu `theme === 'auto'`, đăng ký listener:
```javascript
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (currentTheme === 'auto') {
    applyTheme('auto');
  }
});
```

## Kế hoạch kiểm thử (Verification Plan)

1. **Kiểm tra chuyển đổi 3 trạng thái:**
   - Click nút: `auto` ➔ `light` ➔ `dark` ➔ `auto`.
   - Kiểm tra icon và tooltip cập nhật chính xác.
   - Tắt popup, mở lại: theme đã chọn vẫn được duy trì nguyên vẹn từ `chrome.storage.local`.
2. **Kiểm tra độ tương phản và hiển thị các Tab:**
   - **Tab Lịch học:** Thẻ lớp học, chip môn, chip điểm danh (attended/absent/not yet), chip online/phòng học, khung ghi chú meta.
   - **Tab Kỳ thi:** Thẻ môn thi, tag FE/PE/Second FE, tag Countdown (urgent/future/past), khung chi tiết phòng thi.
   - **Tab Điểm số:** Thẻ môn học, thanh tiến độ điểm, hộp dự đoán điểm (predictor slider, kết quả tính toán), bảng chi tiết điểm thành phần.
   - **Các Modal:** Modal Lọc lịch học, Modal Đồng bộ nhiều tuần, Modal Cài đặt thông báo.
3. **Kiểm thử tự động:**
   - Chạy `npm test` đảm bảo toàn bộ 75 unit tests hiện tại tiếp tục pass 100%.
   - Bổ sung unit tests cho logic quản lý theme (resolve theme, cycle theme) nếu tách module helper.
