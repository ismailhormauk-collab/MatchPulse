"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { competitionMenus } from "@/data/navigation";
import { ChevronDownIcon } from "@/components/ui/icons";

export function CompetitionNav() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openIndex === null) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenIndex(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenIndex(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openIndex]);

  return (
    <div ref={rootRef} className="relative">
      <ul className="no-scrollbar edge-fade flex gap-2 overflow-x-auto px-4 sm:px-6 lg:justify-center lg:[mask-image:none]">
        {competitionMenus.map((menu, index) => {
          const open = openIndex === index;
          return (
            <li key={menu.label} className="shrink-0">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`competition-menu-${index}`}
                onClick={() => setOpenIndex(open ? null : index)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  open
                    ? "border-pulse/40 bg-surface-3 text-ink"
                    : "border-line bg-surface text-ink/90 shadow-card hover:bg-surface-2"
                }`}
              >
                {menu.label}
                <ChevronDownIcon className={`size-3.5 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
            </li>
          );
        })}
      </ul>

      {openIndex !== null && (
        <div
          id={`competition-menu-${openIndex}`}
          className="absolute inset-x-4 top-full z-40 mt-2 rounded-xl border border-line bg-surface-2 p-3 shadow-pop sm:inset-x-auto sm:left-1/2 sm:w-[min(40rem,calc(100vw-3rem))] sm:-translate-x-1/2"
        >
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {competitionMenus[openIndex].label}
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {competitionMenus[openIndex].items.map((item) => (
              <li key={item.href + item.label}>
                <Link
                  href={item.href}
                  onClick={() => setOpenIndex(null)}
                  className="block rounded-md px-2 py-1.5 text-sm text-ink/90 hover:bg-surface-3 hover:text-pulse"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
