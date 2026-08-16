(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KalimatExport = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  /**
   * Helper to wrap text into multiple lines given a max width and 2D canvas context.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {number} maxWidth
   * @param {string} [font]
   * @param {string} [direction="rtl"]
   * @returns {string[]}
   */
  function wrapText(ctx, text, maxWidth, font, direction = "rtl") {
    if (!ctx) return String(text || "").split("\n");
    if (font) ctx.font = font;
    if (direction) ctx.direction = direction;
    const words = String(text || "").split(" ");
    const lines = [];
    let currentLine = "";
    for (const w of words) {
      const testLine = currentLine ? `${currentLine} ${w}` : w;
      const metrics = ctx.measureText ? ctx.measureText(testLine) : { width: testLine.length * 10 };
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = w;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  /**
   * Serializes vocabulary records into an RFC 4180 compliant CSV deck with UTF-8 BOM.
   * Compatible with both words.js and vocabulary.json schemas.
   *
   * @param {*} historyOrAssignments
   * @param {Array<object>} words
   * @returns {string}
   */
  function serializeAnkiCSV(historyOrAssignments, words) {
    let wordsList = [];

    if (Array.isArray(words)) {
      if (historyOrAssignments) {
        const targetIds = new Set();

        if (historyOrAssignments instanceof Set) {
          for (const item of historyOrAssignments) {
            if (item !== null && item !== undefined) {
              if (typeof item === "object") {
                if (item.id !== undefined) targetIds.add(String(item.id));
                else if (item.wordId !== undefined) targetIds.add(String(item.wordId));
              } else {
                targetIds.add(String(item));
              }
            }
          }
        } else if (Array.isArray(historyOrAssignments)) {
          for (const item of historyOrAssignments) {
            if (item !== null && item !== undefined) {
              if (typeof item === "object") {
                if (item.id !== undefined) targetIds.add(String(item.id));
                else if (item.wordId !== undefined) targetIds.add(String(item.wordId));
              } else {
                targetIds.add(String(item));
              }
            }
          }
        } else if (typeof historyOrAssignments === "object") {
          if (historyOrAssignments.assignments && typeof historyOrAssignments.assignments === "object") {
            for (const assignment of Object.values(historyOrAssignments.assignments)) {
              if (assignment && assignment.wordId !== undefined) targetIds.add(String(assignment.wordId));
            }
          }
          if (historyOrAssignments.wordStates && typeof historyOrAssignments.wordStates === "object") {
            for (const id of Object.keys(historyOrAssignments.wordStates)) {
              targetIds.add(String(id));
            }
          }
          for (const [key, val] of Object.entries(historyOrAssignments)) {
            if (key === "assignments" || key === "wordStates" || key === "preferences" || key === "recentIds") continue;
            targetIds.add(String(key));
            if (val && typeof val === "object") {
              if (val.id !== undefined) targetIds.add(String(val.id));
              if (val.wordId !== undefined) targetIds.add(String(val.wordId));
            }
          }
        }

        wordsList = words.filter(
          (w) => w && (targetIds.has(String(w.id)) || (w.wordId !== undefined && targetIds.has(String(w.wordId))))
        );
      } else {
        wordsList = words;
      }
    } else if (Array.isArray(historyOrAssignments)) {
      wordsList = historyOrAssignments;
    }

    const headers = ["Word", "Root", "Weight", "Vocalization", "Meaning", "English Meaning", "Example"];
    const escapeField = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const rows = [headers.map(escapeField).join(",")];

    for (const w of wordsList) {
      if (!w || typeof w !== "object") continue;
      rows.push(
        [
          w.word || "",
          w.root || "",
          w.weight || w.pattern || "",
          w.vocalization || w.pronunciation || "",
          w.meaning || w.meaningAr || "",
          w.englishMeaning || w.meaningEn || "",
          w.example || w.exampleAr || "",
        ]
          .map(escapeField)
          .join(",")
      );
    }

    return `\uFEFF${rows.join("\r\n")}\r\n`;
  }

  /**
   * Renders a high-resolution 1080x1080 HTML5 Canvas social card and optionally triggers PNG download.
   *
   * @param {object} word
   * @param {object} [options]
   * @param {HTMLCanvasElement} [options.canvas]
   * @param {boolean} [options.download=true]
   * @param {string} [options.filename]
   * @returns {Promise<Blob|string|null>}
   */
  async function renderSocialCard(word, options = {}) {
    if (!word || typeof word !== "object") return null;

    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {}
    }

    const canvas =
      options.canvas ||
      (typeof document !== "undefined" && typeof document.createElement === "function"
        ? document.createElement("canvas")
        : null);

    if (!canvas) return null;

    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return null;

    // 1. Background: Linear Gradient (#0f172a to #14211b)
    const bgGrad = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 1080, 1080) : null;
    if (bgGrad && typeof bgGrad.addColorStop === "function") {
      bgGrad.addColorStop(0, "#0f172a");
      bgGrad.addColorStop(1, "#14211b");
      ctx.fillStyle = bgGrad;
    } else {
      ctx.fillStyle = "#0f172a";
    }
    ctx.fillRect(0, 0, 1080, 1080);

    // 2. Dual borders (Outer lime #84cc16, Inner subtle line)
    ctx.strokeStyle = "#84cc16";
    ctx.lineWidth = 6;
    ctx.strokeRect(36, 36, 1008, 1008);

    ctx.strokeStyle = "rgba(243, 239, 229, 0.15)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(48, 48, 984, 984);

    // 3. Watermark Calligraphy glyph (ض)
    if (typeof ctx.save === "function") ctx.save();
    ctx.font = "bold 320px 'Amiri', serif";
    ctx.fillStyle = "rgba(132, 204, 22, 0.05)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = "rtl";
    if (typeof ctx.fillText === "function") ctx.fillText("ض", 540, 540);
    if (typeof ctx.restore === "function") ctx.restore();

    // 4. Header Branding
    if (typeof ctx.save === "function") ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "right";

    ctx.fillStyle = "#84cc16";
    ctx.font = "bold 36px 'Outfit', sans-serif";
    if (typeof ctx.fillText === "function") ctx.fillText("كَلِمات", 980, 110);

    ctx.fillStyle = "rgba(243, 239, 229, 0.75)";
    ctx.font = "500 24px 'Outfit', sans-serif";
    if (typeof ctx.fillText === "function") ctx.fillText("كلمة اليوم من الفصحى", 980, 150);

    ctx.textAlign = "left";
    ctx.direction = "ltr";
    ctx.font = "600 22px 'Outfit', sans-serif";
    ctx.fillStyle = "rgba(243, 239, 229, 0.6)";
    if (typeof ctx.fillText === "function") ctx.fillText("kalimaat.app", 100, 110);
    if (typeof ctx.restore === "function") ctx.restore();

    // Divider line
    ctx.strokeStyle = "rgba(243, 239, 229, 0.2)";
    ctx.lineWidth = 1;
    if (typeof ctx.beginPath === "function") {
      ctx.beginPath();
      ctx.moveTo(100, 185);
      ctx.lineTo(980, 185);
      ctx.stroke();
    }

    // 5. Headword & Vocalization
    if (typeof ctx.save === "function") ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f3efe5";
    ctx.font = "bold 100px 'Amiri', serif";
    if (typeof ctx.fillText === "function") ctx.fillText(word.word || "", 540, 310);

    ctx.fillStyle = "#84cc16";
    ctx.font = "34px 'Amiri', serif";
    if (typeof ctx.fillText === "function") ctx.fillText(word.vocalization || word.pronunciation || "", 540, 370);
    if (typeof ctx.restore === "function") ctx.restore();

    // 6. Metadata Badges (Root, Weight/Pattern, Category/Topic)
    const categoryVal =
      word.category || (Array.isArray(word.topics) && word.topics.length > 0 ? word.topics[0] : "") || "—";
    const metadata = [
      { label: "الجذر", val: word.root || "—" },
      { label: "الوزن", val: word.weight || word.pattern || "—" },
      { label: "التصنيف", val: categoryVal },
    ];

    const boxWidth = 260;
    const boxHeight = 75;
    const boxY = 415;
    const boxGap = 40;
    const totalWidth = 3 * boxWidth + 2 * boxGap;
    const startX = (1080 - totalWidth) / 2;

    metadata.forEach((item, index) => {
      const x = startX + index * (boxWidth + boxGap);
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.fillRect(x, boxY, boxWidth, boxHeight);
      ctx.strokeStyle = "rgba(243, 239, 229, 0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, boxY, boxWidth, boxHeight);

      if (typeof ctx.save === "function") ctx.save();
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(243, 239, 229, 0.7)";
      ctx.font = "20px 'Outfit', sans-serif";
      if (typeof ctx.fillText === "function") ctx.fillText(item.label, x + boxWidth / 2, boxY + 28);

      ctx.fillStyle = "#f3efe5";
      ctx.font = "bold 24px 'Amiri', serif";
      if (typeof ctx.fillText === "function") ctx.fillText(item.val || "—", x + boxWidth / 2, boxY + 60);
      if (typeof ctx.restore === "function") ctx.restore();
    });

    // 7. Meaning Section
    if (typeof ctx.save === "function") ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#84cc16";
    ctx.font = "bold 22px 'Outfit', sans-serif";
    if (typeof ctx.fillText === "function") ctx.fillText("المعنى والدلالة:", 980, 540);

    ctx.fillStyle = "#f3efe5";
    const meaningText = word.meaning || word.meaningAr || "";
    const meaningLines = wrapText(ctx, meaningText, 880, "30px 'Amiri', serif", "rtl");
    let currentY = 585;
    meaningLines.slice(0, 3).forEach((line) => {
      if (typeof ctx.fillText === "function") ctx.fillText(line, 980, currentY);
      currentY += 42;
    });

    const englishText = word.englishMeaning || word.meaningEn;
    if (englishText) {
      if (typeof ctx.save === "function") ctx.save();
      ctx.direction = "ltr";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(243, 239, 229, 0.75)";
      const enLines = wrapText(ctx, englishText, 880, "italic 22px 'Outfit', sans-serif", "ltr");
      currentY += 8;
      enLines.slice(0, 2).forEach((line) => {
        if (typeof ctx.fillText === "function") ctx.fillText(line, 100, currentY);
        currentY += 30;
      });
      if (typeof ctx.restore === "function") ctx.restore();
    }
    if (typeof ctx.restore === "function") ctx.restore();

    // 8. Literary Example Box
    const exampleText = word.example || word.exampleAr;
    if (exampleText) {
      const exBoxY = Math.max(currentY + 20, 770);
      const exBoxHeight = 180;
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fillRect(100, exBoxY, 880, exBoxHeight);
      ctx.strokeStyle = "#84cc16";
      ctx.lineWidth = 3;
      if (typeof ctx.beginPath === "function") {
        ctx.beginPath();
        ctx.moveTo(980, exBoxY);
        ctx.lineTo(980, exBoxY + exBoxHeight);
        ctx.stroke();
      }

      if (typeof ctx.save === "function") ctx.save();
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.fillStyle = "#84cc16";
      ctx.font = "bold 20px 'Outfit', sans-serif";
      if (typeof ctx.fillText === "function") ctx.fillText("الشاهد الأدبي:", 960, exBoxY + 35);

      ctx.fillStyle = "#f3efe5";
      const formattedQuote = exampleText.startsWith("«") ? exampleText : `«${exampleText}»`;
      const exLines = wrapText(ctx, formattedQuote, 830, "26px 'Amiri', serif", "rtl");
      let exY = exBoxY + 75;
      exLines.slice(0, 2).forEach((line) => {
        if (typeof ctx.fillText === "function") ctx.fillText(line, 960, exY);
        exY += 38;
      });
      if (typeof ctx.restore === "function") ctx.restore();
    }

    // 9. Footer Tagline
    if (typeof ctx.save === "function") ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(243, 239, 229, 0.5)";
    ctx.font = "500 20px 'Outfit', sans-serif";
    if (typeof ctx.fillText === "function") {
      ctx.fillText("كَلِمات — تجربة يومية للاحتفاء بجماليات اللغة العربية وثراء مفرداتها", 540, 1015);
    }
    if (typeof ctx.restore === "function") ctx.restore();

    // 10. Export pipeline
    const filename = options.filename || `kalimat-word-${word.id || "card"}.png`;
    const shouldDownload = options.download !== false;

    return new Promise((resolve) => {
      if (typeof canvas.toBlob === "function") {
        canvas.toBlob((blob) => {
          if (blob) {
            if (
              shouldDownload &&
              typeof document !== "undefined" &&
              typeof document.createElement === "function" &&
              typeof URL !== "undefined" &&
              typeof URL.createObjectURL === "function"
            ) {
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = filename;
              link.hidden = true;
              document.body.appendChild(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(url), 0);
            }
            resolve(blob);
          } else if (typeof canvas.toDataURL === "function") {
            const dataUrl = canvas.toDataURL("image/png");
            if (
              shouldDownload &&
              typeof document !== "undefined" &&
              typeof document.createElement === "function"
            ) {
              const link = document.createElement("a");
              link.href = dataUrl;
              link.download = filename;
              link.hidden = true;
              document.body.appendChild(link);
              link.click();
              link.remove();
            }
            resolve(dataUrl);
          } else {
            resolve(null);
          }
        }, "image/png");
      } else if (typeof canvas.toDataURL === "function") {
        const dataUrl = canvas.toDataURL("image/png");
        if (
          shouldDownload &&
          typeof document !== "undefined" &&
          typeof document.createElement === "function"
        ) {
          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = filename;
          link.hidden = true;
          document.body.appendChild(link);
          link.click();
          link.remove();
        }
        resolve(dataUrl);
      } else {
        resolve(null);
      }
    });
  }

  return {
    serializeAnkiCSV,
    renderSocialCard,
    wrapText,
  };
});
