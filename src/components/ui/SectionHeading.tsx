import Link from "next/link";

interface SectionHeadingProps {
  title: string;
  as?: "h1" | "h2";
  /** id for aria-labelledby on the enclosing section. */
  id?: string;
  eyebrow?: string;
  description?: string;
  action?: { label: string; href: string };
}

export function SectionHeading({ title, as: Tag = "h2", id, eyebrow, description, action }: SectionHeadingProps) {
  return (
    <div className={`flex items-end justify-between gap-4 ${Tag === "h1" ? "mb-4" : "mb-3"}`}>
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-wider text-pulse">{eyebrow}</p>}
        <Tag
          id={id}
          className={`font-display font-bold leading-tight tracking-wide text-ink ${Tag === "h1" ? "text-3xl" : "text-xl sm:text-2xl"}`}
        >
          {title}
        </Tag>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-card transition-colors hover:border-pulse/40 hover:text-pulse"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
