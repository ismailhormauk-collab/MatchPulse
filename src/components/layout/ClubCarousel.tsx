"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TeamCrest } from "@/components/ui/TeamCrest";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import type { Club } from "@/lib/types";

export function ClubCarousel({ clubs }: { clubs: Club[] }) {
  const railRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  // Arrows are only useful when the rail actually overflows.
  const scrollable = !(edges.start && edges.end);

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setEdges({
      start: rail.scrollLeft <= 2,
      end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    // The observer also fires once on observe, which sets the initial state.
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [measure]);

  function scroll(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * rail.clientWidth * 0.75, behavior: "smooth" });
  }

  return (
    <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 sm:px-6">
      <ArrowButton label="Scroll clubs left" hidden={!scrollable} disabled={edges.start} onClick={() => scroll(-1)}>
        <ChevronLeftIcon className="size-4" />
      </ArrowButton>
      <ul
        ref={railRef}
        onScroll={measure}
        aria-label="Popular clubs"
        className={`no-scrollbar flex justify-center-safe ${scrollable ? "edge-fade" : ""} min-w-0 flex-1 snap-x scroll-px-1 gap-2 overflow-x-auto scroll-smooth px-1 py-1`}
      >
        {clubs.map((club) => (
          <li key={club.id} className="shrink-0 snap-start">
            <Link
              href="/matches"
              title={club.crest?.kind === "image" ? club.name : `${club.name} (placeholder crest)`}
              aria-label={club.name}
              className="relative flex size-12 items-center justify-center rounded-xl border border-line bg-surface shadow-card transition-colors hover:border-pulse/50 hover:bg-surface-2 sm:size-14"
            >
              <TeamCrest club={club} size="lg" />
            </Link>
          </li>
        ))}
      </ul>
      <ArrowButton label="Scroll clubs right" hidden={!scrollable} disabled={edges.end} onClick={() => scroll(1)}>
        <ChevronRightIcon className="size-4" />
      </ArrowButton>
    </div>
  );
}

function ArrowButton({
  label,
  hidden,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hidden: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-card transition-opacity hover:bg-surface-2 disabled:opacity-30 ${
        hidden ? "hidden" : "hidden sm:flex"
      }`}
    >
      {children}
    </button>
  );
}
