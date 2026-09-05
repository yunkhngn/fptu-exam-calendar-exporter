(function (root, factory) {
  const api = factory();
  Object.assign(root, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_NOTIFICATION_SETTINGS = {
    enabled: true,
    class: {
      enabled: true,
      offset15: true,
      offset30: false
    },
    exam: {
      enabled: true,
      offset1Day: true,
      offset1Hour: true
    }
  };

  const MAX_FUTURE_DAYS = 30;

  function parseAlarmName(name) {
    if (!name || typeof name !== "string" || !name.startsWith("fptu:")) return null;
    const parts = name.split(":");
    if (parts.length < 4) return null;
    const [, type, id, offsetStr] = parts;
    const offsetMinutes = parseInt(offsetStr, 10);
    if (isNaN(offsetMinutes)) return null;
    return { type, id, offsetMinutes };
  }

  function serializeAlarmName(type, id, offsetMinutes) {
    return `fptu:${type}:${id}:${offsetMinutes}`;
  }

  function getClassEventStartTime(event) {
    if (!event) return null;
    if (event.rawDate) {
      const rd = event.rawDate;
      const d = new Date(rd.year, rd.month - 1, rd.day, rd.startHour, rd.startMinute, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }
    if (event.start) {
      const d = new Date(event.start);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function getExamEventStartTime(event) {
    if (!event) return null;
    if (event.start) {
      const d = new Date(event.start);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function buildClassAlarmItems(classEvents, settings, now = new Date()) {
    if (!settings || !settings.enabled || !settings.class || !settings.class.enabled) {
      return [];
    }
    if (!Array.isArray(classEvents)) return [];

    const nowMs = now.getTime();
    const maxFutureMs = nowMs + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000;
    const offsets = [];
    if (settings.class.offset15) offsets.push(15);
    if (settings.class.offset30) offsets.push(30);
    if (offsets.length === 0) return [];

    const items = [];

    for (const event of classEvents) {
      const start = getClassEventStartTime(event);
      if (!start) continue;
      const startMs = start.getTime();
      if (startMs < nowMs || startMs > maxFutureMs) continue;

      const timeRange = (event.rawDate && event.rawDate.timeRange) || "";
      const baseId = `${event.title || "class"}-${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, "0")}${String(start.getDate()).padStart(2, "0")}-${String(start.getHours()).padStart(2, "0")}${String(start.getMinutes()).padStart(2, "0")}`;

      for (const offset of offsets) {
        const when = startMs - offset * 60 * 1000;
        if (when <= nowMs) continue;

        items.push({
          id: baseId,
          name: serializeAlarmName("class", baseId, offset),
          when,
          offsetMinutes: offset,
          type: "class",
          title: event.title || "Môn học",
          location: event.location || "",
          slot: event.slot || "",
          timeRange,
          url: "https://fap.fpt.edu.vn/Report/ScheduleOfWeek.aspx"
        });
      }
    }

    return items;
  }

  function buildExamAlarmItems(examEvents, settings, now = new Date()) {
    if (!settings || !settings.enabled || !settings.exam || !settings.exam.enabled) {
      return [];
    }
    if (!Array.isArray(examEvents)) return [];

    const nowMs = now.getTime();
    const maxFutureMs = nowMs + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000;
    const offsets = [];
    if (settings.exam.offset1Day) offsets.push(1440);
    if (settings.exam.offset1Hour) offsets.push(60);
    if (offsets.length === 0) return [];

    const items = [];

    for (const event of examEvents) {
      const start = getExamEventStartTime(event);
      if (!start) continue;
      const startMs = start.getTime();
      if (startMs < nowMs || startMs > maxFutureMs) continue;

      const timeText = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
      const baseId = `${event.title || "exam"}-${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, "0")}${String(start.getDate()).padStart(2, "0")}-${String(start.getHours()).padStart(2, "0")}${String(start.getMinutes()).padStart(2, "0")}`;

      for (const offset of offsets) {
        const when = startMs - offset * 60 * 1000;
        if (when <= nowMs) continue;

        items.push({
          id: baseId,
          name: serializeAlarmName("exam", baseId, offset),
          when,
          offsetMinutes: offset,
          type: "exam",
          title: event.title || "Kỳ thi",
          location: event.location || "",
          tag: event.tag || "",
          timeText,
          url: "https://fap.fpt.edu.vn/Exam/ScheduleExams.aspx"
        });
      }
    }

    return items;
  }

  function formatNotificationDetails(item) {
    if (!item) return { title: "FPTU Schedule", message: "", iconUrl: "icon-128.png" };

    if (item.type === "class") {
      const slotText = item.slot ? ` - ${item.slot}` : "";
      const timeText = item.timeRange ? ` (${item.timeRange})` : "";
      const title = `[FPTU Lịch học] ${item.title}${slotText}${timeText}`;
      const locText = item.location ? ` tại phòng ${item.location}` : "";
      const message = `Sắp đến giờ học${locText} (sau ${item.offsetMinutes} phút).`;
      return { title, message, iconUrl: "icon-128.png" };
    }

    if (item.type === "exam") {
      const tagText = item.tag ? ` (${item.tag})` : "";
      const title = `[FPTU Lịch thi] ${item.title}${tagText}`;
      const locText = item.location ? ` tại phòng ${item.location}` : "";
      let timeDesc = `lúc ${item.timeText || ""}`;
      if (item.offsetMinutes === 1440) {
        timeDesc = `ngày mai ${timeDesc}`;
      } else {
        timeDesc = `trong 1 giờ nữa (${timeDesc})`;
      }
      const message = `Lịch thi ${timeDesc}${locText}. Nhấp để xem FAP.`;
      return { title, message, iconUrl: "icon-128.png" };
    }

    return {
      title: "FPTU Schedule",
      message: item.message || "Bạn có lịch mới từ FPTU Schedule.",
      iconUrl: "icon-128.png"
    };
  }

  return {
    DEFAULT_NOTIFICATION_SETTINGS,
    parseAlarmName,
    serializeAlarmName,
    getClassEventStartTime,
    getExamEventStartTime,
    buildClassAlarmItems,
    buildExamAlarmItems,
    formatNotificationDetails
  };
});
