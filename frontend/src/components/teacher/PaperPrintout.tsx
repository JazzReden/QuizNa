import type { PaperSheet } from "../../types";

export interface PaperPacket {
  sheet: PaperSheet;
  images: string[];
}

export function PaperPrintout({
  packets,
  kind,
}: {
  packets: PaperPacket[];
  kind: "questions" | "answers";
}) {
  return (
    <div className="paper-print">
      {packets.map(({ sheet, images }) =>
        kind === "answers" ? (
          images.map((src, i) => (
            <img
              className={`paper-answer-page${sheet.layout.paperSize === "long_bond" ? " long-bond" : ""}`}
              key={`${sheet.id}-${i}`}
              src={src}
              alt={`${sheet.layout.student} answer sheet page ${i + 1}`}
            />
          ))
        ) : (
          <section className="paper-question-copy" key={sheet.id}>
            <h1>{sheet.layout.title}</h1>
            <p>
              {sheet.layout.student} · {sheet.layout.section} ·{" "}
              {sheet.layout.timeLimit} minutes
            </p>
            <p className="whitespace-pre-wrap">{sheet.layout.instructions}</p>
            <p>Fill one bubble per answer on your separate answer sheet.</p>
            <ol>
              {sheet.layout.questions.map((q, i) => (
                <li key={q.id} className="paper-question list-none">
                  <strong>
                    {i + 1}. {q.prompt} ({q.points} pts)
                  </strong>
                  {q.options?.map((o, n) => (
                    <p key={o.id} className="ml-4">
                      {q.type === "true_false"
                        ? o.text
                        : `${String.fromCharCode(65 + n)}. ${o.text}`}
                    </p>
                  ))}
                </li>
              ))}
            </ol>
          </section>
        ),
      )}
    </div>
  );
}
