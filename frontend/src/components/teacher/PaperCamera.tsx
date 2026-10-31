import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ImagePlus, ScanLine, X } from "lucide-react";

interface Props {
  stream: MediaStream;
  busy: boolean;
  progress?: string;
  pageAspect?: string;
  error: string;
  onClose: () => void;
  onCapture: (video: HTMLVideoElement) => void;
  onUpload: (file: File) => void;
}

/** The displayed feed is never cropped; capture uses the full camera frame. */
export function PaperCamera({ stream, busy, progress, pageAspect, error, onClose, onCapture, onUpload }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const player = video.current!;
    player.srcObject = stream;
    void player.play().catch(() => setNeedsPlay(true));
    return () => {
      player.srcObject = null;
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, [stream]);
  return createPortal(
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="paper-camera-title" tabIndex={-1}
      className="paper-camera" onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); }
        if (event.key === "Tab") {
          const controls = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
          const first = controls[0], last = controls.at(-1);
          if (!first) { event.preventDefault(); return; }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
        }
      }}>
      <header className="paper-camera-header">
        <div><p className="text-xs font-semibold text-indigo-300">{progress || "QuizNa"}</p><h2 id="paper-camera-title" className="text-lg font-bold">Scan answer sheet</h2></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close camera" className="paper-camera-icon"><X size={24} /></button>
      </header>
      <div className="paper-camera-stage" aria-busy={busy}>
        <video ref={video} muted playsInline autoPlay aria-label="Live answer sheet camera"
          onPlaying={() => { setReady(true); setNeedsPlay(false); }}
          onWaiting={() => setReady(false)} onPause={() => setReady(false)}
          onError={() => { setReady(false); setNeedsPlay(true); }}
          className="absolute inset-0 h-full w-full object-contain" />
        <div className="paper-camera-guide" style={pageAspect ? {aspectRatio:pageAspect} : undefined} aria-hidden="true">
          {["top-left", "top-right", "bottom-left", "bottom-right"].map(corner => <span key={corner} className={`paper-camera-corner ${corner}`} />)}
          <span className="absolute inset-x-0 top-3 text-center text-xs font-semibold text-white drop-shadow-lg">Keep all four squares inside</span>
        </div>
        {needsPlay && <button type="button" className="relative rounded-full bg-white px-5 py-3 font-semibold text-slate-900" onClick={() => void video.current?.play().catch(() => setNeedsPlay(true))}>Start preview</button>}
        {busy && <div role="status" className="absolute inset-0 flex items-center justify-center bg-slate-950/70"><span className="flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 font-semibold"><ScanLine className="animate-pulse" />Reading sheet…</span></div>}
      </div>
      <footer className="paper-camera-footer">
        {error ? <p role="alert" className="mb-3 rounded-xl bg-red-950 px-4 py-3 text-sm text-red-100">{error}</p> : <p className="mb-4 text-center text-sm text-slate-200">Keep the whole page visible. Hold steady.</p>}
        <div className="grid grid-cols-3 items-center gap-3">
          <label className={`flex cursor-pointer flex-col items-center gap-1 text-xs ${busy ? 'pointer-events-none opacity-40' : ''}`}><span className="paper-camera-icon"><ImagePlus size={22} /></span>Photo
            <input aria-label="Upload photo in camera" type="file" accept="image/*" disabled={busy} className="sr-only" onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(file); e.target.value = ""; }} />
          </label>
          <button type="button" aria-label="Capture sheet" disabled={busy || !ready} onClick={() => { if (video.current) onCapture(video.current); }} className="paper-camera-shutter"><Camera size={30} aria-hidden="true" /></button>
          <span role="status" className="text-center text-xs text-slate-300">{busy ? "Reading…" : ready ? "Ready to scan" : "Starting camera…"}</span>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">Scan · Review · Save</p>
      </footer>
    </div>, document.body,
  );
}
