/* Dedupe/merge helpers are inlined here on purpose: importScripts failing would leave the service worker
   without a listener → "Receiving end does not exist". popup.js keeps its own copy for the same reason. */
function classScheduleDedupeKey(event) {
  if (event.rawDate) {
    return `${event.title}-${event.rawDate.day}/${event.rawDate.month}-${event.rawDate.startHour}:${event.rawDate.startMinute}`;
  }
  if (event.start) {
    const start = typeof event.start === "string" ? new Date(event.start) : event.start;
    if (!isNaN(start.getTime())) {
      return `${event.title}-${start.getDate()}/${start.getMonth() + 1}-${start.getHours()}:${start.getMinutes()}`;
    }
  }
  return null;
}

function mergeNewClassEventsInto(allSchedule, newEvents) {
  const existingKeys = new Set();
  allSchedule.forEach((event) => {
    const k = classScheduleDedupeKey(event);
    if (k) existingKeys.add(k);
  });
  const uniqueNewEvents = newEvents.filter((event) => {
    const k = classScheduleDedupeKey(event);
    if (k) return !existingKeys.has(k);
    return true;
  });
  return { uniqueNewEvents, merged: allSchedule.concat(uniqueNewEvents) };
}

function armWaitForTabComplete(tabId, timeoutMs, onDone) {
  let settled = false;
  let timer;
  const listener = (id, info) => {
    if (id !== tabId || info.status !== "complete") return;
    if (settled) return;
    settled = true;
    chrome.tabs.onUpdated.removeListener(listener);
    clearTimeout(timer);
    setTimeout(() => onDone(true), 400);
  };
  chrome.tabs.onUpdated.addListener(listener);
  timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    chrome.tabs.onUpdated.removeListener(listener);
    onDone(false);
  }, timeoutMs);
  return function cancelWait() {
    if (settled) return;
    settled = true;
    chrome.tabs.onUpdated.removeListener(listener);
    clearTimeout(timer);
  };
}

function extractWeeklyScheduleFromTab(tabId, callback) {
  chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
    if (chrome.runtime.lastError) {
      callback(chrome.runtime.lastError.message, null);
      return;
    }
    chrome.tabs.sendMessage(tabId, { action: "extractWeeklySchedule" }, (response) => {
      if (chrome.runtime.lastError) {
        callback(chrome.runtime.lastError.message, null);
        return;
      }
      callback(null, response);
    });
  });
}

function executeFapWeekIndexMain(tabId, weekIndex, callback) {
  chrome.scripting.executeScript(
    {
      target: { tabId },
      world: "MAIN",
      func: (idx) => {
        function weekSelectEl() {
          return (
            document.getElementById("ctl00_mainContent_drpWeek") ||
            document.getElementById("ctl00_mainContent_ddlWeek") ||
            document.querySelector('select[id*="mainContent"][id*="drp"][id*="Week"]') ||
            document.querySelector('select[id*="mainContent"][id*="Week"]') ||
            document.querySelector('select[name*="drpWeek"]') ||
            document.querySelector('select[name*="Week"]')
          );
        }
        const sel = weekSelectEl();
        if (!sel) return { ok: false, error: "week-select-not-found" };
        if (idx < 0 || idx >= sel.options.length) return { ok: false, error: "bad-index" };
        if (sel.selectedIndex === idx) {
          return { ok: true, skippedPostback: true };
        }
        sel.selectedIndex = idx;
        const oc = sel.getAttribute("onchange") || "";
        const m = oc.match(/__doPostBack\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/);
        if (typeof __doPostBack === "function") {
          if (m) __doPostBack(m[1], m[2] !== undefined && m[2] !== null ? m[2] : "");
          else __doPostBack(sel.name, "");
          return { ok: true, skippedPostback: false };
        }
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, skippedPostback: false, weak: true };
      },
      args: [weekIndex]
    },
    (results) => {
      if (chrome.runtime.lastError) {
        callback(chrome.runtime.lastError.message, null);
        return;
      }
      const r = results && results[0] && results[0].result;
      if (!r || !r.ok) {
        callback((r && r.error) || "unknown", null);
        return;
      }
      callback(null, r);
    }
  );
}

function runWeekRangeSync(tabId, startIdx, endIdx, weekLabels, seedJson, onComplete) {
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  const total = hi - lo + 1;
  let current = lo;
  let stepIndex = 0;
  const collected = [];
  const failedWeeks = [];

  const labelForWeek = (i) =>
    (weekLabels && weekLabels[i]) || `Tuần #${i}`;

  function finish() {
    let allSchedule = [];
    try {
      allSchedule = JSON.parse(typeof seedJson === "string" ? seedJson : "[]");
    } catch (_) {
      allSchedule = [];
    }
    const { uniqueNewEvents, merged } = mergeNewClassEventsInto(allSchedule, collected);
    const mergedJson = JSON.stringify(merged);
    const failMsg =
      failedWeeks.length > 0
        ? ` • Tuần lỗi: ${failedWeeks.map((f) => f.label).join("; ")}`
        : "";
    const toastText = `Đồng bộ xong ${total - failedWeeks.length}/${total} tuần. Mới: ${uniqueNewEvents.length} • Tổng: ${merged.length}${failMsg}`;
    const statusText = `Xong: ${total - failedWeeks.length}/${total} tuần. Tiết mới: ${uniqueNewEvents.length}.${failedWeeks.length ? " Có tuần lỗi (xem toast)." : ""}`;

    chrome.storage.local.set(
      {
        classSchedule: mergedJson,
        weekRangeSyncRunning: false,
        weekRangeLastSummary: { toastText, statusText }
      },
      () => {
        chrome.runtime
          .sendMessage({
            type: "WEEK_RANGE_SYNC_DONE",
            mergedJson,
            toastText,
            statusText,
            uniqueNewCount: uniqueNewEvents.length,
            totalWeeks: total,
            failedCount: failedWeeks.length
          })
          .catch(() => {});
        onComplete && onComplete(null, { mergedJson, uniqueNewEvents, failedWeeks });
      }
    );
  }

  function step() {
    if (current > hi) {
      finish();
      return;
    }
    const idx = current;
    const cancelWait = armWaitForTabComplete(tabId, 28000, (loadOk) => {
      if (!loadOk) {
        failedWeeks.push({ index: idx, label: labelForWeek(idx), reason: "timeout" });
        stepIndex += 1;
        current += 1;
        step();
        return;
      }
      extractWeeklyScheduleFromTab(tabId, (err, response) => {
        if (err || !response || !response.success) {
          if (response && response.loginRequired) {
            failedWeeks.push({ index: idx, label: labelForWeek(idx), reason: "login" });
            chrome.storage.local.set({ weekRangeSyncRunning: false }, () => {
              chrome.tabs.create({ url: "https://fap.fpt.edu.vn/Default.aspx", active: true });
              chrome.runtime
                .sendMessage({ type: "WEEK_RANGE_SYNC_ERROR", message: "login" })
                .catch(() => {});
            });
            onComplete && onComplete(new Error("login"));
            return;
          }
          failedWeeks.push({ index: idx, label: labelForWeek(idx), reason: err || "extract" });
        } else {
          collected.push.apply(collected, response.schedule || []);
        }
        stepIndex += 1;
        current += 1;
        step();
      });
    });

    executeFapWeekIndexMain(tabId, idx, (err, result) => {
      if (err) {
        cancelWait();
        failedWeeks.push({ index: idx, label: labelForWeek(idx), reason: err });
        stepIndex += 1;
        current += 1;
        step();
        return;
      }
      if (result.skippedPostback) {
        cancelWait();
        extractWeeklyScheduleFromTab(tabId, (e2, response) => {
          if (e2 || !response || !response.success) {
            failedWeeks.push({ index: idx, label: labelForWeek(idx), reason: e2 || "extract" });
          } else {
            collected.push.apply(collected, response.schedule || []);
          }
          stepIndex += 1;
          current += 1;
          step();
        });
        return;
      }
    });
  }

  step();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "START_WEEK_RANGE_SYNC") {
    return false;
  }

  const { tabId, startIdx, endIdx, weekLabels, seedJson } = msg;
  if (tabId == null || startIdx == null || endIdx == null) {
    sendResponse({ ok: false, error: "bad-payload" });
    return false;
  }

  const seed =
    typeof seedJson === "string" ? seedJson : JSON.stringify([]);

  chrome.storage.local.set({ weekRangeSyncRunning: true }, () => {
    runWeekRangeSync(tabId, startIdx, endIdx, weekLabels || [], seed, (err) => {
      if (err && err.message === "login") {
        /* already notified */
      } else if (err) {
        chrome.storage.local.set({ weekRangeSyncRunning: false });
      }
    });
  });

  sendResponse({ ok: true });
  return false;
});
