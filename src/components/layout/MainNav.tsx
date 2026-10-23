"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { mainNav } from "@/data/navigation";

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav() {
  const pathname = usePathname();
  return <NavPills activeHref={mainNav.find((item) => isActive(pathname, item.href))?.href} />;
}

/** Rendered on its own as the Suspense fallback, with no active item. */
export function NavPills({ activeHref }: { activeHref?: string }) {
  const navRef = useRef<HTMLElement>(null);

  // On narrow screens the pill row scrolls; keep the active page visible.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const overflowRight = active.offsetLeft + active.offsetWidth - (nav.scrollLeft + nav.clientWidth);
    if (overflowRight > 0) nav.scrollLeft += overflowRight + 8;
    else if (active.offsetLeft < nav.scrollLeft) nav.scrollLeft = active.offsetLeft - 8;
  }, [activeHref]);

  return (
    <nav ref={navRef} aria-label="Main" className="no-scrollbar relative overflow-x-auto">
      <ul className="mx-auto flex w-max items-center gap-0.5 rounded-full border border-chrome-line bg-chrome-2 p-1">
        {mainNav.map((item) => {
          const active = item.href === activeHref;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative block rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors sm:px-4 ${
                  active ? "bg-pulse-soft text-pulse" : "text-muted hover:bg-surface-3/60 hover:text-ink"
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-3.5 -bottom-px h-0.5 rounded-full bg-pulse sm:inset-x-4" aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
