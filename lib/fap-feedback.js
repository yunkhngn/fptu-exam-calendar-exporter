(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FapFeedback = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const POSITIVE_COMMENTS = [
    "Thầy/Cô dạy rất nhiệt tình, giải đáp thắc mắc của sinh viên rất chi tiết và tận tâm ạ.",
    "Bài giảng dễ hiểu, thầy/cô luôn tạo không khí học tập tích cực và truyền cảm hứng cho sinh viên.",
    "Phương pháp giảng dạy rất hay và thực tế, em học hỏi được rất nhiều kiến thức bổ ích từ môn học.",
    "Thầy/Cô chấm chữa bài kỹ lưỡng, đưa ra nhận xét rất chi tiết giúp sinh viên tiến bộ từng ngày ạ.",
    "Em rất cảm ơn thầy/cô đã đồng hành và hỗ trợ lớp nhiệt tình trong suốt học kỳ vừa qua ạ!",
    "Giảng viên có kiến thức chuyên môn sâu rộng, truyền đạt cuốn hút và luôn quan tâm đến sinh viên.",
    "Tiết học luôn sinh động, nhiều ví dụ thực tế sát với công việc sau này. Em rất thích phong cách dạy của thầy/cô.",
    "Thầy/Cô hỗ trợ giải đáp bài tập ngoài giờ rất nhiệt tình, luôn sẵn sàng lắng nghe ý kiến của sinh viên.",
    "Em rất ấn tượng với sự tận tụy và tâm huyết của thầy/cô dành cho môn học và sinh viên ạ.",
    "Thầy/Cô thân thiện, cởi mở, giải thích từng khái niệm rõ ràng, giúp em tiếp thu kiến thức rất hiệu quả.",
    "Bài giảng chuẩn bị rất công phu và dễ tiếp thu, tạo động lực học tập rất lớn cho em ạ.",
    "Mọi thắc mắc của lớp đều được thầy/cô hướng dẫn chu đáo. Em xin chân thành cảm ơn thầy/cô!"
  ];

  function getRandomFeedbackComment(excludeIndex = -1) {
    if (POSITIVE_COMMENTS.length <= 1) {
      return { comment: POSITIVE_COMMENTS[0], index: 0 };
    }
    let idx = Math.floor(Math.random() * POSITIVE_COMMENTS.length);
    if (idx === excludeIndex) {
      idx = (idx + 1) % POSITIVE_COMMENTS.length;
    }
    return {
      comment: POSITIVE_COMMENTS[idx],
      index: idx
    };
  }

  function findFapFeedbackRadioGroups(container) {
    const root = container || (typeof document !== "undefined" ? document : null);
    if (!root) return new Map();

    const radios = Array.from(root.querySelectorAll('input[type="radio"]'));
    const groups = new Map();

    radios.forEach((r) => {
      const name = r.name || (typeof r.getAttribute === "function" ? r.getAttribute("name") : "");
      if (!name) return;
      if (!groups.has(name)) {
        groups.set(name, []);
      }
      groups.get(name).push(r);
    });

    return groups;
  }

  function findFapCommentTextarea(container) {
    const root = container || (typeof document !== "undefined" ? document : null);
    if (!root) return null;

    return (
      root.querySelector('textarea[id*="txtComment"]') ||
      root.querySelector('textarea[name*="Comment"]') ||
      root.querySelector('textarea[id*="Comment"]') ||
      root.querySelector('textarea[id*="mainContent"]') ||
      root.querySelector("textarea")
    );
  }

  function getHighestRatingRadio(radios) {
    if (!radios || radios.length === 0) return null;
    let best = radios[radios.length - 1];
    let maxVal = -Infinity;

    for (const r of radios) {
      const val = parseFloat(r.value);
      if (!isNaN(val) && val > maxVal) {
        maxVal = val;
        best = r;
      }
    }
    return best;
  }

  function fillFapFeedbackForm(container, commentText) {
    const groups = findFapFeedbackRadioGroups(container);
    let radiosFilled = 0;

    groups.forEach((radios) => {
      const highestRadio = getHighestRatingRadio(radios);
      if (highestRadio) {
        highestRadio.checked = true;
        try {
          highestRadio.dispatchEvent(new Event("change", { bubbles: true }));
          highestRadio.dispatchEvent(new Event("click", { bubbles: true }));
        } catch (_) {}
        radiosFilled++;
      }
    });

    let commentFilled = false;
    const txt = findFapCommentTextarea(container);
    if (txt) {
      const textToUse = commentText || getRandomFeedbackComment().comment;
      txt.value = textToUse;
      try {
        txt.dispatchEvent(new Event("input", { bubbles: true }));
        txt.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {}
      commentFilled = true;
    }

    return { radiosFilled, commentFilled };
  }

  function resetFapFeedbackForm(container) {
    const root = container || (typeof document !== "undefined" ? document : null);
    if (!root) return { radiosCleared: 0, commentCleared: false };

    const radios = Array.from(root.querySelectorAll('input[type="radio"]'));
    let radiosCleared = 0;
    radios.forEach((r) => {
      if (r.checked) {
        r.checked = false;
        try {
          r.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (_) {}
        radiosCleared++;
      }
    });

    const txt = findFapCommentTextarea(root);
    let commentCleared = false;
    if (txt) {
      txt.value = "";
      try {
        txt.dispatchEvent(new Event("input", { bubbles: true }));
        txt.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {}
      commentCleared = true;
    }

    return { radiosCleared, commentCleared };
  }

  return {
    POSITIVE_COMMENTS,
    getRandomFeedbackComment,
    findFapFeedbackRadioGroups,
    findFapCommentTextarea,
    getHighestRatingRadio,
    fillFapFeedbackForm,
    resetFapFeedbackForm
  };
});
