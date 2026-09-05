const test = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");
const {
  findFapGradeTable,
  parseFapGradeTable,
  calculateCurrentScore,
  calculateRequiredExamScore
} = require("../lib/grades.js");
const {
  extractCourseCodeAndName,
  getGradePageCourses,
  extractStudentGradeFromPage,
  getGradePageControls
} = require("../content.js");

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
  assert.strictEqual(result.categories.length, 1); // Resit excluded
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
  // Current score = 3.95, Remaining weight = 50%
  // Need: (5.0 - 3.95) / 0.50 = 2.1
  // Since 2.1 <= 4.0 and 3.95 + 4.0*0.50 = 5.95 >= 5.0:
  // student passes simply by hitting exam floor 4.0 -> pass_guaranteed!
  assert.strictEqual(pred.status, "pass_guaranteed");
  assert.strictEqual(Math.round(pred.requiredScore * 10) / 10, 2.1);
  assert.strictEqual(pred.minRequired, 4.0);

  // Target = 7.0 (achievable case)
  // Need: (7.0 - 3.95) / 0.50 = 3.05 / 0.50 = 6.1
  const pred7 = calculateRequiredExamScore(parsed.categories, parsed.bonus, 7.0, 4.0);
  assert.strictEqual(pred7.status, "achievable");
  assert.strictEqual(Math.round(pred7.requiredScore * 10) / 10, 6.1);
  assert.strictEqual(pred7.minRequired, 6.1);
});

test("calculateRequiredExamScore detects pass_guaranteed and impossible cases", () => {
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
    { category: "Lab", weight: 80, value: 1.25, isFinal: false },
    { category: "Final Exam", weight: 20, value: null, isFinal: true }
  ];
  const impossible = calculateRequiredExamScore(lowCategories, 0, 5.0, 4.0);
  assert.strictEqual(impossible.status, "impossible");
  assert.ok(impossible.requiredScore > 10.0);
});

test("findFapGradeTable finds summary=Report and fallback tables", () => {
  const dom1 = new JSDOM(REAL_FAP_HTML);
  assert.ok(findFapGradeTable(dom1.window.document));

  const dom2 = new JSDOM(`
    <table>
      <thead><tr><th>Grade category</th><th>Weight</th><th>Value</th></tr></thead>
      <tbody><tr><td>Quiz</td><td>10%</td><td>8</td></tr></tbody>
    </table>
  `);
  assert.ok(findFapGradeTable(dom2.window.document));
});

test("extractCourseCodeAndName extracts code and clean name correctly", () => {
  assert.deepStrictEqual(
    extractCourseCodeAndName("Experiential Entrepreneurship (ENT301m) (from 13/05/2026 - 22/07/2026)", "100609"),
    { courseCode: "ENT301M", courseName: "Experiential Entrepreneurship" }
  );

  assert.deepStrictEqual(
    extractCourseCodeAndName("Multiplatform Mobile App (PRN211)", "100610"),
    { courseCode: "PRN211", courseName: "Multiplatform Mobile App" }
  );

  assert.deepStrictEqual(
    extractCourseCodeAndName("Project management (PMG202c)", "100611"),
    { courseCode: "PMG202C", courseName: "Project management" }
  );

  assert.deepStrictEqual(
    extractCourseCodeAndName("PRJ301 - Server-Side development", "100612"),
    { courseCode: "PRJ301", courseName: "Server-Side development" }
  );

  assert.deepStrictEqual(
    extractCourseCodeAndName("Experiential Entrepreneurship", "100609"),
    { courseCode: "EE_100609", courseName: "Experiential Entrepreneurship" }
  );
});

test("getGradePageCourses and extractStudentGradeFromPage parse real FAP page layout", () => {
  const REAL_PAGE_HTML = `
    <html>
      <body>
        <table>
          <thead><tr><th>TERM</th><th>COURSE</th></tr></thead>
          <tbody>
            <tr>
              <td><a href="StudentGrade.aspx?rollNumber=HE190183&term=Summer2026">Summer2026</a></td>
              <td>
                <a href="StudentGrade.aspx?rollNumber=HE190183&term=Summer2026&course=100609">Experiential Entrepreneurship (ENT301m) (from 13/05/2026 - 22/07/2026)</a><br/>
                <a href="StudentGrade.aspx?rollNumber=HE190183&term=Summer2026&course=100610">Multiplatform Mobile App (PRN211) (from 13/05/2026 - 22/07/2026)</a><br/>
                <a href="StudentGrade.aspx?rollNumber=HE190183&term=Summer2026&course=100611">Project management (PMG202c)</a>
              </td>
            </tr>
          </tbody>
        </table>
        <table summary="Report">
          <thead>
            <tr><th>Grade category</th><th>Grade item</th><th>Weight</th><th>Value</th><th>Comment</th></tr>
          </thead>
          <tbody>
            <tr><td rowspan="2">Group Assignment 1</td><td>Group Assignment 1</td><td>10.0 %</td><td>8</td><td></td></tr>
            <tr><td>Total</td><td>10.0 %</td><td>8</td><td></td></tr>
            <tr><td rowspan="2">Constructivism Presentations</td><td>Constructivism Presentations</td><td>15.0 %</td><td>8.5</td><td></td></tr>
            <tr><td>Total</td><td>15.0 %</td><td>8.5</td><td></td></tr>
            <tr><td rowspan="2">Presentation</td><td>Presentation</td><td>40.0 %</td><td>7.6</td><td></td></tr>
            <tr><td>Total</td><td>40.0 %</td><td>7.6</td><td></td></tr>
          </tbody>
          <tfoot>
            <tr><td rowspan="2">COURSE TOTAL</td><td>AVERAGE</td><td colspan="3">7.8</td></tr>
            <tr><td>STATUS</td><td colspan="3"><font color="Green">PASSED</font></td></tr>
          </tfoot>
        </table>
      </body>
    </html>
  `;

  const dom = new JSDOM(REAL_PAGE_HTML, {
    url: "https://fap.fpt.edu.vn/Grade/StudentGrade.aspx?rollNumber=HE190183&term=Summer2026&course=100609"
  });

  const controls = getGradePageControls(dom.window.document);
  assert.strictEqual(controls.ok, true);
  assert.strictEqual(controls.courses.length, 3);
  assert.strictEqual(controls.courses[0].courseCode, "ENT301M");
  assert.strictEqual(controls.courses[1].courseCode, "PRN211");
  assert.strictEqual(controls.courses[2].courseCode, "PMG202C");

  // Extract the current course grade
  const grade = extractStudentGradeFromPage(dom.window.document);
  assert.ok(grade, "extracted grade");
  assert.strictEqual(grade.courseCode, "ENT301M");
  assert.strictEqual(grade.average, 7.8);
  assert.strictEqual(grade.status, "Passed");
  assert.strictEqual(grade.term, "Summer2026");
});

test("parse real screenshot FAP layout with 4 columns and bold active course", () => {
  const SCREENSHOT_PAGE_HTML = `
    <!DOCTYPE html>
    <html>
      <body>
        <div id="ctl00_mainContent_divContent">
          <h2>Grade report for HE190183 (Nguyen Van A)</h2>
          <table>
            <thead><tr><th>TERM</th><th>COURSE</th></tr></thead>
            <tbody>
              <tr><td>Fall2023</td><td><b>Experiential Entrepreneurship (from 13/05/2026 - 22/07/2026)</b></td></tr>
              <tr><td>Spring2024</td><td><a href="StudentGrade.aspx?rollNumber=HE190183&term=Summer2026&course=100610">Multiplatform Mobile App (PRN211)</a></td></tr>
              <tr><td>Summer2024</td><td><a href="StudentGrade.aspx?rollNumber=HE190183&term=Summer2026&course=100611">Project management (PMG201c)</a></td></tr>
              <tr><td>Fall2024</td><td><a href="StudentGrade.aspx?rollNumber=HE190183&term=Summer2026&course=100612">Server-Side development with VBNET (PRN292)</a></td></tr>
              <tr><td>Spring2025</td><td><a href="StudentGrade.aspx?rollNumber=HE190183&term=Summer2026&course=100613">SW Architecture and Design (SWD392)</a></td></tr>
            </tbody>
          </table>

          <table>
            <thead>
              <tr><th>GRADE ITEM</th><th>WEIGHT</th><th>VALUE</th><th>COMMENT</th></tr>
            </thead>
            <tbody>
              <tr><td>Group Assignment 1 (Checkpoint 1)</td><td>10.0 %</td><td>8</td><td></td></tr>
              <tr><td>Total</td><td>10.0 %</td><td>8</td><td></td></tr>
              <tr><td>Constructivism Presentations</td><td>15.0 %</td><td>8.5</td><td></td></tr>
              <tr><td>Total</td><td>15.0 %</td><td>8.5</td><td></td></tr>
              <tr><td>Group Assignment 3 (Checkpoint 3)</td><td>15.0 %</td><td>7.5</td><td></td></tr>
              <tr><td>Total</td><td>15.0 %</td><td>7.5</td><td></td></tr>
              <tr><td>Group Assignment 2 (Checkpoint 2)</td><td>20.0 %</td><td>7.6</td><td></td></tr>
              <tr><td>Total</td><td>20.0 %</td><td>7.6</td><td></td></tr>
              <tr><td>Presentation (Checkpoint 4)</td><td>40.0 %</td><td>7.6</td><td></td></tr>
              <tr><td>Total</td><td>40.0 %</td><td>7.6</td><td></td></tr>
            </tbody>
            <tfoot>
              <tr><td>COURSE TOTAL</td><td>AVERAGE</td><td colspan="2">7.8</td></tr>
              <tr><td>STATUS</td><td colspan="2"><font color="Green">PASSED</font></td></tr>
            </tfoot>
          </table>
        </div>
      </body>
    </html>
  `;

  const dom = new JSDOM(SCREENSHOT_PAGE_HTML, {
    url: "https://fap.fpt.edu.vn/Grade/StudentGrade.aspx?rollNumber=HE190183&term=Summer2026&course=100609"
  });

  const controls = getGradePageControls(dom.window.document);
  assert.strictEqual(controls.ok, true);
  assert.strictEqual(controls.courses.length, 5);
  assert.strictEqual(controls.courses[0].isActive, true);
  assert.strictEqual(controls.courses[0].id, "100609");
  assert.strictEqual(controls.courses[0].courseCode, "EE_100609");
  assert.strictEqual(controls.courses[1].courseCode, "PRN211");
  assert.strictEqual(controls.courses[2].courseCode, "PMG201C");
  assert.strictEqual(controls.courses[3].courseCode, "PRN292");
  assert.strictEqual(controls.courses[4].courseCode, "SWD392");

  const grade = extractStudentGradeFromPage(dom.window.document);
  assert.ok(grade, "grade extracted");
  assert.strictEqual(grade.courseCode, "EE_100609");
  assert.strictEqual(grade.categories.length, 5);
  assert.strictEqual(grade.categories[0].category, "Group Assignment 1 (Checkpoint 1)");
  assert.strictEqual(grade.categories[0].weight, 10);
  assert.strictEqual(grade.categories[0].value, 8);
  assert.strictEqual(grade.categories[4].category, "Presentation (Checkpoint 4)");
  assert.strictEqual(grade.categories[4].weight, 40);
  assert.strictEqual(grade.categories[4].value, 7.6);
  assert.strictEqual(grade.average, 7.8);
  assert.strictEqual(grade.status, "Passed");
});


