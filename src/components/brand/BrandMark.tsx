/**
 * The MatchPulse mark: a match "pulse" rising into the ball.
 * Same artwork as public/brand/matchpulse-mark.svg and app/icon.svg. Fixed
 * colours on a dark tile keep it legible on both light and dark backgrounds.
 */
export function BrandMark({ className = "size-8", title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect width="64" height="64" rx="15" fill="#0b0d10" />
      <rect x="1.5" y="1.5" width="61" height="61" rx="13.5" fill="none" stroke="#2ee66f" strokeOpacity=".35" strokeWidth="3" />
      <path
        d="M9 38h10l5-11 8 19 6-14 3 6h7"
        fill="none"
        stroke="#2ee66f"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="49" cy="20" r="7" fill="#ffffff" />
    </svg>
  );
}
