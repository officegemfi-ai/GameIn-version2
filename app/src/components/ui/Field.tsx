import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
}

function useFieldIds(id?: string) {
  const auto = useId();
  const inputId = id ?? auto;
  return { inputId, hintId: `${inputId}-hint`, errorId: `${inputId}-error` };
}

function describedBy(hint: ReactNode, error: string | null | undefined, hintId: string, errorId: string) {
  return [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
}

function Shell({ label, hint, error, inputId, hintId, errorId, children }: FieldProps & { inputId: string; hintId: string; errorId: string; children: ReactNode }) {
  return (
    <div className="g-field">
      <label className="g-field__label" htmlFor={inputId}>
        {label}
      </label>
      {children}
      {hint ? <span id={hintId} className="g-field__hint">{hint}</span> : null}
      {error ? <span id={errorId} className="g-field__error" role="alert">{error}</span> : null}
    </div>
  );
}

export function TextField({ label, hint, error, prefix, id, ...input }: FieldProps & { prefix?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const ids = useFieldIds(id);
  const control = (
    <input
      id={ids.inputId}
      className="g-input"
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(hint, error, ids.hintId, ids.errorId)}
      {...input}
    />
  );
  return (
    <Shell label={label} hint={hint} error={error} {...ids}>
      {prefix ? (
        <div className="g-prefix">
          <span aria-hidden="true">{prefix}</span>
          {control}
        </div>
      ) : (
        control
      )}
    </Shell>
  );
}

export function TextAreaField({ label, hint, error, id, ...area }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ids = useFieldIds(id);
  return (
    <Shell label={label} hint={hint} error={error} {...ids}>
      <textarea
        id={ids.inputId}
        className="g-textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, ids.hintId, ids.errorId)}
        {...area}
      />
    </Shell>
  );
}

export function SelectField({ label, hint, error, id, children, ...select }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const ids = useFieldIds(id);
  return (
    <Shell label={label} hint={hint} error={error} {...ids}>
      <select id={ids.inputId} className="g-select" aria-describedby={describedBy(hint, error, ids.hintId, ids.errorId)} {...select}>
        {children}
      </select>
    </Shell>
  );
}

/** A small set of choices shown side by side (role="radiogroup"). */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="g-segment" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
