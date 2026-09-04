/**
 * RFC 5545 §3.3.11 — escape a TEXT value so a comma, semicolon, backslash or newline
 * in a course name / room / method cannot terminate the property early.
 */
/**
 * RFC 5545 UTC DATE-TIME, e.g. 20260920T030000Z. toISOString() already ends in "Z" —
 * appending another produced the invalid "…ZZ" stamps in the class-schedule export.
 */
function icsUtcStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsEscapeText(value) {
  return String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 — fold a content line at 75 octets; continuations start with one space.
 * Counts bytes, not characters, and never splits a multi-byte UTF-8 sequence.
 */
function icsFoldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const decoder = new TextDecoder();
  const parts = [];
  let pos = 0;
  while (pos < bytes.length) {
    const limit = parts.length === 0 ? 75 : 74; // continuations spend one octet on the leading space
    let end = Math.min(pos + limit, bytes.length);
    while (end > pos && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(decoder.decode(bytes.subarray(pos, end)));
    pos = end;
  }
  return parts.join("\r\n ");
}

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
    loc.set({ classSchedule: jsonString });
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "WEEK_RANGE_SYNC_DONE") {
      applyWeekRangeSyncDoneFromBackground(msg);
    }
    if (msg.type === "WEEK_RANGE_SYNC_ERROR" && msg.message === "login") {
      weekRangeSyncInProgress = false;
      setWeekRangeControlsDisabled(false);
      setWeekRangeStatus("", false);
      alert("Phiên đăng nhập hết hạn. Đăng nhập lại FAP rồi thử sync khoảng.");
    }
  });

  const stInit = getChromeStorageLocal();
  if (stInit) {
    try {
      stInit.get(["weekRangeSyncRunning"], (r) => {
        if (chrome.runtime.lastError) return;
        if (r.weekRangeSyncRunning) {
          weekRangeSyncInProgress = true;
          const wrb = document.getElementById("scheduleWeekRangeBlock");
          if (wrb && wrb.tagName === "DETAILS") wrb.open = true;
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
  
  // Tab switching functionality - add this right after the other element declarations
  const upcomingTab = document.getElementById("upcomingTab");
  const upcomingContent = document.getElementById("upcomingExams");
  const completedContent = document.getElementById("completedExams");
  const scheduleTabBtn = document.getElementById("scheduleTabBtn");
  const scheduleContent = document.getElementById("scheduleTab");
  const examActionsRow = document.getElementById("examActions");
  const scheduleActionsRow = document.getElementById("scheduleActions");
  const examListSection = document.getElementById("examList");
  if (examActionsRow) examActionsRow.hidden = true;
  if (scheduleActionsRow) scheduleActionsRow.hidden = false;

  if (upcomingContent && completedContent) {
    const activateTab = (name) => {
      [upcomingTab, scheduleTabBtn].forEach(btn => btn && btn.classList.remove("active"));
      [upcomingContent, completedContent, scheduleContent].forEach(c => c && c.classList.remove("active"));

      const examAct = document.getElementById("examActions");
      const schedAct = document.getElementById("scheduleActions");
      const weekRangeBlock = document.getElementById("scheduleWeekRangeBlock");
      if (name === "schedule") {
        if (examAct) examAct.hidden = true;
        if (schedAct) schedAct.hidden = false;
        if (weekRangeBlock) weekRangeBlock.hidden = false;
      } else {
        if (examAct) examAct.hidden = false;
        if (schedAct) schedAct.hidden = true;
        if (weekRangeBlock) weekRangeBlock.hidden = true;
      }

      if (name === "schedule") {
        if (scheduleTabBtn) {
          scheduleTabBtn.classList.add("active");
          scheduleTabBtn.setAttribute("aria-selected", "true");
        }
        if (upcomingTab) upcomingTab.setAttribute("aria-selected", "false");
        if (scheduleContent) scheduleContent.classList.add("active");
        if (examListSection) examListSection.classList.remove("exams-two-col");
        const syncLoad = document.getElementById("examSyncLoading");
        const syncErr = document.getElementById("examSyncError");
        if (syncLoad) syncLoad.hidden = true;
        if (syncErr) syncErr.hidden = true;
      } else {
        if (upcomingTab) {
          upcomingTab.classList.add("active");
          upcomingTab.setAttribute("aria-selected", "true");
        }
        if (scheduleTabBtn) scheduleTabBtn.setAttribute("aria-selected", "false");
        upcomingContent.classList.add("active");
        completedContent.classList.add("active");
        if (examListSection) examListSection.classList.add("exams-two-col");
      }
    };

    if (upcomingTab) upcomingTab.addEventListener("click", () => activateTab("exams"));
    if (scheduleTabBtn) scheduleTabBtn.addEventListener("click", () => activateTab("schedule"));

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
        alert("Chưa có dữ liệu lịch thi. Vui lòng truy cập trang FAP và nhấn Sync để tải dữ liệu.");
        return;
      }

      let events;
      try {
        events = JSON.parse(storedData);
      } catch (e) {
        console.error("Parse stored data failed:", e);
        alert("Dữ liệu lịch thi bị lỗi. Vui lòng sync lại từ trang FAP.");
        return;
      }

      if (!events || !events.length) {
        alert("Không có lịch thi nào để xuất.");
        return;
      }

      const ICS = function (uid = "fptu", prod = "examination") {
        const SEPARATOR = '\r\n';
        let eventsData = [];
        const calendarStart = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:' + prod,
          'CALSCALE:GREGORIAN'
        ].join(SEPARATOR);
        const calendarEnd = 'END:VCALENDAR';

        return {
          addEvent: function (title, desc, loc, start, end) {
            const now = new Date();
            const fmt = icsUtcStamp;
            const stamp = icsUtcStamp(now);
            const uidStr = fmt(now) + '-' + Math.random().toString(36).substring(2, 8) + '@' + prod;
            eventsData.push([
              'BEGIN:VEVENT',
              'UID:' + uidStr,
              'DTSTAMP:' + stamp,
              'DTSTART:' + fmt(start),
              'DTEND:' + fmt(end),
              'SUMMARY:' + icsEscapeText(title),
              'DESCRIPTION:' + icsEscapeText(desc),
              'LOCATION:' + icsEscapeText(loc),
              'BEGIN:VALARM',
              'TRIGGER:-P1D',
              'ACTION:DISPLAY',
              'DESCRIPTION:Nhắc nhở: Thi vào ngày mai',
              'END:VALARM',
              'BEGIN:VALARM',
              'TRIGGER:-PT1H',
              'ACTION:DISPLAY',
              'DESCRIPTION:Nhắc nhở: Thi trong 1 giờ nữa',
              'END:VALARM',
              'END:VEVENT'
            ].join(SEPARATOR));
          },
          build: function () {
            const raw = calendarStart + SEPARATOR + eventsData.join(SEPARATOR) + SEPARATOR + calendarEnd;
            return raw.split(SEPARATOR).map(icsFoldLine).join(SEPARATOR) + SEPARATOR;
          }
        };
      };

      const cal = new ICS();
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
        alert("Không có kỳ thi nào sắp tới và có phòng để xuất ra file .ics");
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
function renderClassSchedule(schedule) {
  const container = document.getElementById("scheduleTab");
  if (!container) return;

  // Clear existing
  while (container.firstChild) container.removeChild(container.firstChild);

  // Update tab label with count
  const btn = document.getElementById("scheduleTabBtn");
  const tabText = btn?.querySelector(".tab-btn__text");
  if (tabText) {
    const n = Array.isArray(schedule) ? schedule.length : 0;
    tabText.textContent = n ? `Lịch học (${n})` : "Lịch học";
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
  const sorted = Array.isArray(schedule) ? [...schedule].sort((a,b) => toMillis(a) - toMillis(b)) : [];

  if (!Array.isArray(schedule) || schedule.length === 0) {
    const empty = document.createElement("div");
    empty.className = "schedule-empty";
    empty.textContent = "Chưa có lịch học. Nhấn \"Sync lịch học\" để tải.";
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

    head.appendChild(code);
    head.appendChild(attendanceChip);

    const tags = document.createElement("div");
    tags.className = "class-tags";

    // Slot/Type chip (first)
    const chipType = document.createElement("span");
    chipType.className = "chip type";
    const dotType = document.createElement("span"); dotType.className = "dot";
    chipType.appendChild(dotType);
    chipType.appendChild(document.createTextNode(` ${(ev.slot || ev.type || "Slot ?").toString()}`));
    tags.appendChild(chipType);

    // Room chip (second)
    if (ev.location) {
      const chipRoom = document.createElement("span");
      chipRoom.className = "chip room";
      const dot = document.createElement("span"); dot.className = "dot";
      chipRoom.appendChild(dot);
      const roomText = (ev.location || "").replace(/\s*-\s*$/, "").trim();
      chipRoom.appendChild(document.createTextNode(` ${roomText}`));
      tags.appendChild(chipRoom);
    }

    // Detail link chip (third) — open detail page and refresh attendance from there
    if (ev.detailUrl) {
      const linkChip = document.createElement("a");
      linkChip.href = ev.detailUrl;
      linkChip.target = "_blank";
      linkChip.rel = "noopener";
      linkChip.className = "chip link";
      const dotLink = document.createElement("span");
      dotLink.className = "dot";
      linkChip.appendChild(dotLink);
      linkChip.appendChild(document.createTextNode(" Chi tiết"));

      linkChip.addEventListener("click", async (e) => {
        e.preventDefault();
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
      });

      tags.appendChild(linkChip);
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

  const loadWeekOptionsBtn = document.getElementById("loadWeekOptionsBtn");
  const syncWeekRangeBtn = document.getElementById("syncWeekRangeBtn");
  if (loadWeekOptionsBtn) {
    loadWeekOptionsBtn.addEventListener("click", handleLoadWeekScheduleOptions);
  }
  if (syncWeekRangeBtn) {
    syncWeekRangeBtn.addEventListener("click", handleSyncClassScheduleWeekRange);
  }
});

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
  findScheduleOfWeekTab((err, tab) => {
    if (err || !tab || !tab.id) {
      if (confirm("Chưa có tab Lịch tuần FAP. Mở https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx ?")) {
        chrome.tabs.create({ url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx", active: true });
      }
      return;
    }
    setWeekRangeStatus("Đang đọc danh sách tuần…", true);
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }, () => {
      if (chrome.runtime.lastError) {
        setWeekRangeStatus("", false);
        alert("Không đọc được trang. Thử refresh FAP rồi mở lại popup.");
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: "getWeekScheduleControls" }, (res) => {
        if (chrome.runtime.lastError) {
          setWeekRangeStatus("", false);
          alert("Không gửi được yêu cầu tới trang. Thử refresh FAP.");
          return;
        }
        if (!res || !res.ok) {
          setWeekRangeStatus("", false);
          if (res && res.loginRequired) {
            chrome.tabs.create({ url: "https://fap.fpt.edu.vn/Default.aspx", active: true });
            alert("Bạn cần đăng nhập FAP. Đã mở trang đăng nhập.");
          } else {
            alert("Không tìm thấy dropdown tuần trên trang. Đảm bảo bạn đang ở lịch tuần.");
          }
          return;
        }
        if (!res.weeks || !res.weeks.length) {
          setWeekRangeStatus("", false);
          alert("Danh sách tuần trống.");
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
    alert("Nhấn «Tải tuần» trước khi đồng bộ khoảng.");
    return;
  }
  let startIdx = parseInt(startSel.value, 10);
  let endIdx = parseInt(endSel.value, 10);
  if (Number.isNaN(startIdx) || Number.isNaN(endIdx)) {
    alert("Tuần không hợp lệ.");
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

  findScheduleOfWeekTab((err, tab) => {
    if (err || !tab || !tab.id) {
      if (confirm("Cần tab Lịch tuần FAP để đồng bộ. Mở ScheduleOfWeek.aspx?")) {
        chrome.tabs.create({ url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx", active: true });
      }
      return;
    }

    const tabId = tab.id;
    const total = endIdx - startIdx + 1;
    const wrb = document.getElementById("scheduleWeekRangeBlock");
    if (wrb && wrb.tagName === "DETAILS") wrb.open = true;
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
          alert(
            "Không khởi chạy đồng bộ nền: " +
              (err && err.message ? err.message : "unknown") +
              "\nMở chrome://extensions → Service worker → Inspect để xem lỗi (nếu SW không load, thường do lỗi JS khi khởi động)."
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

  findScheduleOfWeekTab((err, tab) => {
    if (err || !tab || !tab.id) {
      if (confirm("Cần trang Lịch tuần (ScheduleOfWeek). Mở FAP?")) {
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
        alert("Không thể truy cập trang để sync lịch học. Vui lòng refresh trang và thử lại.");
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "extractWeeklySchedule" }, function (response) {
        if (chrome.runtime.lastError) {
          console.error("extractWeeklySchedule message failed:", chrome.runtime.lastError);
          alert("Có lỗi xảy ra khi sync lịch học. Vui lòng thử lại.");
          return;
        }
        
        if (!response || !response.success) {
          if (response && response.loginRequired) {
            // Open login page and focus it so user can sign in
            chrome.tabs.create({ url: 'https://fap.fpt.edu.vn/Default.aspx', active: true });
            alert('Bạn cần đăng nhập FAP để sync lịch học. Vui lòng đăng nhập rồi quay lại popup.');
            return;
          }
          console.error("Weekly schedule extraction failed");
          alert("Không thể trích xuất lịch học. Vui lòng:\n1. Đảm bảo bạn đang ở trang có bảng lịch học\n2. Trang đã load hoàn toàn\n3. Bạn đã đăng nhập");
          return;
        }
        
        const newEvents = response.schedule || [];
        
        if (newEvents.length === 0) {
          alert("Không tìm thấy lịch học nào. Vui lòng kiểm tra:\n1. Tuần hiện tại có lịch học không\n2. Trang đã load đầy đủ chưa");
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
        showToast(`Đã sync lịch học! Mới: ${uniqueNewEvents.length} • Tổng: ${allSchedule.length}`, 2600);
      });
    });
  });
}

function handleDownloadClassSchedule() {
  const storedData = localStorage.getItem("classSchedule");
  
  if (!storedData) {
    alert("Chưa có dữ liệu lịch học. Vui lòng sync lịch học trước.");
    return;
  }

  let schedule;
  try {
    schedule = JSON.parse(storedData);
  } catch (e) {
    console.error("Parse stored schedule failed:", e);
    alert("Dữ liệu lịch học bị lỗi. Vui lòng sync lại.");
    return;
  }

  if (!schedule || !schedule.length) {
    alert("Không có lịch học nào để tải.");
    return;
  }

  // Create ICS content for class schedule
  const ICS = function (uid = "fptu", prod = "class-schedule") {
    const SEPARATOR = '\r\n';
    let eventsData = [];
    const calendarStart = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:' + prod,
      'CALSCALE:GREGORIAN'
    ].join(SEPARATOR);
    const calendarEnd = 'END:VCALENDAR';

    return {
      addEvent: function (title, desc, loc, event, isFirstSlot = false) {
        const now = new Date();
        
        // Format date for ICS file - without timezone adjustment
        const formatDate = (year, month, day, hour, minute) => {
          // Format as YYYYMMDDTHHMMSS (local time, not UTC)
          return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}00`;
        };
        
        const timestamp = icsUtcStamp(now);
        const uidStr = `${timestamp}-${Math.random().toString(36).substring(2, 8)}@${prod}`;
        
        // Generate start and end times directly from raw values
        let startDate, endDate;
        
        if (event.rawDate) {
          const rd = event.rawDate;
          startDate = formatDate(rd.year, rd.month, rd.day, rd.startHour, rd.startMinute);
          endDate = formatDate(rd.year, rd.month, rd.day, rd.endHour, rd.endMinute);
        } else {
          // Fallback (should not happen with new data)
          const start = new Date();
          const end = new Date();
          end.setHours(end.getHours() + 1);
          
          startDate = icsUtcStamp(start);
          endDate = icsUtcStamp(end);
        }
        
        // Build the event with potential alarms
        let eventArray = [
          'BEGIN:VEVENT',
          'UID:' + uidStr,
          'DTSTAMP:' + timestamp,
          'DTSTART;VALUE=DATE-TIME:' + startDate,  // Specify as DATE-TIME with no Z for local time
          'DTEND;VALUE=DATE-TIME:' + endDate,      // Specify as DATE-TIME with no Z for local time
          'SUMMARY:' + icsEscapeText(title),
          'DESCRIPTION:' + icsEscapeText(desc),
          'LOCATION:' + icsEscapeText(loc)
        ];
        
        if (isFirstSlot || event.slot === "Slot 1") {
          eventArray = eventArray.concat([
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            'DESCRIPTION:Sắp đến giờ học! (Nhắc nhở 30 phút)',
            'TRIGGER:-PT30M',
            'END:VALARM'
          ]);
        }
        
        // End the event
        eventArray.push('END:VEVENT');
        
        // Join all lines with separator and add to events data
        eventsData.push(eventArray.join(SEPARATOR));
      },
      build: function () {
        const raw = calendarStart + SEPARATOR + eventsData.join(SEPARATOR) + SEPARATOR + calendarEnd;
        return raw.split(SEPARATOR).map(icsFoldLine).join(SEPARATOR) + SEPARATOR;
      }
    };
  };

  const cal = new ICS();
  
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

  alert(`Đã tải xuống ${schedule.length} lịch học. Chúc bạn học tập vui vẻ.`);
}

function handleClearClassSchedule() {
  if (!confirm('Bạn có chắc chắn muốn xoá toàn bộ lịch học đã lưu?')) {
    return;
  }
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
    alert('Có lỗi xảy ra khi xoá lịch học.');
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

function showToast(message, duration = 1800) {
  let toast = document.getElementById('popupToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'popupToast';
    toast.className = 'popup-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    toast.style.opacity = '0';
  }, duration);
}