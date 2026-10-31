import QRCode from "qrcode";
import type { PaperSheet } from "../types";
import { pageMarkers } from "./paper-scan";
const wrap = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 20,
) => {
  let line = "",
    row = 0;
  for (const word of text.split(/\s+/)) {
    if (ctx.measureText(line + word).width > maxWidth && line) {
      ctx.fillText(line, x, y + row * lineHeight);
      line = "";
      if (++row >= maxLines) return;
    }
    line += word + " ";
  }
  ctx.fillText(line, x, y + row * lineHeight);
};
export const qrPayload = (sheet: PaperSheet, page: number) =>
  `QUIZNA:P1:${sheet.id}:${page}:${sheet.token}`;
export async function answerSheetImages(sheet: PaperSheet, renderScale = 1): Promise<string[]> {
  const images: string[] = [];
  const scale = Math.max(1, Math.min(3, Math.round(renderScale)));
  for (const page of sheet.layout.pages) {
    const canvas = document.createElement("canvas");
    const pageHeight = page.height || 1414;
    canvas.width = 1000 * scale;
    canvas.height = pageHeight * scale;
    const ctx = canvas.getContext("2d")!;
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1000, pageHeight);
    ctx.fillStyle = "#000";
    for (const p of pageMarkers(page)) ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
    ctx.font = "bold 27px Arial";
    ctx.fillText("QuizNa · Answer sheet", 80, 92);
    ctx.font = "bold 23px Arial";
    wrap(ctx, sheet.layout.title, 80, 136, 640, 28, 2);
    const longBond = sheet.layout.revision === 3;
    ctx.font = "21px Arial";
    if (longBond) {
      ctx.fillText("Name:",80,204);ctx.beginPath();ctx.moveTo(150,210);ctx.lineTo(725,210);ctx.stroke();
      ctx.fillText("Section:",80,260);ctx.beginPath();ctx.moveTo(165,266);ctx.lineTo(725,266);ctx.stroke();
    } else {
      wrap(ctx, `Student: ${sheet.layout.student}`, 80, 204, 650, 25, 2);
      wrap(ctx, `Section: ${sheet.layout.section}`, 80, 260, 840, 24, 2);
    }
    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, qrPayload(sheet, page.index), {
      width: 280 * scale,
      margin: 0,
      errorCorrectionLevel: "M",
    });
    ctx.drawImage(qrCanvas, 780, 70, 140, 140);
    ctx.font = "15px Arial";
    ctx.fillText(
      `Page ${page.index + 1}/${sheet.layout.pages.length}`,
      780,
      238,
    );
    const compact = sheet.layout.revision === 2 || longBond;
    if (compact) {
      ctx.font = "bold 17px Arial";
      ctx.fillText(page.rows.some(row => row.options.length) ? "OBJECTIVE ANSWERS" : "WRITTEN RESPONSES", 80, longBond ? 295 : 310);
      const columnStarts = [...new Set(page.rows.filter(row => row.options.length).map(row => row.x || 80))].sort((a, b) => a - b);
      ctx.strokeStyle = "#d4d4d4";
      ctx.lineWidth = 1;
      for (const start of columnStarts.slice(1)) {
        ctx.beginPath(); ctx.moveTo(start - 30, 330); ctx.lineTo(start - 30, longBond ? 1390 : 1230); ctx.stroke();
      }
      if (longBond && page.rows.some(row => row.width)) {
        ctx.font = "bold 15px Arial";ctx.fillText("WRITTEN RESPONSES",650,295);
        ctx.beginPath();ctx.moveTo(620,295);ctx.lineTo(620,1390);ctx.stroke();
      }
      ctx.strokeStyle = "#000";
    }
    for (const row of page.rows) {
      const q = sheet.layout.questions.find((q) => q.id === row.questionId)!;
      ctx.fillStyle = "#000";
      ctx.font = compact ? "bold 16px Arial" : "bold 21px Arial";
      ctx.fillText(compact ? `${row.number}.` : `Q${row.number}`, row.x ?? 80, row.y + 7);
      if (row.options.length) {
        for (const option of row.options) {
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(option.x, row.y, 12, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = compact ? "12px Arial" : "16px Arial";
          if (row.showOptionLabels !== false) ctx.fillText(option.label, compact ? option.x - ctx.measureText(option.label).width / 2 : option.x - 5, row.y - (compact ? 17 : 20));
        }
      } else {
        const narrow = Boolean(row.width);
        const left = narrow ? (row.x || 650) + 15 : 160;
        const right = narrow ? (row.x || 650) + row.width! : 920;
        ctx.font = narrow ? "13px Arial" : "17px Arial";
        if (narrow) ctx.fillText(`${q.points} pts`, right - 40, row.y + 7);
        else wrap(ctx, q.prompt, 160, row.y + 5, 740, 22, 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#aaa";
        for (let y = row.y + (narrow ? 35 : 65); y < row.y + row.height - 10; y += narrow ? 24 : 30) {
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
        }
        ctx.strokeStyle = "#000";
      }
    }
    ctx.font = "15px Arial";
    ctx.fillText("Fill one bubble fully per answer. Use dark ink.", 80, pageHeight - 96);
    ctx.font = "13px Arial";
    ctx.fillText(
      `Sheet ${sheet.id.slice(0, 8)} · Keep all four black corner squares visible when scanning.`,
      80,
      pageHeight - 74,
    );
    if (longBond) {
      ctx.font = "12px Arial";ctx.fillText(`Assigned to: ${sheet.layout.student} | ${sheet.layout.section}`,80,pageHeight-54);
    }
    images.push(canvas.toDataURL("image/png"));
  }
  return images;
}
