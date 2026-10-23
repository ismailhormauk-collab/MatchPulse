// Time-zone and time-format checks against known timestamps.
// Run with: npm run test:time   (Node 22.18+ loads the .ts module natively)
import assert from "node:assert/strict";
import {
  formatDateKeyLong,
  formatTime,
  isValidTimeZone,
  matchClock,
  zonedDateKey,
} from "../src/lib/time.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const evening = "2026-10-21T19:00:00Z";
const lateNight = "2026-10-21T23:30:00Z";
const earlyMorning = "2026-10-21T00:30:00Z";

check("UTC 24h and 12h", () => {
  assert.equal(formatTime(evening, { timeZone: "UTC", timeFormat: "24h" }), "19:00");
  assert.equal(formatTime(evening, { timeZone: "UTC", timeFormat: "12h" }), "7:00 PM");
});

check("midnight renders as 00:xx, not 24:xx", () => {
  assert.equal(formatTime(earlyMorning, { timeZone: "UTC", timeFormat: "24h" }), "00:30");
  assert.equal(formatTime(earlyMorning, { timeZone: "UTC", timeFormat: "12h" }), "12:30 AM");
});

check("Europe/London is BST (UTC+1) in October before the change", () => {
  assert.equal(formatTime(evening, { timeZone: "Europe/London", timeFormat: "24h" }), "20:00");
});

check("Europe/London is GMT after the 25 Oct 2026 change", () => {
  assert.equal(formatTime("2026-10-26T19:00:00Z", { timeZone: "Europe/London", timeFormat: "24h" }), "19:00");
});

check("Europe/Paris (UTC+2)", () => {
  assert.equal(formatTime(evening, { timeZone: "Europe/Paris", timeFormat: "24h" }), "21:00");
});

check("America/New_York (UTC−4) and Los Angeles (UTC−7)", () => {
  assert.equal(formatTime(evening, { timeZone: "America/New_York", timeFormat: "12h" }), "3:00 PM");
  assert.equal(formatTime(evening, { timeZone: "America/Los_Angeles", timeFormat: "24h" }), "12:00");
});

check("half-hour offset: Asia/Kolkata (UTC+5:30)", () => {
  assert.equal(formatTime(evening, { timeZone: "Asia/Kolkata", timeFormat: "24h" }), "00:30");
});

check("Australia/Sydney (UTC+11, daylight time)", () => {
  assert.equal(formatTime(evening, { timeZone: "Australia/Sydney", timeFormat: "24h" }), "06:00");
});

check("calendar date follows the zone", () => {
  assert.equal(zonedDateKey(lateNight, "UTC"), "2026-10-21");
  assert.equal(zonedDateKey(lateNight, "Asia/Tokyo"), "2026-10-22");
  assert.equal(zonedDateKey(earlyMorning, "America/New_York"), "2026-10-20");
  assert.equal(zonedDateKey(evening, "Asia/Kolkata"), "2026-10-22");
});

check("date keys format without shifting days", () => {
  assert.equal(formatDateKeyLong("2026-10-21"), "Wednesday, 21 October 2026");
});

check("time-zone validation", () => {
  assert.equal(isValidTimeZone("Africa/Casablanca"), true);
  assert.equal(isValidTimeZone("Mars/Olympus_Mons"), false);
  assert.equal(isValidTimeZone(42), false);
});

check("match clock with half-time break", () => {
  const now = "2026-10-21T17:45:00Z";
  assert.equal(matchClock("2026-10-21T17:15:00Z", now).label, "30'");
  assert.equal(matchClock("2026-10-21T16:55:00Z", now).label, "HT");
  assert.equal(matchClock("2026-10-21T16:15:00Z", now).label, "75'");
  assert.equal(matchClock("2026-10-21T15:30:00Z", now).label, "90+'");
});

console.log(`\n${passed} time checks passed`);
