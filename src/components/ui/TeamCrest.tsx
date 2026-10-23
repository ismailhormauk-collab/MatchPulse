"use client";

import Image from "next/image";
import { useState } from "react";
import type { Club } from "@/lib/types";
import { Crest } from "./Crest";

const PIXELS = { sm: 24, md: 32, lg: 48, xl: 64 } as const;
type Size = keyof typeof PIXELS;

const BOX: Record<Size, string> = {
  sm: "size-6 text-[7px]",
  md: "size-8 text-[8px]",
  lg: "size-12 text-[11px]",
  xl: "size-16 text-sm",
};

/**
 * Team crest:
 * - provider crest image when the API supplied one (falls back if it fails to load)
 * - neutral badge for provider teams without a crest (never a guessed crest)
 * - MatchPulse placeholder crest for sample clubs
 */
export function TeamCrest({ club, size = "md" }: { club: Club; size?: Size }) {
  const [failed, setFailed] = useState(false);
  const crest = club.crest;

  if (!crest) return <Crest club={club} size={size === "xl" ? "lg" : size} />;

  if (crest.kind === "image" && !failed) {
    const px = PIXELS[size];
    return (
      <span className={`relative inline-flex shrink-0 items-center justify-center ${BOX[size]}`}>
        <Image
          src={crest.url}
          alt={`${club.name} crest`}
          width={px}
          height={px}
          sizes={`${px}px`}
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return <NeutralCrest club={club} size={size} />;
}

function NeutralCrest({ club, size }: { club: Club; size: Size }) {
  return (
    <span
      role="img"
      aria-label={`${club.name} (crest unavailable)`}
      className={`relative inline-flex shrink-0 items-center justify-center ${BOX[size]}`}
    >
      <svg viewBox="0 0 32 36" className="absolute inset-0 size-full" aria-hidden>
        <path
          d="M16 1 30 6v11c0 9-6.2 15.1-14 18C8.2 32.1 2 26 2 17V6z"
          fill="var(--mp-surface-3)"
          stroke="var(--mp-line)"
          strokeWidth="1.6"
        />
      </svg>
      <span className="relative font-display font-bold leading-none tracking-tight text-muted">{club.short}</span>
    </span>
  );
}
