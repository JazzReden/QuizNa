import { createHash } from "node:crypto";
import { Question, QuizVersion } from "../../common/types";
import { PaperSheet, PaperPage } from "./paper.types";
// Layout is frozen with the sheet. Camera coordinates and option labels always use this edition.
export function paperLayout(
  version: QuizVersion,
  seed: string,
  student: string,
  section: string,
  paperFormat: "a4" | "long_bond" = "a4",
): PaperSheet["layout"] {
  const randomOrder = <T>(items: T[], key: (v: T) => string) =>
    items.slice().sort((a, b) =>
      createHash("sha256")
        .update(seed + key(a))
        .digest("hex")
        .localeCompare(
          createHash("sha256")
            .update(seed + key(b))
            .digest("hex"),
        ),
    );
  const snapshot = version.snapshot_data;
  const source = snapshot.randomize_questions
    ? randomOrder(snapshot.questions, (q) => q.id)
    : snapshot.questions;
  const questions = source.map((q: Question) => ({
    id: q.id,
    quiz_id: q.quiz_id,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    order_index: q.order_index,
    options: (q.type !== "mcq" && q.type !== "true_false"
      ? undefined
      : snapshot.randomize_options && q.type === "mcq"
        ? randomOrder(q.options || [], (o) => q.id + o.id)
        : q.options
    )?.map((o) => ({ id: o.id, text: o.text })),
  }));
  const pages: PaperPage[] = [];
  const numbered = questions.map((question, index) => ({ question, number: index + 1 }));
  const objective = numbered.filter(({ question }) => question.type === "mcq" || question.type === "true_false");
  const written = numbered.filter(({ question }) => question.type !== "mcq" && question.type !== "true_false");
  // Twenty rows per column keep 4.5 mm bubbles readable on A4.
  // Wider option sets receive fewer columns rather than smaller bubbles.
  const maxOptions = Math.max(0, ...objective.map(({ question }) => question.options?.length || 0));
  // A long-bond form keeps up to 60 objective items beside short written
  // responses. Overflow uses additional pages; never shrink bubbles to fit.
  if (paperFormat === "long_bond" && objective.length > 0 && maxOptions <= 4 && objective.length <= 60 && written.reduce((sum, {question}) => sum + (question.type === "essay" ? 200 : 100), 0) <= 1000) {
    const rows: PaperPage["rows"] = [];
    for (let column = 0; column < 2; column++) {
      let y = 335, labels = "";
      objective.slice(column * 30, column * 30 + 30).forEach(({question: q, number}) => {
        const options = (q.options || []).map((option, index) => ({ id: option.id, label: q.type === "true_false" ? option.text : String.fromCharCode(65 + index), x: 130 + column * 270 + index * 40 }));
        const signature = options.map(option => option.label).join("|");
        const changed = labels !== signature;
        if (labels && changed) y += 24;
        rows.push({questionId:q.id, number, type:q.type, x:80 + column * 270, y, height:34, showOptionLabels:changed, options});
        labels = signature; y += 34;
      });
    }
    let y = 350;
    written.forEach(({question:q,number}) => {
      const height = q.type === "essay" ? 200 : 100;
      rows.push({questionId:q.id, number, type:q.type, x:650, width:270, y, height, options:[]});
      y += height;
    });
    if (rows.every(row => row.y + row.height <= 1390)) {
      return {revision:3,paperSize:"long_bond",title:snapshot.title,instructions:snapshot.instructions || "",timeLimit:snapshot.time_limit_minutes,student,section,questions,pages:[{index:0,width:1000,height:1529,rows}]};
    }
  }
  const columns = maxOptions <= 4 ? 3 : maxOptions <= 6 ? 2 : 1;
  const perPage = columns * 20;
  for (let start = 0; start < objective.length; start += perPage) {
    const page: PaperPage = { index: pages.length, rows: [] };
    objective.slice(start, start + perPage).forEach(({ question: q, number }, index) => {
      const column = Math.floor(index / 20);
      const x = 80 + column * (900 / columns);
      page.rows.push({
        questionId: q.id, number, type: q.type, x,
        y: 350 + (index % 20) * 44, height: 44,
        options: (q.options || []).map((option, n) => ({
          id: option.id,
          label: q.type === "true_false" ? option.text : String.fromCharCode(65 + n),
          x: x + 65 + n * (columns === 1 ? 72 : 44),
        })),
      });
    });
    pages.push(page);
  }
  let writtenPage: PaperPage | undefined;
  let y = 330;
  for (const { question: q, number } of written) {
    const height = q.type === "essay" ? 310 : 130;
    if (!writtenPage || y + height > 1270) {
      writtenPage = { index: pages.length, rows: [] };
      pages.push(writtenPage);
      y = 330;
    }
    writtenPage.rows.push({ questionId: q.id, number, type: q.type, x: 80, y, height, options: [] });
    y += height;
  }
  if (!pages.length) pages.push({ index: 0, rows: [] });
  return {
    revision: paperFormat === "long_bond" ? 3 : 2,
    paperSize: paperFormat,
    title: snapshot.title,
    instructions: snapshot.instructions || "",
    timeLimit: snapshot.time_limit_minutes,
    student,
    section,
    questions,
    pages: paperFormat === "long_bond" ? pages.map(page => ({...page,width:1000,height:1529})) : pages,
  };
}
