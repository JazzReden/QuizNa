import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";

const ImportDialog = lazy(() =>
  import("./BulkQuestionImport").then((module) => ({
    default: module.BulkQuestionImport,
  })),
);

export function PasteQuestionsDialog(
  props: ComponentProps<typeof ImportDialog>,
) {
  return (
    <Suspense
      fallback={
        <p
          role="status"
          className="fixed inset-0 z-50 grid place-content-center bg-slate-900/50 text-white"
        >
          Opening paste questions…
        </p>
      }
    >
      <ImportDialog {...props} />
    </Suspense>
  );
}
