# AGENTS.md — Rules & Guidelines for FPTU Schedule

This file defines the project-specific rules, architectural constraints, and engineering workflows that all AI agents must follow when developing the **FPTU Schedule** Chrome Extension.

---

## 1. Project Philosophy & Tech Stack

- **Architecture:** Chrome Extension Manifest V3.
- **Language & Frameworks:** Pure Vanilla JavaScript (ES2020+) and Vanilla CSS.
- **Zero External Dependencies:**
  - Do NOT introduce build tools (Webpack, Vite, Rollup), transpilers, or CSS frameworks (Tailwind, Bootstrap).
  - Do NOT load external scripts or CDNs (`chrome.runtime` and Chrome Web Store policies forbid remote code).
- **Core Library Pattern:**
  - Logic must be modularized into standalone files under `lib/` (e.g., `lib/schedule.js`, `lib/qrcode.js`, `lib/grades.js`, `lib/fap-keepalive.js`, `lib/fap-feedback.js`).
  - Libraries must use UMD/dual-export wrappers so they run in browser content scripts, background workers, and Node.js test environments without modification.

---

## 2. Testing & Verification Requirements

- **Test Runner:** Exclusively use the Node.js built-in test runner:
  ```bash
  node --test tests/*.test.js
  ```
- **Coverage & Pass Rate:**
  - **100% test pass rate** is strictly required at all times.
  - Every new feature, parser change, or bugfix must have corresponding unit tests in `tests/`.
  - DOM interactions in tests should use lightweight mock objects or pure functional helpers.
- **Verification Before Completion:**
  - Always run the full test suite and inspect output before proposing commits or declaring tasks complete.

---

## 3. UI/UX & Visual Standards

- **Strict Zero-Emoji UI:**
  - Do NOT use character emojis in user-facing extension UI components (popup, badges, alerts).
  - Always use inline SVG symbol icons via `<svg class="icon"><use href="#icon-[name]"/></svg>`.
- **Theme & Aesthetics:**
  - Support 3 theme modes: Auto/System, Light, and Dark.
  - Use high-contrast, modern glassmorphic styles with curated HSL/hex palettes (`rgba(15, 23, 42, 0.94)`, backdrop blur, subtle borders).
  - Extension popup dimensions must respect 600px width and 580px maximum height with no horizontal overflow or double scrollbars.

---

## 4. FAP Integration & Student Safety

- **Non-Intrusive & Transparent:**
  - Extension acts solely on behalf of the student.
  - **No Automated Form Submission:** For survey auto-fills (feedback forms), auto-select answers and comments for review, but **never auto-submit**. The student must click the native submit button.
- **Session Keep-Alive Efficiency:**
  - Keep-Alive heartbeats must only operate when at least one active FAP tab is open (`window.location` candidate check).
  - Ping interval must be ~7 minutes to stay within ASP.NET's 20-minute sliding window without unnecessary server traffic.
  - Stop immediately if redirected to login (`/Default.aspx`) or logged out.

---

## 5. Release & Packaging Workflow

- **User-Gated Release Lifecycle:**
  - **No Premature Releases or Packaging:** Do NOT build `fptu-schedule.zip`, create git release tags, or publish GitHub releases during intermediate development. Only package and release when the user explicitly requests or signs off on a release.
  - **User-Decided Versioning:** The release version number is **strictly decided/approved by the USER** (e.g., v3.6.5). Never unilaterally assume or bump the release version without explicit user instruction.
- **Professional English & Zero-Emoji Release Documentation:**
  - All release notes (GitHub releases, `CHANGELOG.md`, `STORE_LISTING.txt`, commit messages for releases) must be written exclusively in **professional English**.
  - **Strict Zero-Emoji Rule:** Absolutely NO character emojis anywhere in release titles, headers, bullet points, or store listings (e.g., do not use 🚀, 📦, 📅, ⏱️, 🛡️, ⚡). Maintain clean, modern typography using standard markdown (bolding, backticks, bulleted lists).
  - Structure all changes thoroughly by feature categories (e.g., `Added`, `Changed`, `Fixed`, `Security & Compliance`).
- **Packaging Command:**
  ```bash
  zip -FS -r fptu-schedule.zip manifest.json *.png popup.html popup.js popup.css background.js content.js lib/
  ```
- **Version Synchronization & Web Documentation:**
  - When the user confirms a release version, synchronize consistency across `manifest.json`, `package.json`, `lib/` badges, `CHANGELOG.md`, and the documentation site under `docs/` (`docs/index.html` meta tags, version badges, hero banner, feature cards, download URLs, and changelog cards).
