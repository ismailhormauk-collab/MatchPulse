import { FlaskIcon } from "./icons";

export function SampleDataNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn"
    >
      <FlaskIcon className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
