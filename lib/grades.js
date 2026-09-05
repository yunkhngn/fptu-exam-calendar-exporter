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

  function findFapGradeTable(doc) {
    if (!doc) doc = typeof document !== "undefined" ? document : null;
    if (!doc) return null;
    const bySummary = doc.querySelector('table[summary="Report"]');
    if (bySummary) return bySummary;

    const tables = Array.from(doc.querySelectorAll("table"));
    for (const tbl of tables) {
      const text = tbl.textContent || "";
      if (
        /Weight/i.test(text) &&
        /Value/i.test(text) &&
        (/Grade/i.test(text) || /Course total/i.test(text) || /Average/i.test(text) || /Passed|Not passed/i.test(text))
      ) {
        return tbl;
      }
    }
    for (const tbl of tables) {
      const text = tbl.textContent || "";
      if (/Weight/i.test(text) && /Value/i.test(text) && (/Total/i.test(text) || /Average/i.test(text))) {
        return tbl;
      }
    }
    return null;
  }

  function parseFapGradeTable(tableEl) {
    if (!tableEl) {
      return { categories: [], bonus: 0, average: null, status: null };
    }

    const headerRow = tableEl.querySelector("thead tr, tr:first-child");
    const ths = headerRow
      ? Array.from(headerRow.querySelectorAll("th, td")).map((c) => (c.textContent || "").trim())
      : [];
    const hasCategoryCol = ths.some((t) => /category/i.test(t)) || ths.length >= 5;

    const allRows = Array.from(tableEl.querySelectorAll("tr"));
    const rows = allRows.filter((r) => {
      if (r.querySelector("th")) return false;
      const text = (r.textContent || "").trim();
      if (/^(COURSE\s*TOTAL|AVERAGE|STATUS)/i.test(text)) return false;
      return true;
    });

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

      if (hasCategoryCol) {
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
      } else {
        if (cells[0].toLowerCase() === "total") {
          category = currentCategory;
          item = "Total";
          weightStr = cells[1];
          valueStr = cells[2];
        } else {
          category = cells[0];
          item = cells[0];
          weightStr = cells[1];
          valueStr = cells[2];
          currentCategory = category;
        }
      }

      if (item.toLowerCase() === "bonus" || category.toLowerCase() === "bonus") {
        const b = parseNumber(valueStr);
        if (b != null) bonus += b;
        return;
      }

      const catName = (category || currentCategory || item).trim();
      if (!catName || /resit/i.test(catName) || /resit/i.test(item)) {
        // Skip resit rows
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
      const avgMatch = footText.match(/Average\s*[:\s]*([\d.]+)/i);
      if (avgMatch) average = parseFloat(avgMatch[1]);

      if (/not\s*passed/i.test(footText)) status = "Not passed";
      else if (/passed/i.test(footText)) status = "Passed";
    }

    const allText = tableEl.textContent || "";
    if (average == null) {
      const avgMatch = allText.match(/Average\s*[:\s]*([\d.]+)/i);
      if (avgMatch) average = parseFloat(avgMatch[1]);
    }
    if (status == null) {
      if (/not\s*passed/i.test(allText)) status = "Not passed";
      else if (/passed/i.test(allText)) status = "Passed";
    }

    return { categories, bonus, average, status };
  }

  function calculateCurrentScore(categories, bonus = 0) {
    if (!Array.isArray(categories)) {
      return { currentWeightedScore: Number(bonus) || 0, completedWeight: 0, remainingWeight: 100 };
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
    findFapGradeTable,
    parseFapGradeTable,
    calculateCurrentScore,
    calculateRequiredExamScore
  };
});
