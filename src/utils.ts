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
    const firstNonEmptyLines = lines.filter(line => line.trim()).slice(0, 3);
    const firstParagraph = firstNonEmptyLines.join('\n').trim();
    
    if (!firstParagraph || firstParagraph.length < 10) {
      return { contentModified: false, modifiedContent: content };
    }
    
    // Categorize formatting types
    const formattingAnalysis = firstNonEmptyLines.map(line => {
      const trimmed = line.trim();
      return {
        original: line,
        isHeader: trimmed.startsWith('#'),
        isList: trimmed.startsWith('-') || trimmed.startsWith('*'),
        isCodeBlock: trimmed.startsWith('```'),
        hasEmoji: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(trimmed),
        hasMarkdown: trimmed.includes('**') || trimmed.includes('`') || trimmed.includes('['),
        isStructural: trimmed.startsWith('#') || trimmed.includes('|') || trimmed.startsWith('```'),
        contentWithoutFormatting: trimmed.replace(/^[#\-\*\s]+/, '').replace(/[\*\`\[\]]/g, '').replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim()
      };
    });
    
    // Check if this is structural content that should be preserved
    const isStructuralContent = formattingAnalysis.some(analysis => 
      analysis.isStructural || analysis.isCodeBlock
    );
    
    // For list items, check if they're actually content lists vs duplicate text
    const isContentList = formattingAnalysis.some(analysis => 
      analysis.isList && analysis.contentWithoutFormatting.length > 20
    );
    
    if (isStructuralContent || isContentList) {
      console.log('Detected structural/content formatting, skipping duplicate cleanup to preserve structure');
      return { contentModified: false, modifiedContent: content };
    }
    
    // Enhanced prompt for formatted duplicate detection
    const prompt = `Analyze if the first paragraph is a genuine duplicate of the title, considering both content and formatting.

Title: "${title}"

First paragraph:
"${firstParagraph}"

ANALYSIS RULES:
1. Strip away formatting symbols (# - * ** ` emojis) and compare the core meaning
2. Only respond "DUPLICATE" if the core content (after removing formatting) literally restates the same information as the title
3. Respond "DIFFERENT" if:
   - It's a section header introducing new topics
   - It's a list of items/content (even if related to title)
   - It provides specific details, examples, or instructions
   - It's structural content (tables, code blocks, navigation)

Examples:
- Title: "Setup Guide" + First paragraph: "# Setup Guide" → DUPLICATE (just formatted title repeat)
- Title: "API Keys" + First paragraph: "🔑 **API Configuration**" → DUPLICATE (same concept, just formatted)
- Title: "Environment Variables" + First paragraph: "- ANTHROPIC_API_KEY - API key for..." → DIFFERENT (actual content list)
- Title: "Installation" + First paragraph: "### Prerequisites" → DIFFERENT (section introducing new topic)

Focus on semantic meaning, not formatting. Only remove if it's truly redundant after stripping formatting.

Only respond with exactly: "DUPLICATE" or "DIFFERENT"

Response:`;

    const aiResponse = await aiCallFunction(prompt, '');
    const response = aiResponse.trim().toUpperCase();
    
    if (response === 'DUPLICATE') {
      // For formatted duplicates, be more careful about what we remove
      const duplicateLineIndices: number[] = [];
      
      // Only remove lines that are truly duplicate (not structural)
      for (let i = 0; i < lines.length && duplicateLineIndices.length < firstNonEmptyLines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          // Check if this line's core content (without formatting) is duplicate
          const coreContent = line.replace(/^[#\-\*\s]+/, '').replace(/[\*\`\[\]]/g, '').replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
          
          // Only mark as duplicate if:
          // 1. Core content is substantial enough to compare
          // 2. It's not a complex list item or structural element
          if (coreContent.length > 5 && 
              !line.includes('|') && 
              !line.startsWith('```') &&
              !(line.includes('-') && coreContent.length > 20)) {
            duplicateLineIndices.push(i);
          }
        }
      }
      
      if (duplicateLineIndices.length === 0) {
        return { contentModified: false, modifiedContent: content };
      }
      
      // Create new lines array without the duplicate content
      const modifiedLines = [...lines];
      
      // Remove lines in reverse order to maintain correct indices
      for (let i = duplicateLineIndices.length - 1; i >= 0; i--) {
        const lineIndex = duplicateLineIndices[i];
        modifiedLines.splice(lineIndex, 1);
      }
      
      // Join and clean up excessive empty lines at the beginning
      let modifiedContent = modifiedLines.join('\n');
      modifiedContent = modifiedContent.replace(/^\n+/, '');
      
      // Ensure there's at least some content left
      if (modifiedContent.trim().length === 0) {
        console.warn('Duplicate removal would result in empty content, keeping original');
        return { contentModified: false, modifiedContent: content };
      }
      
      return { contentModified: true, modifiedContent };
    }
    
    return { contentModified: false, modifiedContent: content };
  } catch (error) {
    console.error('Error in AI duplicate detection:', error);
    return { contentModified: false, modifiedContent: content };
  }
}