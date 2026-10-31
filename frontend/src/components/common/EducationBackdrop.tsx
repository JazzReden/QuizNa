import { BookOpen, GraduationCap, Pencil, Ruler, Sparkles } from "lucide-react";
import "../../styles/education-backdrop.css";

/** Decorative only: never intercepts taps or enters the reading order. */
export function EducationBackdrop() {
  return (
    <div className="qe-backdrop" aria-hidden="true">
      <div className="qe-grid" />
      <span className="qe-token qe-book">
        <BookOpen strokeWidth={1.5} />
      </span>
      <span className="qe-token qe-pencil">
        <Pencil strokeWidth={1.5} />
      </span>
      <span className="qe-token qe-cap">
        <GraduationCap strokeWidth={1.5} />
      </span>
      <span className="qe-token qe-ruler">
        <Ruler strokeWidth={1.5} />
      </span>
      <Sparkles className="qe-spark qe-spark-one" strokeWidth={1.5} />
      <Sparkles className="qe-spark qe-spark-two" strokeWidth={1.5} />
      <span className="qe-ring" />
    </div>
  );
}
