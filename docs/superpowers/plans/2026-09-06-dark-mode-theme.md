# Dark Mode Theme Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai tính năng Dark Mode cho extension FPTU Schedule với 3 chế độ (Auto/System, Light, Dark), nút toggle trên Header và hệ thống Design Tokens nhất quán.

**Architecture:** Tạo module thuần JS `lib/theme.js` (UMD) quản lý chu trình chuyển đổi và tính toán theme hiệu lực; mở rộng `:root` và định nghĩa `[data-theme="dark"]` trong `popup.css` để chuẩn hóa các màu fix cứng sang CSS Variables; tích hợp nút toggle và listener `prefers-color-scheme` trong `popup.html` và `popup.js`.

**Tech Stack:** Vanilla JavaScript (ES6+), Pure Vanilla CSS (CSS Custom Properties), HTML5 SVG Sprites, Chrome Extension MV3 (`chrome.storage.local`), Node.js built-in test runner (`node:test`).

## Global Constraints

- Không dùng thư viện ngoài hay CSS framework (Bootstrap, Tailwind). Chỉ dùng Vanilla CSS và Vanilla JS.
- Mọi module trong `lib/` đều dùng định dạng UMD để chạy được cả trong Node.js (test) và trình duyệt (extension).
- Bảo toàn 75 unit test hiện có trong `tests/` luôn pass 100%.
- **TUYỆT ĐỐI KHÔNG** chạy lệnh `./zip-extension.sh` hay tạo file zip đóng gói trong quá trình thực hiện khi chưa có yêu cầu từ người dùng.

---

### Task 1: Module quản lý Theme (`lib/theme.js`) và Unit Tests (`tests/theme.test.js`)

**Files:**
- Create: `lib/theme.js`
- Create: `tests/theme.test.js`

**Interfaces:**
- Produces:
  - `THEME_VALUES: { AUTO: 'auto', LIGHT: 'light', DARK: 'dark' }`
  - `getNextTheme(currentTheme: string): string`
  - `resolveEffectiveTheme(savedTheme: string, systemPrefersDark: boolean): 'light' | 'dark'`
  - `getThemeLabel(theme: string): string`
  - `getThemeIcon(theme: string): string`

- [ ] **Step 1: Viết failing test trong `tests/theme.test.js`**

```javascript
const test = require("node:test");
const assert = require("node:assert");
const {
  THEME_VALUES,
  getNextTheme,
  resolveEffectiveTheme,
  getThemeLabel,
  getThemeIcon
} = require("../lib/theme.js");

test("THEME_VALUES contains expected keys", () => {
  assert.strictEqual(THEME_VALUES.AUTO, "auto");
  assert.strictEqual(THEME_VALUES.LIGHT, "light");
  assert.strictEqual(THEME_VALUES.DARK, "dark");
});

test("getNextTheme cycles through auto -> light -> dark -> auto", () => {
  assert.strictEqual(getNextTheme("auto"), "light");
  assert.strictEqual(getNextTheme("light"), "dark");
  assert.strictEqual(getNextTheme("dark"), "auto");
  assert.strictEqual(getNextTheme("unknown"), "auto");
});

test("resolveEffectiveTheme resolves system theme when set to auto", () => {
  assert.strictEqual(resolveEffectiveTheme("auto", true), "dark");
  assert.strictEqual(resolveEffectiveTheme("auto", false), "light");
});

test("resolveEffectiveTheme respects explicit light or dark settings", () => {
  assert.strictEqual(resolveEffectiveTheme("light", true), "light");
  assert.strictEqual(resolveEffectiveTheme("light", false), "light");
  assert.strictEqual(resolveEffectiveTheme("dark", true), "dark");
  assert.strictEqual(resolveEffectiveTheme("dark", false), "dark");
});

test("getThemeLabel returns descriptive Vietnamese labels", () => {
  assert.match(getThemeLabel("auto"), /Tự động/i);
  assert.match(getThemeLabel("light"), /Sáng/i);
  assert.match(getThemeLabel("dark"), /Tối/i);
});

test("getThemeIcon returns matching svg icon symbol id", () => {
  assert.strictEqual(getThemeIcon("auto"), "icon-theme-auto");
  assert.strictEqual(getThemeIcon("light"), "icon-sun");
  assert.strictEqual(getThemeIcon("dark"), "icon-moon");
});
```

- [ ] **Step 2: Chạy test để xác nhận test fail do chưa có module**

Run: `node --test tests/theme.test.js`  
Expected: FAIL (Cannot find module '../lib/theme.js')

- [ ] **Step 3: Viết module `lib/theme.js` (UMD)**

```javascript
(function (root, factory) {
  const api = factory();
  Object.assign(root, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const THEME_VALUES = {
    AUTO: "auto",
    LIGHT: "light",
    DARK: "dark"
  };

  function getNextTheme(currentTheme) {
    if (currentTheme === THEME_VALUES.AUTO) return THEME_VALUES.LIGHT;
    if (currentTheme === THEME_VALUES.LIGHT) return THEME_VALUES.DARK;
    return THEME_VALUES.AUTO;
  }

  function resolveEffectiveTheme(savedTheme, systemPrefersDark) {
    if (savedTheme === THEME_VALUES.LIGHT) return THEME_VALUES.LIGHT;
    if (savedTheme === THEME_VALUES.DARK) return THEME_VALUES.DARK;
    return systemPrefersDark ? THEME_VALUES.DARK : THEME_VALUES.LIGHT;
  }

  function getThemeLabel(theme) {
    if (theme === THEME_VALUES.LIGHT) return "Giao diện: Sáng";
    if (theme === THEME_VALUES.DARK) return "Giao diện: Tối";
    return "Giao diện: Tự động (theo hệ thống)";
  }

  function getThemeIcon(theme) {
    if (theme === THEME_VALUES.LIGHT) return "icon-sun";
    if (theme === THEME_VALUES.DARK) return "icon-moon";
    return "icon-theme-auto";
  }

  return {
    THEME_VALUES,
    getNextTheme,
    resolveEffectiveTheme,
    getThemeLabel,
    getThemeIcon
  };
});
```

- [ ] **Step 4: Chạy toàn bộ unit test**

Run: `npm test`  
Expected: PASS (All tests passing)

- [ ] **Step 5: Commit**

```bash
git add lib/theme.js tests/theme.test.js
git commit -m "feat: add theme helper module and unit tests"
```

---

### Task 2: Cập nhật Header & SVG Icons trong `popup.html`

**Files:**
- Modify: `popup.html:40-52` (SVG sprite), `popup.html:70-74` (Header buttons), `popup.html:345-353` (Script tags)

**Interfaces:**
- Consumes: `lib/theme.js`
- Produces: DOM elements `#themeToggleBtn`, `#icon-sun`, `#icon-moon`, `#icon-theme-auto`

- [ ] **Step 1: Bổ sung SVG symbols vào `.icon-sprite` trong `popup.html`**

Thêm các icon sau vào khối `<svg class="icon-sprite">`:
- `#icon-sun`: Mặt trời
- `#icon-moon`: Mặt trăng
- `#icon-theme-auto`: Nửa vầng sáng tối / màn hình

```html
    <symbol id="icon-sun" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </symbol>
    <symbol id="icon-moon" viewBox="0 0 24 24">
      <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
    </symbol>
    <symbol id="icon-theme-auto" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>
      <path fill="currentColor" d="M12 3a9 9 0 000 18V3z"/>
    </symbol>
```

- [ ] **Step 2: Cập nhật cấu trúc Header trong `popup.html`**

Bọc `#themeToggleBtn` và `#notificationBtn` vào container `.popup-header__actions`:

```html
      <div class="popup-header__actions">
        <button type="button" id="themeToggleBtn" class="header-icon-btn" title="Chế độ giao diện: Tự động" aria-label="Chế độ giao diện">
          <svg class="icon" aria-hidden="true"><use href="#icon-theme-auto"/></svg>
        </button>
        <button type="button" id="notificationBtn" class="header-icon-btn" title="Cài đặt thông báo" aria-label="Cài đặt thông báo">
          <svg class="icon" aria-hidden="true"><use href="#icon-bell"/></svg>
        </button>
      </div>
```

- [ ] **Step 3: Nhúng `lib/theme.js` trước `popup.js` trong `popup.html`**

```html
  <script src="lib/theme.js"></script>
  <script src="popup.js"></script>
```

- [ ] **Step 4: Kiểm tra tính hợp lệ của HTML và chạy test**

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add popup.html
git commit -m "feat: add theme toggle button, svg icons, and theme script to popup.html"
```

---

### Task 3: CSS Design Tokens và Giao diện Dark Mode trong `popup.css`

**Files:**
- Modify: `popup.css`

**Interfaces:**
- Consumes: Các class hiện có trên toàn bộ giao diện popup
- Produces: Bộ tokens `[data-theme="dark"]`, biến `--bg-card-subtle`, `.popup-header__actions`

- [ ] **Step 1: Bổ sung tokens vào `:root` và định nghĩa tokens cho `[data-theme="dark"]`**

Trong `:root`:
```css
  --bg-card-subtle: #f8fafc;
  --border-card-subtle: #e2e8f0;
```

Thêm khối ruleset `[data-theme="dark"]`:
```css
[data-theme="dark"] {
  --bg-app: #0f172a;
  --bg-elevated: #1e293b;
  --bg-subtle: #273549;
  --bg-card-subtle: #162032;
  --border: #334155;
  --border-strong: #475569;
  --border-card-subtle: #293548;
  --text: #f8fafc;
  --text-muted: #94a3b8;
  --accent: #3b82f6;
  --accent-hover: #60a5fa;
  --accent-soft: rgba(59, 130, 246, 0.2);
  --danger: #ef4444;
  --danger-soft: rgba(239, 68, 68, 0.2);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.45);
}
```

- [ ] **Step 2: Thêm style cho `.popup-header__actions`**

```css
.popup-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 3: Chuẩn hóa các khung sub-box và nhãn sang dùng tokens**

1. Thay thế nền fix cứng của `.exam-detail`, `.class-meta`, `.grade-predictor-box`:
```css
.exam-detail,
#scheduleTab .class-meta,
.grade-predictor-box {
  background: var(--bg-card-subtle);
  border: 1px solid var(--border-card-subtle);
}
```

2. Chuẩn hóa nhãn `.meta-label` và `.meta-value`:
```css
.meta-label {
  color: var(--text-muted);
}
.meta-value {
  color: var(--text);
}
```

3. Cập nhật thanh tiến độ và slider trong Tab Điểm số:
```css
.grade-progress-wrap {
  background: var(--border-strong);
}
.grade-slider {
  background: var(--border-strong);
}
.grade-table td {
  border-bottom: 1px solid var(--border);
}
```

4. Cập nhật card viền và bóng đổ ở dark mode:
```css
[data-theme="dark"] .exam-card,
[data-theme="dark"] #scheduleTab .class-card,
[data-theme="dark"] .grade-card {
  border-color: var(--border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
```

- [ ] **Step 4: Tinh chỉnh màu Tags, Chips và Badges ở Dark Mode**

Bổ sung các ruleset cho dark theme để giữ độ tương phản cao và dịu mắt:
```css
[data-theme="dark"] .tag.fe { color: #93c5fd; background: rgba(37, 99, 235, 0.2); border-color: rgba(96, 165, 250, 0.3); }
[data-theme="dark"] .tag.pe { color: #6ee7b7; background: rgba(16, 185, 129, 0.2); border-color: rgba(52, 211, 153, 0.3); }
[data-theme="dark"] .tag.secondfe { color: #fdba74; background: rgba(234, 88, 12, 0.2); border-color: rgba(251, 146, 60, 0.3); }
[data-theme="dark"] .tag.secondpe { color: #d8b4fe; background: rgba(124, 58, 237, 0.2); border-color: rgba(192, 132, 252, 0.3); }
[data-theme="dark"] .tag.today,
[data-theme="dark"] .tag.urgent { color: #fca5a5; background: rgba(239, 68, 68, 0.2); border-color: rgba(248, 113, 113, 0.3); }

[data-theme="dark"] #scheduleTab .chip.type { color: #fdba74; background: rgba(234, 88, 12, 0.2); border-color: rgba(251, 146, 60, 0.3); }
[data-theme="dark"] #scheduleTab .chip.online { color: #6ee7b7; background: rgba(16, 185, 129, 0.2); border-color: rgba(52, 211, 153, 0.3); }
[data-theme="dark"] #scheduleTab .chip.room { color: #fca5a5; background: rgba(239, 68, 68, 0.2); border-color: rgba(248, 113, 113, 0.3); }
[data-theme="dark"] #scheduleTab .chip.attendance { background: rgba(100, 116, 139, 0.2); color: #cbd5e1; border-color: rgba(100, 116, 139, 0.3); }
[data-theme="dark"] #scheduleTab .chip.attendance.notyet { background: rgba(100, 116, 139, 0.2); color: #cbd5e1; border-color: rgba(100, 116, 139, 0.3); }
[data-theme="dark"] #scheduleTab .chip.attendance.attended { color: #6ee7b7; background: rgba(16, 185, 129, 0.2); border-color: rgba(52, 211, 153, 0.3); }
[data-theme="dark"] #scheduleTab .chip.attendance.absent { color: #fca5a5; background: rgba(239, 68, 68, 0.2); border-color: rgba(248, 113, 113, 0.3); }

[data-theme="dark"] .grade-badge--passed { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border-color: rgba(52, 211, 153, 0.3); }
[data-theme="dark"] .grade-badge--inprogress { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border-color: rgba(96, 165, 250, 0.3); }
[data-theme="dark"] .grade-badge--failed { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border-color: rgba(248, 113, 113, 0.3); }

[data-theme="dark"] .grade-predict-result--guaranteed { background: rgba(22, 101, 52, 0.25); color: #86efac; border-color: rgba(34, 197, 94, 0.3); }
[data-theme="dark"] .grade-predict-result--achievable { background: rgba(30, 58, 138, 0.25); color: #93c5fd; border-color: rgba(59, 130, 246, 0.3); }
[data-theme="dark"] .grade-predict-result--warning { background: rgba(146, 64, 14, 0.25); color: #fde68a; border-color: rgba(245, 158, 11, 0.3); }
[data-theme="dark"] .grade-predict-result--impossible { background: rgba(153, 27, 27, 0.25); color: #fca5a5; border-color: rgba(239, 68, 68, 0.3); }
```

- [ ] **Step 5: Chạy test kiểm tra toàn bộ suite**

Run: `npm test`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add popup.css
git commit -m "feat: add dark mode design tokens and element styling in popup.css"
```

---

### Task 4: Xử lý tương tác & Lưu trữ Theme trong `popup.js`

**Files:**
- Modify: `popup.js`

**Interfaces:**
- Consumes: `lib/theme.js` (`THEME_VALUES`, `getNextTheme`, `resolveEffectiveTheme`, `getThemeLabel`, `getThemeIcon`)
- Produces: Quản lý thuộc tính `data-theme` trên `<html>`, lắng nghe click `#themeToggleBtn` và `matchMedia`.

- [ ] **Step 1: Viết hàm áp dụng theme và cập nhật UI nút bấm**

```javascript
  let currentThemePreference = "auto";

  function applyTheme(preference, showToastFeedback = false) {
    currentThemePreference = preference;
    const systemPrefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const effectiveTheme = resolveEffectiveTheme(preference, systemPrefersDark);

    document.documentElement.setAttribute("data-theme", effectiveTheme);
    document.documentElement.setAttribute("data-theme-preference", preference);

    const themeToggleBtn = document.getElementById("themeToggleBtn");
    if (themeToggleBtn) {
      const iconName = getThemeIcon(preference);
      const label = getThemeLabel(preference);
      themeToggleBtn.setAttribute("title", label);
      themeToggleBtn.setAttribute("aria-label", label);
      const useEl = themeToggleBtn.querySelector("use");
      if (useEl) {
        useEl.setAttribute("href", `#${iconName}`);
      }
    }

    if (showToastFeedback && typeof showToast === "function") {
      showToast(getThemeLabel(preference));
    }
  }
```

- [ ] **Step 2: Khởi tạo theme khi mở popup và đăng ký event listener**

1. Khởi tạo từ `chrome.storage.local`:
```javascript
  chrome.storage.local.get({ theme: "auto" }, (result) => {
    applyTheme(result.theme || "auto", false);
  });
```

2. Đăng ký sự kiện click nút `#themeToggleBtn`:
```javascript
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const nextTheme = getNextTheme(currentThemePreference);
      chrome.storage.local.set({ theme: nextTheme }, () => {
        applyTheme(nextTheme, true);
      });
    });
  }
```

3. Đăng ký sự kiện `matchMedia` lắng nghe thay đổi theme OS:
```javascript
  if (window.matchMedia) {
    const colorSchemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      if (currentThemePreference === "auto") {
        applyTheme("auto", false);
      }
    };
    if (typeof colorSchemeMediaQuery.addEventListener === "function") {
      colorSchemeMediaQuery.addEventListener("change", handleMediaChange);
    } else if (typeof colorSchemeMediaQuery.addListener === "function") {
      colorSchemeMediaQuery.addListener(handleMediaChange);
    }
  }
```

- [ ] **Step 3: Chạy test kiểm tra toàn bộ suite**

Run: `npm test`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: implement theme toggle interaction and storage in popup.js"
```

---

### Task 5: Kiểm thử hoàn chỉnh (Full Verification)

**Files:**
- Test: Toàn bộ extension (`popup.html`, `popup.css`, `popup.js`, `lib/theme.js`, `tests/*.test.js`)

- [ ] **Step 1: Chạy toàn bộ unit test suite**

Run: `npm test`  
Expected: PASS (Tất cả các bài test trong `tests/*.test.js` đều pass 100%)

- [ ] **Step 2: Kiểm tra DOM rendering và switch theme bằng script mô phỏng**

Viết script test ngắn chạy qua `jsdom` kiểm tra chuyển đổi class, icon, và storage:
Run: `node -e "const { getNextTheme, resolveEffectiveTheme } = require('./lib/theme.js'); console.log('Theme cycling verified:', getNextTheme('auto') === 'light' && getNextTheme('light') === 'dark');"`  
Expected: `Theme cycling verified: true`

- [ ] **Step 3: Kiểm tra Git status sạch sẽ**

Run: `git status`  
Expected: Clean working tree

*(Nhắc nhở: Không chạy lệnh `./zip-extension.sh`)*
