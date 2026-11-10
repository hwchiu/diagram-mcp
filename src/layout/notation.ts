/** Shared helpers for notation-specific diagram kinds. */
export function tagSuffix(tags: string[] | undefined): string {
  if (!tags?.length) return "";
  return "\u00a0" + tags.map((t) => `[${t}]`).join("");
}

/** Edge label with classification tags appended (measured + placed as one pill). */
export function labelWithTags(label: string | undefined, tags: string[] | undefined): string | undefined {
  if (!tags?.length) return label;
  return label ? label + tagSuffix(tags) : tagSuffix(tags).trim();
}
