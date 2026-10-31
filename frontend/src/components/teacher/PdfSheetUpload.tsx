import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { openAnswerPdf, renderAnswerPdfPage } from "../../utils/paper-pdf";
interface Props {
  file: File;
  disabled: boolean;
  onScan: (
    source: HTMLCanvasElement,
    width: number,
    height: number,
  ) => Promise<void>;
  onClose: () => void;
}
/** One page is rendered and reviewed at a time, never a batch of student results. */
export function PdfSheetUpload({ file, disabled, onScan, onClose }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [rendering, setRendering] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cancel = new AbortController();
    let opened: PDFDocumentProxy | undefined;
    setLoading(true);
    setError("");
    setReady(false);
    setPdf(null);
    setPage(1);
    void openAnswerPdf(file, cancel.signal)
      .then((value) => {
        opened = value;
        if (cancel.signal.aborted) void value.loadingTask.destroy();
        else setPdf(value);
      })
      .catch((e) => {
        if (!cancel.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!cancel.signal.aborted) setLoading(false);
      });
    return () => {
      cancel.abort();
      if (opened) void opened.loadingTask.destroy();
    };
  }, [file]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    const cancel = new AbortController();
    setRendering(true);
    setReady(false);
    setError("");
    void renderAnswerPdfPage(pdf, page, canvas.current, cancel.signal)
      .then(() => {
        if (!cancel.signal.aborted) setReady(true);
      })
      .catch((e) => {
        if (!cancel.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!cancel.signal.aborted) setRendering(false);
      });
    return () => cancel.abort();
  }, [pdf, page]);
  const blocked = disabled || loading || rendering;
  return (
    <section className="qn-pdf-upload" aria-label="PDF answer sheet preview">
      <div className="qn-pdf-toolbar">
        <div>
          <strong>PDF answer sheet</strong>
          <p>{file.name}</p>
        </div>
        <button
          type="button"
          className="qn-button-secondary"
          disabled={disabled}
          onClick={onClose}
        >
          Close PDF
        </button>
      </div>
      {error && (
        <p role="alert" className="qn-alert qn-alert-error">
          {error}
        </p>
      )}
      {loading && <p role="status">Opening PDF…</p>}
      {pdf && (
        <>
          <div className="qn-pdf-toolbar">
            <label>
              Page
              <select
                aria-label="PDF page"
                disabled={blocked}
                value={page}
                onChange={(e) => setPage(Number(e.target.value))}
              >
                {Array.from({ length: pdf.numPages }, (_, i) => (
                  <option value={i + 1} key={i}>
                    {i + 1} of {pdf.numPages}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="qn-button-primary"
              disabled={blocked || !ready}
              onClick={() => {
                if (canvas.current)
                  void onScan(
                    canvas.current,
                    canvas.current.width,
                    canvas.current.height,
                  );
              }}
            >
              Scan this page
            </button>
          </div>
          {rendering && <p role="status">Preparing page preview…</p>}
          <div className="qn-pdf-canvas">
            <canvas
              ref={canvas}
              aria-label={`Answer sheet PDF page ${page}`}
              role="img"
            />
          </div>
          <p className="qn-description">
            Scan each answer-sheet page, then review before saving.
          </p>
        </>
      )}
    </section>
  );
}
