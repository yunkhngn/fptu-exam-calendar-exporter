function findScheduleOfWeekYearSelect() {
  return (
    document.getElementById("ctl00_mainContent_drpYear") ||
    document.querySelector('select[name*="Year"]')
  );
}

function findScheduleOfWeekWeekSelect() {
  return (
    document.getElementById("ctl00_mainContent_drpWeek") ||
    document.getElementById("ctl00_mainContent_ddlWeek") ||
    document.querySelector('select[id*="mainContent"][id*="drp"][id*="Week"]') ||
    document.querySelector('select[id*="mainContent"][id*="Week"]') ||
    document.querySelector('select[name*="drpWeek"]') ||
    document.querySelector('select[name*="Week"]')
  );
}

function getScheduleOfWeekControls() {
  const weekSelect = findScheduleOfWeekWeekSelect();
  const yearSelect = findScheduleOfWeekYearSelect();
  const onWeekPage = /ScheduleOfWeek\.aspx/i.test(window.location.pathname || "");

  if (!weekSelect) {
    const loginLike =
      document.querySelector('input[type="password"]') ||
      document.getElementById("ctl00_mainContent_txtPassword");
    const loginRequired = !!loginLike;
    return {
      ok: false,
      loginRequired,
      onWeekPage,
      error: loginRequired ? "login-required" : "week-select-not-found"
    };
  }

  const weeks = Array.from(weekSelect.options).map((opt, idx) => ({
    index: idx,
    value: opt.value,
    label: (opt.textContent || "").trim()
  }));

  const years = yearSelect
    ? Array.from(yearSelect.options).map((opt, idx) => ({
        index: idx,
        value: opt.value,
        label: (opt.textContent || "").trim()
      }))
    : [];

  return {
    ok: true,
    onWeekPage,
    yearIndex: yearSelect ? yearSelect.selectedIndex : -1,
    yearValue: yearSelect ? yearSelect.value : "",
    weekIndex: weekSelect.selectedIndex,
    weeks,
    years
  };
}

/* Guarded so the scraper can be required from tests/, where there is no chrome runtime. */
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "extractSchedule") {
    try {
      const fmtTime = t => {
        if (!t || typeof t !== "string") return { hour: 0, minute: 0 };
        
        // Clean up the string - remove extra spaces and normalize
        const cleaned = t.trim().replace(/\s+/g, "");
        
        // Handle Vietnamese format (10h00, 10h, 10H00)
        if (cleaned.match(/\d+h\d*/i)) {
          const [h, m = "0"] = cleaned.replace(/h/i, ":").split(":").map(Number);
          return { hour: h, minute: m };
        }
        
        // Handle colon format (10:00, 10:30)
        if (cleaned.includes(":")) {
          const [h, m = "0"] = cleaned.split(":").map(Number);
          return { hour: h, minute: m };
        }
        
        // Handle hour only format (10, 14) - assume no minutes
        if (/^\d{1,2}$/.test(cleaned)) {
          const h = Number(cleaned);
          return { hour: h, minute: 0 };
        }
        
        // Handle dot format (10.00, 10.30)
        if (cleaned.includes(".")) {
          const [h, m = "0"] = cleaned.split(".").map(Number);
          return { hour: h, minute: m };
        }
        
        return { hour: 0, minute: 0 };
      };

      const rows = Array.from(document.querySelectorAll("#ctl00_mainContent_divContent table tr"))
        .slice(1)
        .map(tr => Array.from(tr.cells).map(td => td.textContent.trim()));

      const events = rows
        .filter(row => row.length >= 8 && row[3] && row[5] !== undefined)
        .map(row => {
          const [no, code, name, date, room, time, form, exam, ...rest] = row;
          
          const [day, month, year] = date.split("/").map(Number);
          const [startStr, endStr] = time.split("-");
          const start = new Date(year, month - 1, day, fmtTime(startStr).hour, fmtTime(startStr).minute);
          const end = new Date(year, month - 1, day, fmtTime(endStr).hour, fmtTime(endStr).minute);
          
          let rawTag = "";
          if (exam && exam.trim()) {
            rawTag = exam.trim().toUpperCase();
          } else if (rest.length > 0 && rest[0] && rest[0].trim()) {
            rawTag = rest[0].trim().toUpperCase();
          }
          
          const formLower = (form || "").toLowerCase();
          
          let tag = null;
          if (rawTag === "2NDFE") tag = "2NDFE";
          else if (rawTag === "2NDPE") tag = "2NDPE";
          else if (rawTag === "PE") tag = "PE";
          else if (rawTag === "FE") tag = "FE";
          else if (!rawTag || rawTag === "") {
            if (formLower.includes("2nd") && formLower.includes("fe")) tag = "2NDFE";
            else if (formLower.includes("2nd") && formLower.includes("pe")) tag = "2NDPE";
            else if (formLower.includes("practical_exam") || formLower.includes("project presentation")) tag = "PE";
            else if (formLower.includes("multiple_choices") || formLower.includes("speaking")) tag = "FE";
          }

          return {
            title: code || "Unknown",
            location: room || "",
            description: form || "",
            start,
            end,
            tag
          };
        });

      sendResponse({ events });
    } catch (e) {
      sendResponse({ events: [] });
    }
    return true;
  } else if (msg.action === "getWeekScheduleControls") {
    try {
      sendResponse(getScheduleOfWeekControls());
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
    return true;
  } else if (msg.action === "extractWeeklySchedule") {
    try {
      if (!findScheduleOfWeekWeekSelect()) {
        const loginLike = document.querySelector('input[type="password"]');
        sendResponse({
          schedule: [],
          success: false,
          loginRequired: !!loginLike
        });
        return true;
      }
      const { schedule, skipped } = extractWeeklyScheduleFromTable();
      sendResponse({ schedule, skipped, success: true });
    } catch (e) {
      console.error("Error extracting weekly schedule:", e);
      sendResponse({ schedule: [], success: false });
    }
    return true;
  } else if (msg.action === "extractStudentGrade" || msg.type === "EXTRACT_GRADE_REPORT" || msg.action === "EXTRACT_GRADE_REPORT") {
    try {
      const grade = extractStudentGradeFromPage();
      if (!grade) {
        sendResponse({ ok: false, error: "table-not-found" });
      } else {
        sendResponse({ ok: true, grade });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
    return true;
  } else if (msg.action === "getGradePageControls" || msg.type === "GET_GRADE_PAGE_CONTROLS" || msg.action === "GET_GRADE_PAGE_CONTROLS") {
    try {
      sendResponse(getGradePageControls());
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
    return true;
  } else if (msg.action === "fetchCourseGrade" || msg.type === "FETCH_COURSE_GRADE" || msg.action === "FETCH_COURSE_GRADE") {
    fetchCourseGradeFromPage(msg.url)
      .then((grade) => {
        sendResponse({ ok: !!grade, grade });
      })
      .catch((e) => {
        sendResponse({ ok: false, error: String(e.message || e) });
      });
    return true;
  }
});
}

function extractWeeklyScheduleFromTable() {
  const rows = Array.from(document.querySelectorAll("tbody tr"))
    .filter((row) => row.querySelector("td")?.textContent?.startsWith("Slot"));

  // FAP renders the "Slot" corner cell with rowspan=2, so the date row holds one <th> fewer than
  // the day-name row. Dropping the first cell of both rows shifted every date one column left —
  // which is what the old "subtract a day" patch was compensating for, at the cost of silently
  // dropping the last day of the week. Align to the body's day columns from the right instead,
  // which is correct whether or not the date row carries its own corner cell.
  const dayColumnCount = rows.length ? rows[0].querySelectorAll("td").length - 1 : 0;
  const headerTexts = (selector) => {
    const all = Array.from(document.querySelectorAll(selector)).map((th) => th.textContent.trim());
    return dayColumnCount > 0 ? all.slice(-dayColumnCount) : all.slice(1);
  };
  const dayHeaders = headerTexts("thead tr:nth-child(2) th");
  const dayNames = headerTexts("thead tr:nth-child(1) th");

  const schedule = [];
  // A cell holding a link is a class cell. If one produces no event the page markup has
  // moved on from what these patterns expect — report it rather than dropping it silently.
  let skipped = 0;
  
  // Get correct year for date calculation
  const yearSelect = findScheduleOfWeekYearSelect();
  const year = yearSelect ? parseInt(yearSelect.value) : new Date().getFullYear();
  
  rows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    const slotName = cells[0].textContent.trim();

    for (let i = 1; i < cells.length; i++) {
      const cell = cells[i];
      const content = cell.innerHTML.trim();
      
      // Check for class content
      if (content.includes("href")) {
        // Try multiple regex patterns for more flexibility
        const subjectMatch = content.match(/([A-Z]{2,4}\d{3})-/) || 
                           content.match(/>([A-Z]{2,4}\d{3})/) ||
                           content.match(/([A-Z]{2,4}\d{3})/);
                           
        const roomMatch = content.match(/at\s+(.*?)\s*</) || 
                         content.match(/at\s+([A-Z]{1,3}-\d{3})/);

        // A cell switched to online (see isOnline below) carries a second, earlier time
        // badge (label-primary) next to its Meet URL, alongside the usual one (label-success)
        // that always sits next to the attendance status. In every sample seen the two agree,
        // but pick the label-success one deliberately — it's the one present on every cell,
        // online or not — rather than "whichever comes first" in the raw HTML.
        const successTimeMatch = content.match(/label-success">\s*\((\d{1,2}:\d{2}-\d{1,2}:\d{2})\)/);
        const allTimeMatches = [...content.matchAll(/\((\d{1,2}:\d{2}-\d{1,2}:\d{2})\)/g)];
        const timeRangeFound = successTimeMatch
          ? successTimeMatch[1]
          : (allTimeMatches.length ? allTimeMatches[allTimeMatches.length - 1][1] : null);

        // FAP marks a session moved online with a <div class="online-indicator"> + an
        // "Online" <h3>, alongside the room it was originally assigned (kept for reference).
        const isOnline = /online-indicator/i.test(content);
        
        // Extract detail link (anchor href)
        const hrefMatch = content.match(/href="([^"]+)"/i);
        let detailUrl = "";
        if (hrefMatch && hrefMatch[1]) {
          try {
            detailUrl = new URL(hrefMatch[1], window.location.href).href;
          } catch (e) {
            detailUrl = hrefMatch[1];
          }
        }

        // Extract attendance status from <font color="...">status</font>
        let attendanceStatus = null;
        let attendanceColor = null;
        const statusFontMatch = content.match(/<font\s+color="([^"]+)">([^<]+)<\/font>/i);
        if (statusFontMatch) {
          attendanceColor = (statusFontMatch[1] || '').toLowerCase();
          attendanceStatus = (statusFontMatch[2] || '').trim().toLowerCase();
        } else {
          // Fallback textual detection when not wrapped in font
          if (/\bnot\s*yet\b/i.test(content)) {
            attendanceStatus = 'not yet';
            attendanceColor = 'gray';
          } else if (/\babsent\b/i.test(content)) {
            attendanceStatus = 'absent';
            attendanceColor = 'red';
          } else if (/\battended\b/i.test(content)) {
            attendanceStatus = 'attended';
            attendanceColor = 'green';
          }
        }
        
        // Even if we can't find all parts, at least capture what we can
        if (!subjectMatch) {
          skipped += 1;
          continue;
        }
        {
          const subject = subjectMatch[1];
          // Trim a trailing " -" left over when the room and the next badge (e.g. "Meet URL")
          // share a line with no <br> between them — "AL-L302 -" rather than "AL-L302".
          const room = (roomMatch ? roomMatch[1] : "").replace(/[\s-]+$/, "");
          const timeRange = timeRangeFound || "7:30-9:00"; // Default time if not found
          
          // Create formatted event 
          const dateStr = dayHeaders[i - 1];
          if (!dateStr) {
            skipped += 1;
            continue;
          }

          const [day, month] = dateStr.split('/').map(Number);
          if (!Number.isFinite(day) || !Number.isFinite(month)) {
            skipped += 1;
            continue;
          }
          
          let startHour = 0, startMinute = 0, endHour = 0, endMinute = 0;
          
          // Parse time if available
          if (timeRangeFound) {
            const [startTime, endTime] = timeRange.split('-');
            [startHour, startMinute] = startTime.split(':').map(Number);
            [endHour, endMinute] = endTime.split(':').map(Number);
          }

          schedule.push({
            title: subject,
            detailUrl,
            attendanceStatus,
            attendanceColor,
            isOnline,
            location: room,
            description: `${subject} - ${slotName} (${timeRange})`,
            rawDate: {
              year,
              month,
              day,
              startHour,
              startMinute,
              endHour,
              endMinute,
              timeRange
            },
            slot: slotName,
            day: dayNames[i - 1],
            date: `${day}/${month}/${year}`
          });
        }
      }
    }
  });

  if (skipped > 0) {
    console.warn(`FPTU Schedule: ${skipped} ô lịch không đọc được (FAP có thể đã đổi giao diện).`);
  }
  return { schedule, skipped };
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

function extractCourseCodeAndName(rawText, courseId = "") {
  let text = (rawText || "").trim();
  // Strip date ranges: (from 13/05/2026 - 22/07/2026) or from 13/05/2026 to 22/07/2026
  text = text.replace(/\(?from\s+[\d/.-]+\s*(-|to|–)\s*[\d/.-]+\)?/gi, "").trim();

  let code = "";
  let name = text;

  // 1. Check parenthesized groups: e.g. "(IS1905-EIS, EXE101)", "(PMG202c)", "(IS1905-EIS, (EXE101))"
  const parenMatches = Array.from(text.matchAll(/\(([^)]+)\)?/g));
  for (const m of parenMatches) {
    const inside = m[1];
    // Find all potential codes inside: e.g. "IS1905-EIS", "EXE101"
    const tokens = inside.split(/[,;\s]+/).map((t) => t.replace(/[()]/g, "").trim()).filter(Boolean);
    // Prioritize standard 3-digit course code (e.g. EXE101, PRN211, PMG202c, ENT301m)
    let found = tokens.find((t) => /^[A-Za-z]{2,5}\d{3}[A-Za-z]?$/i.test(t));
    if (!found) {
      // Fallback: any code with 2-4 digits, avoiding class codes with hyphen like IS1905-EIS if possible
      found = tokens.find((t) => /^[A-Za-z]{2,5}\d{2,4}[A-Za-z0-9_]*$/i.test(t) && !t.includes("-"));
    }
    if (found) {
      code = found.toUpperCase();
      // Remove this entire parenthesized section from name
      name = name.replace(m[0], " ");
      break;
    }
  }

  // 2. Prefix code like "PRN211 - Multiplatform Mobile App"
  if (!code) {
    const prefixMatch = text.match(/^([A-Za-z]{2,5}\d{2,4}[A-Za-z0-9_]*)\s*[-–:]\s*(.*)$/i);
    if (prefixMatch) {
      code = prefixMatch[1].toUpperCase();
      name = prefixMatch[2];
    }
  }

  // 3. Any word with digits e.g. "ENT301"
  if (!code) {
    // Prefer 3-digit course code first
    const match3 = text.match(/\b([A-Za-z]{2,5}\d{3}[A-Za-z]?)\b/i);
    if (match3) {
      code = match3[1].toUpperCase();
    } else {
      const matchAny = text.match(/\b([A-Za-z]{2,5}\d{2,4}[A-Za-z0-9_]*)\b/i);
      if (matchAny) code = matchAny[1].toUpperCase();
    }
  }

  // 4. Fallback code from initials
  if (!code) {
    const words = text.split(/\s+/).filter(Boolean);
    let acronym = words.map((w) => w[0]).join("").toUpperCase();
    if (acronym.length < 2) acronym = "COURSE";
    code = courseId ? `${acronym}_${courseId}` : acronym;
  }

  // Clean name:
  // Remove any remaining parenthesized class info e.g. "(IS1905-EIS)" or "(IS1905-EIS," or unclosed "("
  name = name.replace(/\([^)]*\)?/g, " ");
  // Remove unclosed open parenthesis and anything after it
  name = name.replace(/\([^(]*$/, " ");
  // Remove any stray parentheses
  name = name.replace(/[()]/g, " ");
  // Clean trailing/leading punctuation: commas, colons, dashes, slashes
  name = name.replace(/^[-–:,/.\s]+|[-–:,/.\s]+$/g, "");
  // Collapse spaces
  name = name.replace(/\s{2,}/g, " ").trim();

  if (!name || name === code) {
    name = text.replace(/\s{2,}/g, " ").trim() || code;
  }

  return { courseCode: code, courseName: name };
}

function isGradeReportTable(tbl) {
  if (!tbl) return false;
  if (tbl.getAttribute && tbl.getAttribute("summary") === "Report") return true;
  const text = tbl.textContent || "";
  if (/Grade\s*item/i.test(text) && /Weight/i.test(text) && /Value/i.test(text)) return true;
  if (/Grade\s*category/i.test(text) && /Weight/i.test(text)) return true;
  if (/Course\s*total/i.test(text) && (/Average/i.test(text) || /Status/i.test(text))) return true;
  return false;
}

function getGradePageCourses(doc) {
  if (!doc) doc = typeof document !== "undefined" ? document : null;
  if (!doc) return [];
  const win = (doc && doc.defaultView) || (typeof window !== "undefined" ? window : null);
  const courses = [];
  const seen = new Set();

  let currentCourseId = "";
  try {
    const search = (win && win.location ? win.location.search : "") || "";
    const params = new URLSearchParams(search);
    currentCourseId = params.get("course") || "";
  } catch (_) {}

  const activeHref = (win && win.location ? win.location.href : "") || "";

  // 1. Scan candidate course tables, strictly excluding grade report tables
  const allTables = Array.from(doc.querySelectorAll("table"));
  const nonGradeTables = allTables.filter((tbl) => !isGradeReportTable(tbl));

  let courseTable = null;
  for (const tbl of nonGradeTables) {
    const text = tbl.textContent || "";
    if (/\bCOURSE\b/i.test(text) || tbl.querySelector('a[href*="course="]')) {
      courseTable = tbl;
      break;
    }
  }

  if (courseTable) {
    // A. Collect inactive course links inside courseTable
    const courseLinks = Array.from(courseTable.querySelectorAll('a[href*="course="]'));
    courseLinks.forEach((a) => {
      const href = a.getAttribute("href") || "";
      const m = href.match(/course=([^&]+)/i);
      if (m) {
        const courseId = m[1];
        if (!seen.has(courseId)) {
          seen.add(courseId);
          const fullText = (a.textContent || "").trim();
          const { courseCode, courseName } = extractCourseCodeAndName(fullText, courseId);
          let fullHref = a.href || href;
          if (fullHref && !/^https?:\/\//i.test(fullHref) && activeHref) {
            try {
              fullHref = new URL(fullHref, activeHref).href;
            } catch (_) {}
          }
          courses.push({
            id: courseId,
            href: fullHref,
            courseCode,
            courseName,
            fullText,
            isActive: courseId === currentCourseId
          });
        }
      }
    });

    // B. Find the active (non-link) course in courseTable
    let activeText = "";
    const boldEls = Array.from(courseTable.querySelectorAll("b, strong, u, .selected, span[style*='bold']"));
    for (const el of boldEls) {
      if (el.closest("a")) continue;
      const t = (el.textContent || "").trim();
      if (
        t &&
        !/^(TERM|COURSE)$/i.test(t) &&
        !/^(Spring|Summer|Fall|Winter)\d{4}$/i.test(t) &&
        !/^Grade report/i.test(t)
      ) {
        activeText = t;
        break;
      }
    }

    if (!activeText) {
      const cells = Array.from(courseTable.querySelectorAll("td"));
      for (const cell of cells) {
        if (cell.querySelector('a[href*="course="]')) continue;
        const t = (cell.textContent || "").trim();
        if (
          t &&
          !/^(TERM|COURSE)$/i.test(t) &&
          !/^(Spring|Summer|Fall|Winter)\d{4}$/i.test(t) &&
          !/^Grade report/i.test(t) &&
          t.length > 3
        ) {
          activeText = t;
          break;
        }
      }
    }

    if (activeText) {
      const activeId = currentCourseId || "current";
      if (!seen.has(activeId)) {
        seen.add(activeId);
        const { courseCode, courseName } = extractCourseCodeAndName(activeText, activeId);
        courses.unshift({
          id: activeId,
          href: activeHref,
          courseCode,
          courseName,
          fullText: activeText,
          isActive: true
        });
      }
    }
  }

  // 2. Fallback: all <a> links with course=ID across doc
  const links = Array.from(doc.querySelectorAll('a[href*="course="]'));
  links.forEach((a) => {
    try {
      const href = a.getAttribute("href") || "";
      const m = href.match(/course=([^&]+)/i);
      if (m) {
        const courseId = m[1];
        if (!seen.has(courseId)) {
          seen.add(courseId);
          const fullText = (a.textContent || "").trim();
          const { courseCode, courseName } = extractCourseCodeAndName(fullText, courseId);
          let fullHref = a.href || href;
          if (fullHref && !/^https?:\/\//i.test(fullHref) && activeHref) {
            try {
              fullHref = new URL(fullHref, activeHref).href;
            } catch (_) {}
          }
          courses.push({
            id: courseId,
            href: fullHref,
            courseCode,
            courseName,
            fullText,
            isActive: courseId === currentCourseId
          });
        }
      }
    } catch (_) {}
  });

  if (currentCourseId) {
    const existing = courses.find((c) => c.id === currentCourseId);
    if (existing) {
      existing.isActive = true;
    }
  }

  return courses;
}

function getActiveCourseInfo(doc) {
  if (!doc) doc = typeof document !== "undefined" ? document : null;
  const win = (doc && doc.defaultView) || (typeof window !== "undefined" ? window : null);
  let currentCourseId = "";
  let currentTerm = "";

  try {
    const search = (win && win.location ? win.location.search : "") || "";
    const params = new URLSearchParams(search);
    currentCourseId = params.get("course") || "";
    currentTerm = params.get("term") || "";
  } catch (_) {}

  // If term not in URL, find term from active term element or links
  if (!currentTerm && doc) {
    const termLink = doc.querySelector('a[href*="term="]');
    if (termLink) {
      const tm = (termLink.getAttribute("href") || "").match(/term=([^&]+)/i);
      if (tm) currentTerm = tm[1];
    }
    if (!currentTerm) {
      const termEl = doc.querySelector('a[href*="term="].selected, b, strong');
      if (termEl) {
        const tm = (termEl.textContent || "").match(/(Spring|Summer|Fall|Winter)\d{4}/i);
        if (tm) currentTerm = tm[0];
      }
    }
  }

  const courses = getGradePageCourses(doc);
  let activeCourse = null;

  if (currentCourseId) {
    activeCourse = courses.find((c) => c.id === currentCourseId);
  }
  if (!activeCourse) {
    activeCourse = courses.find((c) => c.isActive);
  }
  if (!activeCourse && courses.length > 0) {
    activeCourse = courses[0];
  } else if (!activeCourse && currentCourseId) {
    activeCourse = {
      id: currentCourseId,
      courseCode: `COURSE_${currentCourseId}`,
      courseName: `Môn học (${currentCourseId})`
    };
  }

  return {
    course: activeCourse,
    term: currentTerm,
    courses
  };
}

function extractStudentGradeFromPage(doc) {
  if (!doc) doc = typeof document !== "undefined" ? document : null;
  if (!doc) return null;

  const table = findFapGradeTable(doc);
  if (!table) return null;

  const { course, term } = getActiveCourseInfo(doc);
  const courseCode = course ? course.courseCode : "UNKNOWN";
  const courseName = course ? course.courseName : courseCode;

  let parsed = null;
  const parseFn = typeof parseFapGradeTable === "function"
    ? parseFapGradeTable
    : (typeof window !== "undefined" && typeof window.parseFapGradeTable === "function" ? window.parseFapGradeTable : null);

  if (parseFn) {
    parsed = parseFn(table);
  } else {
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    const categories = [];
    rows.forEach((r) => {
      const cells = Array.from(r.cells).map((c) => c.textContent.trim());
      if (cells.length >= 4) {
        categories.push({
          category: cells[0],
          item: cells[1],
          weight: parseFloat(cells[2]) || 0,
          value: parseFloat(cells[3]) || null
        });
      }
    });
    parsed = { categories, bonus: 0, average: null, status: null };
  }

  return {
    courseCode: courseCode || "UNKNOWN",
    courseName: courseName || courseCode || "Môn học",
    term: term || "",
    ...parsed,
    lastUpdated: Date.now()
  };
}

function getGradePageControls(doc) {
  if (!doc) doc = typeof document !== "undefined" ? document : null;
  const { courses, term } = getActiveCourseInfo(doc);
  return {
    ok: courses.length > 0,
    term,
    courses
  };
}

async function fetchCourseGradeFromPage(url) {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const findFn = typeof findFapGradeTable === "function"
      ? findFapGradeTable
      : (typeof window !== "undefined" && typeof window.findFapGradeTable === "function"
          ? window.findFapGradeTable
          : (typeof globalThis !== "undefined" && typeof globalThis.findFapGradeTable === "function" ? globalThis.findFapGradeTable : null));
    const table = findFn ? findFn(doc) : doc.querySelector('table[summary="Report"]');
    if (!table) return null;
    let parseFn = typeof parseFapGradeTable === "function"
      ? parseFapGradeTable
      : (typeof window !== "undefined" && typeof window.parseFapGradeTable === "function"
          ? window.parseFapGradeTable
          : (typeof globalThis !== "undefined" && typeof globalThis.parseFapGradeTable === "function" ? globalThis.parseFapGradeTable : null));
    if (!parseFn) {
      try {
        const g = require("./lib/grades.js");
        if (g && typeof g.parseFapGradeTable === "function") parseFn = g.parseFapGradeTable;
      } catch (_) {}
    }
    if (!parseFn) return null;
    return parseFn(table);
  } catch (err) {
    return null;
  }
}

if (typeof window !== "undefined" && /StudentGrade\.aspx/i.test(window.location.pathname || "")) {
  setTimeout(() => {
    try {
      const grade = extractStudentGradeFromPage();
      if (grade && grade.courseCode && grade.courseCode !== "UNKNOWN") {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: "SAVE_STUDENT_GRADE", type: "SAVE_STUDENT_GRADE", grade }).catch(() => {});
        }
      }
    } catch (_) {}
  }, 500);
}

if (typeof window !== "undefined" && typeof window.location !== "undefined") {
  const isCandidate = typeof isFapSessionCandidate === "function"
    ? isFapSessionCandidate(window.location.pathname)
    : (typeof FapKeepAlive !== "undefined" && typeof FapKeepAlive.isFapSessionCandidate === "function"
        ? FapKeepAlive.isFapSessionCandidate(window.location.pathname)
        : !window.location.pathname.toLowerCase().includes("default.aspx") && !window.location.pathname.toLowerCase().includes("logout.aspx"));

  if (isCandidate) {
    try {
      const createFn = typeof createFapKeepAlive === "function"
        ? createFapKeepAlive
        : (typeof FapKeepAlive !== "undefined" && FapKeepAlive.createFapKeepAlive ? FapKeepAlive.createFapKeepAlive : null);
      if (createFn) {
        const keepAlive = createFn();
        keepAlive.start();
        window.__fapKeepAlive = keepAlive;
      }
    } catch (_) {}
  }
}

if (typeof window !== "undefined" && /Feedback/i.test(window.location.pathname || "")) {
  setTimeout(() => {
    try {
      const injectFn = typeof injectFapFeedbackToolbar === "function"
        ? injectFapFeedbackToolbar
        : (typeof FapFeedback !== "undefined" && FapFeedback.injectFapFeedbackToolbar ? FapFeedback.injectFapFeedbackToolbar : null);
      if (injectFn) {
        injectFn(document);
      }
    } catch (_) {}
  }, 400);
}

if (typeof window !== "undefined") {
  window.extractWeeklyScheduleFromTable = extractWeeklyScheduleFromTable;
  window.getScheduleOfWeekControls = getScheduleOfWeekControls;
  window.extractStudentGradeFromPage = extractStudentGradeFromPage;
  window.getGradePageControls = getGradePageControls;
  window.findFapGradeTable = findFapGradeTable;
  window.extractCourseCodeAndName = extractCourseCodeAndName;
  window.getGradePageCourses = getGradePageCourses;
  window.getActiveCourseInfo = getActiveCourseInfo;
  window.fetchCourseGradeFromPage = fetchCourseGradeFromPage;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    extractWeeklyScheduleFromTable,
    getScheduleOfWeekControls,
    extractStudentGradeFromPage,
    getGradePageControls,
    findFapGradeTable,
    extractCourseCodeAndName,
    getGradePageCourses,
    getActiveCourseInfo,
    fetchCourseGradeFromPage
  };
}
