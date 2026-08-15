// Returns the YYYY-MM-DD calendar date for `date` as observed in `timeZone`.
// Two Dates fall on the same local day iff this string matches.
export function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
