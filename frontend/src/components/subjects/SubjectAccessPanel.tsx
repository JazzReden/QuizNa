import { Link } from "react-router-dom";
import { Copy, Users, Table2, ArrowUpRight, Trophy } from "lucide-react";
import type { SubjectDetail } from "../../types";
export function SubjectAccessPanel({
  detail,
  busy,
  onCopy,
  onVisibility,
}: {
  detail: SubjectDetail;
  busy: boolean;
  onCopy: () => void;
  onVisibility: (enabled: boolean) => void;
}) {
  return (
    <aside className="qn-course-sidebar" aria-label="Class settings">
      <section className="qn-course-side-card" id="course-access">
        <h2>Class access</h2>
        <p className="qn-course-side-label">Subject code</p>
        <button
          type="button"
          className="qn-course-code"
          aria-label={`Copy subject code ${detail.access_code}`}
          onClick={onCopy}
        >
          <code>{detail.access_code}</code>
          <Copy size={17} aria-hidden="true" />
        </button>
        <p className="qn-course-side-note">
          Share with students in this section.
        </p>
        <div className="qn-course-record-links">
          <Link
            to={`/teacher/sections?section=${detail.class_section_id}&tab=students`}
          >
            <Users size={16} />
            Section roster
            <ArrowUpRight size={15} />
          </Link>
          <Link to={`/teacher/gradebook?section=${detail.class_section_id}`}>
            <Table2 size={16} />
            Section gradebook
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </section>
      <section className="qn-course-side-card">
        <div className="qn-course-side-heading">
          <Trophy size={17} aria-hidden="true" />
          <h2>Leaderboard</h2>
        </div>
        <label className="qn-course-visibility">
          <span>
            <strong>Student visibility</strong>
            <small>
              {detail.leaderboard_enabled
                ? "Visible to students"
                : "Hidden from students"}
            </small>
          </span>
          <span className="qn-course-switch">
            <input
              type="checkbox"
              role="switch"
              aria-label="Open leaderboard to students"
              checked={detail.leaderboard_enabled}
              disabled={busy}
              onChange={(e) => onVisibility(e.target.checked)}
            />
            <span aria-hidden="true" />
          </span>
        </label>
        <p className="qn-course-side-note">
          Only confirmed, released scores appear.
        </p>
      </section>
    </aside>
  );
}
