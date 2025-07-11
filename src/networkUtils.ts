/**
 * Network utilities for handling cross-platform connections
 */

/**
 * Try multiple URLs to find working LM Studio server
 */
export async function findWorkingLMStudioUrl(baseUrl: string): Promise<string> {
  const urls = generateLMStudioUrls(baseUrl);
  
  // Try URLs in parallel with Promise.race for faster detection
  const promises = urls.map(async (url) => {
    try {
      const response = await fetch(new URL('/v1/models', url).toString(), {
        signal: AbortSignal.timeout(3000), // 3 second timeout for testing
      });
      
      if (response.ok) {
        return url;
      }
    } catch (error) {
      // Continue to next URL
    }
    return null;
  });
  
  // Wait for first successful connection
  for (const promise of promises) {
    try {
      const result = await promise;
      if (result) {
        return result;
      }
    } catch (error) {
      // Continue to next promise
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
  
  // For WSL users, try Windows host IP and common network ranges
  if (isWSL()) {
    const hostIps = getWindowsHostIps();
    hostIps.forEach(ip => {
      urls.push(`http://${ip}:${port}`);
    });
  }
  
  // Add common network IP ranges for local networks
  const networkIps = getCommonNetworkIps();
  networkIps.forEach(ip => {
    urls.push(`http://${ip}:${port}`);
  });
  
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
 * Get Windows host IPs from WSL
 */
function getWindowsHostIps(): string[] {
  try {
    // Common WSL host IPs
    return [
      '172.20.10.1',   // Common WSL2 host IP
      '172.16.0.1',    // Alternative WSL2 host IP
      '10.0.0.1',      // Alternative host IP
      '192.168.1.1',   // Common router IP
    ];
  } catch {
    return [];
  }
}

/**
 * Get common network IP addresses to try
 */
function getCommonNetworkIps(): string[] {
  // Common private network ranges
  return [
    '192.168.1.1',     // Common router
    '192.168.0.1',     // Alternative router
    '192.168.68.145',  // Specific IP that was working
    '10.0.0.1',        // Common private range
    '172.16.0.1',      // Docker/WSL range
  ];
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