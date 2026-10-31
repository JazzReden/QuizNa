import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/auth-context";
import { api } from "../../api/client";
import type { PaperSheet, Quiz, QuizSection } from "../../types";
import type { ScanMark, QrLocation } from "../../utils/paper-scan";
import { answerSheetImages } from "../../utils/paper-print";
import { PaperCamera } from "../../components/teacher/PaperCamera";
import { PasteQuestionsDialog } from "../../components/teacher/PasteQuestionsDialog";
import {
  PaperPrintout,
  type PaperPacket,
} from "../../components/teacher/PaperPrintout";
import {
  announceResultsChange,
  useAutoRefresh,
} from "../../hooks/useAutoRefresh";

import { cropPng, type EssayCrop } from "../../utils/paper-essay-crops";
import {
  editTranscription,
  reviewedEssays,
  applyReviewedEssays,
  type EssayDraft,
  type ReviewedEssay,
} from "../../utils/essay-ai-review";
const PdfSheetUpload = lazy(() =>
  import("../../components/teacher/PdfSheetUpload").then((module) => ({
    default: module.PdfSheetUpload,
  })),
);
const EssayAiReview = lazy(() =>
  import("../../components/teacher/EssayAiReview").then((m) => ({
    default: m.EssayAiReview,
  })),
);

export function PaperExamPage() {
  const { user } = useAuth();
  const { quizId } = useParams<{ quizId: string }>();
  const [params] = useSearchParams();
  const requestedSheet = params.get("sheet");
  const requestedSection = params.get("section");
  const [quiz, setQuiz] = useState<Quiz | null>(null),
    [sections, setSections] = useState<QuizSection[]>([]);
  const [sheets, setSheets] = useState<
    {
      id: string;
      student: string;
      section: string;
      attempt_id: string | null;
      is_current_edition?: boolean;
    }[]
  >([]);
  const [aiAvailable, setAiAvailable] = useState(false),
    [useAi, setUseAi] = useState(false);
  const [aiDisclosure, setAiDisclosure] = useState(
    "Sends essay crops to the selected AI service. Review the text and scores before saving.",
  );
  const [essayDrafts, setEssayDrafts] = useState<Record<string, EssayDraft>>(
    {},
  );
  const [pendingGrades, setPendingGrades] = useState<ReviewedEssay[]>([]);
  useEffect(() => {
    let active = true;
    api
      .paperAiOptions()
      .then((options) => {
        if (active) {
          setAiAvailable(options.enabled);
          if (options.disclosure) setAiDisclosure(options.disclosure);
        }
      })
      .catch(() => {
        if (active) setAiAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const [section, setSection] = useState("");
  const [paperFormat, setPaperFormat] = useState<"a4" | "long_bond">(
    "long_bond",
  );
  const [showPaste, setShowPaste] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [sectionSheetIds, setSectionSheetIds] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<{ student: string; reason: string }[]>(
    [],
  );
  const [printPackets, setPrintPackets] = useState<PaperPacket[] | null>(null);
  const [printProgress, setPrintProgress] = useState("");
  const [sheet, setSheet] = useState<PaperSheet | null>(null),
    [images, setImages] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({}),
    [marks, setMarks] = useState<Record<string, ScanMark>>({});
  const [received, setReceived] = useState<number[]>([]),
    [reviewed, setReviewed] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [printKind, setPrintKind] = useState<"questions" | "answers">(
    "questions",
  );
  const [camera, setCamera] = useState(false),
    stream = useRef<MediaStream | null>(null),
    alive = useRef(true),
    operation = useRef(false),
    scanGeneration = useRef(0);
  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCamera(false);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const reload = async () => {
    if (!quizId) return;
    setSheets(await api.listPaperSheets(quizId));
  };
  useAutoRefresh(async () => {
    if (quiz?.exam_format === "paper" && !busy && !showPaste) {
      const [current, list] = await Promise.all([
        api.getTeacherQuiz(quizId!),
        api.listPaperSheets(quizId!),
      ]);
      setQuiz(current);
      setSheets(list);
    }
  });
  useEffect(() => {
    let active = true;
    scanGeneration.current++;
    setLoading(true);
    setBusy(Boolean(requestedSheet));
    setQuiz(null);
    setSheet(null);
    setImages([]);
    setSectionSheetIds([]);
    setSkipped([]);
    setPrintPackets(null);
    setError("");
    setNotice("");
    setShowPaste(false);
    stopCamera();
    Promise.all([
      api.getTeacherQuiz(quizId!),
      api.listSections(quizId!),
      api.listPaperSheets(quizId!),
    ])
      .then(async ([q, s, list]) => {
        if (!active) return;
        setQuiz(q);
        setSections(s);
        setSection(
          s.find(
            (group) =>
              group.id === requestedSection ||
              group.class_section_id === requestedSection,
          )?.id ||
            s[0]?.id ||
            "",
        );
        setSheets(list);
        if (requestedSheet) {
          if (!list.some((item) => item.id === requestedSheet))
            throw Error(
              "This prepared sheet is unavailable. Select a student below.",
            );
          const prepared = await api.getPaperSheet(requestedSheet);
          if (!active) return;
          await select(prepared);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setBusy(false);
        }
      });
    return () => {
      active = false;
      scanGeneration.current++;
    };
  }, [quizId, requestedSheet, requestedSection]);
  const select = async (s: PaperSheet, renderPrint = true) => {
    stopCamera();
    setPrintPackets(null);
    if (s.section_id !== section) {
      setSection(s.section_id);
      setSectionSheetIds([]);
      setSkipped([]);
    }
    setEssayDrafts({});
    setPendingGrades([]);
    setSheet(s);
    setImages([]);
    setValues({});
    setMarks({});
    setReceived([]);
    setReviewed(false);
    setNotice("");
    setDraftStatus("");
    if (!s.attempt_id) {
      try {
        const saved = JSON.parse(
          sessionStorage.getItem(`quizna-paper-review:${user?.id}:${s.id}`) ||
            "null",
        );
        if (
          saved &&
          saved.version === s.quiz_version_id &&
          Date.now() - saved.updatedAt < 86400000
        ) {
          const restored: Record<string, string> = {};
          for (const q of s.layout.questions)
            if (typeof saved.values?.[q.id] === "string")
              restored[q.id] = saved.values[q.id].slice(0, 50000);
          setValues(restored);
          setReceived(
            Array.isArray(saved.received)
              ? saved.received.filter((n: number) =>
                  s.layout.pages.some((p) => p.index === n),
                )
              : [],
          );
          setNotice("Your unfinished answer review has been restored.");
        }
      } catch {
        /* A blocked/full browser store never prevents scanning or saving. */
      }
    }
    if (s.attempt_id) {
      const saved = await api.getAttemptAnswers(s.attempt_id);
      setValues(
        Object.fromEntries(saved.map((a) => [a.question_id, a.answer ?? ""])),
      );
    }
    if (renderPrint) {
      const rendered = await answerSheetImages(s, 2);
      if (alive.current) setImages(rendered);
    }
  };
  useEffect(() => {
    if (!sheet || sheet.attempt_id || !user) return;
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(
          `quizna-paper-review:${user.id}:${sheet.id}`,
          JSON.stringify({
            version: sheet.quiz_version_id,
            values,
            received,
            updatedAt: Date.now(),
          }),
        );
        setDraftStatus("Review saved on this device.");
      } catch {
        setDraftStatus("Keep this page open until you save the result.");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [sheet, values, received, user]);
  const issue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await api.preparePaperSection(
        quizId!,
        section,
        paperFormat,
      );
      setSectionSheetIds(prepared.sheet_ids);
      setSkipped(prepared.skipped);
      setPrintPackets(null);
      await reload();
      announceResultsChange();
      if (prepared.sheet_ids[0])
        await select(await api.getPaperSheet(prepared.sheet_ids[0]));
      setNotice(
        `${prepared.sheet_ids.length} student sheets ready.${prepared.skipped.length ? ` ${prepared.skipped.length} skipped; see details below.` : ""}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to prepare sheets.");
    } finally {
      setBusy(false);
    }
  };
  const choose = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await select(await api.getPaperSheet(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load sheet.");
    } finally {
      setBusy(false);
    }
  };
  const publishChanges = async () => {
    if (busy || !quizId) return;
    stopCamera();
    setBusy(true);
    setError("");
    try {
      await api.publishQuiz(quizId);
      setQuiz(await api.getTeacherQuiz(quizId));
      await reload();
      setNotice(
        "Questions published. Already printed sheets keep their original questions.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to publish. Retry when connected.",
      );
    } finally {
      setBusy(false);
    }
  };
  const refreshQuestions = async () => {
    try {
      setQuiz(await api.getTeacherQuiz(quizId!));
    } catch {
      setError("Unable to refresh questions. Reload before preparing sheets.");
    }
  };
  const startCamera = async () => {
    if (busy || stream.current) return;
    setBusy(true);
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error(
          "Camera access needs HTTPS or localhost. You can upload a photo instead.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 2560 },
        },
        audio: false,
      });
      if (!alive.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setCamera(true);
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Camera permission is blocked. Allow camera access in your browser settings, or upload a photo."
          : e instanceof Error
            ? e.message
            : "Camera unavailable. Upload a photo instead.",
      );
    } finally {
      setBusy(false);
    }
  };
  const runWorker = (
    image: ImageData,
    page?: PaperSheet["layout"]["pages"][number],
    detectedQr?: { data: string; location: QrLocation },
  ) =>
    new Promise<{
      code: string;
      location: QrLocation;
      marks: ScanMark[] | null;
      crops: EssayCrop[];
      cropError?: string;
    }>((resolve, reject) => {
      const worker = new Worker(
        new URL("../../utils/paper-scan.worker.ts", import.meta.url),
        { type: "module" },
      );
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(
          Error("Photo processing timed out. Try a smaller, clearer photo."),
        );
      }, 15000);
      worker.onmessage = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        e.data.error ? reject(Error(e.data.error)) : resolve(e.data);
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
        reject(Error("Unable to read this photo."));
      };
      worker.postMessage({
        data: image.data,
        width: image.width,
        height: image.height,
        page,
        detectedQr,
        essayCrops: aiAvailable && useAi,
      });
    });
  const scan = async (source: CanvasImageSource, w: number, h: number) => {
    if (operation.current) return;
    operation.current = true;
    const generation = scanGeneration.current;
    setBusy(true);
    setError("");
    setNotice("Reading QR code…");
    try {
      if (!w || !h) throw Error("The camera is not ready yet.");
      const ratio = Math.min(1, 2200 / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const detected = await runWorker(image);
      const resolved = await api.resolvePaper(detected.code);
      if (!alive.current || generation !== scanGeneration.current) return;
      if (resolved.sheet.quiz_id !== quizId)
        throw Error(
          "This sheet belongs to another exam. Open that exam to scan it.",
        );
      if (resolved.sheet.attempt_id)
        throw Error(
          "This sheet is already saved. Open its result to review or grade it.",
        );
      if (
        sheet &&
        !sheet.attempt_id &&
        sheet.id !== resolved.sheet.id &&
        Object.values(values).some((value) => value.trim()) &&
        !window.confirm(
          "Switch to this student’s sheet? Unsaved review changes will be cleared.",
        )
      ) {
        setNotice("Scan cancelled.");
        return;
      }
      const changed = sheet?.id !== resolved.sheet.id;
      if (changed) await select(resolved.sheet, false);
      let found: ScanMark[] = [];
      let alignmentError = "";
      let crops: EssayCrop[] = [];
      let cropError = "";
      try {
        const result = await runWorker(
          image,
          resolved.sheet.layout.pages[resolved.page],
          { data: detected.code, location: detected.location },
        );
        found = result.marks || [];
        crops = result.crops || [];
        cropError = result.cropError || "";
      } catch (e) {
        alignmentError =
          e instanceof Error ? e.message : "Unable to align the page.";
      }
      if (!alive.current || generation !== scanGeneration.current) return;
      setValues((previous) => {
        const next = changed ? {} : { ...previous };
        for (const m of found)
          if (m.status !== "written") next[m.questionId] = m.answer || "";
        return next;
      });
      setMarks((previous) => ({
        ...(changed ? {} : previous),
        ...Object.fromEntries(found.map((m) => [m.questionId, m])),
      }));
      setReceived((previous) => [
        ...new Set([...(changed ? [] : previous), resolved.page]),
      ]);
      setReviewed(false);
      stopCamera();
      if (changed) {
        // Print preview rendering must not delay identifying the student or reading marks.
        void answerSheetImages(resolved.sheet, 2)
          .then((rendered) => {
            if (alive.current && generation === scanGeneration.current)
              setImages(rendered);
          })
          .catch(() => {
            if (alive.current && generation === scanGeneration.current)
              setError(
                "Answers read. Reselect the sheet if you need to load its print preview.",
              );
          });
      }
      setNotice(
        alignmentError
          ? `QR identified ${resolved.sheet.layout.student}. ${alignmentError} Retake or enter the answers below manually.`
          : `Page ${resolved.page + 1} read for ${resolved.sheet.layout.student}. Check every answer before saving.`,
      );
      if (cropError)
        setError(
          cropError + " Enter essays manually; bubble answers were kept.",
        );
      // A retake invalidates old suggestions for that page, even if recognition fails.
      const essayIds = resolved.sheet.layout.pages[resolved.page].rows
        .filter((row) => row.type === "essay")
        .map((row) => row.questionId);
      setEssayDrafts((previous) =>
        Object.fromEntries(
          Object.entries(changed ? {} : previous).filter(
            ([id]) => !essayIds.includes(id),
          ),
        ),
      );
      if (!alignmentError && aiAvailable && useAi && crops.length) {
        setNotice("Reading essays…");
        try {
          const prepared = await Promise.all(crops.map(cropPng));
          const result = await api.suggestPaperEssays(
            resolved.sheet.id,
            resolved.page,
            prepared.map((item) => item.blob),
          );
          if (!alive.current || generation !== scanGeneration.current) return;
          const drafts: Record<string, EssayDraft> = {};
          for (const essay of result.essays) {
            const index = crops.findIndex(
              (c) => c.questionId === essay.questionId,
            );
            if (index < 0)
              throw Error("Essay response does not match this page.");
            drafts[essay.questionId] = {
              ...essay,
              preview: prepared[index].preview,
              score:
                essay.suggestedScore === null
                  ? ""
                  : String(essay.suggestedScore),
              accepted: false,
              edited: false,
            };
          }
          setValues((previous) => ({
            ...previous,
            ...Object.fromEntries(
              result.essays.map((e) => [e.questionId, e.transcription]),
            ),
          }));
          setEssayDrafts((previous) => ({ ...previous, ...drafts }));
          setNotice(
            "Essays read. Check the text and select the scores to save.",
          );
        } catch (e) {
          if (!alive.current || generation !== scanGeneration.current) return;
          setNotice(
            "Bubble answers kept. Enter essays manually or retake the page.",
          );
          setError(
            e instanceof Error ? e.message : "Essay reading unavailable.",
          );
        }
      }
    } catch (e) {
      if (!alive.current || generation !== scanGeneration.current) return;
      setNotice("");
      setError(e instanceof Error ? e.message : "Unable to scan this sheet.");
    } finally {
      operation.current = false;
      if (generation === scanGeneration.current) setBusy(false);
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setError("");
    if (file.size > 20 * 1024 * 1024) {
      setError("Choose a photo smaller than 20 MB.");
      return;
    }
    let image: ImageBitmap | undefined;
    try {
      image = await createImageBitmap(file);
      await scan(image, image.width, image.height);
    } catch {
      setError(
        "This photo format cannot be opened. Use a JPG, PNG or WebP photo.",
      );
    } finally {
      image?.close();
    }
  };
  const changeAnswer = (questionId: string, answer: string) => {
    setValues((previous) => ({ ...previous, [questionId]: answer }));
    setEssayDrafts((previous) =>
      previous[questionId]
        ? {
            ...previous,
            [questionId]: editTranscription(previous[questionId], answer),
          }
        : previous,
    );
    setMarks((previous) => {
      const next = { ...previous };
      delete next[questionId];
      return next;
    });
    setReviewed(false);
  };
  const save = async () => {
    if (!sheet || !reviewed || busy) return;
    setBusy(true);
    setError("");
    try {
      const plans = reviewedEssays(essayDrafts, values);
      const attempt = await api.savePaper(
        sheet.id,
        sheet.layout.questions.map((q) => ({
          question_id: q.id,
          answer: values[q.id]?.trim() || null,
        })),
      );
      try {
        sessionStorage.removeItem(
          `quizna-paper-review:${user?.id}:${sheet.id}`,
        );
      } catch {
        /* Saving on the server already succeeded. */
      }
      setDraftStatus("");
      setSheet({ ...sheet, attempt_id: attempt.id });
      setNotice(
        attempt.is_graded
          ? `Saved: ${attempt.score}/${attempt.max_score}. ${quiz?.release_scores_immediately ? "Student score updated." : "Student score hidden until you release it."}`
          : "Result saved. Written answers are ready for grading.",
      );
      if (plans.length) {
        setPendingGrades(plans);
        try {
          const pending = await applyReviewedEssays(api, attempt.id, plans);
          setPendingGrades(pending);
          setNotice(
            pending.length
              ? "Answers saved. Some essay scores need review; retry or open the result."
              : "Answers and confirmed essay scores saved.",
          );
        } catch {
          setNotice(
            "Answers saved. Essay scores still need saving; retry below.",
          );
        }
      }
      await reload();
      announceResultsChange();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to save. Your review is still here; retry saving.",
      );
    } finally {
      setBusy(false);
    }
  };
  const retryEssayGrades = async () => {
    if (!sheet?.attempt_id || busy || !pendingGrades.length) return;
    setBusy(true);
    setError("");
    try {
      const pending = await applyReviewedEssays(
        api,
        sheet.attempt_id,
        pendingGrades,
      );
      setPendingGrades(pending);
      setNotice(
        pending.length
          ? "Some scores changed or could not save. Open the result to review."
          : "Confirmed essay scores saved.",
      );
      announceResultsChange();
    } catch {
      setError("Could not save essay scores. Retry when connected.");
    } finally {
      setBusy(false);
    }
  };
  const print = async (kind: "questions" | "answers") => {
    setPrintPackets(null);
    setPrintKind(kind);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      await Promise.all(
        Array.from(
          document.querySelectorAll<HTMLImageElement>(".paper-print img"),
        ).map((img) => img.decode()),
      );
      if (!alive.current) return;
      window.print();
    } catch {
      setError("A print image could not load. Please retry printing.");
    }
  };
  const printSection = async (kind: "questions" | "answers") => {
    if (busy || !sectionSheetIds.length) return;
    stopCamera();
    setBusy(true);
    setError("");
    try {
      const packets: PaperPacket[] = [];
      for (const [index, id] of sectionSheetIds.entries()) {
        setPrintProgress(
          `Preparing printouts ${index + 1}/${sectionSheetIds.length}…`,
        );
        const s = await api.getPaperSheet(id);
        if (s.attempt_id) continue;
        packets.push({
          sheet: s,
          images: kind === "answers" ? await answerSheetImages(s, 2) : [],
        });
      }
      if (!packets.length)
        throw Error(
          "These results are already saved. No pending sheets to print.",
        );
      if (!alive.current) return;
      setPrintKind(kind);
      setPrintPackets(packets);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      await Promise.all(
        Array.from(
          document.querySelectorAll<HTMLImageElement>(".paper-print img"),
        ).map((img) => img.decode()),
      );
      if (!alive.current) return;
      window.print();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to prepare printouts. Retry printing.",
      );
    } finally {
      setPrintProgress("");
      setBusy(false);
    }
  };
  return (
    <div className="paper-exam-root qn-page qn-page-narrow">
      <style>{` .paper-print{display:none} @media print{@page{size:A4;margin:10mm}@page quizna-long{size:8.5in 13in;margin:10mm} header,.paper-workspace{display:none!important}.paper-exam-root{padding:0!important;margin:0!important;max-width:none!important} .paper-print{display:block!important;color:#000;background:#fff} main,body,#root{background:#fff!important} .paper-answer-page{width:190mm;height:268.66mm;display:block;break-after:page;object-fit:contain} .paper-answer-page.long-bond{page:quizna-long;width:195.9mm;height:299.53mm}.paper-answer-page:last-child{break-after:auto} .paper-question-copy{break-after:page}.paper-question-copy:last-child{break-after:auto}.paper-question{break-inside:avoid;margin:0 0 3mm}.paper-print h1{font-size:18pt}.paper-print p,.paper-print li{font-size:10.5pt;line-height:1.2}} `}</style>
      <div className="paper-workspace qn-authoring qn-paper-workspace space-y-5">
        <div className="qn-page-heading">
          <div>
            <h1 className="qn-title">Paper Exam</h1>
            <p className="text-sm text-slate-500 mt-1">
              {quiz?.title || "Print, scan and review."}
            </p>
            {quiz && (
              <p className="text-xs text-slate-500 mt-1">
                {sheets.filter((s) => s.attempt_id).length}{" "}
                {sheets.filter((s) => s.attempt_id).length === 1
                  ? "result"
                  : "results"}{" "}
                saved ·{" "}
                {quiz.release_scores_immediately
                  ? "Student scores visible"
                  : "Student scores held for release"}
              </p>
            )}
          </div>
          <div className="qn-heading-actions text-sm font-semibold text-indigo-700">
            {quiz?.exam_format === "paper" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  stopCamera();
                  setShowPaste(true);
                }}
                className="qn-button-secondary"
              >
                Paste questions
              </button>
            )}
            <Link to={`/teacher/edit/${quizId}`}>Edit exam</Link>
            <Link to="/teacher">All exams</Link>
          </div>
        </div>
        {loading && <p role="status">Loading paper exam…</p>}
        {error && (
          <p role="alert" className="p-4 rounded-xl bg-rose-50 text-rose-800">
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="p-4 rounded-xl bg-indigo-50 text-indigo-900"
          >
            {notice}
          </p>
        )}
        {quiz?.exam_format === "paper" && (
          <>
            <div className="flex flex-wrap gap-3 items-center rounded-xl border bg-white p-4 text-sm">
              <strong>{quiz.questions?.length || 0} questions</strong>
              {quiz.status !== "published" ||
              quiz.paper_has_unpublished_changes ? (
                <>
                  <span className="text-amber-800">
                    Publish your questions before preparing papers.
                  </span>
                  <button
                    type="button"
                    disabled={busy || !quiz.questions?.length}
                    onClick={() => void publishChanges()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
                  >
                    {busy ? "Please wait…" : "Publish questions"}
                  </button>
                </>
              ) : (
                <span className="text-emerald-700">Ready to print</span>
              )}
            </div>
            {sheets.some(
              (s) => !s.attempt_id && s.is_current_edition === false,
            ) && (
              <p
                role="status"
                className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              >
                Some prepared sheets use earlier questions. Print their matching
                question papers.
              </p>
            )}
            <form
              onSubmit={issue}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap gap-4 items-end"
            >
              <label className="flex-1 min-w-48 text-sm font-medium">
                Section
                <select
                  value={section}
                  disabled={busy}
                  onChange={(e) => {
                    setSection(e.target.value);
                    setSectionSheetIds([]);
                    setSkipped([]);
                    setPrintPackets(null);
                  }}
                  required
                  className="block w-full mt-1 border rounded-lg p-2.5 bg-white"
                >
                  <option value="">Select section</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                New sheet size
                <select
                  aria-label="New sheet size"
                  value={paperFormat}
                  disabled={busy}
                  onChange={(event) =>
                    setPaperFormat(event.target.value as "a4" | "long_bond")
                  }
                  className="block w-full mt-1 border rounded-lg p-2.5 bg-white"
                >
                  <option value="long_bond">Long bond · 8.5 × 13 in</option>
                  <option value="a4">A4 · separate essay pages</option>
                </select>
              </label>
              <button
                disabled={
                  busy ||
                  quiz.status !== "published" ||
                  !!quiz.paper_has_unpublished_changes
                }
                className="bg-indigo-600 text-white rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Please wait…" : "Prepare section"}
              </button>
            </form>
            {skipped.length > 0 && (
              <details className="rounded-xl bg-slate-50 border p-4 text-sm">
                <summary className="cursor-pointer font-semibold">
                  Skipped students ({skipped.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {skipped.map((s, i) => (
                    <li key={i}>
                      {s.student} — {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {sectionSheetIds.length > 0 && (
              <div className="flex flex-wrap gap-3 items-center rounded-xl bg-white border p-4">
                <span className="text-sm font-semibold">
                  Section printouts · {sectionSheetIds.length} students
                </span>
                <button
                  onClick={() => void printSection("questions")}
                  disabled={busy}
                  className="text-sm rounded-lg border px-4 py-2 disabled:opacity-50"
                >
                  Print question papers
                </button>
                <button
                  onClick={() => void printSection("answers")}
                  disabled={busy}
                  className="text-sm rounded-lg bg-indigo-600 text-white px-4 py-2 disabled:opacity-50"
                >
                  Print QR answer sheets
                </button>
              </div>
            )}
            {printProgress && (
              <p role="status" className="text-sm text-slate-600">
                {printProgress}
              </p>
            )}
            <div className="flex flex-wrap gap-3 items-center">
              <label className="text-sm font-medium flex-1 min-w-48">
                Prepared sheets
                <select
                  aria-label="Prepared answer sheet"
                  disabled={busy}
                  value={sheet?.id || ""}
                  onChange={(e) => {
                    if (e.target.value) void choose(e.target.value);
                  }}
                  className="block w-full bg-white border rounded-lg p-2.5 mt-1"
                >
                  <option value="">Select a student</option>
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.student} · {s.section} ·{" "}
                      {s.attempt_id ? "Saved" : "Ready"}
                      {!s.attempt_id && s.is_current_edition === false
                        ? " · Earlier paper"
                        : ""}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Existing sheets keep their original layout.
                </span>
              </label>
              <button
                type="button"
                onClick={() => void startCamera()}
                disabled={busy || camera}
                className="rounded-lg border border-indigo-200 text-indigo-700 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                Use camera
              </button>
              <label className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold cursor-pointer">
                Upload sheet photo
                <input
                  aria-label="Upload answer sheet photo"
                  disabled={busy || camera}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  className="sr-only"
                />
              </label>
              <label className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold cursor-pointer">
                Upload PDF
                <input
                  aria-label="Upload answer sheet PDF"
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={busy || camera}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (file.size > 20 * 1024 * 1024) {
                      setError("Choose a PDF smaller than 20 MB.");
                      return;
                    }
                    setError("");
                    setPdfFile(file);
                  }}
                />
              </label>
            </div>
            {pdfFile && (
              <Suspense fallback={<p role="status">Opening PDF…</p>}>
                <PdfSheetUpload
                  file={pdfFile}
                  disabled={busy || camera}
                  onScan={scan}
                  onClose={() => setPdfFile(null)}
                />
              </Suspense>
            )}
            {(!sheet || !sheet.attempt_id) && (
              <div className="rounded-xl border bg-white p-4 text-sm space-y-1">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={useAi}
                    disabled={!aiAvailable || busy}
                    onChange={(e) => setUseAi(e.target.checked)}
                  />
                  Read essays with AI
                </label>
                <p className="text-xs text-slate-500">
                  {aiAvailable
                    ? aiDisclosure
                    : "Essay reading is not enabled. You can enter written answers manually."}
                </p>
              </div>
            )}
            {camera && stream.current && (
              <PaperCamera
                stream={stream.current}
                busy={busy}
                error={error}
                onClose={stopCamera}
                pageAspect={
                  sheet?.layout.paperSize === "long_bond"
                    ? "1000 / 1529"
                    : undefined
                }
                progress={
                  sheet && !sheet.attempt_id
                    ? `${received.length} / ${sheet.layout.pages.length} pages scanned`
                    : undefined
                }
                onCapture={(video) =>
                  void scan(video, video.videoWidth, video.videoHeight)
                }
                onUpload={(file) => void upload(file)}
              />
            )}
            {sheet && (
              <section className="space-y-4">
                <div className="bg-white border rounded-xl p-5 flex flex-wrap gap-3 justify-between items-center">
                  <div>
                    <h2 className="font-bold">{sheet.layout.student}</h2>
                    <p className="text-sm text-slate-500">
                      {sheet.layout.section} · {sheet.layout.pages.length}{" "}
                      {sheet.layout.pages.length === 1 ? "page" : "pages"} ·{" "}
                      {sheet.layout.paperSize === "long_bond"
                        ? "Long bond"
                        : "A4"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {sheet.layout.subject ||
                        quiz?.subject ||
                        "Subject not set"}{" "}
                      · {sheet.layout.title}
                    </p>
                  </div>
                  <div className="qn-print-actions flex flex-wrap gap-3">
                    <button
                      disabled={
                        busy || images.length !== sheet.layout.pages.length
                      }
                      onClick={() => print("questions")}
                      className="text-sm font-semibold text-indigo-700 disabled:opacity-50"
                    >
                      Print question paper
                    </button>
                    <button
                      disabled={
                        busy || images.length !== sheet.layout.pages.length
                      }
                      onClick={() => print("answers")}
                      className="text-sm font-semibold text-indigo-700 disabled:opacity-50"
                    >
                      Print answer sheet
                    </button>
                  </div>
                </div>
                {images.length > 0 && (
                  <details className="rounded-xl border bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-indigo-700">
                      Preview answer sheet
                    </summary>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {images.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt={`Printable answer sheet page ${i + 1}`}
                          className="w-full border"
                        />
                      ))}
                    </div>
                  </details>
                )}
                {draftStatus && (
                  <p role="status" className="text-xs text-slate-500">
                    {draftStatus}
                  </p>
                )}
                {!sheet.attempt_id && (
                  <section
                    aria-label="Scan progress"
                    className="rounded-xl border bg-white p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p role="status" className="text-sm font-semibold">
                        {received.length} / {sheet.layout.pages.length} pages
                        scanned
                      </p>
                      <button
                        type="button"
                        disabled={busy || camera}
                        onClick={() => void startCamera()}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {received.length === 0
                          ? "Scan pages"
                          : received.length < sheet.layout.pages.length
                            ? "Scan next page"
                            : "Retake page"}
                      </button>
                    </div>
                    <div
                      className="flex flex-wrap gap-2"
                      aria-label="Answer pages"
                    >
                      {sheet.layout.pages.map((page) => (
                        <span
                          key={page.index}
                          className={`rounded-lg px-3 py-2 text-xs font-semibold ${received.includes(page.index) ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                        >
                          Page {page.index + 1} ·{" "}
                          {received.includes(page.index)
                            ? "Scanned"
                            : "Not scanned"}
                        </span>
                      ))}
                    </div>
                    {sheet.layout.questions.some(
                      (q) => q.type === "essay" || q.type === "short_answer",
                    ) && (
                      <p className="text-xs text-slate-500">
                        {aiAvailable && useAi
                          ? "Essay drafts appear below after scanning."
                          : "Enter written answers below, then grade after saving."}
                      </p>
                    )}
                  </section>
                )}
                {Object.keys(essayDrafts).length > 0 && (
                  <Suspense
                    fallback={<p role="status">Loading essay review…</p>}
                  >
                    {sheet.layout.questions.map(
                      (q, i) =>
                        essayDrafts[q.id] && (
                          <EssayAiReview
                            key={q.id}
                            draft={essayDrafts[q.id]}
                            number={i + 1}
                            disabled={busy || !!sheet.attempt_id}
                            onText={(text) => changeAnswer(q.id, text)}
                            onChange={(draft) => {
                              setEssayDrafts((previous) => ({
                                ...previous,
                                [q.id]: draft,
                              }));
                              setReviewed(false);
                            }}
                          />
                        ),
                    )}
                  </Suspense>
                )}
                <details className="rounded-xl border bg-white p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-indigo-700">
                    Answer overview ({sheet.layout.questions.length})
                  </summary>
                  <div
                    aria-label="Read answers"
                    className="mt-3 flex flex-wrap gap-2"
                  >
                    {sheet.layout.questions.map((q, i) => {
                      const choice = q.options?.findIndex(
                        (o) => o.id === values[q.id],
                      );
                      const label =
                        choice !== undefined && choice >= 0
                          ? q.type === "true_false"
                            ? q.options![choice].text
                            : String.fromCharCode(65 + choice)
                          : values[q.id]
                            ? "Written"
                            : "Blank";
                      const needsCheck = ["uncertain", "multiple"].includes(
                        marks[q.id]?.status,
                      );
                      return (
                        <span
                          key={q.id}
                          className={`rounded-lg px-3 py-2 text-sm font-semibold ${needsCheck ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700"}`}
                        >
                          Q{i + 1}: {needsCheck ? "Check" : label}
                        </span>
                      );
                    })}
                  </div>
                </details>
                {sheet.layout.questions.some((q) => !essayDrafts[q.id]) && (
                  <details className="rounded-xl border bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-indigo-700">
                      Review or correct answers
                    </summary>
                    <div className="space-y-3 mt-4">
                      {sheet.layout.questions.map(
                        (q, i) =>
                          !essayDrafts[q.id] && (
                            <div
                              key={q.id}
                              className="rounded-xl border bg-white p-4"
                            >
                              <label
                                className="block font-medium text-sm"
                                htmlFor={`paper-answer-${q.id}`}
                              >
                                Q{i + 1}. {q.prompt}
                              </label>
                              {q.options?.length ? (
                                <select
                                  id={`paper-answer-${q.id}`}
                                  disabled={!!sheet.attempt_id || busy}
                                  value={values[q.id] || ""}
                                  onChange={(e) => {
                                    changeAnswer(q.id, e.target.value);
                                  }}
                                  className="mt-2 border rounded-lg p-2.5 w-full bg-white"
                                >
                                  <option value="">No answer</option>
                                  {q.options.map((o, n) => (
                                    <option value={o.id} key={o.id}>
                                      {q.type === "true_false"
                                        ? o.text
                                        : `${String.fromCharCode(65 + n)}. ${o.text}`}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <textarea
                                  id={`paper-answer-${q.id}`}
                                  disabled={!!sheet.attempt_id || busy}
                                  rows={q.type === "essay" ? 4 : 2}
                                  maxLength={50000}
                                  value={values[q.id] || ""}
                                  onChange={(e) => {
                                    changeAnswer(q.id, e.target.value);
                                  }}
                                  className="mt-2 border rounded-lg p-2.5 w-full"
                                  placeholder="Transcribe the written answer"
                                />
                              )}
                              {marks[q.id] && (
                                <span
                                  className={`inline-block mt-2 text-xs font-semibold ${["uncertain", "multiple"].includes(marks[q.id].status) ? "text-amber-800" : "text-slate-500"}`}
                                >
                                  {
                                    {
                                      marked: "Detected",
                                      blank: "No answer",
                                      uncertain: "Unclear mark",
                                      multiple: "Multiple marks — choose one",
                                      written: "Enter written response",
                                    }[marks[q.id].status]
                                  }
                                </span>
                              )}
                            </div>
                          ),
                      )}
                    </div>
                  </details>
                )}
                {sheet.attempt_id ? (
                  <div className="flex flex-wrap gap-3 items-center">
                    <button
                      onClick={() => void startCamera()}
                      disabled={busy || camera}
                      className="rounded-lg bg-indigo-600 text-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
                    >
                      Scan next sheet
                    </button>
                    {pendingGrades.length > 0 && (
                      <button
                        disabled={busy}
                        onClick={() => void retryEssayGrades()}
                        className="rounded-lg border px-4 py-3 text-sm font-semibold"
                      >
                        Retry essay scores ({pendingGrades.length})
                      </button>
                    )}
                    <Link
                      className="inline-block rounded-lg bg-indigo-600 text-white px-4 py-3 text-sm font-semibold"
                      to={`/teacher/grading/${quizId}?attempt=${sheet.attempt_id}`}
                    >
                      Review result & grade essays
                    </Link>
                    {sections.find((s) => s.id === sheet.section_id)
                      ?.class_section_id && (
                      <Link
                        className="text-sm font-semibold text-indigo-700"
                        to={`/teacher/gradebook?section=${sections.find((s) => s.id === sheet.section_id)!.class_section_id}`}
                      >
                        View gradebook
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-white border rounded-xl p-5">
                    <label className="text-sm flex gap-2 items-center">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        onChange={(e) => setReviewed(e.target.checked)}
                      />
                      I reviewed the answers and selected essay scores.
                    </label>
                    <button
                      disabled={!reviewed || busy}
                      onClick={() => void save()}
                      className="rounded-lg bg-indigo-600 text-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
                    >
                      Grade & save
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {showPaste && quizId && quiz?.exam_format === "paper" && (
        <PasteQuestionsDialog
          quizId={quizId}
          onClose={() => {
            setShowPaste(false);
            void refreshQuestions();
          }}
          onAdded={(added) => {
            setShowPaste(false);
            setQuiz((current) =>
              current
                ? { ...current, paper_has_unpublished_changes: true }
                : current,
            );
            setNotice(
              `${added.length} ${added.length === 1 ? "question" : "questions"} added. Publish questions before printing new papers.`,
            );
            void refreshQuestions();
          }}
        />
      )}
      <PaperPrintout
        packets={printPackets || (sheet ? [{ sheet, images }] : [])}
        kind={printKind}
      />
    </div>
  );
}
