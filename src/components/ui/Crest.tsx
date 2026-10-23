import type { Club } from "@/lib/types";

const sizes = {
  sm: "size-6 text-[7px]",
  md: "size-8 text-[8px]",
  lg: "size-12 text-[11px]",
} as const;

/**
 * Original placeholder crest: a generic shield in the club's colors.
 * Stands in for official crests, which are not licensed for this project.
 */
export function Crest({ club, size = "md" }: { club: Club; size?: keyof typeof sizes }) {
  const darkText = isLight(club.primary);
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${sizes[size]}`} aria-hidden>
      <svg viewBox="0 0 32 36" className="absolute inset-0 size-full drop-shadow">
        <path d="M16 1 30 6v11c0 9-6.2 15.1-14 18C8.2 32.1 2 26 2 17V6z" fill={club.primary} />
        <path d="M16 1 30 6v11c0 9-6.2 15.1-14 18z" fill={club.secondary} opacity="0.35" />
        <path
          d="M16 1 30 6v11c0 9-6.2 15.1-14 18C8.2 32.1 2 26 2 17V6z"
          fill="none"
          stroke={club.secondary}
          strokeWidth="1.6"
        />
      </svg>
      <span
        className={`relative font-display font-bold leading-none tracking-tight ${darkText ? "text-black/80" : "text-white"}`}
      >
        {club.short}
      </span>
    </span>
  );
}

function isLight(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}
