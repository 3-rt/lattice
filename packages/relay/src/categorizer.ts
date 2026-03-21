/**
 * Predefined keyword-to-category mapping.
 * Keys are category names; values are arrays of keywords that indicate that category.
 */
export const CATEGORY_MAP: Record<string, string[]> = {
  debugging: ["fix", "bug", "error", "debug", "crash", "issue", "broken"],
  "code-review": ["review", "pr", "pull request", "check", "approve", "feedback"],
  "code-generation": ["write", "create", "implement", "add", "build", "generate", "scaffold"],
  refactoring: ["refactor", "clean", "restructure", "reorganize", "simplify", "extract"],
  messaging: ["send", "notify", "message", "email", "post", "alert", "slack", "telegram"],
};

/**
 * Classify task text into a category by counting keyword hits per category.
 * Returns the category with the most keyword matches, or "general" if none match.
 */
export function categorize(text: string): string {
  const lower = text.toLowerCase();
  let bestCategory = "general";
  let bestCount = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
    let count = 0;
    for (const keyword of keywords) {
      // Use word-boundary-aware matching for multi-word keywords,
      // simple includes for single words
      if (keyword.includes(" ")) {
        if (lower.includes(keyword)) count++;
      } else {
        // Match as whole words using word-boundary regex
        const regex = new RegExp(`\\b${keyword}\\b`);
        if (regex.test(lower)) count++;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestCategory = category;
    }
  }

  return bestCategory;
}
