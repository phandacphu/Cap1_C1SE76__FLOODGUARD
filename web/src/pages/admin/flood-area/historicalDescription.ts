/** Presentation only: split separately recorded flooding events, preserving Firestore text. */
export function historicalDescriptionLines(description: unknown): string[] {
  if (typeof description !== "string") return [];
  return description
    .split(/(?:\r?\n|;)\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
}
