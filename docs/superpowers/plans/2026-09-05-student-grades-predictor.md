# Student Grades Tracker & Pass Predictor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow students to view their FAP grade reports, track weighted GPA, and predict the minimum Final Exam score required to pass courses (or achieve custom target marks) directly in the extension popup.

**Architecture:** A standalone UMD module `lib/grades.js` parses FAP `table[summary="Report"]` markup (handling `rowspan`, `Total` sub-rows, bonus marks, and footer averages) and computes weighted progress and required exam scores. `content.js` extracts grade data from FAP grade pages (`Grade/StudentGrade.aspx`). `background.js` orchestrates multi-course sync. `popup.html/js/css` adds a third tab ("Điểm số") with grade cards and an interactive target score slider.

**Tech Stack:** JavaScript (ES6+), Manifest V3 Service Worker, `node:test` + `jsdom`.

## Global Constraints

- Must work in Manifest V3 without build steps (vanilla JS, UMD module exports for Node tests & browser runtime).
- Must handle FAP table markup with `rowspan` and category `Total` lines without duplicating weights.
- `popup.html` must load `lib/grades.js` before `popup.js`.
- `zip-extension.sh` must package `lib/grades.js`.
- All 3 tabs (Lịch học, Kỳ thi, Điểm số) must swap cleanly and keep sticky headers.

---

### Task 1: Grade Parser & Calculation Engine (`lib/grades.js`) & Tests

**Files:**
- Create: `lib/grades.js`
- Create: `tests/grades.test.js`

**Interfaces:**
- Produces:
  - `parseFapGradeTable(tableEl)`: `{ categories: Array<{ category, weight, value, isFinal, items }>, bonus: number, average: number|null, status: string|null }`
  - `calculateCurrentScore(categories, bonus)`: `{ currentWeightedScore: number, completedWeight: number, remainingWeight: number }`
  - `calculateRequiredExamScore(categories, bonus, targetTotal, examMinScore)`: `{ targetTotal: number, currentWeightedScore: number, remainingWeight: number, requiredScore: number, minRequired: number, status: 'completed'|'pass_guaranteed'|'achievable'|'impossible' }`

- [ ] **Step 1: Write failing tests in `tests/grades.test.js`**

```javascript
// tests/grades.test.js
const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const {
  parseFapGradeTable,
  calculateCurrentScore,
  calculateRequiredExamScore
} = require("../lib/grades.js");

const REAL_FAP_HTML = `
<table summary="Report">
  <caption>... then see report - <a class="label label-success" target="_blank" href="#">Recalculate</a></caption>
  <thead>
    <tr><th>Grade category</th><th>Grade item</th><th>Weight</th><th>Value</th><th>Comment</th></tr>
  </thead>
  <tbody>
    <tr style="color: rgb(51, 122, 183); cursor: pointer;">
      <td rowspan="2">Final exam PE</td><td>Final exam PE</td><td>100.0 %</td><td>7</td><td></td>
    </tr>
    <tr><td>Total</td><td>100.0 %</td><td>7</td><td></td></tr>
    <tr>
      <td rowspan="2">Final exam PE Resit</td><td>Final exam PE Resit</td><td>100.0 %</td><td></td><td></td>
    </tr>
    <tr><td>Total</td><td>100.0 %</td><td></td><td></td></tr>
    <tr><td></td><td>Bonus</td><td></td><td>1</td><td></td></tr>
  </tbody>
  <tfoot>
    <tr><td rowspan="2">Course total</td><td>Average</td><td colspan="3">8.0</td></tr>
    <tr><td>Status</td><td colspan="3"><font color="Green">Passed</font></td></tr>
  </tfoot>
</table>
`;

const INCOMPLETE_COURSE_HTML = `
<table summary="Report">
  <thead>
    <tr><th>Grade category</th><th>Grade item</th><th>Weight</th><th>Value</th><th>Comment</th></tr>
  </thead>
  <tbody>
    <tr><td rowspan="3">Quiz</td><td>Quiz 1</td><td>5.0 %</td><td>8.0</td><td></td></tr>
    <tr><td>Quiz 2</td><td>5.0 %</td><td>9.0</td><td></td></tr>
    <tr><td>Total</td><td>10.0 %</td><td>8.5</td><td></td></tr>
    <tr><td rowspan="2">Assignment</td><td>Assignment 1</td><td>20.0 %</td><td>7.5</td><td></td></tr>
    <tr><td>Total</td><td>20.0 %</td><td>7.5</td><td></td></tr>
    <tr><td rowspan="2">Progress Test</td><td>Progress Test</td><td>20.0 %</td><td>8.0</td><td></td></tr>
    <tr><td>Total</td><td>20.0 %</td><td>8.0</td><td></td></tr>
    <tr><td rowspan="2">Final Exam</td><td>Final Exam</td><td>50.0 %</td><td></td><td></td></tr>
    <tr><td>Total</td><td>50.0 %</td><td></td><td></td></tr>
  </tbody>
  <tfoot>
    <tr><td rowspan="2">Course total</td><td>Average</td><td colspan="3"></td></tr>
    <tr><td>Status</td><td colspan="3"></td></tr>
  </tfoot>
</table>
`;

test("parseFapGradeTable parses real FAP HTML with rowspan and totals", () => {
  const dom = new JSDOM(REAL_FAP_HTML);
  const table = dom.window.document.querySelector('table[summary="Report"]');
  const result = parseFapGradeTable(table);

  assert.strictEqual(result.average, 8.0);
  assert.strictEqual(result.status, "Passed");
  assert.strictEqual(result.bonus, 1.0);
  assert.strictEqual(result.categories.length, 1); // Resit excluded when regular exam exists
  assert.strictEqual(result.categories[0].category, "Final exam PE");
  assert.strictEqual(result.categories[0].weight, 100.0);
  assert.strictEqual(result.categories[0].value, 7.0);
});

test("calculateCurrentScore calculates completed weighted score correctly", () => {
  const dom = new JSDOM(INCOMPLETE_COURSE_HTML);
  const table = dom.window.document.querySelector('table[summary="Report"]');
  const result = parseFapGradeTable(table);

  const scoreInfo = calculateCurrentScore(result.categories, result.bonus);
  // Quiz: 8.5 * 10% = 0.85
  // Assignment: 7.5 * 20% = 1.50
  // Progress Test: 8.0 * 20% = 1.60
  // Total current = 0.85 + 1.50 + 1.60 = 3.95
  // Completed weight = 50%, Remaining weight = 50%
  assert.strictEqual(scoreInfo.completedWeight, 50);
  assert.strictEqual(scoreInfo.remainingWeight, 50);
  assert.strictEqual(Math.round(scoreInfo.currentWeightedScore * 100) / 100, 3.95);
});

test("calculateRequiredExamScore predicts minimum FE score to pass (5.0)", () => {
  const dom = new JSDOM(INCOMPLETE_COURSE_HTML);
  const table = dom.window.document.querySelector('table[summary="Report"]');
  const parsed = parseFapGradeTable(table);

  const pred = calculateRequiredExamScore(parsed.categories, parsed.bonus, 5.0, 4.0);
  // Need: (5.0 - 3.95) / 0.50 = 1.05 / 0.50 = 2.1
  // But exam minimum rule is 4.0!
  // So requiredScore = 2.1, minRequired = 4.0 (floor)
  assert.strictEqual(pred.status, "achievable");
  assert.strictEqual(Math.round(pred.requiredScore * 10) / 10, 2.1);
  assert.strictEqual(pred.minRequired, 4.0);
});

test("calculateRequiredExamScore detects pass_guaranteed and impossible cases", () => {
  // Pass guaranteed: Current score 4.5, Remaining weight 10%
  // 4.5 + 4.0 * 0.10 = 4.9 -> if current score 4.7 + 4.0 * 0.10 = 5.1 >= 5.0
  const highCategories = [
    { category: "Lab", weight: 90, value: 9.0, isFinal: false },
    { category: "Final Exam", weight: 10, value: null, isFinal: true }
  ];
  // 9.0 * 0.9 = 8.1 >= 5.0 -> already guaranteed pass
  const guaranteed = calculateRequiredExamScore(highCategories, 0, 5.0, 4.0);
  assert.strictEqual(guaranteed.status, "pass_guaranteed");

  // Impossible case: Current score 1.0, Remaining weight 20%
  // Max possible = 1.0 + 10.0 * 0.20 = 3.0 < 5.0
  const lowCategories = [
    { category: "Lab", weight: 80, value: 1.25, isFinal: false }, // 1.0
    { category: "Final Exam", weight: 20, value: null, isFinal: true }
  ];
  const impossible = calculateRequiredExamScore(lowCategories, 0, 5.0, 4.0);
  assert.strictEqual(impossible.status, "impossible");
  assert.ok(impossible.requiredScore > 10.0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/grades.test.js`
Expected: FAIL with "Cannot find module '../lib/grades.js'"

- [ ] **Step 3: Implement `lib/grades.js`**

```javascript
// lib/grades.js
(function (root, factory) {
  const api = factory();
  Object.assign(root, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function parseNumber(str) {
    if (!str || typeof str !== "string") return null;
    const cleaned = str.replace(/%/g, "").trim();
    if (!cleaned) return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  function parseFapGradeTable(tableEl) {
    if (!tableEl) {
      return { categories: [], bonus: 0, average: null, status: null };
    }

    const rows = Array.from(tableEl.querySelectorAll("tbody tr"));
    const categoriesMap = new Map();
    let currentCategory = "";
    let bonus = 0;

    rows.forEach((row) => {
      const cells = Array.from(row.cells).map((c) => c.textContent.trim());
      if (cells.length === 0) return;

      let category = "";
      let item = "";
      let weightStr = "";
      let valueStr = "";

      if (cells.length >= 5) {
        category = cells[0];
        item = cells[1];
        weightStr = cells[2];
        valueStr = cells[3];
        currentCategory = category || currentCategory;
      } else if (cells.length === 4) {
        category = currentCategory;
        item = cells[0];
        weightStr = cells[1];
        valueStr = cells[2];
      } else if (cells.length === 3) {
        item = cells[0];
        weightStr = cells[1];
        valueStr = cells[2];
      }

      if (item.toLowerCase() === "bonus" || category.toLowerCase() === "bonus") {
        const b = parseNumber(valueStr);
        if (b != null) bonus += b;
        return;
      }

      const catName = (category || currentCategory || item).trim();
      if (/resit/i.test(catName) || /resit/i.test(item)) {
        // Skip resit rows unless regular row had no grade
        return;
      }

      const weight = parseNumber(weightStr);
      const value = parseNumber(valueStr);

      if (!categoriesMap.has(catName)) {
        categoriesMap.set(catName, {
          category: catName,
          weight: 0,
          value: null,
          isFinal: /final/i.test(catName) || /exam/i.test(catName) || /presentation/i.test(catName),
          items: []
        });
      }

      const catObj = categoriesMap.get(catName);

      if (item.toLowerCase() === "total") {
        if (weight != null) catObj.weight = weight;
        if (value != null) catObj.value = value;
      } else {
        catObj.items.push({ name: item, weight: weight || 0, value });
        if (catObj.weight === 0 && weight != null) catObj.weight = weight;
        if (catObj.value == null && value != null) catObj.value = value;
      }
    });

    // If total was never explicitly seen, sum item weights
    const categories = Array.from(categoriesMap.values()).map((cat) => {
      if (cat.weight === 0 && cat.items.length > 0) {
        cat.weight = cat.items.reduce((sum, it) => sum + (it.weight || 0), 0);
      }
      return cat;
    });

    // Extract footer Average & Status
    let average = null;
    let status = null;
    const tfoot = tableEl.querySelector("tfoot");
    if (tfoot) {
      const footText = tfoot.textContent;
      const avgMatch = footText.match(/Average\s*([\d.]+)/i);
      if (avgMatch) average = parseFloat(avgMatch[1]);

      if (/passed/i.test(footText)) status = "Passed";
      else if (/not\s*passed/i.test(footText)) status = "Not passed";
    }

    return { categories, bonus, average, status };
  }

  function calculateCurrentScore(categories, bonus = 0) {
    if (!Array.isArray(categories)) {
      return { currentWeightedScore: bonus, completedWeight: 0, remainingWeight: 100 };
    }

    let completedWeight = 0;
    let currentScore = 0;

    categories.forEach((cat) => {
      if (cat.value != null && cat.weight > 0) {
        completedWeight += cat.weight;
        currentScore += (cat.value * cat.weight) / 100;
      }
    });

    currentScore += Number(bonus) || 0;
    const remainingWeight = Math.max(0, 100 - completedWeight);

    return {
      currentWeightedScore: currentScore,
      completedWeight,
      remainingWeight
    };
  }

  function calculateRequiredExamScore(categories, bonus = 0, targetTotal = 5.0, examMinScore = 4.0) {
    const { currentWeightedScore, completedWeight, remainingWeight } = calculateCurrentScore(categories, bonus);

    if (remainingWeight <= 0) {
      return {
        targetTotal,
        currentWeightedScore,
        remainingWeight: 0,
        requiredScore: 0,
        minRequired: currentWeightedScore >= targetTotal ? 0 : examMinScore,
        status: "completed"
      };
    }

    const neededFromRemaining = targetTotal - currentWeightedScore;
    const rawRequired = (neededFromRemaining / (remainingWeight / 100));
    const minRequired = Math.max(rawRequired, examMinScore);

    let status = "achievable";
    if (rawRequired > 10.0) {
      status = "impossible";
    } else if (rawRequired <= examMinScore && currentWeightedScore + (examMinScore * remainingWeight) / 100 >= targetTotal) {
      status = "pass_guaranteed";
    }

    return {
      targetTotal,
      currentWeightedScore,
      remainingWeight,
      requiredScore: rawRequired,
      minRequired,
      status
    };
  }

  return {
    parseNumber,
    parseFapGradeTable,
    calculateCurrentScore,
    calculateRequiredExamScore
  };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/grades.test.js`
Expected: PASS all 4 tests

- [ ] **Step 5: Commit**

```bash
git add lib/grades.js tests/grades.test.js
git commit -m "feat(grades): add grade parser and pass predictor domain logic"
```

---

### Task 2: Content Script & Background Sync (`content.js`, `background.js`, `manifest.json`)

**Files:**
- Modify: `manifest.json:30-42`
- Modify: `content.js`
- Modify: `background.js`
- Test: `tests/grades.test.js`

**Interfaces:**
- Consumes:
  - `parseFapGradeTable` from `lib/grades.js`
  - `chrome.storage.local`: `studentGrades` (map of `{ [courseCode]: CourseGrade }`)
- Produces:
  - Content message handler `extractStudentGrade`
  - Content message handler `getGradePageControls`
  - Background handler `START_ALL_GRADES_SYNC`

- [ ] **Step 1: Update `manifest.json` content script matches**

Add `"https://fap.fpt.edu.vn/Grade/*"` to `content_scripts[0].matches`:
```json
      "matches": [
        "https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx",
        "https://fap.fpt.edu.vn/Schedule/*",
        "https://fap.fpt.edu.vn/Report/*",
        "https://fap.fpt.edu.vn/Grade/*"
      ],
```

- [ ] **Step 2: Add grade extraction handlers to `content.js`**

In `content.js`:
- Add `findGradeTable()`: searches `document.querySelector('table[summary="Report"]')`.
- Add `findCourseSelect()`: searches `document.getElementById("ctl00_mainContent_drpCourse") || document.querySelector('select[name*="Course"]')`.
- Handle message `{ action: "extractStudentGrade" }`:
  - Extracts courseCode, courseName, term from page header / dropdown label.
  - Calls `parseFapGradeTable(findGradeTable())`.
  - Sends back `{ ok: true, grade: { courseCode, courseName, term, ...parsed, lastUpdated: Date.now() } }`.
- Handle message `{ action: "getGradePageControls" }`:
  - Returns array of `{ index, value, label }` from course dropdown.
- Auto-extract on page load if on `Grade/StudentGrade.aspx` and table exists: sends `{ type: "SAVE_STUDENT_GRADE", grade }` to runtime.

- [ ] **Step 3: Update `background.js` to store grades and handle sync**

In `background.js`:
- Wrap `importScripts("lib/grades.js")` in try/catch.
- Handle message `{ type: "SAVE_STUDENT_GRADE", grade }`:
  - Loads `studentGrades` from `chrome.storage.local`.
  - Stores/merges `studentGrades[grade.courseCode] = grade`.
  - Saves back to storage.
- Handle message `{ type: "START_ALL_GRADES_SYNC", tabId, courseIndices }`:
  - Iterates through course dropdown indices, postbacks, waits for completion, extracts, and merges all courses into `studentGrades`.
  - Emits `{ type: "ALL_GRADES_SYNC_DONE", count }`.

- [ ] **Step 4: Run existing test suite**

Run: `npm test`
Expected: PASS all tests

- [ ] **Step 5: Commit**

```bash
git add manifest.json content.js background.js
git commit -m "feat(grades): add grade content extraction and background sync"
```

---

### Task 3: Popup UI & Interaction for Grades Tab (`popup.html`, `popup.css`, `popup.js`)

**Files:**
- Modify: `popup.html`
- Modify: `popup.css`
- Modify: `popup.js`
- Modify: `tests/popup-boot.test.js`

**Interfaces:**
- Consumes:
  - `calculateCurrentScore`, `calculateRequiredExamScore` from `lib/grades.js`
  - `chrome.storage.local.studentGrades`
- Produces:
  - Tab button `#gradesTabBtn`
  - Tab content `#gradesTab`
  - Action row `#gradeActions`
  - Interactive slider on grade cards

- [ ] **Step 1: Write tests in `tests/popup-boot.test.js` for 3-tab navigation & grades tab**

```javascript
test("popup supports 3 tabs: schedule, exams, grades", async () => {
  const { dom } = await boot();
  const doc = dom.window.document;
  const schedBtn = doc.getElementById("scheduleTabBtn");
  const examBtn = doc.getElementById("upcomingTab");
  const gradeBtn = doc.getElementById("gradesTabBtn");
  const gradesTab = doc.getElementById("gradesTab");
  const gradeActions = doc.getElementById("gradeActions");

  assert.ok(gradeBtn, "gradesTabBtn should exist");
  assert.ok(gradesTab, "gradesTab should exist");
  assert.ok(gradeActions, "gradeActions should exist");

  gradeBtn.click();
  assert.ok(gradeBtn.classList.contains("active"));
  assert.ok(gradesTab.classList.contains("active"));
  assert.strictEqual(gradeActions.hidden, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/popup-boot.test.js`
Expected: FAIL with "gradesTabBtn should exist"

- [ ] **Step 3: Update `popup.html`**

1. Add `#icon-award` to SVG sprite:
```html
    <symbol id="icon-award" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="2"/>
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </symbol>
```
2. Add tab button in `.tab-navigation`:
```html
          <button type="button" id="gradesTabBtn" class="tab-btn" role="tab" aria-selected="false">
            <svg class="icon" aria-hidden="true"><use href="#icon-award"/></svg>
            <span class="tab-btn__text">Điểm số</span>
          </button>
```
3. Add `<div id="gradesTab" class="tab-content"></div>` in `#examList`.
4. Add `#gradeActions` in `.popup-actions`:
```html
      <div id="gradeActions" class="actions-row" hidden>
        <button type="button" id="syncGradeBtn" class="action-btn action-btn--primary" title="Đồng bộ điểm môn hiện tại">
          <svg class="icon" aria-hidden="true"><use href="#icon-refresh"/></svg>
          <span class="action-btn__label">Đồng bộ điểm</span>
        </button>
        <button type="button" id="clearGradesBtn" class="action-btn action-btn--danger action-btn--compact" title="Xoá dữ liệu điểm">
          <svg class="icon" aria-hidden="true"><use href="#icon-trash"/></svg>
          <span class="action-btn__label">Xoá</span>
        </button>
      </div>
```
5. Add `<script src="lib/grades.js"></script>` before `popup.js`.

- [ ] **Step 4: Update `popup.css`**

Add styling for 3-tab layout, grade cards, component badges, progress bars, and target sliders:
- `.grade-card`: clean elevated surface, header with course code & name.
- `.grade-card__badges`: completed weight & current average.
- `.grade-progress-bar`: visual progress bar.
- `.grade-predictor-box`: colored banner for prediction status (`pass_guaranteed`, `achievable`, `impossible`).
- `.grade-slider-wrap`: range slider and numeric target indicator.

- [ ] **Step 5: Wire grades tab logic in `popup.js`**

- Update `activateTab(name)` to support `"grades"`:
  - Sets active tab on `gradesTabBtn` and `#gradesTab`.
  - Shows `#gradeActions` and hides `#examActions` and `#scheduleActions`.
- Function `renderStudentGrades(gradesMap)`:
  - Renders cards for all stored courses.
  - Computes `calculateRequiredExamScore(course.categories, course.bonus, 5.0)`.
  - Adds collapsible item list and live target slider event listener.
- Wire `syncGradeBtn` and `clearGradesBtn`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS all tests

- [ ] **Step 7: Commit**

```bash
git add popup.html popup.css popup.js tests/popup-boot.test.js
git commit -m "feat(popup): add grades tab with pass predictor and interactive target slider"
```

---

### Task 4: Packaging Update & Final Verification

**Files:**
- Modify: `zip-extension.sh`
- Test: `npm test`, `./zip-extension.sh`

- [ ] **Step 1: Update `zip-extension.sh`**

Add `lib/grades.js` to `zip-extension.sh`:
```bash
zip -r fptu-schedule.zip manifest.json background.js popup.html popup.js popup.css content.js lib/schedule.js lib/ics.js lib/notifications.js lib/grades.js study-sources.json study-suggestions.js icon-16.png icon-48.png icon-128.png -x "*.DS_Store" "*.git*"
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS all test files

- [ ] **Step 3: Run package script and inspect zip**

Run: `./zip-extension.sh && unzip -l fptu-schedule.zip`
Expected: `fptu-schedule.zip` created containing `lib/grades.js`

- [ ] **Step 4: Commit**

```bash
git add zip-extension.sh
git commit -m "chore: include lib/grades.js in extension zip package"
```
