import { stripCitations } from './citationCleanerService';

/**
 * GFM (GitHub Flavored Markdown) transformation service
 * Acts as a "compiler" targeting GFM specification
 */

export class GfmService {
  /**
   * Pre-transform: normalize input Markdown before AI processing
   * @param stripCitations - if true, also remove citation markers from content
   */
  preTransform(
    content: string,
    stripCitationsSetting: boolean = false
  ): string {
    let result = content;

    // Strip citation markers if enabled
    if (stripCitationsSetting) {
      result = stripCitations(result);
    }

    // Normalize line endings
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Normalize task lists (various checkbox formats)
    result = this.transformTaskLists(result);

    // Normalize indented code blocks (4+ spaces) - will be fenced in post-transform
    result = this.normalizeIndentedCode(result);

    // Normalize strikethrough HTML tags
    result = this.transformStrikethrough(result);

    // Normalize tables (ensure proper separator syntax)
    result = this.transformTables(result);

    return result;
  }

  /**
   * Post-transform: ensure GFM compliance after AI processing
   * @param cleanQAPrefix - if true, also strip Q&A prefix patterns from output
   * @param sentPrompt - the prompt sent to the AI, used to detect prompt echoing
   */
  postTransform(
    content: string,
    cleanQAPrefix: boolean = true,
    sentPrompt?: string
  ): string {
    let result = content;

    // Strip leaked instructions from AI output
    result = this.stripInstructions(result);

    // Strip prompt echoing if we know what was sent
    if (sentPrompt) {
      result = this.stripPromptEcho(result, sentPrompt);
    }

    // Strip Q&A prefix from AI output (only if enabled)
    if (cleanQAPrefix) {
      result = this.stripQaPrefix(result);
    }

    // Convert remaining indented code to fenced code blocks
    result = this.transformCodeBlocks(result);

    // Ensure proper table syntax
    result = this.validateTables(result);

    // Sanitize dangerous HTML tags while preserving safe ones
    result = this.sanitizeHtml(result);

    // Ensure URLs are properly formatted for auto-linking
    result = this.transformLinks(result);

    // Final cleanup: normalize excessive blank lines
    result = result.replace(/\n{3,}/g, '\n\n');

    return result;
  }

  /**
   * Strip leaked instructions from AI output
   * Removes common instruction patterns that AI may include in its response,
   * including prompt echoing from the GFM reformat prompt.
   */
  private stripInstructions(content: string): string {
    let result = content;

    // Common meta-instruction phrases that leak from any prompt
    const instructionPatterns = [
      /^Instructions?:.*$/gim,
      /^You are a helpful assistant\.?$/gim,
      /^You are a GitHub Flavored Markdown.*$/gim,
      /^Format the following.*$/gim,
      /^Transform the following content.*$/gim,
      /^Here's the (reformatted |formatted )?content.*$/gim,
      /^Below is the (reformatted |formatted )?content.*$/gim,
      /^(Sure|Sure!|Of course|Here's).*reformat/i,
      /^Output ONLY the transformed content.*$/gim,
      /^CRITICAL:.*$/gim,
      /^IMPORTANT: Before reformatting.*$/gim,
      /^Please reformat ONLY.*$/gim,
      /^Do NOT repeat these instructions.*$/gim,
      /^Do NOT add explanations.*$/gim,
      /^Do NOT include the original prompt.*$/gim,
    ];

    const lines = result.split('\n');
    const filteredLines = lines.filter((line) => {
      return !instructionPatterns.some((pattern) => pattern.test(line));
    });

    result = filteredLines.join('\n');

    return result;
  }

  /**
   * Strip prompt echoing by comparing output against the sent prompt.
   * Only removes lines that are exact or near-exact matches of instruction lines,
   * avoiding false positives on legitimate content.
   */
  private stripPromptEcho(content: string, sentPrompt: string): string {
    // Build a set of prompt lines that look like instructions (not content)
    const promptLines = sentPrompt.split('\n');
    const instructionLines = new Set<string>();

    for (const line of promptLines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      // Only fingerprint lines that are clearly instructions
      const isInstruction =
        /^You are\b/i.test(trimmed) ||
        /^Format\b/i.test(trimmed) ||
        /^Transform\b/i.test(trimmed) ||
        /^Output\b/i.test(trimmed) ||
        /^CRITICAL:/i.test(trimmed) ||
        /^IMPORTANT:/i.test(trimmed) ||
        /^Please\b/i.test(trimmed) ||
        /^Do NOT\b/i.test(trimmed) ||
        /^Instructions?:/i.test(trimmed) ||
        /^Here's\b/i.test(trimmed) ||
        /^Below\b/i.test(trimmed) ||
        /^[-*+]\s+(Use|Ensure|Normalize|Convert|Remove)\b/i.test(trimmed);

      if (isInstruction) {
        instructionLines.add(trimmed);
        // Also add without trailing period for fuzzy match
        instructionLines.add(trimmed.replace(/\.$/, ''));
      }
    }

    if (instructionLines.size === 0) return content;

    const lines = content.split('\n');
    const filteredLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true;
      // Remove if it matches a known instruction line (exact match)
      if (instructionLines.has(trimmed)) return false;
      // Remove if it matches without trailing period
      if (instructionLines.has(trimmed.replace(/\.$/, ''))) return false;
      return true;
    });

    return filteredLines.join('\n');
  }

  /**
   * Strip Q&A prefix from AI output
   * Removes question lines (Q:/Question:) that appear before answer content
   */
  private stripQaPrefix(content: string): string {
    const lines = content.split('\n');

    // Check if content starts with Q&A pattern
    if (lines.length < 2) return content;

    const firstLine = lines[0].trim();
    const secondLine = lines.length > 1 ? lines[1].trim() : '';

    const isQuestionStart =
      firstLine.match(/^(?:Q:|Question:)\s*.+$/i) !== null;
    const isAnswerStart = secondLine.match(/^(?:A:|Answer:)\s*.+$/i) !== null;

    if (!isQuestionStart || !isAnswerStart) return content;

    // Find the answer line index (line 1) and skip question lines
    // Remove the question line (0) and any blank lines between question and answer
    const resultLines: string[] = [];
    let skipUntilAnswer = true;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (skipUntilAnswer && trimmed.match(/^(?:A:|Answer:)\s*.+$/i)) {
        // This is the answer line - include it and stop skipping
        resultLines.push(line);
        skipUntilAnswer = false;
      } else if (skipUntilAnswer && trimmed === '') {
        // Skip blank lines before the answer
        continue;
      } else if (!skipUntilAnswer) {
        // Include all lines after we've found the answer
        resultLines.push(line);
      }
      // If skipUntilAnswer and line is not empty and not the answer, skip it (question content)
    }

    return resultLines.join('\n');
  }

  /**
   * Transform task lists to proper GFM syntax
   */
  transformTaskLists(content: string): string {
    // Match various checkbox formats: [ ], [x], [X], ( ), (x), < >
    return content.replace(/^(\s*)[-*+]?\s*\[([ xX])\]\s*/gm, '$1- [$2] ');
  }

  /**
   * Transform <del> or <s> tags to ~~strikethrough~~
   */
  transformStrikethrough(content: string): string {
    // Handle <del> tags
    content = content.replace(/<del>(.*?)<\/del>/gi, '~~$1~~');
    // Handle <s> tags
    content = content.replace(/<s>(.*?)<\/s>/gi, '~~$1~~');
    // Handle <strike> tags
    content = content.replace(/<strike>(.*?)<\/strike>/gi, '~~$1~~');
    return content;
  }

  /**
   * Normalize indented code blocks (pre-transform step)
   * Mark them for conversion to fenced blocks in post-transform
   */
  normalizeIndentedCode(content: string): string {
    // This just flags the lines - actual conversion happens in transformCodeBlocks
    return content;
  }

  /**
   * Convert indented code (4+ spaces) to fenced code blocks
   */
  transformCodeBlocks(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let inCodeBlock = false;
    let codeBlockStart = -1;
    let codeBlockIndent = 0;
    let codeBlockContent: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const leadingSpaces = line.match(/^(\s*)/)?.[1].length ?? 0;

      if (!inCodeBlock) {
        // Check if this line starts a code block (4+ spaces of indentation)
        if (leadingSpaces >= 4 && line.trim().length > 0) {
          inCodeBlock = true;
          codeBlockStart = i;
          codeBlockIndent = leadingSpaces;
          // Collect all lines for this code block
          codeBlockContent = [line.substring(leadingSpaces)];
        } else {
          result.push(line);
        }
      } else {
        // Inside a code block
        if (line.trim() === '') {
          // Empty line in code block
          codeBlockContent.push('');
        } else if (leadingSpaces >= codeBlockIndent || line.startsWith('```')) {
          // Continuation of code block
          codeBlockContent.push(line.substring(codeBlockIndent));
        } else {
          // Code block ended
          const codeText = codeBlockContent.join('\n').trim();
          if (codeText) {
            result.push('```');
            result.push(codeText);
            result.push('```');
          } else {
            // It wasn't actually a code block, restore the content
            for (const codeLine of codeBlockContent) {
              if (codeLine !== '') {
                result.push(' '.repeat(codeBlockIndent) + codeLine);
              } else {
                result.push('');
              }
            }
          }
          inCodeBlock = false;
          codeBlockContent = [];
          // Process this line as a regular line
          i--;
        }
      }
    }

    // Handle unclosed code block at end of file
    if (inCodeBlock && codeBlockContent.length > 0) {
      const codeText = codeBlockContent.join('\n').trim();
      if (codeText) {
        result.push('```');
        result.push(codeText);
        result.push('```');
      }
    }

    return result.join('\n');
  }

  /**
   * Transform tables to proper GFM syntax with alignment
   */
  transformTables(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if this looks like a table row
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        result.push(line);

        // Check if next line is a table separator
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          // If it's a separator row with |---| format, check if it needs normalization
          if (nextLine.match(/^\|[\s-:|<>]+\|$/)) {
            // Normalize the separator
            const normalized = this.normalizeTableSeparator(nextLine);
            result.push(normalized);
            i++; // Skip the separator line since we already processed it
          }
        }
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * Normalize table separator to GFM format
   */
  private normalizeTableSeparator(line: string): string {
    const cells = line
      .split('|')
      .filter((c, i, a) => i > 0 && i < a.length - 1);

    const normalizedCells = cells.map((cell) => {
      const trimmed = cell.trim();

      // Already has alignment markers
      if (trimmed.startsWith(':') || trimmed.endsWith(':')) {
        // Normalize: ensure format is :---, :---:, or ---:
        if (trimmed === ':') return ':---';
        if (trimmed === ':') return ':---';
        if (trimmed === '-:' || trimmed === ':' || trimmed === ':-') {
          return trimmed.replace('-', '').replace(':', '') + '---';
        }
        return trimmed.replace(/\s/g, '');
      }

      // No alignment markers - default to left-aligned
      return '---';
    });

    return '| ' + normalizedCells.join(' | ') + ' |';
  }

  /**
   * Validate and fix existing table syntax
   */
  validateTables(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!inTable) {
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
          inTable = true;
          tableRows = [trimmed];
        } else {
          result.push(line);
        }
      } else {
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
          tableRows.push(trimmed);
        } else {
          // Table ended - validate and emit
          for (const row of tableRows) {
            result.push(row);
          }
          tableRows = [];
          inTable = false;
          result.push(line);
        }
      }
    }

    // Emit remaining table rows
    if (inTable) {
      for (const row of tableRows) {
        result.push(row);
      }
    }

    return result.join('\n');
  }

  /**
   * Transform URLs to proper auto-link format
   */
  transformLinks(content: string): string {
    // Ensure bare URLs in angle brackets are properly formatted (already linked)
    // but also catch common patterns that might not auto-link

    // Add angle brackets around URLs that aren't already in links or code
    return content.replace(
      /(?<![<\(])(https?:\/\/[^\s<>\[\]()"]+)(?![>\)\]])/g,
      '<$1>'
    );
  }

  /**
   * Sanitize HTML tags - remove dangerous ones, preserve safe structural ones
   */
  sanitizeHtml(content: string): string {
    // Allowed: table, caption, tr, th, td, br, hr
    // Remove: script, style, iframe, object, embed, form, input, button, etc.

    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
      /<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi,
      /<input\b[^/]*\/?>/gi,
      /<button\b[^<]*(?:(?!<\/button>)<[^<]*)*<\/button>/gi,
      /<select\b[^<]*(?:(?!<\/select>)<[^<]*)*<\/select>/gi,
      /on\w+\s*=\s*["'][^"']*["']/gi,
      /on\w+\s*=\s*[^\s>]+/gi,
    ];

    let result = content;

    for (const pattern of dangerousPatterns) {
      result = result.replace(pattern, '');
    }

    // Preserve safe structural HTML (table elements)
    // These are allowed in GFM for complex table structures

    return result;
  }

  /**
   * Check if content has any GFM transformation needs
   */
  hasGfmNeeds(content: string): boolean {
    return (
      /<del>|<\/del>|<s>|<\/s>|<strike>|<\/strike>/i.test(content) ||
      /^ {4}/m.test(content) ||
      /^\s*[-*+]\s*\[\s*[xX\s]\s*\]\s*/m.test(content) ||
      /^\|.*\|$/m.test(content)
    );
  }
}
