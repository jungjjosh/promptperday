// Shared style guide for AI-generated questions, taken directly from the
// project's own SETTINGS spec: prompts must demand narrative unfolding,
// reasoning through consequences, or emotional unpacking — not simple
// factual or opinion questions.
const STYLE_GUIDE = `Each prompt must demand narrative unfolding, reasoning through
consequences, or emotional unpacking — never a simple factual or opinion
question. Draw from a mix of these forms across the 10 prompts: narrative or
memory prompts, hypotheticals, advice-column simulation, argue-the-other-side,
letters never sent, sensory or scene reconstruction, ethical dilemmas with no
clean answer, and legacy or values prompts. Each prompt should be answerable
in roughly 5 minutes of focused writing, phrased as a direct instruction or
question (not a title), and self-contained — it shouldn't require the reader
to already know a specific news event or public figure.`;

const CATEGORY_PROMPTS: Record<string, string> = {
  philosophy: `Generate 10 candidate journaling prompts for a daily-writing app's
"philosophy" category. ${STYLE_GUIDE} Topics can span ethics, identity,
meaning, free will, knowledge, and value — but keep every prompt personal and
concrete rather than abstract or academic.`,
  "personal life": `Generate 10 candidate journaling prompts for a daily-writing
app's "personal life" category. ${STYLE_GUIDE} Topics should draw on
relationships, family, formative memories, small daily decisions, and
personal growth.`,
};

export function buildGenerationPrompt(categoryName: "philosophy" | "personal life"): string {
  return CATEGORY_PROMPTS[categoryName];
}
