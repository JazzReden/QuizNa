import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import type { QuizSection } from "../../types";

export function QuizSharePanel({
  quizCode,
  sections,
}: {
  quizCode: string;
  sections: QuizSection[];
}) {
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const codes = sections.length
    ? [...sections]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((section) => ({
          id: section.id,
          name: section.name,
          code: section.access_code,
        }))
    : quizCode
      ? [{ id: "quiz", name: "Quiz code", code: quizCode }]
      : [];
  if (!codes.length) return null;
  const copy = async (id: string, code: string) => {
    setError("");
    setCopied("");
    try {
      await navigator.clipboard.writeText(code);
      setCopied(`${id}:${code}`);
    } catch {
      setError("Unable to copy. Select the code and copy it manually.");
    }
  };
  return (
    <section className="qn-quiz-share" aria-label="Quiz share codes">
      <div className="qn-quiz-share-heading">
        <Share2 size={21} aria-hidden="true" />
        <div>
          <h2>Quiz published</h2>
          <p>
            {sections.length
              ? "Share each code with its section."
              : "Share this code with your students."}
          </p>
        </div>
      </div>
      <div className="qn-quiz-share-grid">
        {codes.map((item) => (
          <div className="qn-quiz-share-code" key={`${item.id}:${item.code}`}>
            <div>
              <span>{item.name}</span>
              <code>{item.code}</code>
            </div>
            <button
              type="button"
              className="qn-button-primary"
              onClick={() => void copy(item.id, item.code)}
              aria-label={`Copy code for ${item.name}`}
            >
              {copied === `${item.id}:${item.code}` ? (
                <Check size={17} aria-hidden="true" />
              ) : (
                <Copy size={17} aria-hidden="true" />
              )}
              {copied === `${item.id}:${item.code}` ? "Copied" : "Copy code"}
            </button>
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">
        {copied ? "Code copied." : ""}
      </span>
      {error && (
        <p className="qn-quiz-share-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
