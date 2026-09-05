# Exam study splash suggestions (Quizlet-style) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trên mỗi thẻ kỳ thi trong popup, hiển thị một “splash card” gợi ý nguồn ôn tập theo **mã môn** (lấy từ `e.title`), với liên kết dạng Quizlet / tìm kiếm / nguồn tùy chỉnh trong JSON, bổ sung fallback khi chưa có cấu hình.

**Architecture:** Dữ liệu gợi ý lưu trong `study-sources.json` (key = mã môn chuẩn hoá). Module `study-suggestions.js` (IIFE + `window`) cung cấp `normalizeCourseCode(title)`, `getStudySuggestions(code)`, và URL fallback Quizlet search. `createExamItem` trong `popup.js` gắn một khối DOM `.exam-splash` ngay dưới `.exam-detail`. Style Quizlet-like (gradient tím–lam, CTA rõ) nằm trong `popup.css`. Không gọi API ngoài để crawl; chỉ mở tab khi người dùng nhấn (tuân thủ quyền riêng tư).

**Tech Stack:** Chrome MV3 extension, vanilla JS, JSON tĩnh, CSS (popup). Không thêm bundler hay npm (repo hiện không có `package.json`).

---

## File structure (create / modify)

| File | Responsibility |
|------|----------------|
| `study-sources.json` | Map mã môn → mảng `{ "label", "url", "kind" }` (curated links). |
| `study-suggestions.js` | Parse/normalize mã môn, đọc JSON (fetch `chrome.runtime.getURL`), merge với fallback links. |
| `popup.html` | Thêm `<script src="study-suggestions.js">` **trước** `popup.js`. |
| `popup.js` | Trong `createExamItem`, sau khi `examCard.appendChild(examDetail)`, gắn splash DOM. |
| `popup.css` | Lớp `.exam-splash`, `.exam-splash__title`, `.exam-splash__actions`, nút CTA. |
| `manifest.json` | Khai báo `web_accessible_resources` cho `study-sources.json` nếu `fetch(chrome.runtime.getURL(...))` báo lỗi trên bản Chrome của bạn; trên MV3 thường cần để file không trong `web_accessible_resources` vẫn fetch được từ extension context — **nếu fetch thất bại trong Task 3, thêm entry** (xem Task 3). |

---

### Task 1: Schema + sample `study-sources.json`

**Files:**
- Create: `study-sources.json` (repo root, cạnh `manifest.json`)

- [ ] **Step 1: Add JSON file with documented shape**

Nội dung khởi tạo (có thể mở rộng sau; đây là ví dụ thật để QA):

```json
{
  "$schema_note": "Keys = uppercase course codes. Remove this key in production if strict parsers complain; or keep — JSON.parse allows it.",
  "PRJ301": [
    {
      "label": "Quizlet — PRJ301",
      "url": "https://quizlet.com/search?query=PRJ301",
      "kind": "quizlet"
    }
  ],
  "JPD123": [
    {
      "label": "Quizlet — JPD123",
      "url": "https://quizlet.com/search?query=JPD123",
      "kind": "quizlet"
    }
  ]
}
```

**Lưu ý:** Một số parser JSON nghiêm ngặt có thể không thích key `$schema_note`. Trước khi ship, xóa key đó hoặc đổi tên không bắt đầu bằng `$` nếu gặp lỗi.

- [ ] **Step 2: Validate JSON**

Run:

```bash
python3 -c "import json; json.load(open('study-sources.json')); print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add study-sources.json
git commit -m "feat: add study-sources.json for exam splash links"
```

---

### Task 2: `study-suggestions.js` — normalize + fetch + fallback

**Files:**
- Create: `study-suggestions.js`

- [ ] **Step 1: Implement module (no build step)**

```javascript
(function () {
  const CACHE = { data: null, promise: null };

  function normalizeCourseCode(title) {
    if (!title || typeof title !== "string") return "";
    const t = title.trim();
    const m = t.match(/^([A-Za-z]{2,4}\d{3})\b/);
    return m ? m[1].toUpperCase() : t.split(/\s+/)[0].toUpperCase();
  }

  function fallbackSuggestions(code) {
    if (!code) return [];
    const q = encodeURIComponent(code + " FPTU");
    return [
      {
        label: "Tìm trên Quizlet",
        url: "https://quizlet.com/search?query=" + q,
        kind: "quizlet",
      },
      {
        label: "Tìm trên Google",
        url: "https://www.google.com/search?q=" + encodeURIComponent(code + " FPTU quizlet"),
        kind: "search",
      },
    ];
  }

  function loadStudySources() {
    if (CACHE.data) return Promise.resolve(CACHE.data);
    if (CACHE.promise) return CACHE.promise;
    CACHE.promise = fetch(chrome.runtime.getURL("study-sources.json"))
      .then((r) => {
        if (!r.ok) throw new Error("study-sources: " + r.status);
        return r.json();
      })
      .then((raw) => {
        const map = {};
        Object.keys(raw).forEach((k) => {
          if (k.startsWith("$")) return;
          const code = String(k).toUpperCase();
          const arr = raw[k];
          if (Array.isArray(arr)) map[code] = arr;
        });
        CACHE.data = map;
        return CACHE.data;
      })
      .catch(() => {
        CACHE.data = {};
        return CACHE.data;
      });
    return CACHE.promise;
  }

  async function getStudySuggestions(courseTitle) {
    const code = normalizeCourseCode(courseTitle);
    const map = await loadStudySources();
    const curated = code && map[code] ? map[code].slice() : [];
    const fallbacks = fallbackSuggestions(code);
    const seen = new Set(curated.map((x) => x.url));
    fallbacks.forEach((f) => {
      if (!seen.has(f.url)) {
        curated.push(f);
        seen.add(f.url);
      }
    });
    return { code, items: curated };
  }

  window.FPTUStudySuggestions = {
    normalizeCourseCode,
    getStudySuggestions,
  };
})();
```

- [ ] **Step 2: Manual sanity in console (after Task 4 loads script)**

Sau khi gắn script vào popup (Task 4), load extension, mở popup → Inspect → Console:

```javascript
FPTUStudySuggestions.getStudySuggestions("PRJ301 - Demo").then(console.log)
```

Expected: `{ code: 'PRJ301', items: [...] }` với ít nhất một URL Quizlet.

- [ ] **Step 3: Commit**

```bash
git add study-suggestions.js
git commit -m "feat: study suggestion resolver with Quizlet fallback"
```

---

### Task 3: `manifest.json` — đảm bảo đọc được JSON

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Bump `version` (patch)**

Ví dụ `3.0.9` → `3.1.0` (minor: tính năng mới).

- [ ] **Step 2: Nếu `fetch(chrome.runtime.getURL('study-sources.json'))` trả 404 hoặc network error trong popup**

Thêm (hoặc gộp vào mảng hiện có):

```json
"web_accessible_resources": [
  {
    "resources": ["study-sources.json"],
    "matches": ["<all_urls>"]
  }
]
```

Trên nhiều bản Chrome, `fetch` từ extension page tới packaged file **không** cần WAR; chỉ thêm khi kiểm chứng Task 2 Step 2 thất bại.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "chore: bump version; web_accessible study-sources if needed"
```

---

### Task 4: Wire script in `popup.html`

**Files:**
- Modify: `popup.html` (trước thẻ `<script src="popup.js">`)

- [ ] **Step 1: Insert script tag**

```html
<script src="study-suggestions.js"></script>
```

Đặt ngay trước:

```html
<script src="sanitize-utils.js"></script>
<script src="popup.js"></script>
```

Thứ tự đề xuất: `sanitize-utils.js` → `study-suggestions.js` → `popup.js` (hoặc `study-suggestions` trước `sanitize-utils` nếu không phụ thuộc — giữ `popup.js` cuối).

- [ ] **Step 2: Commit**

```bash
git add popup.html
git commit -m "feat: load study-suggestions in popup"
```

---

### Task 5: DOM trong `createExamItem` (`popup.js`)

**Files:**
- Modify: `popup.js` (hàm `createExamItem`, sau `examCard.appendChild(examDetail);`)

- [ ] **Step 1: Append splash container và populate async**

Ngay trước `row.appendChild(examCard);`, chèn logic sau (copy nguyên):

```javascript
  const splash = document.createElement("div");
  splash.className = "exam-splash";
  splash.setAttribute("role", "region");
  splash.setAttribute("aria-label", "Gợi ý ôn tập");

  const splashInner = document.createElement("div");
  splashInner.className = "exam-splash__inner";

  const splashTitle = document.createElement("div");
  splashTitle.className = "exam-splash__kicker";
  splashTitle.textContent = "Ôn tập";

  const splashHeadline = document.createElement("div");
  splashHeadline.className = "exam-splash__headline";

  const actions = document.createElement("div");
  actions.className = "exam-splash__actions";

  splashInner.appendChild(splashTitle);
  splashInner.appendChild(splashHeadline);
  splashInner.appendChild(actions);
  splash.appendChild(splashInner);
  examCard.appendChild(splash);

  if (window.FPTUStudySuggestions && typeof window.FPTUStudySuggestions.getStudySuggestions === "function") {
    window.FPTUStudySuggestions.getStudySuggestions(e.title || "").then(({ code, items }) => {
      splashHeadline.textContent = code ? `Gợi ý cho ${code}` : "Gợi ý ôn tập";
      actions.replaceChildren();
      if (!items || !items.length) {
        const empty = document.createElement("span");
        empty.className = "exam-splash__empty";
        empty.textContent = "Chưa có liên kết.";
        actions.appendChild(empty);
        return;
      }
      items.forEach((it) => {
        const a = document.createElement("a");
        a.className = "exam-splash__btn";
        a.href = it.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = it.label || "Mở";
        if (it.kind === "quizlet") a.classList.add("exam-splash__btn--quizlet");
        actions.appendChild(a);
      });
    });
  }
```

- [ ] **Step 2: Reload extension và mở tab Kỳ thi**

Kiểm tra mỗi thẻ có khối splash; nhấn link mở tab mới đúng URL.

- [ ] **Step 3: Commit**

```bash
git add popup.js
git commit -m "feat: Quizlet-style study splash on exam cards"
```

---

### Task 6: `popup.css` — Quizlet-like splash

**Files:**
- Modify: `popup.css` (khối sau `.exam-detail` / `.exam-card` hoặc cuối file phần exam)

- [ ] **Step 1: Add styles**

```css
/* Exam study splash (Quizlet-inspired) */
.exam-splash {
  margin-top: 10px;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, #1e3a5f 0%, #4257b2 48%, #5c6bc0 100%);
  box-shadow: 0 4px 14px rgba(30, 58, 95, 0.35);
}

.exam-splash__inner {
  padding: 12px 14px 14px;
  color: #f8fafc;
}

.exam-splash__kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.85;
  margin-bottom: 4px;
}

.exam-splash__headline {
  font-size: 15px;
  font-weight: 750;
  letter-spacing: -0.02em;
  margin-bottom: 10px;
  line-height: 1.25;
}

.exam-splash__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.exam-splash__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
  color: #1e3a5f;
  background: #fff;
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: transform 0.1s ease, box-shadow 0.15s ease;
}

.exam-splash__btn:hover {
  text-decoration: none;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  color: #0f172a;
}

.exam-splash__btn--quizlet {
  background: #fffbeb;
  color: #854d0e;
}

.exam-splash__empty {
  font-size: 12px;
  opacity: 0.9;
}
```

- [ ] **Step 2: Visual check** — popup hẹp ~600px: các nút wrap gọn, không tràn card.

- [ ] **Step 3: Commit**

```bash
git add popup.css
git commit -m "style: exam study splash card (Quizlet-like)"
```

---

### Task 7: `applyFilters` compatibility

**Files:**
- Modify: `popup.js` (chỉ nếu filter đang giả định cấu trúc con trực tiếp của `.exam-card`)

- [ ] **Step 1: Đọc `applyFilters` / selector**

Hiện tại: `examCard.querySelectorAll(".tag")` — splash không dùng class `tag`, không ảnh hưởng.

- [ ] **Step 2: Nếu có logic `display: none` trên toàn bộ children**

Không đổi gì. Nếu sau này filter ẩn theo `.exam-detail` only, giữ nguyên splash hiển thị hoặc ẩn cùng card — **YAGNI**: không code thêm trừ khi test thấy lỗi.

- [ ] **Step 3: Chạy lại filter modal trên danh sách thi**

Bật/tắt FE/PE: thẻ ẩn/hiện đúng; splash vẫn nằm trong thẻ.

---

### Task 8: Packaging & docs (tùy chọn nhỏ)

**Files:**
- Modify: `zip-extension.sh` (nếu dùng) — thêm `study-sources.json` và `study-suggestions.js` vào lệnh `zip`.

Ví dụ (điều chỉnh đường dẫn `cd` cho đúng máy bạn):

```bash
zip -r fptu-examination.zip manifest.json ... study-sources.json study-suggestions.js ...
```

- [ ] **Step 1: Cập nhật zip script**

- [ ] **Step 2: (Tuỳ chọn) Một dòng trong `docs/index.html` mục tính năng — “Gợi ý ôn tập (Quizlet) theo mã môn trên thẻ kỳ thi”**

- [ ] **Step 3: Commit**

```bash
git add zip-extension.sh docs/index.html
git commit -m "chore: include study assets in zip; note in docs"
```

---

## Testing checklist (không có pytest trong repo)

| Bước | Cách kiểm tra |
|------|----------------|
| JSON hợp lệ | `python3 -c "import json; json.load(open('study-sources.json'))"` |
| Popup không lỗi | `chrome://extensions` → Reload → mở popup, Inspect Console không đỏ |
| Splash có nút | Thẻ kỳ thi hiển thị headline + ít nhất 2 CTA (curated hoặc fallback) |
| Mở link | Nhấn nút → tab mới `noopener` |
| Mã môn lạ | Môn không có trong JSON vẫn có Quizlet + Google fallback |
| Filter thi | Lọc FE/PE vẫn hoạt động |

---

## Self-review (đã rà soát)

1. **Spec coverage:** Gợi ý theo mã môn — `normalizeCourseCode(e.title)`; splash kiểu Quizlet — Task 6 CSS + Task 5 layout; nguồn học — JSON + fallback Quizlet/Google. **Gap có chủ ý:** Không embed Quizlet iframe (vi phạm CSP/third-party và UX popup nhỏ); chỉ deep link.
2. **Placeholder scan:** Không dùng TBD; các bước có mã cụ thể.
3. **Consistency:** `getStudySuggestions` trả `{ code, items }`; DOM dùng `it.label`, `it.url`, `it.kind` khớp JSON.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-05-exam-study-splash-suggestions.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Mỗi task một subagent mới, review giữa các task, lặp nhanh.

**2. Inline Execution** — Làm tuần tự trong session này theo checklist, có điểm dừng để review.

**Bạn muốn theo hướng nào?**
