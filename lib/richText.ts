// Fallback content for an Entry created without any prior autosave — e.g.
// the write phase ended before the editor ever fired an update. Shaped as a
// minimal TipTap document; stored as opaque Json in Prisma either way.
export const EMPTY_DOCUMENT = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
