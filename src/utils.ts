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
 * Normalizes a title for comparison by removing extra whitespace, punctuation, and converting to lowercase.
 * @param title The title to normalize.
 * @returns The normalized title.
 */
export function normalizeTitleForComparison(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Calculates similarity between two titles using Levenshtein distance.
 * @param title1 First title to compare.
 * @param title2 Second title to compare.
 * @returns Similarity score between 0 and 1.
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
  const normalized1 = normalizeTitleForComparison(title1);
  const normalized2 = normalizeTitleForComparison(title2);
  
  if (normalized1 === normalized2) return 1;
  if (normalized1.length === 0 || normalized2.length === 0) return 0;
  
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  
  return 1 - (distance / maxLength);
}

/**
 * Calculates Levenshtein distance between two strings.
 * @param str1 First string.
 * @param str2 Second string.
 * @returns The Levenshtein distance.
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array.from({ length: str1.length + 1 }, () => 
    Array(str2.length + 1).fill(0)
  );

  for (let i = 0; i <= str1.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= str2.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[str1.length][str2.length];
}

/**
 * Detects potential duplicate titles in note content.
 * @param generatedTitle The newly generated title.
 * @param noteContent The content of the note.
 * @param sensitivity Detection sensitivity level.
 * @returns Detection result with matches found.
 */
export function detectTitleInContent(
  generatedTitle: string, 
  noteContent: string, 
  sensitivity: 'strict' | 'normal' | 'loose' = 'normal'
): import('./types').DuplicateDetectionResult {
  const matches: import('./types').TitleMatch[] = [];
  const lines = noteContent.split('\n');
  
  // Import constants
  const { DUPLICATE_CONFIG } = require('./constants');
  const threshold = DUPLICATE_CONFIG.SIMILARITY_THRESHOLDS[sensitivity];
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();
    if (!line) continue;
    
    // Check for markdown headers
    const headerMatch = line.match(DUPLICATE_CONFIG.MARKDOWN_HEADER_PATTERN);
    if (headerMatch) {
      const headerText = headerMatch[2].trim();
      const similarity = calculateTitleSimilarity(generatedTitle, headerText);
      
      if (similarity >= threshold) {
        const startIndex = noteContent.indexOf(line);
        matches.push({
          startIndex,
          endIndex: startIndex + line.length,
          matchedText: line,
          similarity,
          lineNumber: lineIndex + 1,
          isMarkdownHeader: true,
          headerLevel: headerMatch[1].length
        });
      }
    } else {
      // Check for plain text titles (first few lines only)
      if (lineIndex < DUPLICATE_CONFIG.PLAIN_TEXT_SCAN_LINES) {
        const similarity = calculateTitleSimilarity(generatedTitle, line);
        
        if (similarity >= threshold) {
          const startIndex = noteContent.indexOf(line);
          matches.push({
            startIndex,
            endIndex: startIndex + line.length,
            matchedText: line,
            similarity,
            lineNumber: lineIndex + 1,
            isMarkdownHeader: false
          });
        }
      }
    }
  }
  
  return {
    found: matches.length > 0,
    matches,
    totalMatches: matches.length,
    contentWithoutDuplicates: matches.length > 0 ? removeDuplicatesFromContent(noteContent, matches) : undefined
  };
}

/**
 * Removes duplicate titles from content based on matches.
 * @param content The original content.
 * @param matches The matches to remove.
 * @returns Content with duplicates removed.
 */
export function removeDuplicatesFromContent(
  content: string, 
  matches: import('./types').TitleMatch[]
): string {
  if (matches.length === 0) return content;
  
  // Sort matches by start index in descending order to remove from end to beginning
  const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex);
  
  let modifiedContent = content;
  const lines = content.split('\n');
  
  for (const match of sortedMatches) {
    // Find the line containing this match
    const lineIndex = match.lineNumber - 1;
    if (lineIndex >= 0 && lineIndex < lines.length) {
      // Remove the entire line
      lines.splice(lineIndex, 1);
    }
  }
  
  // Rejoin lines and clean up extra empty lines
  modifiedContent = lines.join('\n');
  
  // Remove excessive empty lines at the beginning
  modifiedContent = modifiedContent.replace(/^\n+/, '');
  
  // Limit consecutive empty lines to maximum defined in constants
  const maxEmptyLines = DUPLICATE_CONFIG.MAX_CONSECUTIVE_EMPTY_LINES;
  const emptyLinePattern = new RegExp(`\\n{${maxEmptyLines + 1},}`, 'g');
  modifiedContent = modifiedContent.replace(emptyLinePattern, '\n'.repeat(maxEmptyLines));
  
  return modifiedContent;
}

/**
 * Validates if a title should be considered for removal.
 * @param match The title match to validate.
 * @param onlyExactMatches Whether to only remove exact matches.
 * @returns Whether the match should be removed.
 */
export function shouldRemoveMatch(
  match: import('./types').TitleMatch, 
  onlyExactMatches: boolean
): boolean {
  const { DUPLICATE_CONFIG } = require('./constants');
  
  if (onlyExactMatches) {
    return match.similarity >= DUPLICATE_CONFIG.EXACT_MATCH_THRESHOLD;
  }
  
  return match.similarity >= DUPLICATE_CONFIG.SIMILARITY_THRESHOLDS.normal;
}
