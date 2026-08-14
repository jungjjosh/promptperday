// Emoji per category name, used on the HISTORY calendar and its legend.
// Not part of the schema — Category has no emoji/color column, so this is a
// small fixed lookup rather than new stored state, matching the emoji set to
// the seeded category names.
const CATEGORY_EMOJI: Record<string, string> = {
  "current events": "📰",
  philosophy: "🧠",
  "personal life": "💭",
};

export function emojiForCategory(name: string): string {
  return CATEGORY_EMOJI[name] ?? "📝";
}
