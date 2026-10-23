import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";

/** Header/footer logo: brand mark plus the MATCHPULSE wordmark. */
export function Logo({ className = "", size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <Link
      href="/"
      aria-label="MatchPulse home"
      className={`group inline-flex items-center gap-2.5 rounded-lg font-display font-bold leading-none tracking-wide ${
        size === "lg" ? "text-[1.7rem]" : "text-[1.55rem]"
      } ${className}`}
    >
      <BrandMark className={size === "lg" ? "size-9" : "size-8 transition-transform group-hover:scale-105"} />
      <span aria-hidden>
        <span className="text-ink">MATCH</span>
        <span className="text-pulse">PULSE</span>
      </span>
    </Link>
  );
}
