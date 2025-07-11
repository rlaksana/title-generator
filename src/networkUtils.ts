/**
 * Network utilities for handling cross-platform connections
 */

/**
 * Try multiple URLs to find working LM Studio server
 */
export async function findWorkingLMStudioUrl(baseUrl: string): Promise<string> {
  const urls = generateLMStudioUrls(baseUrl);
  
  for (const url of urls) {
    try {
      const response = await fetch(new URL('/v1/models', url).toString(), {
        signal: AbortSignal.timeout(2000), // Quick timeout for testing
      });
      
      if (response.ok) {
        return url;
      }
    } catch (error) {
      // Continue to next URL
    }
  }
  
  // If none work, return the original URL
  return baseUrl;
}

/**
 * Generate possible LM Studio URLs for cross-platform compatibility
 */
function generateLMStudioUrls(baseUrl: string): string[] {
  const urls: string[] = [baseUrl];
  
  // Extract port from URL
  const port = extractPort(baseUrl) || '1234';
  
  // Add common variations
  urls.push(`http://localhost:${port}`);
  urls.push(`http://127.0.0.1:${port}`);
  urls.push(`http://0.0.0.0:${port}`);
  
  // For WSL users, try Windows host IP
  if (isWSL()) {
    const hostIp = getWindowsHostIp();
    if (hostIp) {
      urls.push(`http://${hostIp}:${port}`);
    }
  }
  
  // Remove duplicates
  return [...new Set(urls)];
}

/**
 * Extract port from URL string
 */
function extractPort(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  } catch {
    // Try regex fallback
    const match = url.match(/:(\d+)/);
    return match ? match[1] : null;
  }
}

/**
 * Check if running in WSL environment
 */
function isWSL(): boolean {
  // Simple heuristic - check if we're in a Linux environment with WSL indicators
  if (typeof process !== 'undefined' && process.platform === 'linux') {
    try {
      // Common WSL indicators
      const userAgent = navigator.userAgent || '';
      return userAgent.includes('WSL') || 
             userAgent.includes('Microsoft') ||
             process.env.WSL_DISTRO_NAME !== undefined ||
             process.env.WSLENV !== undefined;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Get Windows host IP from WSL
 */
function getWindowsHostIp(): string | null {
  try {
    // This would need to be implemented with a system call
    // For now, return common WSL host IPs
    return '172.20.10.1'; // Common WSL2 host IP
  } catch {
    return null;
  }
}

/**
 * Test if a URL is accessible
 */
export async function testConnection(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}