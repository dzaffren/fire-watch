import { useId, useState } from "react";

export const MAX_DAYS = 31;

const DAY_MS = 86_400_000;

export const daysIn = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;

/** The date `days` before `iso`, as YYYY-MM-DD. */
export const daysBefore = (iso: string, days: number) => new Date(Date.parse(iso) - days * DAY_MS).toISOString().slice(0, 10);

function problem(from: string, to: string): string | null {
  if (!from || !to) return "Pick both dates.";
  if (to < from) return "The end date is before the start date.";
  const days = daysIn(from, to);
  return days > MAX_DAYS ? `Pick ${MAX_DAYS} days or fewer. This range is ${days} days.` : null;
}

interface Props {
  from: string;
  to: string;
  today: string;
  onChange: (from: string, to: string) => void;
}

export function DateRange({ from, to, today, onChange }: Props) {
  const [draft, setDraft] = useState({ from, to });
  const id = useId();
  const error = problem(draft.from, draft.to);

  function set(next: { from: string; to: string }) {
    setDraft(next);
    if (!problem(next.from, next.to)) onChange(next.from, next.to);
  }

  return (
    <fieldset className="fw-field dates-field">
      <legend>Dates</legend>
      <div className="dates">
        <input
          className="fw-input fw-mono"
          type="date"
          aria-label="From"
          value={draft.from}
          max={today}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-note`}
          onChange={(e) => set({ ...draft, from: e.target.value })}
        />
        <input
          className="fw-input fw-mono"
          type="date"
          aria-label="To"
          value={draft.to}
          max={today}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-note`}
          onChange={(e) => set({ ...draft, to: e.target.value })}
        />
      </div>
      {error ? (
        <div id={`${id}-note`} className="fw-error" role="alert">{error}</div>
      ) : (
        <div id={`${id}-note`} className="fw-help">Up to {MAX_DAYS} days at a time, in UTC.</div>
      )}
    </fieldset>
  );
}
