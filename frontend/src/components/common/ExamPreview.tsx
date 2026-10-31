import { useEffect, useRef, useState } from "react";
import { Monitor, ScanLine, Send, BookOpen, Pencil } from "lucide-react";

/** Local illustrative videos. Never reads or writes classroom data. */
export function ExamPreview() {
  const [format, setFormat] = useState<"online" | "paper">("paper");
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media?.matches ?? true);
    update();
    media?.addEventListener?.("change", update);
    return () => media?.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (reduced || paused) { element.pause(); return; }
    const update = (visible: boolean) => {
      if (visible && !document.hidden && !paused && !reduced) {
        void element.play()?.catch(() => setPlaying(false));
      } else element.pause();
    };
    let visible = false;
    const observer = window.IntersectionObserver ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update(visible);
    }, { threshold: 0.15 }) : null;
    observer?.observe(element);
    const visibility = () => update(visible);
    document.addEventListener("visibilitychange", visibility);
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, [format, paused, reduced]);
  const toggle = () => {
    if (playing) { setPaused(true); video.current?.pause(); }
    else { setPaused(false); setReduced(false); void video.current?.play()?.catch(() => setPlaying(false)); }
  };
  return (
    <div className="ql-preview-surround">
      <div className="ql-preview-stationery" aria-hidden="true">
        <Send className="ql-plane" strokeWidth={1.25} />
        <BookOpen className="ql-preview-book" strokeWidth={1.25} />
        <Pencil className="ql-preview-pencil" strokeWidth={1.25} />
        <svg className="ql-flight-path" viewBox="0 0 200 400"><path d="M150 20 C20 100 190 180 80 220 S30 350 160 380" /></svg>
      </div>
    <figure className="ql-preview">
      <figcaption className="ql-preview-header">
        <p className="ql-eyebrow">SEE QUIZNA IN MOTION</p>
        <fieldset className="ql-preview-switch">
          <legend className="sr-only">Exam format preview</legend>
          {(["online", "paper"] as const).map(value => (
            <label key={value}>
              <input type="radio" name="exam-preview" value={value} checked={format === value} onChange={() => setFormat(value)} />
              <span>{value === "online" ? <Monitor size={16} aria-hidden="true" /> : <ScanLine size={16} aria-hidden="true" />}{value === "online" ? "Online quiz" : "Paper exam"}</span>
            </label>
          ))}
        </fieldset>
      </figcaption>
      <div className="ql-video-stage">
        <span id="preview-playback-hint" className="sr-only">Select the video or press Enter or Space to pause or resume the preview.</span>
        <video role="button" tabIndex={0} aria-describedby="preview-playback-hint" aria-pressed={paused} onClick={toggle} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }} key={format} ref={video} muted loop playsInline preload="none"
          poster={`/previews/${format}.jpg`} src={`/previews/${format}.mp4`}
          aria-label={format === "paper" ? "Paper exam demonstration: scan, review answers, confirm and save" : "Online quiz demonstration: choose answers, autosave and submit"}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}>
          Your browser does not support video previews.
        </video>

      </div>
    </figure>
    </div>
  );
}
