/** Tránh TypeError "reading 'local'" khi chrome.storage chưa có trong context. */
function getChromeStorageLocal() {
  try {
    if (typeof chrome === "undefined") return null;
    const stor = chrome.storage;
    if (!stor || stor.local == null) return null;
    return stor.local;
  } catch (_) {
    return null;
  }
}

function mirrorClassScheduleToStorage(jsonString) {
  const loc = getChromeStorageLocal();
  if (!loc) return;
  try {
    loc.set({ classSchedule: jsonString }, () => {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "RESCHEDULE_ALARMS" }).catch(() => {});
      }
    });
  } catch (_) {}
}

function mirrorExamScheduleToStorage(events) {
  const loc = getChromeStorageLocal();
  if (!loc) return;
  try {
    const json = typeof events === "string" ? events : JSON.stringify(events || []);
    loc.set({ examSchedule: json }, () => {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "RESCHEDULE_ALARMS" }).catch(() => {});
      }
    });
  } catch (_) {}
}

// Immediate theme detection to prevent flash of light theme
(function () {
  try {
    if (typeof window !== "undefined" && window.matchMedia && typeof document !== "undefined" && document.documentElement) {
      const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", systemPrefersDark ? "dark" : "light");
      document.documentElement.setAttribute("data-theme-preference", "auto");
    }
  } catch (_) {}
})();

document.addEventListener("DOMContentLoaded", () => {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "WEEK_RANGE_SYNC_DONE") {
      applyWeekRangeSyncDoneFromBackground(msg);
    }
    if (msg.type === "WEEK_RANGE_SYNC_ERROR" && msg.message === "login") {
      weekRangeSyncInProgress = false;
      setWeekRangeControlsDisabled(false);
      setWeekRangeStatus("", false);
      showError("Phiên đăng nhập hết hạn. Đăng nhập lại FAP rồi thử đồng bộ khoảng tuần.");
    }
    if (msg.type === "ALL_GRADES_SYNC_DONE") {
      showToast(`Đã quét xong ${msg.savedCount || 0}/${msg.total || 0} môn!`);
      loadAndRenderStudentGrades();
    }
  });

  const stInit = getChromeStorageLocal();
  if (stInit) {
    try {
      stInit.get(["weekRangeSyncRunning"], (r) => {
        if (chrome.runtime.lastError) return;
        if (r.weekRangeSyncRunning) {
          weekRangeSyncInProgress = true;
          const weekRangeModal = document.getElementById("weekRangeModal");
          if (weekRangeModal) weekRangeModal.style.display = "block";
          setWeekRangeControlsDisabled(true);
          setWeekRangeStatus("Đồng bộ nhiều tuần vẫn đang chạy…", true);
          pollWeekRangeSyncUntilIdle();
        }
      });
    } catch (_) { /* no storage API */ }
  }

  const syncButton = document.getElementById("syncButton");
  const exportBtn = document.getElementById("exportBtn");
  const settingsButton = document.getElementById("settingsButton");
  const filterModal = document.getElementById("filterModal");
  const closeFilter = document.getElementById("closeFilter");
  const docsLink = document.getElementById("docsLink");
  
  // Notification settings modal elements
  const notificationBtn = document.getElementById("notificationBtn");
  const notificationModal = document.getElementById("notificationModal");
  const closeNotificationModal = document.getElementById("closeNotificationModal");
  const notifMasterToggle = document.getElementById("notifMasterToggle");
  const notifClassEnabled = document.getElementById("notifClassEnabled");
  const notifClass15 = document.getElementById("notifClass15");
  const notifClass30 = document.getElementById("notifClass30");
  const notifExamEnabled = document.getElementById("notifExamEnabled");
  const notifExam1Day = document.getElementById("notifExam1Day");
  const notifExam1Hour = document.getElementById("notifExam1Hour");
  const testNotificationBtn = document.getElementById("testNotificationBtn");
  const saveNotificationBtn = document.getElementById("saveNotificationBtn");

  const DEFAULT_SETTINGS = (typeof DEFAULT_NOTIFICATION_SETTINGS !== "undefined")
    ? DEFAULT_NOTIFICATION_SETTINGS
    : {
        enabled: true,
        class: { enabled: true, offset15: true, offset30: false },
        exam: { enabled: true, offset1Day: true, offset1Hour: true }
      };

  function updateNotificationButtonState(enabled) {
    if (notificationBtn) {
      notificationBtn.classList.toggle("is-active", !!enabled);
    }
  }

  function syncNotificationForm(settings) {
    const s = settings || DEFAULT_SETTINGS;
    if (notifMasterToggle) notifMasterToggle.checked = !!s.enabled;
    if (notifClassEnabled) notifClassEnabled.checked = !!(s.class && s.class.enabled);
    if (notifClass15) notifClass15.checked = !!(s.class && s.class.offset15);
    if (notifClass30) notifClass30.checked = !!(s.class && s.class.offset30);
    if (notifExamEnabled) notifExamEnabled.checked = !!(s.exam && s.exam.enabled);
    if (notifExam1Day) notifExam1Day.checked = !!(s.exam && s.exam.offset1Day);
    if (notifExam1Hour) notifExam1Hour.checked = !!(s.exam && s.exam.offset1Hour);
    updateNotificationButtonState(s.enabled);
  }

  const locStorage = getChromeStorageLocal();
  if (locStorage) {
    locStorage.get(["notificationSettings"], (res) => {
      syncNotificationForm(res && res.notificationSettings);
    });
  }

  // Theme management
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  let currentThemePreference = "auto";

  function applyTheme(preference, showToastFeedback = false) {
    currentThemePreference = preference || "auto";
    const systemPrefersDark = !!(
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
    const effectiveTheme = (typeof resolveEffectiveTheme === "function")
      ? resolveEffectiveTheme(currentThemePreference, systemPrefersDark)
      : (currentThemePreference === "dark" || (currentThemePreference === "auto" && systemPrefersDark) ? "dark" : "light");

    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.setAttribute("data-theme", effectiveTheme);
      document.documentElement.setAttribute("data-theme-preference", currentThemePreference);
    }

    if (themeToggleBtn) {
      const iconName = (typeof getThemeIcon === "function") ? getThemeIcon(currentThemePreference) : "icon-theme-auto";
      const label = (typeof getThemeLabel === "function") ? getThemeLabel(currentThemePreference) : "Chế độ giao diện";
      themeToggleBtn.setAttribute("title", label);
      themeToggleBtn.setAttribute("aria-label", label);
      const useEl = themeToggleBtn.querySelector("use");
      if (useEl) {
        useEl.setAttribute("href", `#${iconName}`);
      }
    }

    if (showToastFeedback && typeof showToast === "function") {
      const label = (typeof getThemeLabel === "function") ? getThemeLabel(currentThemePreference) : "Chế độ giao diện";
      showToast(label);
    }
  }

  if (locStorage) {
    locStorage.get(["theme"], (res) => {
      applyTheme(res && res.theme ? res.theme : "auto", false);
    });
  } else {
    applyTheme("auto", false);
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const nextTheme = (typeof getNextTheme === "function")
        ? getNextTheme(currentThemePreference)
        : (currentThemePreference === "auto" ? "light" : currentThemePreference === "light" ? "dark" : "auto");
      const storage = getChromeStorageLocal();
      if (storage) {
        storage.set({ theme: nextTheme }, () => {
          applyTheme(nextTheme, true);
        });
      } else {
        applyTheme(nextTheme, true);
      }
    });
  }

  if (typeof window !== "undefined" && window.matchMedia) {
    const colorSchemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      if (currentThemePreference === "auto") {
        applyTheme("auto", false);
      }
    };
    if (typeof colorSchemeMediaQuery.addEventListener === "function") {
      colorSchemeMediaQuery.addEventListener("change", handleMediaChange);
    } else if (typeof colorSchemeMediaQuery.addListener === "function") {
      colorSchemeMediaQuery.addListener(handleMediaChange);
    }
  }

  if (notificationBtn && notificationModal) {
    notificationBtn.addEventListener("click", () => {
      if (locStorage) {
        locStorage.get(["notificationSettings"], (res) => {
          syncNotificationForm(res && res.notificationSettings);
          notificationModal.style.display = "block";
        });
      } else {
        notificationModal.style.display = "block";
      }
    });
  }

  if (closeNotificationModal && notificationModal) {
    closeNotificationModal.addEventListener("click", () => {
      notificationModal.style.display = "none";
    });
  }

  if (testNotificationBtn) {
    testNotificationBtn.addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "TEST_NOTIFICATION" }, () => {
          showToast("Đã gửi thông báo thử nghiệm!");
        });
      } else {
        showToast("Đã gửi thông báo thử nghiệm!");
      }
    });
  }

  if (saveNotificationBtn && notificationModal) {
    saveNotificationBtn.addEventListener("click", () => {
      const current = {
        enabled: notifMasterToggle ? notifMasterToggle.checked : true,
        class: {
          enabled: notifClassEnabled ? notifClassEnabled.checked : true,
          offset15: notifClass15 ? notifClass15.checked : true,
          offset30: notifClass30 ? notifClass30.checked : false
        },
        exam: {
          enabled: notifExamEnabled ? notifExamEnabled.checked : true,
          offset1Day: notifExam1Day ? notifExam1Day.checked : true,
          offset1Hour: notifExam1Hour ? notifExam1Hour.checked : true
        }
      };

      if (locStorage) {
        locStorage.set({ notificationSettings: current }, () => {
          if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ type: "RESCHEDULE_ALARMS" }).catch(() => {});
          }
          updateNotificationButtonState(current.enabled);
          notificationModal.style.display = "none";
          showToast("Đã lưu cài đặt thông báo!");
        });
      } else {
        updateNotificationButtonState(current.enabled);
        notificationModal.style.display = "none";
        showToast("Đã lưu cài đặt thông báo!");
      }
    });
  }
  
  // Tab switching functionality - add this right after the other element declarations
  const upcomingTab = document.getElementById("upcomingTab");
  const upcomingContent = document.getElementById("upcomingExams");
  const completedContent = document.getElementById("completedExams");
  const scheduleTabBtn = document.getElementById("scheduleTabBtn");
  const scheduleContent = document.getElementById("scheduleTab");
  const gradesTabBtn = document.getElementById("gradesTabBtn");
  const gradesContent = document.getElementById("gradesTab");
  const examActionsRow = document.getElementById("examActions");
  const scheduleActionsRow = document.getElementById("scheduleActions");
  const gradeActionsRow = document.getElementById("gradeActions");
  const examListSection = document.getElementById("examList");
  if (examActionsRow) examActionsRow.hidden = true;
  if (scheduleActionsRow) scheduleActionsRow.hidden = false;
  if (gradeActionsRow) gradeActionsRow.hidden = true;

  if (upcomingContent && completedContent) {
    const activateTab = (name) => {
      [upcomingTab, scheduleTabBtn, gradesTabBtn].forEach(btn => btn && btn.classList.remove("active"));
      [upcomingContent, completedContent, scheduleContent, gradesContent].forEach(c => c && c.classList.remove("active"));

      const examAct = document.getElementById("examActions");
      const schedAct = document.getElementById("scheduleActions");
      const gradeAct = document.getElementById("gradeActions");
      if (examAct) examAct.hidden = (name !== "exams");
      if (schedAct) schedAct.hidden = (name !== "schedule");
      if (gradeAct) gradeAct.hidden = (name !== "grades");

      if (name === "schedule") {
        if (scheduleTabBtn) {
          scheduleTabBtn.classList.add("active");
          scheduleTabBtn.setAttribute("aria-selected", "true");
        }
        if (upcomingTab) upcomingTab.setAttribute("aria-selected", "false");
        if (gradesTabBtn) gradesTabBtn.setAttribute("aria-selected", "false");
        if (scheduleContent) scheduleContent.classList.add("active");
        if (examListSection) examListSection.classList.remove("exams-two-col");
        const syncLoad = document.getElementById("examSyncLoading");
        const syncErr = document.getElementById("examSyncError");
        if (syncLoad) syncLoad.hidden = true;
        if (syncErr) syncErr.hidden = true;
      } else if (name === "exams") {
        if (upcomingTab) {
          upcomingTab.classList.add("active");
          upcomingTab.setAttribute("aria-selected", "true");
        }
        if (scheduleTabBtn) scheduleTabBtn.setAttribute("aria-selected", "false");
        if (gradesTabBtn) gradesTabBtn.setAttribute("aria-selected", "false");
        upcomingContent.classList.add("active");
        completedContent.classList.add("active");
        if (examListSection) examListSection.classList.add("exams-two-col");
      } else if (name === "grades") {
        if (gradesTabBtn) {
          gradesTabBtn.classList.add("active");
          gradesTabBtn.setAttribute("aria-selected", "true");
        }
        if (scheduleTabBtn) scheduleTabBtn.setAttribute("aria-selected", "false");
        if (upcomingTab) upcomingTab.setAttribute("aria-selected", "false");
        if (gradesContent) gradesContent.classList.add("active");
        if (examListSection) examListSection.classList.remove("exams-two-col");
        loadAndRenderStudentGrades();
      }
    };

    if (upcomingTab) upcomingTab.addEventListener("click", () => activateTab("exams"));
    if (scheduleTabBtn) scheduleTabBtn.addEventListener("click", () => activateTab("schedule"));
    if (gradesTabBtn) gradesTabBtn.addEventListener("click", () => activateTab("grades"));

    // The tab bar is position:sticky; drop a shadow on it only once content
    // is actually scrolling underneath, so it stays flat at rest.
    const tabBar = document.querySelector(".tab-bar");
    if (tabBar && examListSection) {
      const syncStuck = () => tabBar.classList.toggle("is-stuck", examListSection.scrollTop > 0);
      examListSection.addEventListener("scroll", syncStuck, { passive: true });
      syncStuck();
    }

    // Mặc định: Lịch học (khớp tab active trên HTML)
    activateTab("schedule");
  }

  // Load filter preferences
  let filterPrefs = { FE: true, PE: true, "2NDFE": true, "2NDPE": true };
  try {
    filterPrefs = JSON.parse(
      localStorage.getItem("examFilter") || '{"FE":true,"PE":true,"2NDFE":true,"2NDPE":true}'
    );
  } catch (_) {
    /* keep defaults */
  }
  
  // Set initial filter states
  if (document.getElementById("filterFE")) {
    document.getElementById("filterFE").checked = filterPrefs.FE;
    document.getElementById("filterPE").checked = filterPrefs.PE;
    document.getElementById("filter2NDFE").checked = filterPrefs["2NDFE"];
    document.getElementById("filter2NDPE").checked = filterPrefs["2NDPE"];
  }

  // Filter modal events
  if (settingsButton && filterModal) {
    settingsButton.addEventListener("click", () => {
      filterModal.style.display = "block";
    });
  }

  if (closeFilter && filterModal) {
    closeFilter.addEventListener("click", () => {
      filterModal.style.display = "none";
    });
  }

  // Close modal when clicking outside
  if (filterModal) {
    filterModal.addEventListener("click", (e) => {
      if (e.target === filterModal) {
        filterModal.style.display = "none";
      }
    });
  }

  // Remove the immediate filter change events - comment them out completely
  // ["filterFE", "filterPE", "filter2NDFE", "filter2NDPE"].forEach(id => {
  //   const element = document.getElementById(id);
  //   if (element) {
  //     element.addEventListener("change", () => {
  //       saveFilterPrefs();
  //       applyFilters();
  //     });
  //   }
  // });

  // Select/Deselect all buttons
  const selectAllBtn = document.getElementById("selectAll");
  const deselectAllBtn = document.getElementById("deselectAll");
  const applyFilterBtn = document.getElementById("applyFilter");
  
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      ["filterFE", "filterPE", "filter2NDFE", "filter2NDPE"].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.checked = true;
      });
    });
  }

  if (deselectAllBtn) {
    deselectAllBtn.addEventListener("click", () => {
      ["filterFE", "filterPE", "filter2NDFE", "filter2NDPE"].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.checked = false;
      });
    });
  }

  if (applyFilterBtn) {
    applyFilterBtn.addEventListener("click", () => {
      saveFilterPrefs();
      applyFilters();
      filterModal.style.display = "none";
    });
  }

  function saveFilterPrefs() {
    const prefs = {
      FE: document.getElementById("filterFE")?.checked || false,
      PE: document.getElementById("filterPE")?.checked || false,
      "2NDFE": document.getElementById("filter2NDFE")?.checked || false,
      "2NDPE": document.getElementById("filter2NDPE")?.checked || false
    };
    localStorage.setItem("examFilter", JSON.stringify(prefs));
  }

  function applyFilters() {
    const upcomingItems = document.querySelectorAll("#upcomingExams .exam-item");
    const completedItems = document.querySelectorAll("#completedExams .exam-item");
    const activeFilters = JSON.parse(localStorage.getItem("examFilter") || '{"FE":true,"PE":true,"2NDFE":true,"2NDPE":true}');
    
    // Apply filters to both upcoming and completed tabs
    [...upcomingItems, ...completedItems].forEach(item => {
      const examCard = item.querySelector(".exam-card");
      const tags = examCard.querySelectorAll(".tag");
      let examType = null;
      
      // Check for exam type tags
      tags.forEach(tag => {
        if (tag.classList.contains("fe")) examType = "FE";
        else if (tag.classList.contains("pe")) examType = "PE";
        else if (tag.classList.contains("secondfe")) examType = "2NDFE";
        else if (tag.classList.contains("secondpe")) examType = "2NDPE";
      });
      
      // If no specific exam type found, try to determine from tag text
      if (!examType) {
        tags.forEach(tag => {
          const tagText = tag.textContent.trim();
          if (tagText === "FE") examType = "FE";
          else if (tagText === "PE") examType = "PE";
          else if (tagText === "2NDFE") examType = "2NDFE";
          else if (tagText === "2NDPE") examType = "2NDPE";
        });
      }
      
      // Show if no exam type found or if exam type is enabled
      if (!examType || activeFilters[examType]) {
        item.style.display = "block";
      } else {
        item.style.display = "none";
      }
    });
  }

  window.applyFilters = applyFilters;

  if (syncButton) {
    syncButton.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx" });
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      // Get stored exam data instead of requiring FAP page
      const storedData = localStorage.getItem("examSchedule");
      
      if (!storedData) {
        showError("Chưa có dữ liệu lịch thi. Mở trang lịch thi FAP rồi nhấn «Đồng bộ lịch thi».");
        return;
      }

      let events;
      try {
        events = JSON.parse(storedData);
      } catch (e) {
        console.error("Parse stored data failed:", e);
        showError("Dữ liệu lịch thi bị lỗi. Đồng bộ lại từ trang FAP.");
        return;
      }

      if (!events || !events.length) {
        showError("Không có lịch thi nào để xuất.");
        return;
      }

      const cal = createExamCalendar();
      let validEventsCount = 0;
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      events.forEach(e => {
        // Check if exam is upcoming (not completed)
        const start = new Date(e.start);
        const examDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const diffTime = examDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Skip completed exams
        if (diffDays < 0) {
          return; // Skip past exams
        }

        // Skip exams without room number (not scheduled for retake)
        if (!e.location || 
            e.location.trim() === "" || 
            e.location.toLowerCase().includes("chưa có") ||
            e.location.toLowerCase().includes("chưa rõ") ||
            e.location.toLowerCase() === "tba" ||
            e.location.toLowerCase() === "to be announced") {
          return; // Skip this exam
        }

        let title = e.title;
     
        if (e.tag) {
          title += ' - ' + e.tag;
        } else {
          if (/2nd_fe/i.test(e.description)) title += ' - 2NDFE';
          else if (/practical_exam/i.test(e.description)) title += ' - PE';
          else if (/multiple_choices|final|fe/i.test(e.description)) title += ' - FE';
        }

        cal.addEvent(title, e.description, e.location, new Date(e.start), new Date(e.end));
        validEventsCount++;
      });

      if (validEventsCount === 0) {
        showError("Không có kỳ thi sắp tới đã có phòng để xuất ra .ics.");
        return;
      }

      const blob = new Blob([cal.build()], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', 'lich-thi.ics');
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    });
  }


  setTimeout(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes("https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx")) {
        autoSyncSchedule();
      }
    });
  }, 100);

  const data = localStorage.getItem("examSchedule");
  if (data) {
    try {
      renderExamList(JSON.parse(data));
    } catch (e) {
      console.error("Parse failed:", e);
    }
  } else {
    const up = document.getElementById("upcomingExams");
    const co = document.getElementById("completedExams");
    if (up && co) {
      while (up.firstChild) up.removeChild(up.firstChild);
      while (co.firstChild) co.removeChild(co.firstChild);
      const hint = document.createElement("div");
      hint.className = "exam-list-hint";
      hint.textContent = "Chưa có dữ liệu lịch thi. Nhấn «Đồng bộ lịch thi» để mở FAP và tải lịch.";
      up.appendChild(hint);
    }
  }

  // Load class schedule for the new tab
  const storedSchedule = localStorage.getItem("classSchedule");
  if (storedSchedule) {
    try {
      renderClassSchedule(JSON.parse(storedSchedule));
    } catch (e) {
      console.error("Parse stored class schedule failed:", e);
    }
  } else {
    // Ensure empty state appears if container exists
    const sc = document.getElementById("scheduleTab");
    if (sc && !sc.firstChild) {
      const empty = document.createElement("div");
      empty.className = "schedule-empty";
      empty.textContent = "Chưa có lịch học. Nhấn \"Sync lịch học\" để tải.";
      sc.appendChild(empty);
    }
  }
  // Try to auto-refresh attendance status from the current FAP page (only updates matching items)
  tryAutoRefreshAttendance();
  loadAndRenderStudentGrades();

function renderStudentGrades(gradesMap) {
  const container = document.getElementById("gradesTab");
  if (!container) return;

  container.innerHTML = "";

  const courses = Object.values(gradesMap || {});

  // Update tab label with count
  const btn = document.getElementById("gradesTabBtn");
  const tabText = btn?.querySelector(".tab-btn__text");
  if (tabText) {
    tabText.textContent = courses.length ? `Điểm số (${courses.length})` : "Điểm số";
  }

  if (courses.length === 0) {
    const empty = document.createElement("div");
    empty.className = "schedule-empty";
    empty.innerHTML = `
      <p style="font-weight:650; font-size:14px; margin:0 0 6px;">Chưa có dữ liệu bảng điểm</p>
      <p style="font-size:12px; color:var(--text-muted); margin:0 0 14px; line-height:1.4;">
        Mở trang Điểm số FAP (StudentGrade.aspx) rồi nhấn <strong>«Đồng bộ»</strong> hoặc <strong>«Quét tất cả môn»</strong>.
      </p>
      <a href="https://fap.fpt.edu.vn/Grade/StudentGrade.aspx" target="_blank" class="action-btn action-btn--secondary" style="display:inline-flex; align-items:center; gap:6px; margin:0 auto; text-decoration:none; width:fit-content;">
        <svg class="icon" aria-hidden="true" style="width:14px; height:14px;"><use href="#icon-award"/></svg>
        <span>Mở FAP StudentGrade</span>
      </a>
    `;
    container.appendChild(empty);
    return;
  }

  // Sort courses alphabetically by courseCode
  courses.sort((a, b) => (a.courseCode || "").localeCompare(b.courseCode || ""));

  const list = document.createElement("div");
  list.className = "grades-list";

  courses.forEach((course) => {
    const card = document.createElement("div");
    card.className = "grade-card";

    const categories = course.categories || [];
    const bonus = Number(course.bonus) || 0;
    const { currentWeightedScore, completedWeight, remainingWeight } =
      typeof calculateCurrentScore === "function"
        ? calculateCurrentScore(categories, bonus)
        : { currentWeightedScore: 0, completedWeight: 0, remainingWeight: 100 };

    const isPassed = course.status === "Passed" || (remainingWeight === 0 && currentWeightedScore >= 5.0);
    const isFailed = course.status === "Not passed" || (remainingWeight === 0 && currentWeightedScore < 5.0);

    let statusBadgeClass = "grade-badge--inprogress";
    let statusText = `Đang học (${completedWeight}%)`;

    if (isPassed) {
      statusBadgeClass = "grade-badge--passed";
      statusText = "Passed";
    } else if (isFailed) {
      statusBadgeClass = "grade-badge--failed";
      statusText = "Not passed";
    }

    // Header
    const header = document.createElement("div");
    header.className = "grade-card__header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "grade-card__title-group";

    const codeEl = document.createElement("div");
    codeEl.className = "grade-card__code";
    codeEl.textContent = course.courseCode || "UNKNOWN";
    titleGroup.appendChild(codeEl);

    if (course.courseName && course.courseName !== course.courseCode) {
      let cleanCourseName = course.courseName
        .replace(/\s*\([^)]*,?\s*$/g, "")
        .replace(/[()]/g, " ")
        .replace(/^[-–:,/.\s]+|[-–:,/.\s]+$/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!cleanCourseName) cleanCourseName = course.courseName;
      const nameEl = document.createElement("div");
      nameEl.className = "grade-card__name";
      nameEl.textContent = cleanCourseName;
      titleGroup.appendChild(nameEl);
    }

    if (course.term) {
      const termEl = document.createElement("span");
      termEl.className = "grade-card__term";
      termEl.textContent = course.term;
      titleGroup.appendChild(termEl);
    }

    const badgeEl = document.createElement("span");
    badgeEl.className = `grade-badge ${statusBadgeClass}`;
    badgeEl.textContent = statusText;

    header.appendChild(titleGroup);
    header.appendChild(badgeEl);
    card.appendChild(header);

    // Summary row
    const summaryRow = document.createElement("div");
    summaryRow.className = "grade-summary-row";
    summaryRow.innerHTML = `
      <span>Điểm tích luỹ: <strong class="grade-summary-val">${currentWeightedScore.toFixed(2)}</strong> / 10</span>
      <span>Đã hoàn thành: <strong>${completedWeight}%</strong></span>
    `;
    card.appendChild(summaryRow);

    // Progress bar
    const progressWrap = document.createElement("div");
    progressWrap.className = "grade-progress-wrap";
    const progressBar = document.createElement("div");
    progressBar.className = "grade-progress-bar" + (isPassed ? " grade-progress-bar--passed" : "");
    const pct = Math.min(100, Math.max(0, currentWeightedScore * 10));
    progressBar.style.width = `${pct}%`;
    progressWrap.appendChild(progressBar);
    card.appendChild(progressWrap);

    // Predictor Box
    const predictorBox = document.createElement("div");
    predictorBox.className = "grade-predictor-box";

    if (remainingWeight <= 0) {
      const doneText = course.average != null
        ? `Môn học đã hoàn tất. Điểm tổng kết: <strong>${course.average.toFixed(1)}</strong> (${course.status || (isPassed ? "Passed" : "Not passed")})`
        : `Môn học đã hoàn tất toàn bộ 100% trọng số. Điểm tổng: <strong>${currentWeightedScore.toFixed(2)}</strong>`;
      predictorBox.innerHTML = `<div style="font-size:12px; color:var(--text); line-height:1.4;">${doneText}</div>`;
    } else {
      const predHeader = document.createElement("div");
      predHeader.className = "grade-predictor-header";
      predHeader.innerHTML = `
        <span>Dự báo điểm thi (FE / PE):</span>
        <span>Mục tiêu: <strong class="target-display">5.0</strong></span>
      `;
      predictorBox.appendChild(predHeader);

      const sliderRow = document.createElement("div");
      sliderRow.className = "grade-slider-row";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.className = "grade-slider";
      slider.min = "5.0";
      slider.max = "9.0";
      slider.step = "0.1";
      slider.value = "5.0";

      const targetNum = document.createElement("span");
      targetNum.className = "grade-target-num";
      targetNum.textContent = "5.0";

      sliderRow.appendChild(slider);
      sliderRow.appendChild(targetNum);
      predictorBox.appendChild(sliderRow);

      const resultBox = document.createElement("div");
      resultBox.className = "grade-predict-result";
      predictorBox.appendChild(resultBox);

      const updatePrediction = (targetVal) => {
        targetNum.textContent = targetVal.toFixed(1);
        const targetDisplay = predHeader.querySelector(".target-display");
        if (targetDisplay) targetDisplay.textContent = targetVal.toFixed(1);

        if (typeof calculateRequiredExamScore !== "function") return;
        const res = calculateRequiredExamScore(categories, bonus, targetVal, 4.0);

        resultBox.className = "grade-predict-result";
        if (res.status === "pass_guaranteed") {
          resultBox.classList.add("grade-predict-result--guaranteed");
          resultBox.innerHTML = `🎉 <strong>Chắc chắn qua môn!</strong> Chỉ cần thi ≥ <strong>4.0</strong> (tránh điểm liệt) là đạt mục tiêu ${targetVal.toFixed(1)}.`;
        } else if (res.status === "achievable") {
          resultBox.classList.add("grade-predict-result--achievable");
          resultBox.innerHTML = `🎯 Cần thi tối thiểu: <span class="grade-predict-score">${res.minRequired.toFixed(1)}</span> để đạt tổng kết ${targetVal.toFixed(1)}.`;
        } else if (res.status === "impossible") {
          resultBox.classList.add("grade-predict-result--impossible");
          resultBox.innerHTML = `⚠️ Không thể đạt ${targetVal.toFixed(1)} (Điểm thi cần > 10.0: ${res.requiredScore.toFixed(1)}).`;
        }
      };

      slider.addEventListener("input", (e) => {
        const val = parseFloat(e.target.value) || 5.0;
        updatePrediction(val);
      });

      updatePrediction(5.0);
    }
    card.appendChild(predictorBox);

    // Collapsible breakdown accordion
    if (categories.length > 0 || bonus > 0) {
      const details = document.createElement("details");
      details.className = "grade-details-accordion";

      const summary = document.createElement("summary");
      summary.className = "grade-details-summary";
      summary.innerHTML = `<span>Xem bảng điểm chi tiết (${categories.length} mục)</span>`;
      details.appendChild(summary);

      const table = document.createElement("table");
      table.className = "grade-table";
      const thead = document.createElement("thead");
      thead.innerHTML = `<tr><th>Thành phần</th><th>Trọng số</th><th style="text-align:right;">Điểm</th></tr>`;
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      categories.forEach((cat) => {
        const tr = document.createElement("tr");
        const valText = cat.value != null ? cat.value : "-";
        tr.innerHTML = `
          <td><strong>${cat.category || ""}</strong>${cat.items && cat.items.length > 1 ? ` (${cat.items.map(i => i.name).join(", ")})` : ""}</td>
          <td>${cat.weight}%</td>
          <td style="text-align:right; font-weight:600;">${valText}</td>
        `;
        tbody.appendChild(tr);
      });

      if (bonus > 0) {
        const trBonus = document.createElement("tr");
        trBonus.innerHTML = `
          <td><strong>Bonus</strong></td>
          <td>-</td>
          <td style="text-align:right; font-weight:600; color:var(--accent);">+${bonus}</td>
        `;
        tbody.appendChild(trBonus);
      }

      table.appendChild(tbody);
      details.appendChild(table);
      card.appendChild(details);
    }

    list.appendChild(card);
  });

  container.appendChild(list);
}

function loadAndRenderStudentGrades() {
  const loc = getChromeStorageLocal();
  if (loc) {
    loc.get(["studentGrades"], (res) => {
      const grades = (res && res.studentGrades) || {};
      renderStudentGrades(grades);
    });
  } else {
    try {
      const saved = JSON.parse(localStorage.getItem("studentGrades") || "{}");
      renderStudentGrades(saved);
    } catch (_) {
      renderStudentGrades({});
    }
  }
}

window.renderStudentGrades = renderStudentGrades;
window.loadAndRenderStudentGrades = loadAndRenderStudentGrades;

function renderClassSchedule(schedule) {
  const container = document.getElementById("scheduleTab");
  if (!container) return;

  // Clear existing
  while (container.firstChild) container.removeChild(container.firstChild);

  // The range filter only narrows what is shown; nothing is removed from storage.
  const stored = Array.isArray(schedule) ? schedule : [];
  const mode = getClassRangeFilter();
  const visible = filterClassScheduleByRange(stored, mode);
  syncClassFilterButton();

  // Absence rate is a fact about the course, not about the currently filtered view — computed
  // from the full stored schedule so it stays accurate even when filtered down to "Hôm nay".
  const attendanceByCourse = computeAttendanceByCourse(stored);

  // Update tab label with count
  const btn = document.getElementById("scheduleTabBtn");
  const tabText = btn?.querySelector(".tab-btn__text");
  if (tabText) {
    tabText.textContent = visible.length ? `Lịch học (${visible.length})` : "Lịch học";
  }

  // Normalize and sort schedule by date/time ascending
  const toMillis = (ev) => {
    if (ev && ev.rawDate) {
      const rd = ev.rawDate;
      // month in JS Date is 0-based
      return new Date(rd.year, (rd.month || 1) - 1, rd.day || 1, rd.startHour || 0, rd.startMinute || 0, 0).getTime();
    }
    if (ev && ev.start) {
      try { return new Date(ev.start).getTime(); } catch (_) {}
    }
    return Number.MAX_SAFE_INTEGER; // push unknown dates to the end
  };
  const sorted = [...visible].sort((a, b) => toMillis(a) - toMillis(b));

  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "schedule-empty";
    empty.textContent = stored.length
      ? "Không có tiết học nào trong khoảng đã lọc. Đổi bộ lọc để xem thêm."
      : "Chưa có lịch học. Nhấn «Đồng bộ lịch học» để tải.";
    container.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "schedule-grid";

  // Helper formatters using rawDate if present
  const two = n => String(n).padStart(2, '0');
  const fmtDate = rd => `${two(rd.day)}/${two(rd.month)}/${rd.year}`;
  const fmtTime = (h,m) => `${two(h)}:${two(m)}`;

  sorted.forEach(ev => {
    const card = document.createElement("div");
    card.className = "class-card";

    const head = document.createElement("div");
    head.className = "class-card__head";

    const code = document.createElement("span");
    code.className = "class-code";
    code.textContent = ev.title || "Môn học";

    const attendanceChip = document.createElement("span");
    attendanceChip.className = "chip attendance";
    const dotAtt = document.createElement("span");
    dotAtt.className = "dot";
    attendanceChip.appendChild(dotAtt);
    const rawStatus = (ev.attendanceStatus || "not yet").toLowerCase();
    let statusClass = "notyet";
    let statusLabel = "Not yet";
    if (rawStatus.includes("absent")) { statusClass = "absent"; statusLabel = "Absent"; }
    else if (rawStatus.includes("attended")) { statusClass = "attended"; statusLabel = "Attended"; }
    attendanceChip.classList.add(statusClass);
    attendanceChip.appendChild(document.createTextNode(" " + statusLabel));

    // Badges on the right of the header: Online (if applicable), then attendance status.
    // Grouped in their own row so `justify-content: space-between` on the head keeps them
    // together at the right edge instead of spreading a third item into the middle.
    const headBadges = document.createElement("div");
    headBadges.className = "class-card__badges";
    if (ev.isOnline) {
      const chipOnline = document.createElement("span");
      chipOnline.className = "chip online";
      const dotOnline = document.createElement("span"); dotOnline.className = "dot";
      chipOnline.appendChild(dotOnline);
      chipOnline.appendChild(document.createTextNode(" Online"));
      headBadges.appendChild(chipOnline);
    }
    headBadges.appendChild(attendanceChip);

    head.appendChild(code);
    head.appendChild(headBadges);

    const tags = document.createElement("div");
    tags.className = "class-tags";

    // Slot/Type chip (first)
    const chipType = document.createElement("span");
    chipType.className = "chip type";
    const dotType = document.createElement("span"); dotType.className = "dot";
    chipType.appendChild(dotType);
    chipType.appendChild(document.createTextNode(` ${(ev.slot || ev.type || "Slot ?").toString()}`));
    tags.appendChild(chipType);

    // Attendance-risk chip — shown on every card of a course whose graded sessions so far
    // put it at or past the early-warning line, using the same rate for all of that course's
    // cards regardless of which specific session this one is.
    const courseAttendance = attendanceByCourse[ev.title];
    const riskLevel = courseAttendance ? attendanceRiskLevel(courseAttendance.rate) : null;
    if (riskLevel) {
      const chipRisk = document.createElement("span");
      chipRisk.className = `chip risk-${riskLevel}`;
      const dotRisk = document.createElement("span"); dotRisk.className = "dot";
      chipRisk.appendChild(dotRisk);
      const pct = Math.round(courseAttendance.rate * 100);
      chipRisk.appendChild(document.createTextNode(` ${pct}% vắng`));
      tags.appendChild(chipRisk);
    }

    // Room chip
    if (ev.location) {
      const chipRoom = document.createElement("span");
      chipRoom.className = "chip room";
      const dot = document.createElement("span"); dot.className = "dot";
      chipRoom.appendChild(dot);
      const roomText = (ev.location || "").replace(/\s*-\s*$/, "").trim();
      chipRoom.appendChild(document.createTextNode(` ${roomText}`));
      tags.appendChild(chipRoom);
    }

    // The whole card opens the detail page — see the click/keydown wiring appended to
    // `card` below, right after this event object's chips are all built.
    if (ev.detailUrl) {
      const openDetail = async () => {
        const url = ev.detailUrl;

        // 1) Fetch the detail page directly and parse attendance
        try {
          const res = await fetch(url, { credentials: 'include' });
          const html = await res.text();
          const parseAttendance = (html) => {
            try {
              const doc = new DOMParser().parseFromString(html, 'text/html');
              // Pattern 1: table row <td>Attendance:</td><td>STATUS</td>
              const tds = Array.from(doc.querySelectorAll('td'));
              for (let i = 0; i < tds.length; i++) {
                const label = (tds[i].textContent || '').trim().toLowerCase().replace(/[:\s]+$/, '');
                if (label === 'attendance' && tds[i+1]) {
                  const status = (tds[i+1].textContent || '').trim().toLowerCase();
                  if (status) return { status };
                }
              }
              // Pattern 2: <font color="...">status</font>
              const font = doc.querySelector('font[color]');
              if (font) {
                return {
                  status: (font.textContent || '').trim().toLowerCase(),
                  color: (font.getAttribute('color') || '').toLowerCase()
                };
              }
              // Pattern 3: fallback scan
              const txt = (doc.body?.innerText || '').toLowerCase();
              if (txt.includes('absent')) return { status: 'absent' };
              if (txt.includes('attended')) return { status: 'attended' };
              if (txt.includes('not yet')) return { status: 'not yet' };
              return null;
            } catch { return null; }
          };
          const found = parseAttendance(html);

          if (found && found.status) {
            // 2) Update local schedule immediately
            const keyOf = (obj) => obj && obj.rawDate ? `${(obj.title||'').trim()}__${obj.rawDate.year}-${obj.rawDate.month}-${obj.rawDate.day}__${obj.rawDate.startHour}:${obj.rawDate.startMinute}` : null;
            let saved = JSON.parse(localStorage.getItem('classSchedule') || '[]');
            const k = keyOf(ev);
            let changed = false;
            saved = saved.map(it => {
              if (keyOf(it) === k) {
                if (it.attendanceStatus !== found.status) changed = true;
                it.attendanceStatus = found.status;
                if (found.color) it.attendanceColor = found.color;
              }
              return it;
            });
            if (changed) {
              persistClassSchedule(JSON.stringify(saved));
              try { window.renderClassSchedule && window.renderClassSchedule(saved); } catch (_) {}
              // silent update – no toast
            }
          }
        } catch (err) {
          console.warn('Fetch detail failed:', err);
        }

        // 3) Open the detail page for the user
        try { chrome.tabs.create({ url }); } catch (_) { window.open(url, '_blank'); }
      };

      card.classList.add("class-card--clickable");
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Xem chi tiết ${ev.title || "buổi học"}`);
      card.addEventListener("click", openDetail);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail();
        }
      });
    }

    card.appendChild(head);
    card.appendChild(tags);

    const meta = document.createElement("div");
    meta.className = "class-meta";

    const addMeta = (label, value) => {
      const row = document.createElement("div");
      row.className = "meta-row";
      const lab = document.createElement("span");
      lab.className = "meta-label";
      lab.textContent = `${label}:`;
      const val = document.createElement("span");
      val.className = "meta-value";
      val.textContent = value || "—";
      row.appendChild(lab);
      row.appendChild(val);
      meta.appendChild(row);
    };

    if (ev.rawDate) {
      addMeta("Ngày", fmtDate(ev.rawDate));
      addMeta("Giờ", `${fmtTime(ev.rawDate.startHour, ev.rawDate.startMinute)} – ${fmtTime(ev.rawDate.endHour, ev.rawDate.endMinute)}`);
    }

    card.appendChild(meta);

    grid.appendChild(card);
  });

  container.appendChild(grid);
}
window.renderClassSchedule = renderClassSchedule;

  // Sau khi renderClassSchedule đã gắn window; tránh race với callback storage
  const stMerge = getChromeStorageLocal();
  if (stMerge) {
    try {
      stMerge.get(["classSchedule"], (r) => {
        if (chrome.runtime.lastError || !r.classSchedule) return;
        if (r.classSchedule === localStorage.getItem("classSchedule")) return;
        try {
          persistClassSchedule(r.classSchedule);
          const parsed = JSON.parse(r.classSchedule);
          renderClassSchedule(parsed);
        } catch (e) {
          console.error("Merge class schedule from storage failed:", e);
        }
      });
    } catch (_) { /* no storage API */ }
  }

  // Documentation link event
  if (docsLink) {
    docsLink.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: "https://yunkhngn.github.io/fptu-schedule/" });
    });
  }

  // Get new button elements
  const syncScheduleBtn = document.getElementById("syncScheduleBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");

  // Add event handlers for new buttons
  if (syncScheduleBtn) {
    syncScheduleBtn.addEventListener("click", handleSyncClassSchedule);
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", handleDownloadClassSchedule);
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", handleClearClassSchedule);
  }

  // Grade action buttons
  const syncGradeBtn = document.getElementById("syncGradeBtn");
  const syncAllGradesBtn = document.getElementById("syncAllGradesBtn");
  const clearGradesBtn = document.getElementById("clearGradesBtn");

  function runWithInjectedGradeScript(tabId, actionFn) {
    if (typeof chrome === "undefined" || !chrome.scripting || !chrome.scripting.executeScript) {
      actionFn();
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["lib/grades.js", "content.js"]
      },
      () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          // tab might already have content scripts or restricted host
        }
        actionFn();
      }
    );
  }

  function saveAndRenderSingleGrade(grade) {
    const loc = getChromeStorageLocal();
    if (loc) {
      loc.get(["studentGrades"], (r) => {
        const grades = (r && r.studentGrades) || {};
        grades[grade.courseCode] = grade;
        loc.set({ studentGrades: grades }, () => {
          showToast(`Đã đồng bộ điểm môn ${grade.courseCode}!`);
          loadAndRenderStudentGrades();
        });
      });
    } else {
      showToast(`Đã đồng bộ điểm môn ${grade.courseCode}!`);
      renderStudentGrades({ [grade.courseCode]: grade });
    }
  }

  async function fetchGradeInTab(tabId, url) {
    // 1. Try sendMessage to content script in tab
    const fromMsg = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        { action: "fetchCourseGrade", type: "FETCH_COURSE_GRADE", url },
        (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok || !resp.grade) {
            resolve(null);
          } else {
            resolve(resp.grade);
          }
        }
      );
    });
    if (fromMsg) return fromMsg;

    // 2. Direct executeScript fallback inside tab context (with auth cookies)
    if (chrome.scripting && chrome.scripting.executeScript) {
      const fromScript = await new Promise((resolve) => {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: async (fetchUrl) => {
              try {
                if (typeof window !== "undefined" && typeof window.fetchCourseGradeFromPage === "function") {
                  return await window.fetchCourseGradeFromPage(fetchUrl);
                }
                const res = await fetch(fetchUrl, { credentials: "include" });
                if (!res.ok) return null;
                const html = await res.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");

                const findFn = typeof window !== "undefined" && typeof window.findFapGradeTable === "function"
                  ? window.findFapGradeTable
                  : (typeof findFapGradeTable === "function" ? findFapGradeTable : null);
                const parseFn = typeof window !== "undefined" && typeof window.parseFapGradeTable === "function"
                  ? window.parseFapGradeTable
                  : (typeof parseFapGradeTable === "function" ? parseFapGradeTable : null);

                let table = findFn ? findFn(doc) : null;
                if (!table) table = doc.querySelector('table[summary="Report"]');
                if (!table) {
                  const tables = Array.from(doc.querySelectorAll("table"));
                  for (const tbl of tables) {
                    const text = tbl.textContent || "";
                    if (
                      /Weight/i.test(text) &&
                      /Value/i.test(text) &&
                      (/Grade/i.test(text) || /Course total/i.test(text) || /Average/i.test(text) || /Passed|Not passed/i.test(text))
                    ) {
                      table = tbl;
                      break;
                    }
                  }
                }
                if (table) {
                  if (parseFn) return parseFn(table);
                  const rows = Array.from(table.querySelectorAll("tbody tr"));
                  const categories = [];
                  rows.forEach((r) => {
                    const cells = Array.from(r.cells).map((c) => c.textContent.trim());
                    if (cells.length >= 4) {
                      const weight = parseFloat(cells[2].replace(/%/g, "")) || 0;
                      const val = parseFloat(cells[3]);
                      categories.push({
                        category: cells[0],
                        item: cells[1],
                        weight,
                        value: isNaN(val) ? null : val
                      });
                    }
                  });
                  return { categories, bonus: 0, average: null, status: null };
                }
              } catch (_) {}
              return null;
            },
            args: [url]
          },
          (results) => resolve(results && results[0] && results[0].result)
        );
      });
      if (fromScript) return fromScript;
    }

    return null;
  }

  if (syncGradeBtn) {
    syncGradeBtn.addEventListener("click", () => {
      if (typeof chrome === "undefined" || !chrome.tabs) return;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (!activeTab || !activeTab.url || !/fap\.fpt\.edu\.vn/i.test(activeTab.url)) {
          showError("Hãy mở tab FAP (StudentGrade.aspx) để đồng bộ điểm.");
          return;
        }

        runWithInjectedGradeScript(activeTab.id, () => {
          chrome.tabs.sendMessage(activeTab.id, { action: "extractStudentGrade", type: "EXTRACT_GRADE_REPORT" }, (resp) => {
            if (chrome.runtime.lastError || !resp || !resp.ok || !resp.grade) {
              // Direct fallback execution via executeScript
              if (chrome.scripting && chrome.scripting.executeScript) {
                chrome.scripting.executeScript(
                  {
                    target: { tabId: activeTab.id },
                    func: () => {
                      try {
                        if (typeof window !== "undefined" && typeof window.extractStudentGradeFromPage === "function") {
                          return window.extractStudentGradeFromPage(document);
                        }
                        if (typeof extractStudentGradeFromPage === "function") {
                          return extractStudentGradeFromPage(document);
                        }
                      } catch (_) {}
                      return null;
                    }
                  },
                  (results) => {
                    const grade = results && results[0] && results[0].result;
                    if (grade && grade.courseCode && grade.courseCode !== "UNKNOWN") {
                      saveAndRenderSingleGrade(grade);
                    } else {
                      showError("Không tìm thấy bảng điểm trên trang hiện tại. Hãy chọn môn trên FAP.");
                    }
                  }
                );
              } else {
                showError("Không tìm thấy bảng điểm trên trang hiện tại. Hãy chọn môn trên FAP.");
              }
              return;
            }

            saveAndRenderSingleGrade(resp.grade);
          });
        });
      });
    });
  }

  if (syncAllGradesBtn) {
    syncAllGradesBtn.addEventListener("click", () => {
      if (typeof chrome === "undefined" || !chrome.tabs) return;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (!activeTab || !activeTab.url || !/StudentGrade\.aspx/i.test(activeTab.url)) {
          showError("Mở trang FAP 'Grade report' (StudentGrade.aspx) để quét tất cả môn.");
          return;
        }

        runWithInjectedGradeScript(activeTab.id, () => {
          chrome.tabs.sendMessage(activeTab.id, { action: "getGradePageControls", type: "GET_GRADE_PAGE_CONTROLS" }, async (resp) => {
            let courses = resp && resp.courses;
            let term = resp && resp.term;

            if (!courses || courses.length === 0) {
              // Direct fallback via executeScript
              if (chrome.scripting && chrome.scripting.executeScript) {
                const fallback = await new Promise((resolve) => {
                  chrome.scripting.executeScript(
                    {
                      target: { tabId: activeTab.id },
                      func: () => {
                        try {
                          if (typeof window !== "undefined" && typeof window.getGradePageControls === "function") {
                            return window.getGradePageControls(document);
                          }
                          if (typeof getGradePageControls === "function") {
                            return getGradePageControls(document);
                          }
                        } catch (_) {}
                        return null;
                      }
                    },
                    (res) => resolve(res && res[0] && res[0].result)
                  );
                });
                courses = fallback && fallback.courses;
                term = fallback && fallback.term;
              }
            }

            if (!courses || courses.length === 0) {
              showError("Không lấy được danh sách môn học từ FAP.");
              return;
            }

            showToast(`Bắt đầu quét ${courses.length} môn học...`, 1500);

            const loc = getChromeStorageLocal();
            let grades = {};
            if (loc) {
              try {
                const r = await new Promise((res) => loc.get(["studentGrades"], res));
                grades = (r && r.studentGrades) || {};
              } catch (_) {}
            }

            let savedCount = 0;
            for (let i = 0; i < courses.length; i++) {
              const c = courses[i];
              showToast(`Đang quét [${i + 1}/${courses.length}]: ${c.courseCode}...`, 1200);

              // If course is active on current page, extract from page directly!
              if (c.isActive && chrome.scripting && chrome.scripting.executeScript) {
                try {
                  const currentGrade = await new Promise((resolve) => {
                    chrome.scripting.executeScript(
                      {
                        target: { tabId: activeTab.id },
                        func: () => {
                          try {
                            if (typeof window !== "undefined" && typeof window.extractStudentGradeFromPage === "function") {
                              return window.extractStudentGradeFromPage(document);
                            }
                            if (typeof extractStudentGradeFromPage === "function") {
                              return extractStudentGradeFromPage(document);
                            }
                          } catch (_) {}
                          return null;
                        }
                      },
                      (res) => resolve(res && res[0] && res[0].result)
                    );
                  });
                  if (currentGrade && currentGrade.categories) {
                    grades[c.courseCode] = {
                      ...currentGrade,
                      courseCode: c.courseCode,
                      courseName: c.courseName || currentGrade.courseName,
                      term: term || currentGrade.term || ""
                    };
                    savedCount++;
                    continue;
                  }
                } catch (_) {}
              }

              // Otherwise fetch URL via the active tab (same-origin with auth cookies)
              try {
                let fetchUrl = c.href;
                if (!fetchUrl || !/^https?:\/\//i.test(fetchUrl)) {
                  try {
                    const base = new URL(activeTab.url || "https://fap.fpt.edu.vn/Grade/StudentGrade.aspx");
                    base.searchParams.set("course", c.id);
                    fetchUrl = base.href;
                  } catch (_) {
                    fetchUrl = `https://fap.fpt.edu.vn/Grade/StudentGrade.aspx?course=${c.id}`;
                  }
                }
                const parsed = await fetchGradeInTab(activeTab.id, fetchUrl);
                if (!parsed || !parsed.categories) {
                  console.warn("Không lấy được điểm môn:", c.courseCode, fetchUrl);
                  continue;
                }

                grades[c.courseCode] = {
                  courseCode: c.courseCode,
                  courseName: c.courseName || c.courseCode,
                  term: term || "",
                  ...parsed,
                  lastUpdated: Date.now()
                };
                savedCount++;
              } catch (err) {
                console.warn("Lỗi khi tải điểm môn:", c.courseCode, err);
              }
            }

            if (loc) {
              loc.set({ studentGrades: grades }, () => {
                showToast(`Đã quét xong ${savedCount}/${courses.length} môn!`, 3000);
                loadAndRenderStudentGrades();
              });
            } else {
              showToast(`Đã quét xong ${savedCount}/${courses.length} môn!`, 3000);
              renderStudentGrades(grades);
            }
          });
        });
      });
    });
  }

  if (clearGradesBtn) {
    clearGradesBtn.addEventListener("click", async () => {
      const ok = await showConfirm("Bạn có chắc chắn muốn xoá toàn bộ dữ liệu bảng điểm đã lưu?", {
        title: "Xoá bảng điểm",
        okLabel: "Xoá tất cả",
        danger: true
      });
      if (!ok) return;
      const loc = getChromeStorageLocal();
      if (loc) {
        loc.remove(["studentGrades"], () => {
          try { localStorage.removeItem("studentGrades"); } catch (_) {}
          showToast("Đã xoá dữ liệu bảng điểm.");
          loadAndRenderStudentGrades();
        });
      }
    });
  }

  const scheduleFilterBtn = document.getElementById("scheduleFilterBtn");
  const scheduleFilterModal = document.getElementById("scheduleFilterModal");
  const closeScheduleFilter = document.getElementById("closeScheduleFilter");
  const rangeInputs = () => document.querySelectorAll('input[name="classRange"]');

  const closeScheduleFilterModal = () => {
    if (scheduleFilterModal) scheduleFilterModal.style.display = "none";
  };

  if (scheduleFilterBtn && scheduleFilterModal) {
    scheduleFilterBtn.addEventListener("click", () => {
      const current = getClassRangeFilter();
      rangeInputs().forEach((input) => {
        input.checked = input.value === current;
      });
      scheduleFilterModal.style.display = "block";
    });

    scheduleFilterModal.addEventListener("click", (e) => {
      if (e.target === scheduleFilterModal) closeScheduleFilterModal();
    });
  }

  const resetClassFilter = document.getElementById("resetClassFilter");
  if (resetClassFilter) {
    // Same role as «Chọn tất cả» on the exam filter: back to showing everything.
    resetClassFilter.addEventListener("click", () => {
      rangeInputs().forEach((input) => {
        input.checked = input.value === "all";
      });
    });
  }

  const applyClassFilter = document.getElementById("applyClassFilter");
  if (applyClassFilter) {
    applyClassFilter.addEventListener("click", () => {
      const picked = [...rangeInputs()].find((input) => input.checked);
      setClassRangeFilter(picked ? picked.value : "all");
      closeScheduleFilterModal();
      let saved = [];
      try {
        saved = JSON.parse(localStorage.getItem("classSchedule") || "[]");
      } catch (_) {}
      renderClassSchedule(saved);
    });
  }

  if (closeScheduleFilter) {
    closeScheduleFilter.addEventListener("click", closeScheduleFilterModal);
  }

  syncClassFilterButton();

  const loadWeekOptionsBtn = document.getElementById("loadWeekOptionsBtn");
  const syncWeekRangeBtn = document.getElementById("syncWeekRangeBtn");
  if (loadWeekOptionsBtn) {
    loadWeekOptionsBtn.addEventListener("click", handleLoadWeekScheduleOptions);
  }
  if (syncWeekRangeBtn) {
    syncWeekRangeBtn.addEventListener("click", handleSyncClassScheduleWeekRange);
  }

  const weekRangeBtn = document.getElementById("weekRangeBtn");
  const weekRangeModal = document.getElementById("weekRangeModal");
  const closeWeekRangeModal = document.getElementById("closeWeekRangeModal");

  const closeWeekRangeModalFn = () => {
    if (weekRangeModal) weekRangeModal.style.display = "none";
  };

  if (weekRangeBtn && weekRangeModal) {
    weekRangeBtn.addEventListener("click", () => {
      weekRangeModal.style.display = "block";
    });
    weekRangeModal.addEventListener("click", (e) => {
      if (e.target === weekRangeModal) closeWeekRangeModalFn();
    });
  }
  if (closeWeekRangeModal) {
    closeWeekRangeModal.addEventListener("click", closeWeekRangeModalFn);
  }
});

const CLASS_RANGE_STORAGE_KEY = "classRangeFilter";

function getClassRangeFilter() {
  try {
    const saved = localStorage.getItem(CLASS_RANGE_STORAGE_KEY);
    return CLASS_RANGE_MODES.includes(saved) ? saved : "all";
  } catch (_) {
    return "all";
  }
}

function setClassRangeFilter(mode) {
  try {
    localStorage.setItem(CLASS_RANGE_STORAGE_KEY, mode);
  } catch (_) {}
}

/** Tints the Lọc button while a range is hiding part of the timetable. */
function syncClassFilterButton() {
  const btn = document.getElementById("scheduleFilterBtn");
  if (btn) btn.classList.toggle("action-btn--filtering", getClassRangeFilter() !== "all");
}

function persistClassSchedule(jsonString) {
  try {
    localStorage.setItem("classSchedule", jsonString);
  } catch (_) {}
  mirrorClassScheduleToStorage(jsonString);
}

function isScheduleOfWeekUrl(url) {
  return typeof url === "string" && /fap\.fpt\.edu\.vn\/Report\/ScheduleOfWeek\.aspx/i.test(url);
}

/** Tab ScheduleOfWeek (có thể không phải tab đang focus). */
function findScheduleOfWeekTab(done) {
  chrome.tabs.query({ url: "https://fap.fpt.edu.vn/*" }, (candidates) => {
    const list = (candidates || []).filter((t) => t.id && isScheduleOfWeekUrl(t.url || ""));
    if (list.length) {
      const preferred = list.find((t) => t.active) || list[0];
      done(null, preferred);
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const t = tabs && tabs[0];
      if (t && t.id && isScheduleOfWeekUrl(t.url || "")) {
        done(null, t);
        return;
      }
      done(new Error("no-schedule-tab"), null);
    });
  });
}

let weekRangeSyncInProgress = false;

function fillWeekRangeSelectOptions(weeks) {
  const startSel = document.getElementById("weekRangeStart");
  const endSel = document.getElementById("weekRangeEnd");
  const syncBtn = document.getElementById("syncWeekRangeBtn");
  if (!startSel || !endSel) return;
  startSel.replaceChildren();
  endSel.replaceChildren();
  weeks.forEach((w) => {
    const o1 = document.createElement("option");
    o1.value = String(w.index);
    o1.textContent = w.label || `Tuần ${w.index}`;
    startSel.appendChild(o1);
    const o2 = document.createElement("option");
    o2.value = String(w.index);
    o2.textContent = w.label || `Tuần ${w.index}`;
    endSel.appendChild(o2);
  });
  if (weeks.length) {
    const last = weeks.length - 1;
    startSel.selectedIndex = 0;
    endSel.selectedIndex = last;
    startSel.disabled = false;
    endSel.disabled = false;
    if (syncBtn) syncBtn.disabled = false;
  }
}

function setWeekRangeStatus(text, show) {
  const el = document.getElementById("weekRangeStatus");
  if (!el) return;
  el.textContent = text || "";
  el.hidden = !show;
}

function setWeekRangeControlsDisabled(disabled) {
  ["loadWeekOptionsBtn", "syncWeekRangeBtn", "weekRangeStart", "weekRangeEnd"].forEach((id) => {
    const n = document.getElementById(id);
    if (n) n.disabled = disabled;
  });
}

function handleLoadWeekScheduleOptions() {
  findScheduleOfWeekTab(async (err, tab) => {
    if (err || !tab || !tab.id) {
      const open = await showConfirm(
        "Chưa có tab Lịch tuần FAP. Mở https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx ?",
        { okLabel: "Mở FAP" }
      );
      if (open) {
        chrome.tabs.create({ url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx", active: true });
      }
      return;
    }
    setWeekRangeStatus("Đang đọc danh sách tuần…", true);
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }, () => {
      if (chrome.runtime.lastError) {
        setWeekRangeStatus("", false);
        showError("Không đọc được trang. Tải lại FAP rồi mở lại popup.");
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: "getWeekScheduleControls" }, (res) => {
        if (chrome.runtime.lastError) {
          setWeekRangeStatus("", false);
          showError("Không gửi được yêu cầu tới trang. Tải lại FAP.");
          return;
        }
        if (!res || !res.ok) {
          setWeekRangeStatus("", false);
          if (res && res.loginRequired) {
            chrome.tabs.create({ url: "https://fap.fpt.edu.vn/Default.aspx", active: true });
            showError("Bạn cần đăng nhập FAP. Đã mở trang đăng nhập.");
          } else {
            showError("Không thấy danh sách tuần. Đảm bảo bạn đang ở trang Lịch tuần FAP.");
          }
          return;
        }
        if (!res.weeks || !res.weeks.length) {
          setWeekRangeStatus("", false);
          showError("Danh sách tuần trống.");
          return;
        }
        fillWeekRangeSelectOptions(res.weeks);
        setWeekRangeStatus(`Đã tải ${res.weeks.length} tuần. Chọn khoảng rồi nhấn Đồng bộ.`, true);
      });
    });
  });
}

function handleSyncClassScheduleWeekRange() {
  if (weekRangeSyncInProgress) return;
  const startSel = document.getElementById("weekRangeStart");
  const endSel = document.getElementById("weekRangeEnd");
  if (!startSel || !endSel || startSel.disabled) {
    showError("Nhấn «Tải tuần» trước khi đồng bộ khoảng.");
    return;
  }
  let startIdx = parseInt(startSel.value, 10);
  let endIdx = parseInt(endSel.value, 10);
  if (Number.isNaN(startIdx) || Number.isNaN(endIdx)) {
    showError("Tuần không hợp lệ.");
    return;
  }
  if (startIdx > endIdx) {
    const t = startIdx;
    startIdx = endIdx;
    endIdx = t;
  }

  const weekLabels = [];
  for (let i = 0; i < startSel.options.length; i++) {
    weekLabels.push((startSel.options[i].textContent || "").trim());
  }

  findScheduleOfWeekTab(async (err, tab) => {
    if (err || !tab || !tab.id) {
      const open = await showConfirm(
        "Cần tab Lịch tuần FAP để đồng bộ. Mở ScheduleOfWeek.aspx?",
        { okLabel: "Mở FAP" }
      );
      if (open) {
        chrome.tabs.create({ url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx", active: true });
      }
      return;
    }

    const tabId = tab.id;
    const total = endIdx - startIdx + 1;
    weekRangeSyncInProgress = true;
    setWeekRangeControlsDisabled(true);
    setWeekRangeStatus(
      `Đang đồng bộ ${total} tuần trong nền… Bạn có thể đóng popup; mở lại khi xong.`,
      true
    );

    const seedJson = localStorage.getItem("classSchedule") || "[]";
    const payload = {
      type: "START_WEEK_RANGE_SYNC",
      tabId,
      startIdx,
      endIdx,
      weekLabels,
      seedJson
    };
    function sendStartWeekRangeSync(attempt) {
      chrome.runtime.sendMessage(payload, (resp) => {
        const err = chrome.runtime.lastError;
        if (err && attempt < 2) {
          setTimeout(() => sendStartWeekRangeSync(attempt + 1), 250);
          return;
        }
        if (err || !resp || !resp.ok) {
          weekRangeSyncInProgress = false;
          setWeekRangeControlsDisabled(false);
          setWeekRangeStatus("", false);
          showError(
            "Không khởi chạy được đồng bộ nền: " +
              (err && err.message ? err.message : "unknown") +
              ". Xem chi tiết ở chrome://extensions → Service worker → Inspect."
          );
        }
      });
    }
    sendStartWeekRangeSync(0);
  });
}

function applyWeekRangeSyncDoneFromBackground(msg) {
  weekRangeSyncInProgress = false;
  setWeekRangeControlsDisabled(false);
  if (msg.mergedJson) {
    persistClassSchedule(msg.mergedJson);
    try {
      const merged = JSON.parse(msg.mergedJson);
      window.renderClassSchedule && window.renderClassSchedule(merged);
    } catch (e) { /* no-op */ }
  }
  try {
    document.getElementById("scheduleTabBtn")?.click();
  } catch (e) { /* no-op */ }
  if (msg.toastText) {
    showToast(msg.toastText, 4200);
  }
  if (msg.statusText) {
    setWeekRangeStatus(msg.statusText, true);
  }
}

function pollWeekRangeSyncUntilIdle() {
  const loc = getChromeStorageLocal();
  if (!loc) return;
  let ticks = 0;
  const iv = setInterval(() => {
    ticks += 1;
    if (ticks > 600) {
      clearInterval(iv);
      weekRangeSyncInProgress = false;
      setWeekRangeControlsDisabled(false);
      setWeekRangeStatus("", false);
      return;
    }
    try {
      loc.get(["weekRangeSyncRunning", "classSchedule", "weekRangeLastSummary"], (r) => {
        if (chrome.runtime.lastError) return;
        if (r.weekRangeSyncRunning) return;
        clearInterval(iv);
        if (r.classSchedule) {
          const cur = localStorage.getItem("classSchedule");
          if (cur !== r.classSchedule) {
            persistClassSchedule(r.classSchedule);
            try {
              window.renderClassSchedule && window.renderClassSchedule(JSON.parse(r.classSchedule));
            } catch (e) { /* no-op */ }
          }
        }
        if (r.weekRangeLastSummary) {
          if (r.weekRangeLastSummary.toastText) {
            showToast(r.weekRangeLastSummary.toastText, 4200);
          }
          if (r.weekRangeLastSummary.statusText) {
            setWeekRangeStatus(r.weekRangeLastSummary.statusText, true);
          }
          try {
            loc.remove(["weekRangeLastSummary"]);
          } catch (_) {}
        }
        weekRangeSyncInProgress = false;
        setWeekRangeControlsDisabled(false);
      });
    } catch (_) {
      clearInterval(iv);
      weekRangeSyncInProgress = false;
      setWeekRangeControlsDisabled(false);
    }
  }, 500);
}

function handleSyncClassSchedule() {
  showToast("Đang sync lịch học...", 1500);

  findScheduleOfWeekTab(async (err, tab) => {
    if (err || !tab || !tab.id) {
      const open = await showConfirm("Cần trang Lịch tuần (ScheduleOfWeek). Mở FAP?", { okLabel: "Mở FAP" });
      if (open) {
        chrome.tabs.create({ url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx", active: true });
      }
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error("Script injection failed:", chrome.runtime.lastError);
        showError("Không truy cập được trang để đồng bộ lịch học. Tải lại trang rồi thử lại.");
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "extractWeeklySchedule" }, function (response) {
        if (chrome.runtime.lastError) {
          console.error("extractWeeklySchedule message failed:", chrome.runtime.lastError);
          showError("Có lỗi khi đồng bộ lịch học. Thử lại.");
          return;
        }
        
        if (!response || !response.success) {
          if (response && response.loginRequired) {
            // Open login page and focus it so user can sign in
            chrome.tabs.create({ url: 'https://fap.fpt.edu.vn/Default.aspx', active: true });
            showError("Bạn cần đăng nhập FAP. Đăng nhập rồi mở lại popup.");
            return;
          }
          console.error("Weekly schedule extraction failed");
          showError("Không đọc được bảng lịch học. Kiểm tra: đang ở trang Lịch tuần, trang đã tải xong, và đã đăng nhập.");
          return;
        }
        
        const newEvents = response.schedule || [];
        
        if (newEvents.length === 0) {
          showError("Tuần này không có lịch học nào, hoặc trang chưa tải xong.");
          return;
        }
        
        const existingData = localStorage.getItem("classSchedule");
        let allSchedule = [];
        
        if (existingData) {
          try {
            allSchedule = JSON.parse(existingData);
          } catch (e) {
            console.error("Error parsing existing schedule:", e);
            allSchedule = [];
          }
        }
        
        const { uniqueNewEvents, merged: mergedSchedule } = mergeNewClassEventsInto(allSchedule, newEvents);
        allSchedule = mergedSchedule;
        persistClassSchedule(JSON.stringify(allSchedule));
        // Re-render UI for the schedule tab
        window.renderClassSchedule && window.renderClassSchedule(allSchedule);
        // Chuyển sang tab Lịch học và hiện toast thay vì alert
        try {
          document.getElementById('scheduleTabBtn')?.click();
        } catch (e) { /* no-op */ }
        const skipped = response.skipped || 0;
        if (skipped > 0) {
          showError(`Đồng bộ xong nhưng bỏ qua ${skipped} ô không đọc được — FAP có thể đã đổi giao diện.`);
        } else {
          showToast(`Đã đồng bộ lịch học! Mới: ${uniqueNewEvents.length} • Tổng: ${allSchedule.length}`, 2600);
        }
      });
    });
  });
}

function handleDownloadClassSchedule() {
  const storedData = localStorage.getItem("classSchedule");
  
  if (!storedData) {
    showError("Chưa có dữ liệu lịch học. Đồng bộ lịch học trước đã.");
    return;
  }

  let schedule;
  try {
    schedule = JSON.parse(storedData);
  } catch (e) {
    console.error("Parse stored schedule failed:", e);
    showError("Dữ liệu lịch học bị lỗi. Đồng bộ lại.");
    return;
  }

  if (!schedule || !schedule.length) {
    showError("Không có lịch học nào để tải.");
    return;
  }

  // Create ICS content for class schedule
  const cal = createClassCalendar();
  
  // Group events by date to identify first slots
  const eventsByDate = {};
  
  // First pass: group events by date
  schedule.forEach(event => {
    if (event.rawDate) {
      const dateKey = `${event.rawDate.day}-${event.rawDate.month}-${event.rawDate.year}`;
      if (!eventsByDate[dateKey]) {
        eventsByDate[dateKey] = [];
      }
      eventsByDate[dateKey].push(event);
    }
  });
  
  // Second pass: sort events by time and mark first slots
  Object.keys(eventsByDate).forEach(dateKey => {
    // Sort events by start time
    eventsByDate[dateKey].sort((a, b) => {
      if (a.rawDate.startHour !== b.rawDate.startHour) {
        return a.rawDate.startHour - b.rawDate.startHour;
      }
      return a.rawDate.startMinute - b.rawDate.startMinute;
    });
    
    // Mark the first event of the day
    if (eventsByDate[dateKey].length > 0) {
      eventsByDate[dateKey][0].isFirstSlot = true;
    }
  });
  
  // Add events to calendar
  schedule.forEach(event => {
    cal.addEvent(
      event.title,
      event.description || '',
      event.location || '',
      event,
      event.isFirstSlot // Pass the flag that identifies if it's the first slot of the day
    );
  });

  const blob = new Blob([cal.build()], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', 'lich-hoc.ics');
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  showToast(`Đã tải ${schedule.length} tiết học. Chúc bạn học tốt!`, 2600);
}

async function handleClearClassSchedule() {
  const proceed = await showConfirm(
    "Bạn có chắc chắn muốn xoá toàn bộ lịch học đã lưu?",
    { title: "Xoá lịch học", okLabel: "Xoá", danger: true }
  );
  if (!proceed) return;
  try {
    localStorage.removeItem("classSchedule");
    try {
      const loc = getChromeStorageLocal();
      if (loc) loc.remove(["classSchedule"]);
    } catch (_) {}
    // Re-render empty state immediately
    try {
      window.renderClassSchedule && window.renderClassSchedule([]);
    } catch (_) {}
    // Ensure we are on the Lịch học tab so user sees the change
    try { document.getElementById('scheduleTabBtn')?.click(); } catch (_) {}
    showToast('Đã xoá toàn bộ lịch học');
  } catch (e) {
    console.error("Error clearing class schedule:", e);
    showError("Có lỗi khi xoá lịch học.");
  }
}

function tryAutoRefreshAttendance() {
  // Only run if we already have some schedule stored (to match against)
  const stored = localStorage.getItem("classSchedule");
  if (!stored) return;
  let saved;
  try { saved = JSON.parse(stored); } catch { return; }
  if (!Array.isArray(saved) || saved.length === 0) return;

  const keyOf = (ev) => {
    if (ev && ev.rawDate) {
      const rd = ev.rawDate;
      return `${(ev.title||'').trim()}__${rd.year}-${rd.month}-${rd.day}__${rd.startHour}:${rd.startMinute}`;
    }
    return null;
  };

  const extractFromTab = (tabId, onDone) => {
    chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Skip auto attendance refresh (inject error):', chrome.runtime.lastError.message);
        return onDone && onDone(false);
      }
      chrome.tabs.sendMessage(tabId, { action: 'extractWeeklySchedule' }, function (response) {
        if (chrome.runtime.lastError || !response || !response.success || !Array.isArray(response.schedule)) {
          if (response && response.loginRequired) {
            try {
              chrome.tabs.update(tabId, { active: true });
            } catch (_) {}
            showToast('Cần đăng nhập FAP để cập nhật điểm danh. Vui lòng đăng nhập rồi mở lại popup.', 3000);
          }
          return onDone && onDone(false);
        }
        const fresh = response.schedule;
        const freshMap = new Map();
        fresh.forEach(ev => { const k = keyOf(ev); if (k) freshMap.set(k, ev); });

        let updated = 0;
        const merged = saved.map(ev => {
          const k = keyOf(ev);
          if (!k) return ev;
          const f = freshMap.get(k);
          if (!f) return ev;
          const attStatus = f.attendanceStatus || f.attendance_status || null;
          const attColor = f.attendanceColor || f.attendance_color || null;
          if (attStatus && attStatus !== ev.attendanceStatus) { ev.attendanceStatus = attStatus; updated++; }
          if (attColor && attColor !== ev.attendanceColor) { ev.attendanceColor = attColor; }
          return ev;
        });

        if (updated > 0) {
          persistClassSchedule(JSON.stringify(merged));
          try { window.renderClassSchedule && window.renderClassSchedule(merged); } catch (_) {}
        }
        onDone && onDone(true);
      });
    });
  };

  findScheduleOfWeekTab((err, tab) => {
    if (err || !tab || !tab.id) return;
    extractFromTab(tab.id);
  });
}

function autoSyncSchedule() {
  const loadingEl = document.getElementById("examSyncLoading");
  const errorEl = document.getElementById("examSyncError");
  const up = document.getElementById("upcomingExams");
  const co = document.getElementById("completedExams");
  if (up) while (up.firstChild) up.removeChild(up.firstChild);
  if (co) while (co.firstChild) co.removeChild(co.firstChild);

  if (loadingEl) loadingEl.hidden = false;
  if (errorEl) errorEl.hidden = true;

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs || !tabs[0]) {
      if (loadingEl) loadingEl.hidden = true;
      return;
    }
    
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ["content.js"]
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error('Script injection failed:', chrome.runtime.lastError);
        if (loadingEl) loadingEl.hidden = true;
        if (errorEl) errorEl.hidden = false;
        return;
      }
      
      chrome.tabs.sendMessage(tabs[0].id, { action: "extractSchedule" }, function (response) {
        if (loadingEl) loadingEl.hidden = true;
        if (chrome.runtime.lastError) {
          console.error('Message sending failed:', chrome.runtime.lastError);
          if (errorEl) errorEl.hidden = false;
          return;
        }
        if (!response || !response.events) {
          if (errorEl) errorEl.hidden = false;
          return;
        }
        localStorage.setItem("examSchedule", JSON.stringify(response.events));
        mirrorExamScheduleToStorage(response.events);

        renderExamList(response.events);
      });
    });
  });
}

/** Mirrors the "Lịch học (n)" count that renderClassSchedule puts on its own tab. */
function setExamTabCount(upcomingCount) {
  const label = document.getElementById("upcomingTab")?.querySelector(".tab-btn__text");
  if (label) label.textContent = upcomingCount ? `Kỳ thi (${upcomingCount})` : "Kỳ thi";
}

function renderExamList(events) {
  if (!Array.isArray(events)) events = [];
  const upcomingContainer = document.getElementById("upcomingExams");
  const completedContainer = document.getElementById("completedExams");
  const loadingEl = document.getElementById("examSyncLoading");
  const errorEl = document.getElementById("examSyncError");
  
  if (loadingEl) loadingEl.hidden = true;
  if (errorEl) errorEl.hidden = true;
  
  if (!upcomingContainer || !completedContainer) return;

  // Clear both containers safely
  while (upcomingContainer.firstChild) {
    upcomingContainer.removeChild(upcomingContainer.firstChild);
  }
  while (completedContainer.firstChild) {
    completedContainer.removeChild(completedContainer.firstChild);
  }

  // Insert column headings
  const upHead = document.createElement("div"); upHead.className = "split-heading"; upHead.textContent = "Chưa thi";
  upcomingContainer.appendChild(upHead);
  const compHead = document.createElement("div"); compHead.className = "split-heading"; compHead.textContent = "Đã thi";
  completedContainer.appendChild(compHead);
  
  if (!events.length) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "exam-list-hint";
    emptyDiv.textContent = "Không có lịch thi nào.";
    upcomingContainer.appendChild(emptyDiv);
    setExamTabCount(0);
    return;
  }

  // Separate upcoming and completed exams
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const upcomingExams = [];
  const completedExams = [];

  events.forEach(e => {
    const start = new Date(e.start);
    const examDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const diffTime = examDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      completedExams.push(e);
    } else {
      upcomingExams.push(e);
    }
  });

  // Update headings with counts
  upHead.textContent = `Chưa thi (${upcomingExams.length})`;
  compHead.textContent = `Đã thi (${completedExams.length})`;
  setExamTabCount(upcomingExams.length);

  // Render upcoming exams
  if (upcomingExams.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "exam-list-hint";
    emptyDiv.textContent = "Không có kỳ thi nào sắp tới.";
    upcomingContainer.appendChild(emptyDiv);
  } else {
    upcomingExams.forEach(e => {
      const examItem = createExamItem(e);
      upcomingContainer.appendChild(examItem);
    });
  }

  // Render completed exams
  if (completedExams.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "exam-list-hint";
    emptyDiv.textContent = "Không có kỳ thi nào đã hoàn thành.";
    completedContainer.appendChild(emptyDiv);
  } else {
    completedExams.forEach(e => {
      const examItem = createExamItem(e);
      completedContainer.appendChild(examItem);
    });
  }

  // Apply filters after rendering
  setTimeout(() => {
    if (window.applyFilters) {
      window.applyFilters();
    }
  }, 100);
}

function createExamItem(e) {
  const desc = (e.description + ' ' + e.title).toLowerCase();
  const examType = (e.examType || "").toLowerCase();
  const tagType = (() => {
    if (e.tag) {
      return e.tag; 
    }
    
    const tag = (examType || "").toLowerCase();
    if (tag.includes("2ndfe") || desc.includes("2ndfe") || desc.includes("2nd fe")) return "2NDFE";
    if (tag.includes("2ndpe") || desc.includes("2ndpe") || desc.includes("2nd pe")) return "2NDPE";
    if (tag === "pe" || desc.includes("practical_exam") || desc.includes("project presentation")) return "PE";
    if (tag === "fe" || desc.includes("fe") || desc.includes("final") || desc.includes("multiple_choices") || desc.includes("speaking")) return "FE";
    return null;
  })();

  const row = document.createElement("div");
  row.className = "exam-item";

  const start = new Date(e.start);
  const end = new Date(e.end);
  const formatTime = d => d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const formatDate = d => d.toLocaleDateString("vi-VN");

  // Calculate days remaining
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const examDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diffTime = examDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Create exam card structure safely
  const examCard = document.createElement("div");
  examCard.className = "exam-card";

  const examHeader = document.createElement("div");
  examHeader.className = "exam-header";

  const examTitle = document.createElement("div");
  examTitle.className = "exam-title";

  const codeSpan = document.createElement("span");
  codeSpan.className = "exam-code";
  codeSpan.textContent = e.title;
  examTitle.appendChild(codeSpan);

  const tagGroup = document.createElement("span");
  tagGroup.className = "exam-title__tags";

  if (tagType) {
    const tagSpan = document.createElement("span");
    tagSpan.className = "tag";
    if (tagType === "2NDFE") {
      tagSpan.classList.add("secondfe");
      tagSpan.textContent = "2NDFE";
    } else if (tagType === "2NDPE") {
      tagSpan.classList.add("secondpe");
      tagSpan.textContent = "2NDPE";
    } else if (tagType === "PE") {
      tagSpan.classList.add("pe");
      tagSpan.textContent = "PE";
    } else if (tagType === "FE") {
      tagSpan.classList.add("fe");
      tagSpan.textContent = "FE";
    }
    tagGroup.appendChild(tagSpan);
  }

  const countdownSpan = document.createElement("span");
  countdownSpan.className = "tag countdown";
  if (diffDays < 0) {
    countdownSpan.classList.add("past");
    countdownSpan.textContent = "Đã thi";
  } else if (diffDays === 0) {
    countdownSpan.classList.add("today");
    countdownSpan.textContent = "Hôm nay";
  } else if (diffDays === 1) {
    countdownSpan.classList.add("tomorrow");
    countdownSpan.textContent = "Ngày mai";
  } else if (diffDays <= 3) {
    countdownSpan.classList.add("urgent");
    countdownSpan.textContent = "Còn " + diffDays + " ngày";
  } else {
    countdownSpan.classList.add("future");
    countdownSpan.textContent = "Còn " + diffDays + " ngày";
  }
  tagGroup.appendChild(countdownSpan);

  examTitle.appendChild(tagGroup);

  examHeader.appendChild(examTitle);
  examCard.appendChild(examHeader);

  // Create exam details safely
  const examDetail = document.createElement("div");
  examDetail.className = "exam-detail";

  const createDetailLine = (label, value) => {
    const line = document.createElement("div");
    line.className = "meta-row";
    const lab = document.createElement("span");
    lab.className = "meta-label";
    lab.textContent = `${label}:`;
    const val = document.createElement("span");
    val.className = "meta-value";
    val.textContent = value;
    line.appendChild(lab);
    line.appendChild(val);
    return line;
  };

  examDetail.appendChild(createDetailLine("Phương thức", e.description || "Chưa rõ"));
  examDetail.appendChild(createDetailLine("Phòng", e.location || "Chưa rõ"));
  examDetail.appendChild(createDetailLine("Ngày thi", formatDate(start)));
  examDetail.appendChild(createDetailLine("Thời gian", formatTime(start) + " - " + formatTime(end)));

  examCard.appendChild(examDetail);

  const splash = document.createElement("div");
  splash.className = "exam-splash";
  splash.setAttribute("role", "region");
  splash.setAttribute("aria-label", "Gợi ý ôn tập");

  const splashInner = document.createElement("div");
  splashInner.className = "exam-splash__inner";

  const splashTitle = document.createElement("div");
  splashTitle.className = "exam-splash__kicker";
  splashTitle.textContent = "Ôn tập";

  const splashHeadline = document.createElement("div");
  splashHeadline.className = "exam-splash__headline";

  const actions = document.createElement("div");
  actions.className = "exam-splash__actions";

  splashInner.appendChild(splashTitle);
  splashInner.appendChild(splashHeadline);
  splashInner.appendChild(actions);
  splash.appendChild(splashInner);
  examCard.appendChild(splash);

  if (window.FPTUStudySuggestions && typeof window.FPTUStudySuggestions.getStudySuggestions === "function") {
    window.FPTUStudySuggestions.getStudySuggestions(e.title || "").then(({ code, items }) => {
      splashHeadline.textContent = code ? `Gợi ý cho ${code}` : "Gợi ý ôn tập";
      actions.replaceChildren();
      if (!items || !items.length) {
        const empty = document.createElement("span");
        empty.className = "exam-splash__empty";
        empty.textContent = "Chưa có liên kết.";
        actions.appendChild(empty);
        return;
      }
      items.forEach((it) => {
        const allow =
          window.FPTUStudySuggestions &&
          typeof window.FPTUStudySuggestions.isAllowedStudyUrl === "function" &&
          window.FPTUStudySuggestions.isAllowedStudyUrl(it.url);
        if (!allow) return;
        const a = document.createElement("a");
        a.className = "exam-splash__btn";
        a.href = it.url.trim();
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = it.label || "Mở";
        if (it.kind === "quizlet") a.classList.add("exam-splash__btn--quizlet");
        actions.appendChild(a);
      });
    });
  }

  row.appendChild(examCard);

  return row;
}

/** kind: "info" (default) | "error" — errors are tinted red and linger longer. */
function showToast(message, duration = 1800, kind = "info") {
  let toast = document.getElementById('popupToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'popupToast';
    toast.className = 'popup-toast';
    document.body.appendChild(toast);
  }
  toast.classList.toggle('popup-toast--error', kind === 'error');
  toast.textContent = message;
  const triggerShow = () => { toast.style.opacity = '1'; };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(triggerShow);
  } else {
    setTimeout(triggerShow, 0);
  }
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
  }, duration);
}

function showError(message) {
  showToast(message, 4200, "error");
}

/**
 * Promise-based stand-in for window.confirm(), styled like the rest of the popup instead of
 * a native browser dialog. Resolves true/false; never rejects.
 */
function showConfirm(message, opts = {}) {
  const { title = "Xác nhận", okLabel = "Đồng ý", danger = false } = opts;
  const modal = document.getElementById("confirmModal");
  const titleEl = document.getElementById("confirmModalTitle");
  const msgEl = document.getElementById("confirmModalMessage");
  const okBtn = document.getElementById("confirmModalOk");
  const cancelBtn = document.getElementById("confirmModalCancel");
  const closeBtn = document.getElementById("closeConfirmModal");

  titleEl.textContent = title;
  msgEl.textContent = message;
  okBtn.textContent = okLabel;
  okBtn.classList.toggle("danger-btn", danger);
  modal.style.display = "block";

  return new Promise((resolve) => {
    const settle = (result) => {
      modal.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      closeBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      resolve(result);
    };
    const onOk = () => settle(true);
    const onCancel = () => settle(false);
    const onBackdrop = (e) => { if (e.target === modal) settle(false); };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    closeBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
  });
}
