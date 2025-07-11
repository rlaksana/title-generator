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
