# Changelog

All notable changes to the **FPTU Schedule** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.6.0] - 2026-09-06

### Added
- **Offline QR Phone Calendar Synchronization**: Generates ISO/IEC 18004 standard QR codes completely offline using pure JavaScript vector SVG. Students can scan directly from the default iOS Camera or Android Lens to import classes and exams into Apple Calendar or Google Calendar without computer cables or email transfers.
- **Unified Export & QR Modal**: Replaced separate export buttons with a consolidated "Xuất lịch & Quét QR" modal on the action toolbar, offering instant time-scoped QR generation (Today, This Week, Next Week, or Upcoming Exams), direct `.ics` download, and clipboard copy.
- **True Dark Mode Support**: Implemented a comprehensive 3-state theme switcher (System/Auto, Light, Dark) across the extension popup and documentation website, adhering to WCAG AA contrast standards with zero flash of unstyled content.
- **Today's Agenda Live Hero Banner**: Persistent real-time widget at the top of the Class Schedule tab featuring an animated pulse status dot, countdown to the next slot, room number, instructor name, and same-day exam alerts.
- **Student Grades Tracker & Pass Predictor**: Scrapes and analyzes course grade breakdowns directly from FAP with cumulative GPA display, credit tracking, and an interactive Target Grade slider calculating the minimum Final Exam score required to pass or attain honors.
- **Desktop Schedule & Exam Notifications**: Configurable local advance alerts (15 or 30 minutes before classes; 1 hour or 1 day before exams) using Chrome Alarms and Notifications APIs.
- **Automated Verification Suite**: Expanded unit and integration test coverage to 95 passing tests with zero test framework dependencies (`node --test`).

### Changed
- **Anti-Overflow Window Layout**: Expanded extension window height to 580px with responsive sizing to ensure modals and QR codes fit comfortably without clipping or unnecessary scrollbars.
- **Navigation Architecture**: Restructured popup into 3 primary tabs: "Lịch học" (Classes), "Kỳ thi" (Exams), and "Điểm số" (Grades).
- **Strict Zero-Emoji UI**: Replaced all character emojis across the user interface and landing pages with lightweight, high-contrast inline SVG icons.

### Security & Compliance
- Compliant with Manifest V3 and Chrome Web Store Developer Policies.
- 100% offline local processing: no remote scripts, no CDNs, no telemetry, and zero third-party tracking.

---

## [3.5.1] - 2025-02-18

### Added
- **Clickable Class Cards**: The entire class card is clickable to open activity details on FAP with subtle hover feedback.
- **Attendance Risk Warning**: Automatically calculates cumulative absence rates per course; flags courses at >=15% absence in amber and >=20% (exam ban threshold) with pulsing warning badges.
- **Themed Confirmation Dialogs**: Replaced native `window.confirm()` prompts with accessible, theme-aware in-app modals.
- **Enhanced Online Session Parsing**: Accurately recognizes FAP's `online-indicator` elements, formats Meet URLs, and prevents duplicate time badges or trailing dashes in room names.

### Changed
- Rebalanced multi-week sync interface into a predictable stacked layout.
- Compacted action toolbar to maximize visible schedule space.

---

## [3.5.0] - 2025-02-15

### Added
- **Schedule Time Filtering**: Filter timetable by Today, This Week (through Sunday), Two Weeks, or This Month without mutating stored data.
- **Test Suite**: Introduced native `node --test` suite covering ICS export formatting, schedule merging, and table parsing.
- **Module Architecture**: Extracted shared utilities into `lib/` for parity between `popup.js` and `background.js`.

### Fixed
- Fixed day column misalignment in FAP's weekly schedule scraper caused by `rowspan="2"` corner cells.
- Fixed `.ics` compliance: properly escapes TEXT commas and semicolons, folds lines at 75 octets, and standardizes UTC timestamps.

---

## [3.2.0] - 2025-01-20

### Added
- Exam study suggestions module integrated with `study-sources.json`.
- Quick-access study resource links directly on exam cards.

---

## [3.0.0] - 2025-01-10

### Added
- **Lịch học (Class Timetable)**: Added support for scraping and synchronizing weekly class schedules alongside exam schedules.
- **Multi-Week Synchronization**: Implemented background synchronization for multiple weeks across the semester.
- Upgraded to Manifest V3 service worker architecture with narrowed permissions.

---

## [2.1.0] - 2024-11-05

### Added
- Exam type categorization (EOS Client, Practical Exam PE, Presentation, Written Exam).
- Tab counters and upcoming exam countdown timer badges.
- Advanced export filters for room allocation and upcoming events.

---

## [2.0.0] - 2024-10-15

### Added
- Dual-tab navigation for Upcoming vs Completed examinations.
- Modernized Material Design layout with responsive card styles.

---

## [1.0.0] - 2024-09-01

### Added
- Initial release for FPT University students.
- FAP exam timetable scraping and export to standard `.ics` calendar files.
