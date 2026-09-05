/* importScripts is wrapped so a load failure cannot abort evaluation of this file: the
   onMessage listener at the bottom must register no matter what, otherwise the popup only
   ever sees "Receiving end does not exist" with no clue why. */
try {
  importScripts("lib/schedule.js");
} catch (e) {
  console.error("background: could not load lib/schedule.js", e);
}
try {
  importScripts("lib/notifications.js");
} catch (e) {
  console.error("background: could not load lib/notifications.js", e);
}
try {
  importScripts("lib/grades.js");
} catch (e) {
  console.error("background: could not load lib/grades.js", e);
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
  let skippedCells = 0;

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
    const skipMsg = skippedCells > 0 ? ` • Bỏ qua ${skippedCells} ô không đọc được` : "";
    const toastText = `Đồng bộ xong ${total - failedWeeks.length}/${total} tuần. Mới: ${uniqueNewEvents.length} • Tổng: ${merged.length}${failMsg}${skipMsg}`;
    const statusText = `Xong: ${total - failedWeeks.length}/${total} tuần. Tiết mới: ${uniqueNewEvents.length}.${failedWeeks.length ? " Có tuần lỗi (xem toast)." : ""}`;

    chrome.storage.local.set(
      {
        classSchedule: mergedJson,
        weekRangeSyncRunning: false,
        weekRangeLastSummary: { toastText, statusText }
      },
      () => {
        rescheduleAllAlarms();
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
          skippedCells += response.skipped || 0;
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
          skippedCells += response.skipped || 0;
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

function rescheduleAllAlarms(callback) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local || !chrome.alarms) {
    callback && callback();
    return;
  }

  chrome.storage.local.get(["classSchedule", "examSchedule", "notificationSettings"], (res) => {
    if (chrome.runtime.lastError) {
      callback && callback();
      return;
    }

    let settings = res.notificationSettings;
    if (!settings) {
      settings = typeof DEFAULT_NOTIFICATION_SETTINGS !== "undefined"
        ? DEFAULT_NOTIFICATION_SETTINGS
        : { enabled: true, class: { enabled: true, offset15: true, offset30: false }, exam: { enabled: true, offset1Day: true, offset1Hour: true } };
    }

    let classEvents = [];
    try {
      classEvents = JSON.parse(res.classSchedule || "[]");
    } catch (_) {}

    let examEvents = [];
    try {
      examEvents = JSON.parse(res.examSchedule || "[]");
    } catch (_) {}

    const now = new Date();
    const classAlarms = typeof buildClassAlarmItems === "function"
      ? buildClassAlarmItems(classEvents, settings, now)
      : [];
    const examAlarms = typeof buildExamAlarmItems === "function"
      ? buildExamAlarmItems(examEvents, settings, now)
      : [];

    const allAlarms = classAlarms.concat(examAlarms);
    const alarmMetadata = {};

    chrome.alarms.getAll((existing) => {
      const fptuAlarms = (existing || []).filter((a) => a && a.name && a.name.startsWith("fptu:"));
      const clearPromises = fptuAlarms.map((a) => new Promise((resolve) => chrome.alarms.clear(a.name, resolve)));

      Promise.all(clearPromises).then(() => {
        if (!settings.enabled) {
          chrome.storage.local.set({ activeAlarmsMetadata: {} }, () => callback && callback());
          return;
        }

        allAlarms.forEach((item) => {
          alarmMetadata[item.name] = item;
          chrome.alarms.create(item.name, { when: item.when });
        });

        chrome.storage.local.set({ activeAlarmsMetadata: alarmMetadata }, () => callback && callback());
      });
    });
  });
}

if (typeof chrome !== "undefined" && chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || !alarm.name || !alarm.name.startsWith("fptu:")) return;

    chrome.storage.local.get(["activeAlarmsMetadata"], (res) => {
      const meta = (res && res.activeAlarmsMetadata) || {};
      const item = meta[alarm.name] || (typeof parseAlarmName === "function" ? parseAlarmName(alarm.name) : null);
      const details = typeof formatNotificationDetails === "function"
        ? formatNotificationDetails(item)
        : { title: "FPTU Schedule", message: "Bạn có lịch học / lịch thi sắp diễn ra.", iconUrl: "icon-128.png" };

      if (typeof chrome.notifications !== "undefined" && chrome.notifications.create) {
        chrome.notifications.create(alarm.name, {
          type: "basic",
          iconUrl: details.iconUrl || "icon-128.png",
          title: details.title || "FPTU Schedule",
          message: details.message || "Bạn có lịch sắp tới.",
          priority: 2
        });
      }
    });
  });
}

if (typeof chrome !== "undefined" && chrome.notifications && chrome.notifications.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (!notificationId || !notificationId.startsWith("fptu:")) return;
    const isExam = notificationId.startsWith("fptu:exam:");
    const targetUrl = isExam
      ? "https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx"
      : "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx";

    chrome.tabs.query({ url: "*://fap.fpt.edu.vn/*" }, (tabs) => {
      const matchingTab = (tabs || []).find((t) => t.url && t.url.includes(isExam ? "ScheduleExams" : "ScheduleOfWeek"));
      if (matchingTab && matchingTab.id) {
        chrome.tabs.update(matchingTab.id, { active: true });
      } else {
        chrome.tabs.create({ url: targetUrl, active: true });
      }
      chrome.notifications.clear(notificationId);
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;

  if (msg.type === "RESCHEDULE_ALARMS") {
    rescheduleAllAlarms(() => sendResponse && sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "TEST_NOTIFICATION") {
    if (typeof chrome.notifications !== "undefined" && chrome.notifications.create) {
      chrome.notifications.create("fptu:test:" + Date.now(), {
        type: "basic",
        iconUrl: "icon-128.png",
        title: "[FPTU Schedule] Thông báo thử nghiệm",
        message: "Hệ thống thông báo hoạt động tốt! Bạn sẽ nhận được nhắc nhở trước giờ học và giờ thi.",
        priority: 2
      });
    }
    sendResponse && sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "SAVE_STUDENT_GRADE" && msg.grade && msg.grade.courseCode) {
    chrome.storage.local.get(["studentGrades"], (res) => {
      const map = (res && res.studentGrades) || {};
      map[msg.grade.courseCode] = msg.grade;
      chrome.storage.local.set({ studentGrades: map }, () => {
        sendResponse && sendResponse({ ok: true, count: Object.keys(map).length });
      });
    });
    return true;
  }

  if (msg.type === "START_ALL_GRADES_SYNC") {
    const { tabId, totalCourses } = msg;
    if (tabId == null || !totalCourses) {
      sendResponse && sendResponse({ ok: false, error: "bad-payload" });
      return false;
    }
    runAllGradesSync(tabId, totalCourses, (err, map) => {
      /* done handled by runner */
    });
    sendResponse && sendResponse({ ok: true });
    return false;
  }

  if (msg.type !== "START_WEEK_RANGE_SYNC") {
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

function executeFapCourseIndexMain(tabId, courseIndex, callback) {
  chrome.scripting.executeScript(
    {
      target: { tabId },
      world: "MAIN",
      func: (idx) => {
        const sel =
          document.getElementById("ctl00_mainContent_drpCourse") ||
          document.getElementById("ctl00_mainContent_ddlCourse") ||
          document.querySelector('select[id*="mainContent"][id*="Course"]') ||
          document.querySelector('select[name*="Course"]');
        if (!sel) return { ok: false, error: "course-select-not-found" };
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
      args: [courseIndex]
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

function extractGradeFromTab(tabId, callback) {
  chrome.scripting.executeScript({ target: { tabId }, files: ["lib/grades.js", "content.js"] }, () => {
    if (chrome.runtime.lastError) {
      callback(chrome.runtime.lastError.message, null);
      return;
    }
    chrome.tabs.sendMessage(tabId, { action: "extractStudentGrade" }, (response) => {
      if (chrome.runtime.lastError) {
        callback(chrome.runtime.lastError.message, null);
        return;
      }
      callback(null, response);
    });
  });
}

function runAllGradesSync(tabId, totalCourses, onComplete) {
  let current = 0;
  let savedCount = 0;

  function step() {
    if (current >= totalCourses) {
      chrome.storage.local.get(["studentGrades"], (res) => {
        const map = (res && res.studentGrades) || {};
        chrome.runtime.sendMessage({
          type: "ALL_GRADES_SYNC_DONE",
          total: totalCourses,
          savedCount
        }).catch(() => {});
        onComplete && onComplete(null, map);
      });
      return;
    }

    const idx = current;
    const cancelWait = armWaitForTabComplete(tabId, 25000, (loadOk) => {
      if (!loadOk) {
        current += 1;
        step();
        return;
      }
      extractGradeFromTab(tabId, (err, resp) => {
        if (!err && resp && resp.ok && resp.grade) {
          chrome.storage.local.get(["studentGrades"], (res) => {
            const map = (res && res.studentGrades) || {};
            map[resp.grade.courseCode] = resp.grade;
            savedCount += 1;
            chrome.storage.local.set({ studentGrades: map }, () => {
              current += 1;
              step();
            });
          });
        } else {
          current += 1;
          step();
        }
      });
    });

    executeFapCourseIndexMain(tabId, idx, (err, result) => {
      if (err) {
        cancelWait();
        current += 1;
        step();
        return;
      }
      if (result && result.skippedPostback) {
        cancelWait();
        extractGradeFromTab(tabId, (err2, resp) => {
          if (!err2 && resp && resp.ok && resp.grade) {
            chrome.storage.local.get(["studentGrades"], (res) => {
              const map = (res && res.studentGrades) || {};
              map[resp.grade.courseCode] = resp.grade;
              savedCount += 1;
              chrome.storage.local.set({ studentGrades: map }, () => {
                current += 1;
                step();
              });
            });
          } else {
            current += 1;
            step();
          }
        });
      }
    });
  }

  step();
}
