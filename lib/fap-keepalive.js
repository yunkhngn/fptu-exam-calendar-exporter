(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FapKeepAlive = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const DEFAULT_INTERVAL_MS = 7 * 60 * 1000; // 7 minutes
  const DEFAULT_PING_URL = "/HomePage.aspx";

  function isFapSessionCandidate(urlPath) {
    if (!urlPath || typeof urlPath !== "string") return false;
    const p = urlPath.toLowerCase();
    if (p.includes("/default.aspx") || p.includes("/logout.aspx")) return false;
    return true;
  }

  function createFapKeepAlive(options = {}) {
    const pingUrl = options.pingUrl || DEFAULT_PING_URL;
    const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
    const fetchFn = options.fetchFn || (typeof fetch === "function" ? fetch : null);
    const storage = options.storage || (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null);

    let timerId = null;
    let isActive = false;
    let lastPingTime = null;
    let lastStatus = null;

    async function checkEnabled() {
      if (!storage || typeof storage.get !== "function") return true;
      return new Promise((resolve) => {
        try {
          storage.get(["fapKeepSessionEnabled"], (res) => {
            if (res && res.fapKeepSessionEnabled === false) {
              resolve(false);
            } else {
              resolve(true);
            }
          });
        } catch (_) {
          resolve(true);
        }
      });
    }

    async function ping() {
      const isEnabled = await checkEnabled();
      if (!isEnabled) {
        return { ok: false, reason: "disabled-by-user" };
      }

      if (!fetchFn) {
        return { ok: false, reason: "no-fetch" };
      }

      try {
        const res = await fetchFn(pingUrl, {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        });

        const redirectedToLogin = res.redirected && (res.url || "").toLowerCase().includes("default.aspx");
        if (redirectedToLogin || res.status === 401 || res.status === 403) {
          stop();
          lastStatus = "session-expired";
          return { ok: false, status: res.status, reason: "session-expired" };
        }

        lastPingTime = Date.now();
        lastStatus = "success";
        return { ok: true, status: res.status };
      } catch (err) {
        lastStatus = "error";
        return { ok: false, error: err.message || "network-error" };
      }
    }

    function start() {
      if (isActive) return;
      isActive = true;
      timerId = setInterval(() => {
        ping();
      }, intervalMs);
    }

    function stop() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      isActive = false;
    }

    function getStatus() {
      return {
        active: isActive,
        lastPingTime,
        lastStatus,
        intervalMs
      };
    }

    return {
      start,
      stop,
      ping,
      getStatus
    };
  }

  return {
    isFapSessionCandidate,
    createFapKeepAlive,
    DEFAULT_INTERVAL_MS,
    DEFAULT_PING_URL
  };
});
