import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, X } from "lucide-react";
import { Dialog } from "../common/Dialog";
import { api } from "../../api/client";
import type { SubjectRoom } from "../../types";

export function CopyQuizButton({
  quizId,
  title,
  sectionId,
}: {
  quizId: string;
  title: string;
  sectionId: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false),
    [rooms, setRooms] = useState<SubjectRoom[]>([]);
  const [target, setTarget] = useState(""),
    [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const request = useRef("");
  const close = () => {
    if (!busy) setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className="qn-button-secondary"
        aria-label={`Copy ${title} to another section`}
        onClick={async () => {
          setOpen(true);
          setLoading(true);
          setError("");
          setTarget("");
          request.current = crypto.randomUUID();
          try {
            setRooms(
              (await api.listSubjects()).filter(
                (r) => r.class_section_id !== sectionId,
              ),
            );
          } catch {
            setError("Unable to load your subjects. Close and try again.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <Copy size={15} aria-hidden="true" />
        Copy
      </button>
      {open && (
        <div className="qn-copy-overlay">
          <Dialog
            label="Copy quiz to another section"
            className="qn-copy-dialog"
            onClose={close}
          >
            <header>
              <h2>Copy to another section</h2>
              <button
                type="button"
                className="qn-button-quiet"
                aria-label="Close copy quiz"
                disabled={busy}
                onClick={close}
              >
                <X size={20} />
              </button>
            </header>
            <p className="qn-copy-title">{title}</p>
            {error && (
              <p role="alert" className="qn-alert qn-alert-error">
                {error}
              </p>
            )}
            {loading ? (
              <p role="status">Loading subjects…</p>
            ) : (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!target || busy) return;
                  setBusy(true);
                  setError("");
                  try {
                    const copied = await api.copyQuiz(
                      quizId,
                      target,
                      request.current,
                    );
                    navigate(
                      `/teacher/edit/${copied.id}?subjectRoom=${target}`,
                    );
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Unable to copy. Try again.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label htmlFor={`copy-target-${quizId}`}>
                  Destination subject and section
                </label>
                <select
                  id={`copy-target-${quizId}`}
                  required
                  disabled={busy}
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    request.current = crypto.randomUUID();
                  }}
                >
                  <option value="">Choose a destination</option>
                  {rooms
                    .slice()
                    .sort((a, b) =>
                      `${a.section_name} ${a.name}`.localeCompare(
                        `${b.section_name} ${b.name}`,
                      ),
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.section_name} · {r.name}
                      </option>
                    ))}
                </select>
                {!rooms.length && (
                  <p>Create a subject in another section first.</p>
                )}
                <p className="qn-description">
                  Questions and criteria are copied into a draft. Review dates
                  and publish to share its new code.
                </p>
                <footer>
                  <button
                    type="button"
                    className="qn-button-secondary"
                    disabled={busy}
                    onClick={close}
                  >
                    Cancel
                  </button>
                  <button
                    className="qn-button-primary"
                    disabled={busy || !target}
                  >
                    {busy ? "Copying…" : "Copy quiz"}
                  </button>
                </footer>
              </form>
            )}
          </Dialog>
        </div>
      )}
    </>
  );
}
