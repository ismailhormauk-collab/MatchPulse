import Link from "next/link";

export interface Crumb {
  name: string;
  /** Omit for the current page. */
  href?: string;
}

/** Visible breadcrumb trail; pair it with the BreadcrumbList structured data from JsonLd. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-xs text-muted">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex min-w-0 items-center gap-x-1.5">
            {index > 0 && <span aria-hidden>›</span>}
            {item.href ? (
              <Link href={item.href} className="hover:text-pulse">
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-ink/80">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
