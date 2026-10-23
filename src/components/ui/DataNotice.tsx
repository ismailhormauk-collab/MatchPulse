import { FlaskIcon } from "./icons";

/**
 * Status box for data-source messages. `info` for real provider data, `warn`
 * for sample data, unavailable data or errors.
 */
export function DataNotice({
  tone = "info",
  children,
  action,
}: {
  tone?: "info" | "warn";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "warn" ? "note" : undefined}
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${
        tone === "warn" ? "border-warn/30 bg-warn/10 text-warn" : "border-line bg-surface text-muted shadow-card"
      }`}
    >
      <p className="flex min-w-0 flex-1 items-start gap-2">
        {tone === "warn" && <FlaskIcon className="mt-px size-3.5 shrink-0" />}
        <span>{children}</span>
      </p>
      {action}
    </div>
  );
}
