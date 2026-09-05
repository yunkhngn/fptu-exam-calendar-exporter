# FPTU Schedule

Chrome extension (Manifest V3) for **FPT University** students: read **exam** and **class** schedules from **FAP**, view them in the popup, and export **`.ics`** calendar files.

## Key features

### Exam schedule
- **Tabs**: Upcoming (**Chưa thi**) and completed (**Đã thi**) with counters
- **Countdown**: Color hints for today, tomorrow, urgent (≤3 days), future, completed
- **Types**: FE, PE, 2NDFE, 2NDPE
- **Filter**: Modal with select all / none / apply; preference remembered
- **Time formats**: Vietnamese (`10h00`), colon, dot, hour-only, mixed
- **Export**: Upcoming exams with a confirmed room (skips TBA / no room); reminders 1 day and 1 hour before
- **Works offline popup data**: After sync, export can work without staying on FAP (uses stored timetable JSON)

### Class schedule (Lịch học)
- Weekly view from FAP schedule pages (`https://fap.fpt.edu.vn/Schedule/*`)
- **Tải lịch** / export class timetable to `.ics`
- **Multi-week sync**: Background merge across a range of weeks (service worker + `chrome.storage.local` for progress and merged data)
- **Filter**: Show only today, this week, two weeks or this month — display only, the export is unaffected

### Study suggestions (exam cards)
- **Ôn tập** strip under each exam card: links by **course code** (from `study-sources.json`)
- Fallback links: Quizlet search and Google search (HTTPS only; opens when you click)

### Design
- Clean popup UI, system light/dark aware
- Tab navigation: exams + **Lịch học**

## Installation

### Chrome Web Store (recommended)
[FPTU Schedule on Chrome Web Store](https://chromewebstore.google.com/detail/fptu-exam-to-calendar/obiiippodjlfcmdipfbkneknbakjekfm) — listing title may still show an older name until the next store update.

### Manual (developer mode)
```bash
git clone https://github.com/yunkhngn/fptu-schedule.git
cd fptu-schedule
```
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. **Load unpacked** → select the repo folder

### Pack zip for upload
```bash
./zip-extension.sh
```
Produces **`fptu-schedule.zip`** (see `manifest.json` for current version).

## Usage

### Exams
1. Open `https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx` and sign in
2. Open the extension popup → data syncs on the exam page (or use **Đồng bộ**)
3. Use **Chưa thi** / **Đã thi**, **Lọc**, and **Tải xuống lịch .ics** (or equivalent) as needed

### Class schedule
1. Open a FAP **Schedule** week page (under `https://fap.fpt.edu.vn/Schedule/`)
2. In the popup, open the **Lịch học** tab → **Tải lịch** / export as shown

### Custom study links
Edit **`study-sources.json`** (keys = course codes like `PRJ301`). Only `https:` URLs are accepted for suggestions.

## Tech stack

- **UI**: HTML, CSS, vanilla JavaScript
- **Chrome**: `tabs`, `scripting`, `storage` (`chrome.storage.local` for cached schedule JSON and sync flags — not website `localStorage`)
- **Background**: Service worker (`background.js`)
- **Calendar**: iCalendar (RFC 5545)

## Project structure

```
fptu-schedule/
├── manifest.json
├── background.js
├── popup.html
├── popup.css
├── popup.js
├── content.js
├── lib/
│   ├── ics.js                  # iCalendar output (escaping, folding, both calendars)
│   └── schedule.js             # Class-schedule dedupe/merge, shared with the worker
├── tests/                      # node --test suites (npm test)
├── package.json                # devDependency: jsdom, for the tests only
├── study-sources.json          # Optional per-course study links
├── study-suggestions.js          # Resolve suggestions + fallbacks
├── icon-16.png / icon-48.png / icon-128.png
├── icon.png                    # Source asset (see scripts/build-icons.py)
├── zip-extension.sh
├── docs/                       # GitHub Pages site
├── scripts/build-icons.py
└── README.md
```

## Tests

```bash
npm install   # jsdom, used only by the tests
npm test
```

Covers `.ics` output (escaping, folding, timestamps), class-schedule dedupe/merge, the FAP
weekly-table scraper (both header shapes, month boundaries, unparseable cells) and popup
start-up. The extension itself ships as plain files — npm is not part of the build.

## Contributing

1. Fork the repo  
2. Branch → commit → push  
3. Open a Pull Request  

## Changelog

### v3.4.1 (current)
- **Online chip** moved to the card header, next to the attendance status, and recolored
  green (was indigo, in its own row under Slot/Room).
- **`window.confirm()` replaced with a themed modal** for all four remaining yes/no prompts
  (open FAP for week options / week-range sync / current-week sync; confirm clearing the whole
  saved class schedule) — the native dialog broke out of the popup's own styling entirely.
- **Online classes parsed correctly.** FAP marks a session moved online with its own
  `online-indicator` block, a "View Materials" link, and — when the move just happened — an
  "Update Online" note plus a second time badge next to the Meet URL. The scraper now always
  reads the `label-success` time badge (the one paired with attendance, present on every cell)
  instead of trusting whichever time badge happened to come first in the markup, and flags the
  class with `isOnline`. A room sharing a line with the next badge ("AL-L302 - Meet URL", no
  `<br>` between them) no longer leaves a trailing dash in the stored room name.
- **Online chip** on the class card, next to Slot and Room — a class keeps showing its
  originally assigned room even when it is actually held online.
- The "View Materials" link's href carries a bearer token; it is deliberately never read or
  stored, so it cannot leak into exported `.ics` files or `chrome.storage.local`.
- **Short labels are back** on the sync / multi-week / filter / delete buttons — icon-only
  turned out to read as unlabeled icons rather than buttons. They now size to icon + a short
  word ("Đồng bộ", "Nhiều tuần", "Lọc", "Xoá") instead of stretching, so **Tải lịch** still
  reads as the one primary action per row.
- **Đồng bộ nhiều tuần modal rebalanced:** the toolbar was a wrapping flex row that staggered
  Từ/Đến against each other and let long week labels overflow their select. It's now a
  predictable stacked form — Tải tuần, then Từ/Đến side by side, then Đồng bộ — matching the
  order of the task itself.
- **Compact action row:** the sync / range-sync / filter / delete buttons are now icon-only
  (tooltip + accessible label kept), leaving one labeled primary action — **Tải lịch** — per row.
  **Đồng bộ nhiều tuần** moved out of its own footer row into an icon button that opens a modal,
  matching how **Lọc** already works. The action area went from 102px to 57px of the 480px popup
  (about 21% down to 12%), all reclaimed by the card list.
- **Lịch học filter:** the Xoá slot now holds **Lọc** and **Xoá** side by side. Lọc narrows the
  timetable to today, this week (to Sunday), two weeks, or this month. Ranges follow the calendar
  the way FAP does but always start at today, so classes that already happened stay hidden; the
  button is tinted while a range is active and the choice is remembered. Same modal shape as the
  exam filter: pick an option, press **Áp dụng**. It changes what the tab shows, not what is
  stored — **Tải lịch still exports the whole timetable**.
- **Fix:** the weekly scraper dropped every class in the last day column. FAP renders
  the `Slot` corner cell with `rowspan="2"`, so the date header row has one cell fewer;
  the old code sliced both header rows alike and compensated with a "subtract one day"
  patch. Headers are now aligned to the body's day columns, and the whole week comes through.
- **Fix:** `.ics` correctness — TEXT values are escaped (a comma in "MULTIPLE_CHOICES, ESSAY"
  no longer acts as a separator), content lines are folded at 75 octets without splitting
  UTF-8, and the class export no longer emits invalid `DTSTAMP:…ZZ` timestamps.
- Weekly scraping now reports cells it could not parse instead of skipping them silently,
  so a FAP redesign surfaces as a warning rather than a shrinking timetable.
- Blocking `alert()` dialogs replaced with toasts; the tab bar sticks to the top while the
  list scrolls; the exam tab shows an upcoming count like the class tab.
- `lib/` extracted from `popup.js`/`background.js` so both share one implementation, plus a
  `npm test` suite covering the ICS output, the merge logic, the scraper and popup start-up.
- Dead code removed: two unreachable message handlers, `parseClassCell`, `sanitize-utils.js`
  and `shared-schedule.js`.
- Manifest **3.4.1**; release zip `fptu-schedule.zip`

### v3.2.0
- Exam study splash: white CTA buttons on cards; primary actions use blue accent

### v3.x (high level)
- **Lịch học** tab, class timetable extraction and `.ics` export  
- Multi-week background sync and merge  
- Study suggestions module + `study-sources.json`  
- MV3 service worker, narrowed permissions and safer study URLs (HTTPS-only)

### v2.1.0
- Richer time formats and exam typing  
- Tabs with counters, countdown styling, filter modal  
- Export rules for rooms / upcoming only  

### v2.0.0
- Upcoming / completed tabs, countdown, filters, Material-style UI  

### v1.0.0
- Initial exam export and type detection  

## Browser support

- **Chrome** / **Edge** and other **Chromium** browsers with Manifest V3 support (roughly v88+)

## Privacy

- Timetable data is processed and cached **locally** in the browser (`chrome.storage.local` / popup flow).  
- Study links open only **on click**; suggested URLs are restricted to **https**.  
- No separate analytics server from this repo; FAP remains the source of truth for auth and pages.

## Troubleshooting

| Issue | What to try |
|--------|-------------|
| No exam data | Open the official exam schedule FAP URL while logged in, then sync |
| Empty export | Upcoming export skips exams without a room; check filters |
| Class schedule | Use a `Schedule` week URL under `fap.fpt.edu.vn/Schedule/` |
| Multi-week sync stuck | Log in again on FAP; reopen popup |

**Support**: [Issues](https://github.com/yunkhngn/fptu-schedule/issues) · **Docs site**: [yunkhngn.github.io/fptu-schedule](https://yunkhngn.github.io/fptu-schedule/)

## Author

- [@yunkhngn](https://github.com/yunkhngn)

**I 💛 FPTU**

## License

MIT — see [LICENSE](LICENSE).

---

If this helps your semester planning, a ⭐ on the repo is appreciated.
