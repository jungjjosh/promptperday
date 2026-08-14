// Turns a raw headline into a reflective writing prompt matching the style
// of the seeded current-events questions (narrative unfolding, reasoning
// through consequences, emotional unpacking) rather than inserting the
// headline verbatim as the question text.
export const CURRENT_EVENTS_TEMPLATES: string[] = [
  'A recent headline read: "{headline}". Write a letter to someone reading about this ten years from now — what do you want them to understand about how it felt to live through it?',
  'Explain "{headline}" to someone from fifty years in the past. What would confuse them most, and what would you need to explain first?',
  'Imagine you\'re the advice columnist for someone anxious about "{headline}". What would you actually tell them?',
  'Argue the strongest good-faith case for the decision at the center of "{headline}", even if you disagree with it.',
  'Write the internal monologue of someone directly affected by "{headline}" today.',
  '"{headline}" will look different in retrospect. Write from ten years in the future, looking back on it.',
  'Describe how "{headline}" has quietly changed a small daily habit of someone who isn\'t in the story.',
  'Reconstruct, from the inside, a hard tradeoff someone had to make because of "{headline}".',
];

export function headlineToPrompt(headline: string): string {
  const template =
    CURRENT_EVENTS_TEMPLATES[Math.floor(Math.random() * CURRENT_EVENTS_TEMPLATES.length)];
  return template.replace("{headline}", headline);
}
