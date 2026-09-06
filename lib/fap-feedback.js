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

  const TOOLBAR_STYLES = `
    #fptu-feedback-toolbar {
      position: fixed;
      top: 18px;
      right: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      color: #e2e8f0;
    }
    #fptu-feedback-toolbar * {
      box-sizing: border-box;
    }
    .fptu-feedback-panel {
      width: 320px;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 14px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(99, 102, 241, 0.15);
      padding: 14px 16px;
      animation: fptuFeedbackSlideIn 0.25s ease-out;
    }
    .fptu-feedback-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .fptu-feedback-title {
      font-weight: 700;
      font-size: 13px;
      letter-spacing: -0.01em;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .fptu-feedback-badge {
      background: linear-gradient(135deg, #6366f1, #a855f7);
      color: #ffffff;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
    }
    .fptu-feedback-close {
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 4px;
      border-radius: 6px;
      transition: all 0.15s ease;
    }
    .fptu-feedback-close:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }
    .fptu-feedback-btn-primary {
      width: 100%;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #c026d3 100%);
      color: #ffffff;
      font-weight: 600;
      font-size: 13px;
      border: none;
      border-radius: 8px;
      padding: 10px 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
      transition: all 0.15s ease;
      margin-bottom: 8px;
    }
    .fptu-feedback-btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
    }
    .fptu-feedback-row-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
    }
    .fptu-feedback-btn-secondary {
      flex: 1;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 500;
      border-radius: 8px;
      padding: 7px 10px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .fptu-feedback-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.13);
      color: #ffffff;
    }
    .fptu-feedback-preview {
      font-size: 11px;
      color: #94a3b8;
      background: rgba(0, 0, 0, 0.25);
      border-radius: 6px;
      padding: 8px;
      margin-bottom: 8px;
      line-height: 1.4;
      font-style: italic;
      border-left: 2px solid #8b5cf6;
      max-height: 60px;
      overflow-y: auto;
    }
    .fptu-feedback-note {
      font-size: 10.5px;
      color: #64748b;
      text-align: center;
      line-height: 1.35;
    }
    .fptu-feedback-pill {
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(99, 102, 241, 0.4);
      color: #e2e8f0;
      padding: 7px 14px;
      border-radius: 999px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 12px;
      transition: all 0.2s ease;
    }
    .fptu-feedback-pill:hover {
      background: rgba(30, 41, 59, 0.98);
      border-color: #818cf8;
      transform: translateY(-1px);
    }
    .fptu-feedback-toast {
      position: absolute;
      bottom: -40px;
      right: 0;
      background: #10b981;
      color: #ffffff;
      font-size: 11.5px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
      animation: fptuFeedbackFade 0.2s ease-out;
      white-space: nowrap;
    }
    @keyframes fptuFeedbackSlideIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fptuFeedbackFade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;

  function injectFapFeedbackToolbar(doc) {
    const documentObj = doc || (typeof document !== "undefined" ? document : null);
    if (!documentObj) return null;

    let existing = documentObj.getElementById("fptu-feedback-toolbar");
    if (existing) return existing;

    // Inject styles
    if (!documentObj.getElementById("fptu-feedback-toolbar-style")) {
      const styleEl = documentObj.createElement("style");
      styleEl.id = "fptu-feedback-toolbar-style";
      styleEl.textContent = TOOLBAR_STYLES;
      if (documentObj.head) {
        documentObj.head.appendChild(styleEl);
      }
    }

    let currentCommentState = getRandomFeedbackComment();

    const container = documentObj.createElement("div");
    container.id = "fptu-feedback-toolbar";

    const panel = documentObj.createElement("div");
    panel.className = "fptu-feedback-panel";

    const pill = documentObj.createElement("div");
    pill.className = "fptu-feedback-pill";
    pill.style.display = "none";
    pill.innerHTML = `<span>⚡</span><span>Khảo sát nhanh</span>`;

    function renderPanelContent() {
      panel.innerHTML = `
        <div class="fptu-feedback-header">
          <div class="fptu-feedback-title">
            <span>⚡ Khảo sát FAP</span>
            <span class="fptu-feedback-badge">v3.6.5</span>
          </div>
          <button class="fptu-feedback-close" id="fptu-btn-minimize" title="Thu gọn toolbar">✕</button>
        </div>
        <button class="fptu-feedback-btn-primary" id="fptu-btn-fill-5star">
          <span>⚡</span>
          <span>Điền Tốt Tất Cả (5★) & Khen</span>
        </button>
        <div class="fptu-feedback-row-actions">
          <button class="fptu-feedback-btn-secondary" id="fptu-btn-random-comment">
            <span>🎲</span>
            <span>Đổi lời khen</span>
          </button>
          <button class="fptu-feedback-btn-secondary" id="fptu-btn-reset">
            <span>↺</span>
            <span>Xoá chọn</span>
          </button>
        </div>
        <div class="fptu-feedback-preview" id="fptu-comment-preview">
          "${currentCommentState.comment}"
        </div>
        <div class="fptu-feedback-note">
          Tự động đánh giá 5★ và lời khen lịch sự. Bạn vui lòng kiểm tra lại rồi bấm <b>Gửi ý kiến</b> của trường nhé!
        </div>
      `;

      const btnFill = panel.querySelector("#fptu-btn-fill-5star");
      if (btnFill) {
        btnFill.addEventListener("click", () => {
          const res = fillFapFeedbackForm(documentObj, currentCommentState.comment);
          showToast(`Đã điền ${res.radiosFilled} câu & nhận xét!`);
        });
      }

      const btnRandom = panel.querySelector("#fptu-btn-random-comment");
      if (btnRandom) {
        btnRandom.addEventListener("click", () => {
          currentCommentState = getRandomFeedbackComment(currentCommentState.index);
          const preview = panel.querySelector("#fptu-comment-preview");
          if (preview) {
            preview.textContent = `"${currentCommentState.comment}"`;
          }
          const txt = findFapCommentTextarea(documentObj);
          if (txt && txt.value) {
            txt.value = currentCommentState.comment;
            try {
              txt.dispatchEvent(new Event("input", { bubbles: true }));
              txt.dispatchEvent(new Event("change", { bubbles: true }));
            } catch (_) {}
          }
          showToast("Đã đổi lời khen mới!");
        });
      }

      const btnReset = panel.querySelector("#fptu-btn-reset");
      if (btnReset) {
        btnReset.addEventListener("click", () => {
          resetFapFeedbackForm(documentObj);
          showToast("Đã xoá lựa chọn!");
        });
      }

      const btnMin = panel.querySelector("#fptu-btn-minimize");
      if (btnMin) {
        btnMin.addEventListener("click", () => {
          panel.style.display = "none";
          pill.style.display = "flex";
        });
      }
    }

    pill.addEventListener("click", () => {
      pill.style.display = "none";
      panel.style.display = "block";
    });

    function showToast(msg) {
      const existingToast = container.querySelector(".fptu-feedback-toast");
      if (existingToast && existingToast.remove) existingToast.remove();

      const toast = documentObj.createElement("div");
      toast.className = "fptu-feedback-toast";
      toast.textContent = msg;
      container.appendChild(toast);
      setTimeout(() => {
        if (toast && toast.remove) toast.remove();
      }, 2500);
    }

    renderPanelContent();
    container.appendChild(panel);
    container.appendChild(pill);

    if (documentObj.body) {
      documentObj.body.appendChild(container);
    }

    return container;
  }

  return {
    POSITIVE_COMMENTS,
    getRandomFeedbackComment,
    findFapFeedbackRadioGroups,
    findFapCommentTextarea,
    getHighestRatingRadio,
    fillFapFeedbackForm,
    resetFapFeedbackForm,
    injectFapFeedbackToolbar
  };
});
