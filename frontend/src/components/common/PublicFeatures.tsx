import { Monitor, ScanLine, Radio, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

export function ExamFormats() {
  return (
    <div className="ql-format-grid">
      <div className="ql-format-card">
        <Monitor size={22} aria-hidden="true" />
        <h3>Online quiz</h3>
        <p>Share a code. Students answer with a timer and automatic saving.</p>
      </div>
      <div className="ql-format-card">
        <ScanLine size={22} aria-hidden="true" />
        <h3>Paper exam</h3>
        <p>
          Print QR answer sheets. Scan marked answers, review, and save scores.
        </p>
      </div>
    </div>
  );
}
export function MonitoringFeature() {
  return (
    <div className="ql-monitoring">
      <div className="ql-monitoring-title">
        <Radio size={19} aria-hidden="true" />
        <h3>Live monitoring</h3>
      </div>
      <p>
        Teachers see online quiz progress and possible violations from tab
        switching, window focus loss, or leaving fullscreen.
      </p>
      <p className="ql-monitoring-limit">
        Browser signals are not proof of cheating. QuizNa cannot monitor other
        devices.
      </p>
      <Link to="/guide?role=student#monitoring" className="ql-text-link">
        How monitoring works <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </div>
  );
}
