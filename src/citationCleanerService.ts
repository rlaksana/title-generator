/**
 * Citation/Reference Cleaner Service
 * Strips citation markers from AI-generated content (ChatGPT, Perplexity, Gemini, Claude)
 */

/**
 * Remove all citation patterns from content
 * Based on research: AI citations follow predictable regex patterns across platforms
 */
export function stripCitations(content: string): string {
  let result = content;

  // Order matters: apply patterns in specific order to avoid leaving artifacts

  // 1. Reference link definitions at end of content: [1]: https://...
  result = result.replace(/^\[\d+\]:\s+https?:\/\/.*$/gm, '');

  // 2. Reference section headers (## References, # Citations, ### Sources)
  // Remove the header line and all content until next header or end
  result = result.replace(/^#{1,6}\s+(?:References|Sources|Citations)\s*$/gim, '');
  // Also remove content under these headers (everything until next # header or double newline followed by non-header)
  result = result.replace(/^#{1,6}\s+(?:References|Sources|Citations)\s*$\n[\s\S]*?(?=\n#{1,6}\s|\n\n[^#]|$)/gim, '');

  // 3. Superscript citations: ^[1]^, ^[1,2]^
  result = result.replace(/\^\[(\d+(?:,\s*\d+)*)\]\^/g, '');

  // 4. Inline numeric citations: [1], [1][2], [1][2][3]
  // Matches: [1], [ 1 ], [1][2][3]
  result = result.replace(/\[\s*\d+\s*\]/g, '');

  // 5. Named/prefixed citations: [source:1], [ref:2], [cite:3], [note:4]
  result = result.replace(/\[(?:source|ref|cite|note):\s*\d+\]/gi, '');

  // 6. Citation before markdown link: [1][link text](url) -> [link text](url)
  result = result.replace(/\[\d+\]+/g, '');

  // 7. Trailing citation markers after punctuation: text.[1] -> text.
  result = result.replace(/\.\[\d+\]/g, '.');

  // 8. Clean up excessive whitespace from removed citations
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/ +/g, ' ');

  return result.trim();
}
