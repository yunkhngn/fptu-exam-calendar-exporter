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
    if (/Grade category/i.test(text) && (/Weight/i.test(text) || /Value/i.test(text))) {
      return tbl;
    }
  }
  return null;
}

function extractCourseCodeAndName(rawText, courseId = "") {
  let text = (rawText || "").trim();
  text = text.replace(/\(?from\s+[\d/]+\s*-\s*[\d/]+\)?/gi, "").trim();

  // 1. Parenthesized code like "Project management (PMG202c)" -> PMG202c
  const codeInParen = text.match(/\(([A-Za-z]{2,5}\d{2,4}[A-Za-z0-9_]*)\)/i);
  if (codeInParen) {
    const code = codeInParen[1].toUpperCase();
    const name = text.replace(codeInParen[0], "").replace(/\s{2,}/g, " ").trim();
    return { courseCode: code, courseName: name || code };
  }

  // 2. Prefix code like "PRN211 - Multiplatform Mobile App"
  const prefixMatch = text.match(/^([A-Za-z]{2,5}\d{2,4}[A-Za-z0-9_]*)\s*[-–:]\s*(.*)$/i);
  if (prefixMatch) {
    return {
      courseCode: prefixMatch[1].toUpperCase(),
      courseName: prefixMatch[2].trim() || prefixMatch[1].toUpperCase()
    };
  }

  // 3. Word with digits anywhere e.g. "ENT301"
  const wordWithDigit = text.match(/\b([A-Za-z]{2,5}\d{2,4}[A-Za-z0-9_]*)\b/i);
  if (wordWithDigit) {
    return {
      courseCode: wordWithDigit[1].toUpperCase(),
      courseName: text
    };
  }

  // 4. Fallback: initials from words
  const words = text.split(/\s+/).filter(Boolean);
  let acronym = words.map((w) => w[0]).join("").toUpperCase();
  if (acronym.length < 2) acronym = "COURSE";
  const code = courseId ? `${acronym}_${courseId}` : acronym;
  return {
    courseCode: code,
    courseName: text || code
  };
}

function getGradePageCourses(doc) {
  if (!doc) doc = typeof document !== "undefined" ? document : null;
  if (!doc) return [];
  const courses = [];
  const seen = new Set();

  // FAP lists courses as <a> links with course=ID
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
          const fullHref = a.href || href;
          courses.push({
            id: courseId,
            href: fullHref,
            courseCode,
            courseName,
            fullText
          });
        }
      }
    } catch (_) {}
  });

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

  // Check table with TERM and COURSE headers for selected/bold element
  if (!activeCourse && doc) {
    const courseHeaders = Array.from(doc.querySelectorAll("th")).filter((th) => /COURSE/i.test(th.textContent));
    if (courseHeaders.length > 0) {
      const table = courseHeaders[0].closest("table");
      if (table) {
        const activeEls = Array.from(table.querySelectorAll("b, strong, .selected, span[style*='bold']"));
        for (const el of activeEls) {
          const text = (el.textContent || "").trim();
          if (text && !/^(TERM|COURSE)$/i.test(text) && !/^(Spring|Summer|Fall|Winter)\d{4}$/i.test(text)) {
            const { courseCode, courseName } = extractCourseCodeAndName(text, currentCourseId);
            activeCourse = {
              id: currentCourseId || courseCode,
              courseCode,
              courseName,
              fullText: text
            };
            break;
          }
        }
      }
    }
  }

  // Fallback if still not matched
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    extractWeeklyScheduleFromTable,
    getScheduleOfWeekControls,
    extractStudentGradeFromPage,
    getGradePageControls,
    findFapGradeTable,
    extractCourseCodeAndName,
    getGradePageCourses,
    getActiveCourseInfo
  };
}
