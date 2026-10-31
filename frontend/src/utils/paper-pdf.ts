import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
export const PDF_UPLOAD_LIMIT = 20 * 1024 * 1024;
export const PDF_PAGE_LIMIT = 50;
const TIMEOUT = 20000;
/** Rasterize local documents only. No viewer actions, scripts, forms or remote URL input. */
export async function openAnswerPdf(
  file: File,
  signal?: AbortSignal,
): Promise<PDFDocumentProxy> {
  if (file.size > PDF_UPLOAD_LIMIT)
    throw Error("Choose a PDF smaller than 20 MB.");
  if (!file.size) throw Error("This PDF is empty. Choose another file.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) throw Error("PDF opening cancelled.");
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-")
    throw Error("This file is not a valid PDF.");
  const loading = getDocument({
    data: bytes,
    enableXfa: false,
    useWasm: false,
    useWorkerFetch: false,
    maxImageSize: 16000000,
    canvasMaxAreaInBytes: 20000000,
    stopAtErrors: true,
    verbosity: 0,
  });
  let protectedFile = false,
    timedOut = false;
  loading.onPassword = () => {
    protectedFile = true;
    void loading.destroy();
  };
  const cancel = () => void loading.destroy();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    void loading.destroy();
  }, TIMEOUT);
  try {
    const pdf = await loading.promise;
    if (signal?.aborted) {
      await pdf.loadingTask.destroy();
      throw Error("PDF opening cancelled.");
    }
    if (pdf.numPages > PDF_PAGE_LIMIT) {
      await pdf.loadingTask.destroy();
      throw Error(`Choose a PDF with ${PDF_PAGE_LIMIT} pages or fewer.`);
    }
    return pdf;
  } catch (error) {
    await loading.destroy().catch(() => undefined);
    if (protectedFile)
      throw Error("This PDF needs a password. Upload an unlocked copy.");
    if (timedOut)
      throw Error("Opening the PDF took too long. Try a smaller file.");
    if (error instanceof Error && error.message.includes("pages or fewer"))
      throw error;
    throw Error("Unable to open this PDF. Try another PDF or upload a photo.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
export async function renderAnswerPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  signal?: AbortSignal,
) {
  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > pdf.numPages
  )
    throw Error("Choose a page from this PDF.");
  const page = await pdf.getPage(pageNumber);
  let task: ReturnType<typeof page.render> | undefined;
  let timedOut = false;
  const cancel = () => task?.cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (signal?.aborted) throw Error("Page preview cancelled.");
    const base = page.getViewport({ scale: 1 }),
      longest = Math.max(base.width, base.height);
    if (!Number.isFinite(longest) || longest <= 0)
      throw Error("Invalid page size.");
    const viewport = page.getViewport({ scale: 2200 / longest });
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    task = page.render({ canvas, viewport, background: "rgb(255,255,255)" });
    timer = setTimeout(() => {
      timedOut = true;
      task?.cancel();
    }, TIMEOUT);
    await task.promise;
  } catch {
    throw Error(
      timedOut
        ? "This page took too long to preview. Try a simpler PDF or a photo."
        : "Unable to preview this PDF page. Try another page or a photo.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    page.cleanup();
  }
}
