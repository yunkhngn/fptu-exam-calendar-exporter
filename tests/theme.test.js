const test = require("node:test");
const assert = require("node:assert");
const {
  THEME_VALUES,
  getNextTheme,
  resolveEffectiveTheme,
  getThemeLabel,
  getThemeIcon
} = require("../lib/theme.js");

test("THEME_VALUES contains expected keys", () => {
  assert.strictEqual(THEME_VALUES.AUTO, "auto");
  assert.strictEqual(THEME_VALUES.LIGHT, "light");
  assert.strictEqual(THEME_VALUES.DARK, "dark");
});

test("getNextTheme cycles through auto -> light -> dark -> auto", () => {
  assert.strictEqual(getNextTheme("auto"), "light");
  assert.strictEqual(getNextTheme("light"), "dark");
  assert.strictEqual(getNextTheme("dark"), "auto");
  assert.strictEqual(getNextTheme("unknown"), "auto");
});

test("resolveEffectiveTheme resolves system theme when set to auto", () => {
  assert.strictEqual(resolveEffectiveTheme("auto", true), "dark");
  assert.strictEqual(resolveEffectiveTheme("auto", false), "light");
});

test("resolveEffectiveTheme respects explicit light or dark settings", () => {
  assert.strictEqual(resolveEffectiveTheme("light", true), "light");
  assert.strictEqual(resolveEffectiveTheme("light", false), "light");
  assert.strictEqual(resolveEffectiveTheme("dark", true), "dark");
  assert.strictEqual(resolveEffectiveTheme("dark", false), "dark");
});

test("getThemeLabel returns descriptive Vietnamese labels", () => {
  assert.match(getThemeLabel("auto"), /Tự động/i);
  assert.match(getThemeLabel("light"), /Sáng/i);
  assert.match(getThemeLabel("dark"), /Tối/i);
});

test("getThemeIcon returns matching svg icon symbol id", () => {
  assert.strictEqual(getThemeIcon("auto"), "icon-theme-auto");
  assert.strictEqual(getThemeIcon("light"), "icon-sun");
  assert.strictEqual(getThemeIcon("dark"), "icon-moon");
});
