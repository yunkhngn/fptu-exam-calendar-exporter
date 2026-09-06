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
