import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength = 1,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  minLength?: number;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="qa-field">
      <label htmlFor={id}>{label}</label>
      <div className="qa-password-wrap">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          maxLength={128}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          className="qa-password-toggle"
          onClick={() => setVisible(!visible)}
        >
          {visible ? (
            <EyeOff size={19} aria-hidden="true" />
          ) : (
            <Eye size={19} aria-hidden="true" />
          )}
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="qa-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
