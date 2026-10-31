import { EducationBackdrop } from "../../components/common/EducationBackdrop";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ScanLine,
  FileCheck2,
  Table2,
} from "lucide-react";
import { ExamPreview } from "../../components/common/ExamPreview";
import "../../styles/landing.css";
import "../../styles/public-pages.css";
import {
  PublicHeader,
  PublicFooter,
} from "../../components/common/PublicLayout";
import {
  ExamFormats,
  MonitoringFeature,
} from "../../components/common/PublicFeatures";

export function LandingPage() {
  const landingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      !window.IntersectionObserver ||
      !window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches
    )
      return;
    const sections =
      landingRef.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("ql-revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08 },
    );
    sections?.forEach((section) => {
      section.classList.add("ql-reveal-ready");
      observer.observe(section);
    });
    return () => {
      observer.disconnect();
      sections?.forEach((section) =>
        section.classList.remove("ql-reveal-ready", "ql-revealed"),
      );
    };
  }, []);

  return (
    <div className="qn-landing ql-home" ref={landingRef}>
      <PublicHeader />
      <div id="public-content" tabIndex={-1} className="ql-content">
        <section className="ql-hero ql-container" aria-labelledby="hero-title">
          <div className="ql-hero-copy">
            <EducationBackdrop />
            <p className="ql-eyebrow">
              <span aria-hidden="true" /> A little less paperwork.
            </p>
            <h1 id="hero-title">
              More teaching.
              <br />
              <span className="ql-typed-line"><span className="sr-only">Less busywork.</span><span className="ql-typed-visual" aria-hidden="true">Less busywork.</span></span>
            </h1>
            <p className="ql-lead">
              Create quizzes, scan paper exams, and keep every section’s scores
              in order. All in one simple workspace.
            </p>
            <div className="ql-hero-actions">
              <Link
                to="/login?mode=register"
                className="qn-button-primary ql-large-button"
              >
                Get started <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#features" className="ql-text-link">
                Explore QuizNa <span aria-hidden="true">↘</span>
              </a>
            </div>
            <p className="ql-audience">
              Made for teachers. Simple for students.
            </p>

          </div>
          <ExamPreview />
        </section>
        <section
          data-reveal
          className="ql-container ql-format-section"
          aria-labelledby="formats-heading"
        >
          <h2 id="formats-heading">One workspace. Two ways to assess.</h2>
          <ExamFormats />
          <MonitoringFeature />
        </section>
        <section
          data-reveal
          className="ql-features ql-container"
          id="features"
          aria-labelledby="features-title"
        >
          <div className="ql-section-heading">
            <p className="ql-eyebrow">LESS ADMIN. MORE CLARITY.</p>
            <h2 id="features-title">
              From your first question
              <br />
              to the final score.
            </h2>
            <p>The tools you need, without the clutter.</p>
          </div>
          <div className="ql-feature-grid">
            <article>
              <span className="ql-feature-icon">
                <FileCheck2 size={24} aria-hidden="true" />
              </span>
              <h3>Create your way</h3>
              <p>
                Paste your questions. Choose an online or paper exam. Reuse your
                sections for the next quiz.
              </p>
              <span className="ql-feature-note">
                One quiz. Your choice of format.
              </span>
            </article>
            <article>
              <span className="ql-feature-icon">
                <ScanLine size={24} aria-hidden="true" />
              </span>
              <h3>Check with confidence</h3>
              <p>
                Scan marked answer sheets with your camera. Review detected
                answers and confirm grades before saving.
              </p>
              <span className="ql-feature-note">
                You stay in control of every grade.
              </span>
            </article>
            <article>
              <span className="ql-feature-icon">
                <Table2 size={24} aria-hidden="true" />
              </span>
              <h3>Keep scores together</h3>
              <p>
                See who submitted, review results by section, and export an
                alphabetical gradebook in a few clicks.
              </p>
              <span className="ql-feature-note">
                Ready for your class record.
              </span>
            </article>
          </div>
        </section>
        <section
          data-reveal
          className="ql-cta ql-container"
          aria-labelledby="cta-title"
        >
          <div>
            <h2 id="cta-title">Your next quiz, made simpler.</h2>
            <p>A clearer workspace for you and your students.</p>
          </div>
          <Link
            to="/login?mode=register"
            className="qn-button-primary ql-large-button"
          >
            Create your account <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </div>
      <PublicFooter />
    </div>
  );
}
