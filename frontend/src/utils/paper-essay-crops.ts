import type { PaperPage } from "../types";
import { alignPaperPage, type QrLocation } from "./paper-scan";
export interface EssayCrop {
  questionId: string;
  number: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
// Rectify only the response boxes. Name, section, QR and objective answers stay on-device.
export function cropEssays(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  location: QrLocation,
  page: PaperPage,
): EssayCrop[] {
  const rows = page.rows.filter((row) => row.type === "essay");
  if (!rows.length) return [];
  if (rows.length > 8)
    throw Error("Read this page manually; too many essay boxes.");
  const project = alignPaperPage(data, width, height, location, page);
  return rows.map((row) => {
    const left = row.width ? (row.x ?? 650) + 5 : 155;
    const top = row.y + (row.width ? 20 : 50);
    const right = row.width ? (row.x ?? 650) + row.width - 5 : 925;
    const bottom = row.y + row.height - 8;
    const scale = Math.min(2, 900 / (right - left));
    const w = Math.round((right - left) * scale),
      h = Math.round((bottom - top) * scale);
    if (w < 80 || h < 40 || h > 2400 || w * h > 3200000)
      throw Error(
        "Essay box is too large to read. Enter the response manually.",
      );
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = project({ x: left + x / scale, y: top + y / scale }),
          xx = Math.round(p.x),
          yy = Math.round(p.y),
          target = (y * w + x) * 4;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height)
          throw Error("Keep the entire essay box in the photo.");
        const source = (yy * width + xx) * 4;
        pixels[target] = data[source];
        pixels[target + 1] = data[source + 1];
        pixels[target + 2] = data[source + 2];
        pixels[target + 3] = 255;
      }
    return {
      questionId: row.questionId,
      number: row.number,
      width: w,
      height: h,
      data: pixels,
    };
  });
}
export async function cropPng(
  crop: EssayCrop,
): Promise<{ blob: Blob; preview: string }> {
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(crop.width, crop.height);
  image.data.set(crop.data);
  ctx.putImageData(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(Error("Unable to prepare essay image.")),
      "image/png",
    ),
  );
  if (blob.size > 700000)
    throw Error(
      "Essay photo is too detailed. Retake a smaller photo or enter the response manually.",
    );
  return { blob, preview: canvas.toDataURL("image/png") };
}
