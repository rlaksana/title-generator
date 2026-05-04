import { Notice, requestUrl } from 'obsidian';

/**
 * Result of a Gist publish operation
 */
export interface GistPublishResult {
  success: boolean;
  gistId?: string;
  gistUrl?: string;
  error?: string;
}

/**
 * Settings subset required for Gist operations
 */
interface GistSettings {
  githubPat: string;
  enableGistAutoShare: boolean;
}

/**
 * Service for publishing notes to GitHub Gist
 */
export class GistService {
  constructor(private getSettings: () => GistSettings) {}

  /**
   * Create or update a secret Gist with note content.
   * If existingGistId is provided, updates the Gist in-place using PATCH.
   * @returns GistPublishResult
   */
  async publishToGist(
    content: string,
    filename: string,
    existingGistId?: string
  ): Promise<GistPublishResult> {
    if (existingGistId) {
      return this.updateExistingGist(content, filename, existingGistId);
    }

    // Create new gist (same as before)
    const settings = this.getSettings();
    return this.createGistWithRetry(content, filename, settings.githubPat);
  }

  /**
   * Update an existing Gist in-place using PATCH, with retry logic.
   */
  private async updateExistingGist(
    content: string,
    filename: string,
    existingGistId: string
  ): Promise<GistPublishResult> {
    let lastResult: GistPublishResult & { status?: number } = {
      success: false,
      error: 'Unknown error',
    };

    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await this.updateGist(content, filename, filename, existingGistId);
      lastResult = result;

      if (result.success) {
        return result;
      }

      // Return immediately on auth failure (401) and not found (404)
      if (result.status === 401) {
        return {
          success: false,
          error: 'GitHub authentication failed. Please check your PAT.',
        };
      }

      if (result.status === 404) {
        return {
          success: false,
          error: `Gist not found: ${existingGistId}. It may have been deleted on GitHub.`,
        };
      }

      // Handle 422: legacy file name mismatch - fetch remote filename and retry
      if (result.status === 422) {
        const fetchResult = await this.fetchGist(existingGistId);
        if (fetchResult.success && fetchResult.data?.files) {
          const remoteFilenames = Object.keys(fetchResult.data.files);
          if (remoteFilenames.length === 1) {
            const remoteFilename = remoteFilenames[0];
            // Retry with the actual remote filename
            const retryResult = await this.updateGist(content, filename, remoteFilename, existingGistId);
            lastResult = retryResult;

            if (retryResult.success) {
              return retryResult;
            }

            // If retry also failed, check if it's retryable
            if (!this.isRetryableStatus(retryResult.status)) {
              return retryResult;
            }
          } else {
            // Multi-file gist - can't auto-resolve
            return {
              success: false,
              error: 'Cannot update multi-file Gist. Please delete and re-share.',
            };
          }
        } else {
          // Couldn't fetch to resolve filename
          return {
            success: false,
            error: fetchResult.error || 'Failed to fetch Gist to resolve filename.',
          };
        }
      }

      // For retryable errors, continue the loop; otherwise return immediately
      if (!this.isRetryableStatus(result.status)) {
        return result;
      }

      // Retryable failure - wait before next attempt
      if (attempt < 3) {
        await this.delay(1000);
      }
    }

    return {
      success: false,
      error: lastResult.error || 'Max retries exceeded',
    };
  }

  /**
   * Create a new Gist with retry logic for retryable failures.
   */
  private async createGistWithRetry(
    content: string,
    filename: string,
    githubPat: string
  ): Promise<GistPublishResult> {
    let lastResult: GistPublishResult & { status?: number } = {
      success: false,
      error: 'Unknown error',
    };

    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await this.createGist(content, filename, githubPat);
      lastResult = result;

      if (result.success) {
        return result;
      }

      // Return immediately on auth failure (401)
      if (result.status === 401) {
        return result;
      }

      // For retryable errors, continue the loop; otherwise return immediately
      if (!this.isRetryableStatus(result.status)) {
        return result;
      }

      // Retryable failure - wait before next attempt
      if (attempt < 3) {
        await this.delay(1000);
      }
    }

    return {
      success: false,
      error: lastResult.error || 'Max retries exceeded',
    };
  }


  /**
   * Create a new Gist via the GitHub API
   */
  private async createGist(
    content: string,
    filename: string,
    githubPat: string
  ): Promise<GistPublishResult & { status?: number }> {
    try {
      const response = await requestUrl({
        url: 'https://api.github.com/gists',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: filename,
          public: false,
          files: {
            [filename]: { content },
          },
        }),
      });

      if (response.status === 201) {
        const data = response.json;
        return {
          success: true,
          gistId: data.id,
          gistUrl: data.html_url,
          status: response.status,
        };
      }

      if (response.status === 401) {
        new Notice('GitHub authentication failed. Please check your PAT.', 7000);
        return {
          success: false,
          error: 'Authentication failed. Please check your GitHub PAT.',
          status: response.status,
        };
      }

      return {
        success: false,
        error: `Gist creation failed (${response.status}): ${response.text}`,
        status: response.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to create Gist: ${errorMessage}`,
      };
    }
  }

  /**
   * Update an existing Gist in-place via the GitHub API (PATCH)
   */
  private async updateGist(
    content: string,
    newFilename: string,
    oldFilename: string,
    gistId: string
  ): Promise<GistPublishResult & { status?: number }> {
    const settings = this.getSettings();

    try {
      const response = await requestUrl({
        url: `https://api.github.com/gists/${gistId}`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${settings.githubPat}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: newFilename,
          files: {
            [oldFilename]: { filename: newFilename, content },
          },
        }),
      });

      if (response.status === 200) {
        const data = response.json;
        return {
          success: true,
          gistId: data.id,
          gistUrl: data.html_url,
          status: response.status,
        };
      }

      if (response.status === 401) {
        new Notice('GitHub authentication failed. Please check your PAT.', 7000);
        return {
          success: false,
          error: 'Authentication failed. Please check your GitHub PAT.',
          status: response.status,
        };
      }

      return {
        success: false,
        error: `Gist update failed (${response.status}): ${response.text}`,
        status: response.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to update Gist: ${errorMessage}`,
      };
    }
  }

  /**
   * Fetch a Gist by ID to recover the remote filename when gist_filename is missing.
   * Uses GET /gists/{gistId} endpoint.
   */
  async fetchGist(
    gistId: string
  ): Promise<{ success: boolean; data?: any; error?: string; status?: number }> {
    const settings = this.getSettings();

    try {
      const response = await requestUrl({
        url: `https://api.github.com/gists/${gistId}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${settings.githubPat}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (response.status === 200) {
        const data = response.json;
        return {
          success: true,
          data,
        };
      }

      if (response.status === 401) {
        new Notice('GitHub authentication failed. Please check your PAT.', 7000);
        return {
          success: false,
          error: 'Authentication failed. Please check your GitHub PAT.',
          status: response.status,
        };
      }

      return {
        success: false,
        error: `Failed to fetch Gist (${response.status}): ${response.text}`,
        status: response.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to fetch Gist: ${errorMessage}`,
      };
    }
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Determine if a status code is retryable.
   * Returns true for network errors (no status), 408, 429, and 5xx.
   * Returns false for 401, 404, 422, and other client errors.
   */
  private isRetryableStatus(status: number | undefined): boolean {
    if (status === undefined) return true; // network error
    if (status === 408) return true;       // request timeout
    if (status === 429) return true;        // rate limit
    if (status >= 500 && status < 600) return true; // server error
    return false;
  }
}
