// Wire services chosen for the source allowlist specifically because they
// report with a house style of minimal editorializing — the goal per
// earlier direction is to keep automated current-events sourcing away from
// "hyper-partisan bait" with no human review step in front of it.
export const ALLOWED_NEWS_SOURCE_IDS = ["reuters", "associated-press", "bbc-news"];

// Case-insensitive substring match against the raw headline. Covers both
// outrage-bait phrasing and explicit partisan-flashpoint terms — either is
// disqualifying regardless of which allowlisted source ran it.
export const HEADLINE_DENYLIST_KEYWORDS = [
  "slams",
  "destroys",
  "obliterates",
  "eviscerates",
  "rips into",
  "blasts",
  "owns",
  "triggered",
  "outrage",
  "outraged",
  "meltdown",
  "shocking",
  "you won't believe",
  "left-wing",
  "right-wing",
  "libtard",
  "maga",
  "woke",
  "cancel culture",
  "radical left",
  "radical right",
  "hoax",
  "witch hunt",
];
