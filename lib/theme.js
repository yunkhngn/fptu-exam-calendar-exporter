(function (root, factory) {
  const api = factory();
  Object.assign(root, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const THEME_VALUES = {
    AUTO: "auto",
    LIGHT: "light",
    DARK: "dark"
  };

  function getNextTheme(currentTheme) {
    if (currentTheme === THEME_VALUES.AUTO) return THEME_VALUES.LIGHT;
    if (currentTheme === THEME_VALUES.LIGHT) return THEME_VALUES.DARK;
    return THEME_VALUES.AUTO;
  }

  function resolveEffectiveTheme(savedTheme, systemPrefersDark) {
    if (savedTheme === THEME_VALUES.LIGHT) return THEME_VALUES.LIGHT;
    if (savedTheme === THEME_VALUES.DARK) return THEME_VALUES.DARK;
    return systemPrefersDark ? THEME_VALUES.DARK : THEME_VALUES.LIGHT;
  }

  function getThemeLabel(theme) {
    if (theme === THEME_VALUES.LIGHT) return "Giao diện: Sáng";
    if (theme === THEME_VALUES.DARK) return "Giao diện: Tối";
    return "Giao diện: Tự động (theo hệ thống)";
  }

  function getThemeIcon(theme) {
    if (theme === THEME_VALUES.LIGHT) return "icon-sun";
    if (theme === THEME_VALUES.DARK) return "icon-moon";
    return "icon-theme-auto";
  }

  return {
    THEME_VALUES,
    getNextTheme,
    resolveEffectiveTheme,
    getThemeLabel,
    getThemeIcon
  };
});
