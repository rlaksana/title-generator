/**
 * Sanitizes a title to make it a valid filename.
 * - Removes characters forbidden by most operating systems.
 * - Normalizes whitespace to a single space.
 * - Trims leading/trailing spaces and dots.
 * - Falls back to "Untitled" if the name becomes empty.
 * @param title The title to sanitize.
 * @returns A safe filename string.
 */
export function sanitizeFilename(title: string): string {
  // eslint-disable-next-line no-control-regex, no-useless-escape
  let safe = title.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '');
  safe = safe.replace(/\s+/g, ' ').trim();
  safe = safe.replace(/^[ .]+|[ .]+$/g, '');
  return safe.length > 0 ? safe : 'Untitled';
}

/**
 * Truncates a title to a maximum length, trying to respect word boundaries.
 * This is the final safeguard.
 * @param title The title to truncate.
 * @param maxLength The maximum allowed length.
 * @returns The truncated title.
 */
export function truncateTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) {
    return title;
  }

  let truncated = title.slice(0, maxLength);

  // Try to cut at the last word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 0) {
    truncated = truncated.slice(0, lastSpace);
  }

  return truncated.trim();
}

/**
 * Uses AI to detect if the beginning of the document is similar to the title,
 * contains user prompts/questions, or other content that should be removed.
 * @param title The generated title to compare against.
 * @param content The note content.
 * @param aiCallFunction Function to call AI service.
 * @returns Promise with result indicating if content was modified.
 */
export async function detectAndRemoveDuplicateWithAI(
  title: string,
  content: string,
  aiCallFunction: (prompt: string, content: string) => Promise<string>
): Promise<{ contentModified: boolean; modifiedContent: string }> {
  try {
    // Extract first paragraph or few lines from content
    const lines = content.split('\n');
    const firstNonEmptyLines = lines.filter(line => line.trim()).slice(0, 3); // Back to 3 lines for first paragraph
    const firstParagraph = firstNonEmptyLines.join('\n').trim();
    
    if (!firstParagraph || firstParagraph.length < 10) {
      return { contentModified: false, modifiedContent: content };
    }
    
    // Focused prompt only for title duplicate detection
    const prompt = `Compare the title and the first paragraph of this document to check if they have similar meaning.

Title: "${title}"

First paragraph:
"${firstParagraph}"

Instructions:
- Focus ONLY on semantic similarity between the title and first paragraph
- If the first paragraph essentially restates, summarizes, or duplicates the same concept/topic as the title, respond with "DUPLICATE"
- If the first paragraph introduces new information or different content from the title, respond with "DIFFERENT"
- Only consider meaning and concept similarity, not exact word matching

Examples:
- Title: "How to Cook Rice" + First paragraph: "Cooking rice is a basic skill..." → DUPLICATE
- Title: "Programming Tutorial" + First paragraph: "This tutorial will teach you programming..." → DUPLICATE  
- Title: "Climate Change" + First paragraph: "The weather was nice today..." → DIFFERENT

Only respond with exactly one word: either "DUPLICATE" or "DIFFERENT"

Response:`;

    const aiResponse = await aiCallFunction(prompt, '');
    const response = aiResponse.trim().toUpperCase();
    
    if (response === 'DUPLICATE') {
      // Find how many lines to remove by checking the first non-empty lines
      let linesToRemove = 0;
      let removedLines = 0;
      
      for (let i = 0; i < lines.length && removedLines < firstNonEmptyLines.length; i++) {
        linesToRemove++;
        if (lines[i].trim()) {
          removedLines++;
        }
      }
      
      // Remove the identified lines and clean up
      const cleanedLines = lines.slice(linesToRemove);
      let modifiedContent = cleanedLines.join('\n');
      
      // Remove excessive empty lines at the beginning
      modifiedContent = modifiedContent.replace(/^\n+/, '');
      
      return { contentModified: true, modifiedContent };
    }
    
    return { contentModified: false, modifiedContent: content };
  } catch (error) {
    console.error('Error in AI duplicate detection:', error);
    return { contentModified: false, modifiedContent: content };
  }
}