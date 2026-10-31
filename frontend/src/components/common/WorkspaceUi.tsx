import type { ReactNode } from "react";
export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`qn-brand-mark ${small ? "qn-brand-mark-small" : ""}`}
      aria-hidden="true"
    >
      <img src="/quizna-campus.png" alt="" width="52" height="52" />
    </span>
  );
}
export function PageHeading({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="qn-page-heading">
      <div>
        {eyebrow && <p className="qn-eyebrow">{eyebrow}</p>}
        <h1 className="qn-title">{title}</h1>
        {description && <p className="qn-description">{description}</p>}
      </div>
      {actions && <div className="qn-heading-actions">{actions}</div>}
    </div>
  );
}
export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning";
  children: ReactNode;
}) {
  return (
    <span className={`qn-badge qn-badge-${tone}`}>
      <span className="qn-status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="qn-empty">
      {icon && (
        <span className="qn-empty-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
