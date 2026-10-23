import { ImageResponse } from "next/og";

// Shared social-sharing image (also used by nested pages). Brand-only artwork:
// no match data, so it can never show stale or misleading scores.
export const alt = "MatchPulse: football fixtures, results, standings and player rankings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0b0d10 0%, #161f33 100%)",
          color: "#e8ebf0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <svg width="140" height="140" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="15" fill="#0b0d10" />
            <rect x="1.5" y="1.5" width="61" height="61" rx="13.5" fill="none" stroke="#2ee66f" strokeOpacity=".35" strokeWidth="3" />
            <path d="M9 38h10l5-11 8 19 6-14 3 6h7" fill="none" stroke="#2ee66f" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="49" cy="20" r="7" fill="#ffffff" />
          </svg>
          <div style={{ display: "flex", fontSize: 110, fontWeight: 800, letterSpacing: "-2px" }}>
            <span>MATCH</span>
            <span style={{ color: "#2ee66f" }}>PULSE</span>
          </div>
        </div>
        <div style={{ marginTop: 48, fontSize: 40, color: "#8f97a5", lineHeight: 1.3 }}>
          Football fixtures, results, standings and player rankings
        </div>
      </div>
    ),
    size,
  );
}
