"use client";

import Image from "next/image";
import { useState } from "react";
import { initials } from "@/lib/format";

/** Player photo from the API, with an initials fallback if missing or broken. */
export function PlayerPhoto({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <span className="relative size-9 shrink-0 overflow-hidden rounded-full bg-surface-3 ring-1 ring-line">
        <Image
          src={url}
          alt={`${name} photo`}
          width={36}
          height={36}
          sizes="36px"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={`${name} (photo unavailable)`}
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted ring-1 ring-line"
    >
      {initials(name)}
    </span>
  );
}
