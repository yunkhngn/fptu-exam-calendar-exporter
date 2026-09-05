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
