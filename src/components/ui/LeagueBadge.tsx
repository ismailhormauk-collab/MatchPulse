"use client";

import Image from "next/image";
import { useState } from "react";
import { getLeagueAsset } from "@/data/api-assets";
import type { League } from "@/lib/types";

const SIZES = {
  sm: { box: "size-6 rounded", px: 20 },
  md: { box: "size-8 rounded-md", px: 26 },
  lg: { box: "size-11 rounded-lg", px: 36 },
} as const;

/**
 * Competition logo from API-Football (synced into api-assets.json). Logos sit
 * on a light tile so dark artwork stays legible in both themes. Without a
 * genuine logo, or if it fails to load, a neutral trophy icon is shown;
 * no substitute logo is ever drawn.
 */
export function LeagueBadge({ league, size = "md" }: { league: League; size?: keyof typeof SIZES }) {
  const [failed, setFailed] = useState(false);
  const logo = getLeagueAsset(league.slug)?.logo;
  const { box, px } = SIZES[size];

  if (logo && !failed) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center border border-line bg-white ${box}`}>
        <Image
          src={logo}
          alt={`${league.name} logo`}
          width={px}
          height={px}
          sizes={`${px}px`}
          className="object-contain"
          style={{ width: px * 0.82, height: px * 0.82 }}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={`${league.name} (logo unavailable)`}
      className={`inline-flex shrink-0 items-center justify-center border border-line bg-surface-3 text-muted ${box}`}
    >
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
