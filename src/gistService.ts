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
   * If existingGistId is provided, deletes old Gist first (re-processing flow).
   * @returns GistPublishResult
   */
  async publishToGist(
    content: string,
    filename: string,
    existingGistId?: string
  ): Promise<GistPublishResult> {
    const settings = this.getSettings();

    // If re-processing, delete the old gist first
    if (existingGistId) {
      const deleted = await this.deleteGist(existingGistId);
      if (!deleted) {
        return {
          success: false,
          error: 'Failed to delete existing Gist',
        };
      }
    }

    // Attempt to create the gist with up to 3 retries
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await this.createGist(content, filename, settings.githubPat);

      if (result.success) {
        return result;
      }

      // Return immediately on auth failure (401)
      if (result.status === 401) {
        return result;
      }

      // Retry on other failures if we have attempts left
      if (attempt < 3) {
        await this.delay(1000);
      } else {
        return result;
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
    };
  }

  /**
   * Delete a Gist by ID. Returns true on success.
   */
  private async deleteGist(gistId: string): Promise<boolean> {
    const settings = this.getSettings();

    try {
      const response = await requestUrl({
        url: `https://api.github.com/gists/${gistId}`,
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${settings.githubPat}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      return response.status === 204;
    } catch (error) {
      console.error(`Failed to delete Gist ${gistId}:`, error);
      return false;
    }
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
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
