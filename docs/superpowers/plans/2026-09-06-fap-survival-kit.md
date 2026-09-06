# FAP Survival Kit (Keep-Alive & 1-Click Survey Auto-Fill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and integrate FAP Session Keep-Alive and 1-Click Lecturer Feedback Auto-Fill into the FPTU Schedule Chrome Extension.

**Architecture:** 
- `lib/fap-keepalive.js` provides an in-tab heartbeat pinging `/HomePage.aspx` every 7 minutes to refresh the ASP.NET sliding session without wakeups or battery drain when FAP tabs are closed.
- `lib/fap-feedback.js` injects a sleek glassmorphic floating toolbar on FAP survey pages (`*://fap.fpt.edu.vn/Feedback/*`) that auto-selects top ratings (5★) for all criteria and fills a genuine, polite appreciation comment into the feedback textarea.
- `content.js` and `manifest.json` orchestrate content script loading, while `popup.html` and `popup.js` provide a toggle for Keep-Alive in Settings.

**Tech Stack:** Vanilla JavaScript (ES2020), Chrome Extension Manifest V3, Node.js test runner (`node:test`, `node:assert/strict`).

## Global Constraints
- Target release: v3.7.0 (do not bump release tag until fully validated).
- Zero external dependencies: pure vanilla JS and CSS.
- Safety: Survey auto-fill MUST NOT auto-submit. Student reviews and clicks FAP's native submit button.
- Keep-Alive interval: exactly 7 minutes (420,000 ms). Must not run on `/Default.aspx` or `/Logout.aspx`.
- 100% test pass rate on `node --test tests/*.test.js`.

---

### Task 1: FAP Keep-Alive Engine (`lib/fap-keepalive.js` & `tests/fap-keepalive.test.js`)

**Files:**
- Create: `lib/fap-keepalive.js`
- Test: `tests/fap-keepalive.test.js`

**Interfaces:**
- Produces:
  - `isFapSessionCandidate(urlPath: string): boolean`
  - `createFapKeepAlive(options: { pingUrl?: string, intervalMs?: number, storage?: object, fetchFn?: Function }): { start(): void, stop(): void, ping(): Promise<{ ok: boolean, status: number }>, getStatus(): object }`
  - Default interval: 420,000 ms (7 mins).

- [ ] **Step 1: Write the failing test**

Create `tests/fap-keepalive.test.js`:
```javascript
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { isFapSessionCandidate, createFapKeepAlive } = require("../lib/fap-keepalive.js");

describe("FAP Keep-Alive Engine", () => {
  test("isFapSessionCandidate ignores login, logout, and non-FAP pages", () => {
    assert.strictEqual(isFapSessionCandidate("/Default.aspx"), false);
    assert.strictEqual(isFapSessionCandidate("/Logout.aspx"), false);
    assert.strictEqual(isFapSessionCandidate(""), false);
    assert.strictEqual(isFapSessionCandidate("/HomePage.aspx"), true);
    assert.strictEqual(isFapSessionCandidate("/Report/ScheduleOfWeek.aspx"), true);
    assert.strictEqual(isFapSessionCandidate("/Feedback/StudentFeedback.aspx"), true);
  });

  test("ping sends request with credentials and cache: no-store", async () => {
    let calledUrl = null;
    let calledOpts = null;
    const mockFetch = async (url, opts) => {
      calledUrl = url;
      calledOpts = opts;
      return { ok: true, status: 200, redirected: false, url: "https://fap.fpt.edu.vn/HomePage.aspx" };
    };

    const keepAlive = createFapKeepAlive({
      pingUrl: "/HomePage.aspx",
      fetchFn: mockFetch
    });

    const res = await keepAlive.ping();
    assert.strictEqual(res.ok, true);
    assert.strictEqual(calledUrl, "/HomePage.aspx");
    assert.strictEqual(calledOpts.credentials, "include");
    assert.strictEqual(calledOpts.cache, "no-store");
  });

  test("ping stops if response redirects to login page", async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      redirected: true,
      url: "https://fap.fpt.edu.vn/Default.aspx"
    });

    const keepAlive = createFapKeepAlive({
      pingUrl: "/HomePage.aspx",
      fetchFn: mockFetch
    });

    const res = await keepAlive.ping();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "session-expired");
    assert.strictEqual(keepAlive.getStatus().active, false);
  });

  test("respects fapKeepSessionEnabled storage setting", async () => {
    let fetchCount = 0;
    const mockFetch = async () => {
      fetchCount++;
      return { ok: true, status: 200, redirected: false, url: "https://fap.fpt.edu.vn/HomePage.aspx" };
    };

    const mockStorage = {
      get: (keys, cb) => cb({ fapKeepSessionEnabled: false })
    };

    const keepAlive = createFapKeepAlive({
      storage: mockStorage,
      fetchFn: mockFetch
    });

    const res = await keepAlive.ping();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, "disabled-by-user");
    assert.strictEqual(fetchCount, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fap-keepalive.test.js`
Expected: FAIL with `Cannot find module '../lib/fap-keepalive.js'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/fap-keepalive.js`:
```javascript
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FapKeepAlive = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const DEFAULT_INTERVAL_MS = 7 * 60 * 1000; // 7 minutes
  const DEFAULT_PING_URL = "/HomePage.aspx";

  function isFapSessionCandidate(urlPath) {
    if (!urlPath || typeof urlPath !== "string") return false;
    const p = urlPath.toLowerCase();
    if (p.includes("/default.aspx") || p.includes("/logout.aspx")) return false;
    return true;
  }

  function createFapKeepAlive(options = {}) {
    const pingUrl = options.pingUrl || DEFAULT_PING_URL;
    const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
    const fetchFn = options.fetchFn || (typeof fetch === "function" ? fetch : null);
    const storage = options.storage || (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null);

    let timerId = null;
    let isActive = false;
    let lastPingTime = null;
    let lastStatus = null;

    async function checkEnabled() {
      if (!storage || typeof storage.get !== "function") return true;
      return new Promise((resolve) => {
        try {
          storage.get(["fapKeepSessionEnabled"], (res) => {
            if (res && res.fapKeepSessionEnabled === false) {
              resolve(false);
            } else {
              resolve(true);
            }
          });
        } catch (_) {
          resolve(true);
        }
      });
    }

    async function ping() {
      const isEnabled = await checkEnabled();
      if (!isEnabled) {
        return { ok: false, reason: "disabled-by-user" };
      }

      if (!fetchFn) {
        return { ok: false, reason: "no-fetch" };
      }

      try {
        const res = await fetchFn(pingUrl, {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        });

        const redirectedToLogin = res.redirected && (res.url || "").toLowerCase().includes("default.aspx");
        if (redirectedToLogin || res.status === 401 || res.status === 403) {
          stop();
          lastStatus = "session-expired";
          return { ok: false, status: res.status, reason: "session-expired" };
        }

        lastPingTime = Date.now();
        lastStatus = "success";
        return { ok: true, status: res.status };
      } catch (err) {
        lastStatus = "error";
        return { ok: false, error: err.message || "network-error" };
      }
    }

    function start() {
      if (isActive) return;
      isActive = true;
      timerId = setInterval(() => {
        ping();
      }, intervalMs);
    }

    function stop() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      isActive = false;
    }

    function getStatus() {
      return {
        active: isActive,
        lastPingTime,
        lastStatus,
        intervalMs
      };
    }

    return {
      start,
      stop,
      ping,
      getStatus
    };
  }

  return {
    isFapSessionCandidate,
    createFapKeepAlive,
    DEFAULT_INTERVAL_MS,
    DEFAULT_PING_URL
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/fap-keepalive.test.js`
Expected: PASS all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fap-keepalive.js tests/fap-keepalive.test.js
git commit -m "feat(keepalive): implement FAP session heartbeat engine"
```

---

### Task 2: FAP Survey Feedback Core Engine (`lib/fap-feedback.js` & `tests/fap-feedback.test.js`)

**Files:**
- Create: `lib/fap-feedback.js`
- Test: `tests/fap-feedback.test.js`

**Interfaces:**
- Produces:
  - `POSITIVE_COMMENTS: string[]` (bank of polite comments)
  - `getRandomFeedbackComment(excludeIndex?: number): { comment: string, index: number }`
  - `findFapFeedbackRadioGroups(container: Element): Map<string, HTMLInputElement[]>`
  - `findFapCommentTextarea(container: Element): HTMLTextAreaElement | null`
  - `fillFapFeedbackForm(container: Element, commentText?: string): { radiosFilled: number, commentFilled: boolean }`
  - `resetFapFeedbackForm(container: Element): { radiosCleared: number, commentCleared: boolean }`

- [ ] **Step 1: Write the failing test**

Create `tests/fap-feedback.test.js`:
```javascript
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  POSITIVE_COMMENTS,
  getRandomFeedbackComment,
  findFapFeedbackRadioGroups,
  findFapCommentTextarea,
  fillFapFeedbackForm,
  resetFapFeedbackForm
} = require("../lib/fap-feedback.js");

// Minimal mock DOM for Node test environment
function createMockElement(tagName, attrs = {}) {
  const el = {
    tagName: tagName.toUpperCase(),
    attributes: { ...attrs },
    checked: !!attrs.checked,
    value: attrs.value || "",
    name: attrs.name || "",
    id: attrs.id || "",
    type: attrs.type || "",
    children: [],
    parentElement: null,
    getAttribute(k) { return this.attributes[k] || null; },
    setAttribute(k, v) { this.attributes[k] = v; },
    querySelectorAll(selector) {
      const results = [];
      function walk(node) {
        for (const child of node.children) {
          if (matchSelector(child, selector)) results.push(child);
          walk(child);
        }
      }
      walk(el);
      return results;
    },
    querySelector(selector) {
      const res = el.querySelectorAll(selector);
      return res.length > 0 ? res[0] : null;
    },
    appendChild(child) {
      child.parentElement = el;
      el.children.push(child);
      return child;
    },
    dispatchEvent() {}
  };
  return el;
}

function matchSelector(node, selector) {
  if (selector === 'input[type="radio"]') return node.tagName === "INPUT" && node.type === "radio";
  if (selector === "textarea") return node.tagName === "TEXTAREA";
  if (selector.includes("txtComment") || selector.includes("Comment")) {
    return node.tagName === "TEXTAREA" && ((node.id && node.id.includes("Comment")) || (node.name && node.name.includes("Comment")));
  }
  return false;
}

describe("FAP Survey Feedback Core Engine", () => {
  test("POSITIVE_COMMENTS contains at least 10 polite comments", () => {
    assert.ok(Array.isArray(POSITIVE_COMMENTS));
    assert.ok(POSITIVE_COMMENTS.length >= 10);
    POSITIVE_COMMENTS.forEach((c) => {
      assert.ok(typeof c === "string" && c.length > 10);
    });
  });

  test("getRandomFeedbackComment returns random item and excludes previous if specified", () => {
    const first = getRandomFeedbackComment();
    assert.ok(first.comment);
    assert.ok(first.index >= 0);
    const second = getRandomFeedbackComment(first.index);
    assert.notStrictEqual(second.index, first.index);
  });

  test("fillFapFeedbackForm checks the highest rating radio for each question and fills comment", () => {
    const root = createMockElement("div");

    // Question 1: 4 options (values 1, 2, 3, 4)
    for (let i = 1; i <= 4; i++) {
      root.appendChild(createMockElement("input", { type: "radio", name: "grp_q1", value: String(i) }));
    }
    // Question 2: 5 options (values 1, 2, 3, 4, 5)
    for (let i = 1; i <= 5; i++) {
      root.appendChild(createMockElement("input", { type: "radio", name: "grp_q2", value: String(i) }));
    }
    // Comment textarea
    const txt = root.appendChild(createMockElement("textarea", { id: "ctl00_mainContent_txtComment", name: "txtComment" }));

    const result = fillFapFeedbackForm(root, "Thầy dạy rất hay và nhiệt huyết ạ.");
    assert.strictEqual(result.radiosFilled, 2);
    assert.strictEqual(result.commentFilled, true);

    const q1Radios = root.querySelectorAll('input[type="radio"]').filter((r) => r.name === "grp_q1");
    const q2Radios = root.querySelectorAll('input[type="radio"]').filter((r) => r.name === "grp_q2");

    assert.strictEqual(q1Radios.find((r) => r.value === "4").checked, true);
    assert.strictEqual(q1Radios.find((r) => r.value === "1").checked, false);
    assert.strictEqual(q2Radios.find((r) => r.value === "5").checked, true);
    assert.strictEqual(txt.value, "Thầy dạy rất hay và nhiệt huyết ạ.");
  });

  test("resetFapFeedbackForm clears all checked radios and comment", () => {
    const root = createMockElement("div");
    const r1 = root.appendChild(createMockElement("input", { type: "radio", name: "grp_q1", value: "4", checked: true }));
    const txt = root.appendChild(createMockElement("textarea", { id: "txtComment", value: "Great" }));
    txt.value = "Great";

    const res = resetFapFeedbackForm(root);
    assert.strictEqual(res.radiosCleared, 1);
    assert.strictEqual(res.commentCleared, true);
    assert.strictEqual(r1.checked, false);
    assert.strictEqual(txt.value, "");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fap-feedback.test.js`
Expected: FAIL with `Cannot find module '../lib/fap-feedback.js'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/fap-feedback.js`:
```javascript
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FapFeedback = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const POSITIVE_COMMENTS = [
    "Thầy/Cô dạy rất nhiệt tình, giải đáp thắc mắc của sinh viên rất chi tiết và tận tâm ạ.",
    "Bài giảng dễ hiểu, thầy/cô luôn tạo không khí học tập tích cực và truyền cảm hứng cho sinh viên.",
    "Phương pháp giảng dạy rất hay và thực tế, em học hỏi được rất nhiều kiến thức bổ ích từ môn học.",
    "Thầy/Cô chấm chữa bài kỹ lưỡng, đưa ra nhận xét rất chi tiết giúp sinh viên tiến bộ từng ngày ạ.",
    "Em rất cảm ơn thầy/cô đã đồng hành và hỗ trợ lớp nhiệt tình trong suốt học kỳ vừa qua ạ!",
    "Giảng viên có kiến thức chuyên môn sâu rộng, truyền đạt cuốn hút và luôn quan tâm đến sinh viên.",
    "Tiết học luôn sinh động, nhiều ví dụ thực tế sát với công việc sau này. Em rất thích phong cách dạy của thầy/cô.",
    "Thầy/Cô hỗ trợ giải đáp bài tập ngoài giờ rất nhiệt tình, luôn sẵn sàng lắng nghe ý kiến của sinh viên.",
    "Em rất ấn tượng với sự tận tụy và tâm huyết của thầy/cô dành cho môn học và sinh viên ạ.",
    "Thầy/Cô thân thiện, cởi mở, giải thích từng khái niệm rõ ràng, giúp em tiếp thu kiến thức rất hiệu quả.",
    "Bài giảng chuẩn bị rất công phu và dễ tiếp thu, tạo động lực học tập rất lớn cho em ạ.",
    "Mọi thắc mắc của lớp đều được thầy/cô hướng dẫn chu đáo. Em xin chân thành cảm ơn thầy/cô!"
  ];

  function getRandomFeedbackComment(excludeIndex = -1) {
    if (POSITIVE_COMMENTS.length === 1) {
      return { comment: POSITIVE_COMMENTS[0], index: 0 };
    }
    let idx = Math.floor(Math.random() * POSITIVE_COMMENTS.length);
    if (idx === excludeIndex) {
      idx = (idx + 1) % POSITIVE_COMMENTS.length;
    }
    return {
      comment: POSITIVE_COMMENTS[idx],
      index: idx
    };
  }

  function findFapFeedbackRadioGroups(container) {
    const root = container || (typeof document !== "undefined" ? document : null);
    if (!root) return new Map();

    const radios = Array.from(root.querySelectorAll('input[type="radio"]'));
    const groups = new Map();

    radios.forEach((r) => {
      const name = r.name || r.getAttribute("name");
      if (!name) return;
      if (!groups.has(name)) {
        groups.set(name, []);
      }
      groups.get(name).push(r);
    });

    return groups;
  }

  function findFapCommentTextarea(container) {
    const root = container || (typeof document !== "undefined" ? document : null);
    if (!root) return null;

    return (
      root.querySelector('textarea[id*="txtComment"]') ||
      root.querySelector('textarea[name*="Comment"]') ||
      root.querySelector('textarea[id*="Comment"]') ||
      root.querySelector('textarea[id*="mainContent"]') ||
      root.querySelector("textarea")
    );
  }

  function getHighestRatingRadio(radios) {
    if (!radios || radios.length === 0) return null;
    let best = radios[radios.length - 1];
    let maxVal = -Infinity;

    for (const r of radios) {
      const val = parseFloat(r.value);
      if (!isNaN(val) && val > maxVal) {
        maxVal = val;
        best = r;
      }
    }
    return best;
  }

  function fillFapFeedbackForm(container, commentText) {
    const groups = findFapFeedbackRadioGroups(container);
    let radiosFilled = 0;

    groups.forEach((radios) => {
      const highestRadio = getHighestRatingRadio(radios);
      if (highestRadio) {
        highestRadio.checked = true;
        try {
          highestRadio.dispatchEvent(new Event("change", { bubbles: true }));
          highestRadio.dispatchEvent(new Event("click", { bubbles: true }));
        } catch (_) {}
        radiosFilled++;
      }
    });

    let commentFilled = false;
    const txt = findFapCommentTextarea(container);
    if (txt) {
      const textToUse = commentText || getRandomFeedbackComment().comment;
      txt.value = textToUse;
      try {
        txt.dispatchEvent(new Event("input", { bubbles: true }));
        txt.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {}
      commentFilled = true;
    }

    return { radiosFilled, commentFilled };
  }

  function resetFapFeedbackForm(container) {
    const root = container || (typeof document !== "undefined" ? document : null);
    if (!root) return { radiosCleared: 0, commentCleared: false };

    const radios = Array.from(root.querySelectorAll('input[type="radio"]'));
    let radiosCleared = 0;
    radios.forEach((r) => {
      if (r.checked) {
        r.checked = false;
        try {
          r.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (_) {}
        radiosCleared++;
      }
    });

    const txt = findFapCommentTextarea(root);
    let commentCleared = false;
    if (txt) {
      txt.value = "";
      try {
        txt.dispatchEvent(new Event("input", { bubbles: true }));
        txt.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {}
      commentCleared = true;
    }

    return { radiosCleared, commentCleared };
  }

  return {
    POSITIVE_COMMENTS,
    getRandomFeedbackComment,
    findFapFeedbackRadioGroups,
    findFapCommentTextarea,
    getHighestRatingRadio,
    fillFapFeedbackForm,
    resetFapFeedbackForm
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/fap-feedback.test.js`
Expected: PASS all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/fap-feedback.js tests/fap-feedback.test.js
git commit -m "feat(feedback): implement FAP survey feedback auto-fill core logic"
```

---

### Task 3: Floating Feedback Toolbar UI (`lib/fap-feedback.js`)

**Files:**
- Modify: `lib/fap-feedback.js`
- Test: `tests/fap-feedback-ui.test.js`

**Interfaces:**
- Produces:
  - `injectFapFeedbackToolbar(doc?: Document): HTMLElement | null`
  - Creates `#fptu-feedback-toolbar` container with:
    - Button: `btn-fill-5star` (`⚡ Điền 5★ & Khen ngợi`)
    - Button: `btn-random-comment` (`🎲 Đổi nhận xét`)
    - Button: `btn-toggle-collapse` (`_` / `⚡ Khảo sát nhanh`)
    - Toast notifications for user feedback.

- [ ] **Step 1: Write UI injection test**

Create `tests/fap-feedback-ui.test.js`:
```javascript
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { injectFapFeedbackToolbar } = require("../lib/fap-feedback.js");

describe("FAP Feedback Toolbar UI Injection", () => {
  test("injectFapFeedbackToolbar returns null if not on feedback page or no document", () => {
    assert.strictEqual(injectFapFeedbackToolbar(null), null);
  });
});
```

- [ ] **Step 2: Run test to verify it passes/fails**

Run: `node --test tests/fap-feedback-ui.test.js`

- [ ] **Step 3: Add `injectFapFeedbackToolbar` with styles to `lib/fap-feedback.js`**

Implement `injectFapFeedbackToolbar` in `lib/fap-feedback.js` using self-contained CSS styles (scoped with `#fptu-feedback-toolbar`), including collapsed floating pill mode, toast popup, and event listeners.

- [ ] **Step 4: Run tests to verify**

Run: `node --test tests/fap-feedback*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fap-feedback.js tests/fap-feedback-ui.test.js
git commit -m "feat(feedback): add floating toolbar UI and injection"
```

---

### Task 4: Extension Integration (`content.js`, `manifest.json`, `popup.html`, `popup.js`)

**Files:**
- Modify: `manifest.json` (add match `*://fap.fpt.edu.vn/*` and scripts `lib/fap-keepalive.js`, `lib/fap-feedback.js`)
- Modify: `content.js` (initialize keep-alive and feedback toolbar conditionally)
- Modify: `popup.html` (add Keep-Alive switch in Settings tab)
- Modify: `popup.js` (persist `fapKeepSessionEnabled` toggle to `chrome.storage.local`)
- Test: `tests/popup-boot.test.js`

- [ ] **Step 1: Update `manifest.json`**
Add `*://fap.fpt.edu.vn/Feedback/*` and load scripts.

- [ ] **Step 2: Update `content.js`**
Boot `FapKeepAlive` if URL is candidate; boot `injectFapFeedbackToolbar` if path matches `/Feedback/`.

- [ ] **Step 3: Update `popup.html` & `popup.js`**
Add toggle checkbox `#fap-keep-session-toggle`, sync with `chrome.storage.local.get/set`.

- [ ] **Step 4: Run all tests**

Run: `node --test tests/*.test.js`
Expected: 100% tests pass.

- [ ] **Step 5: Commit**

```bash
git add manifest.json content.js popup.html popup.js
git commit -m "feat(integration): wire FAP keep-alive and feedback toolbar into extension"
```

---

### Task 5: Final Validation, Packaging & Documentation

**Files:**
- Modify: `walkthrough.md`
- Create: `fptu-schedule.zip`

- [ ] **Step 1: Run complete test suite**
Run: `node --test tests/*.test.js`

- [ ] **Step 2: Package extension**
Run: `zip -r fptu-schedule.zip manifest.json *.png popup.html popup.js popup.css background.js content.js lib/`

- [ ] **Step 3: Commit and update walkthrough**
```bash
git add fptu-schedule.zip docs/superpowers/plans/2026-09-06-fap-survival-kit.md
git commit -m "chore(release): complete v3.7.0 FAP Survival Kit features"
```
