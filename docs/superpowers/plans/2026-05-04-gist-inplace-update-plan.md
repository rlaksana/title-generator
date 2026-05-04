# Gist In-Place Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace delete+create Gist sharing with PATCH in-place update, add "Update Gist" command for pure content sync, and shorten all command names.

**Architecture:** GistService receives a new `updateGist()` method using GitHub PATCH endpoint. `publishToGist()` branches: existing Gist ID → PATCH update; no ID → POST create. Legacy files without `gist_filename` get a recovery flow via GET before PATCH. `publishToGist()` no longer calls `deleteGist()`.

**Tech Stack:** TypeScript, Obsidian API, GitHub Gist API v3

---

## File Map

| File | Changes |
|------|---------|
| `src/gistService.ts` | Add `updateGist()`, add `fetchGist()` (legacy fallback), remove `deleteGist()`, modify `publishToGist()` |
| `src/main.ts` | Add `getGistFilenameFromFrontmatter()`, update `addGistFrontmatter()`, add `update-gist` command, shorten all command names |

---

## Task 1: Add `updateGist()` method to GistService

**Files:**
- Modify: `src/gistService.ts`

- [ ] **Step 1: Add `updateGist()` method after `createGist()` (around line 104)**

```typescript
/**
 * Update an existing Gist via PATCH.
 * description is always set to newFilename.
 */
async updateGist(
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
          [oldFilename]: {
            filename: newFilename,
            content,
          },
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
```

- [ ] **Step 2: Run build to verify no syntax errors**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/gistService.ts
git commit -m "feat(gist): add updateGist() method using PATCH endpoint

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Add `fetchGist()` method for legacy fallback

**Files:**
- Modify: `src/gistService.ts`

- [ ] **Step 1: Add `fetchGist()` method after `updateGist()`**

```typescript
/**
 * Fetch a Gist by ID. Returns the raw API response data.
 * Used for legacy migration when gist_filename is unknown.
 */
async fetchGist(gistId: string): Promise<{ success: boolean; data?: any; error?: string; status?: number }> {
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
      return {
        success: true,
        data: response.json,
      };
    }

    if (response.status === 401) {
      return {
        success: false,
        error: 'Authentication failed. Please check your GitHub PAT.',
        status: response.status,
      };
    }

    return {
      success: false,
      error: `Failed to fetch Gist (${response.status})`,
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
```

- [ ] **Step 2: Run build to verify no syntax errors**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/gistService.ts
git commit -m "feat(gist): add fetchGist() for legacy filename recovery

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Modify `publishToGist()` to use PATCH for existing Gists

**Files:**
- Modify: `src/gistService.ts`

- [ ] **Step 1: Replace the `publishToGist()` method body (lines 32-75)**

Replace the current `publishToGist()` implementation with:

```typescript
async publishToGist(
  content: string,
  filename: string,
  existingGistId?: string
): Promise<GistPublishResult> {
  const settings = this.getSettings();

  // If existing Gist, PATCH update in-place
  if (existingGistId) {
    const result = await this.updateGist(content, filename, filename, existingGistId);

    // Return immediately on auth failure (401)
    if (result.status === 401) {
      return { success: false, error: result.error };
    }

    // Return immediately on 404 - gist may have been deleted
    if (result.status === 404) {
      return {
        success: false,
        error: 'Gist not found. It may have been deleted. Use Rename & Share to Gist to create a new one.',
      };
    }

    // For 422 (legacy file-not-found), try legacy recovery
    if (result.status === 422) {
      // Attempt to recover old filename from remote
      const fetchResult = await this.fetchGist(existingGistId);
      if (fetchResult.success && fetchResult.data) {
        const files = fetchResult.data.files;
        const fileKeys = Object.keys(files || {});
        if (fileKeys.length === 1) {
          const remoteFilename = fileKeys[0];
          const retryResult = await this.updateGist(content, filename, remoteFilename, existingGistId);
          if (retryResult.success) {
            return {
              success: true,
              gistId: retryResult.gistId!,
              gistUrl: retryResult.gistUrl!,
            };
          }
          // If retry also fails, fall through to return retry error
          return { success: false, error: retryResult.error };
        }
      }
      return { success: false, error: result.error || 'Failed to recover Gist filename' };
    }

    // Retry on network/5xx/408/429
    if (!result.success && this.isRetryableStatus(result.status)) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await this.delay(1000);
        const retryResult = await this.updateGist(content, filename, filename, existingGistId);
        if (retryResult.success) {
          return {
            success: true,
            gistId: retryResult.gistId!,
            gistUrl: retryResult.gistUrl!,
          };
        }
        // Only retry if still retryable
        if (!this.isRetryableStatus(retryResult.status)) {
          break;
        }
      }
      return { success: false, error: 'Max retries exceeded' };
    }

    if (result.success) {
      return {
        success: true,
        gistId: result.gistId!,
        gistUrl: result.gistUrl!,
      };
    }

    return { success: false, error: result.error };
  }

  // No existing Gist - create new
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
```

- [ ] **Step 2: Add helper `isRetryableStatus()` method after `delay()` (around line 164)**

```typescript
/**
 * Returns true if the status code indicates a retryable error.
 */
private isRetryableStatus(status?: number): boolean {
  if (!status) return false;
  // Network errors have no status; retry them
  // 408 Request Timeout, 429 Rate Limited, 5xx Server Errors
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}
```

- [ ] **Step 3: Run build to verify no syntax errors**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src/gistService.ts
git commit -m "refactor(gist): use PATCH in-place for existing Gists

- publishToGist() now calls updateGist() for existing Gist ID
- deleteGist() no longer called from publishToGist()
- Add isRetryableStatus() helper for retry logic
- Add 422 legacy recovery flow with fetchGist()

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Remove `deleteGist()` method from GistService

**Files:**
- Modify: `src/gistService.ts`

- [ ] **Step 1: Remove the entire `deleteGist()` method (lines 79-99)**

Delete these lines completely:
```typescript
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
```

- [ ] **Step 2: Run build to verify no syntax errors**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/gistService.ts
git commit -m "feat(gist): remove deleteGist() method

No longer needed since we use PATCH in-place update

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Add `getGistFilenameFromFrontmatter()` in main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add `getGistFilenameFromFrontmatter()` after `getGistUrlFromFrontmatter()` (around line 577)**

```typescript
/**
 * Extract gist_filename from frontmatter.
 * Returns undefined if not present (legacy file shared before this update).
 */
private getGistFilenameFromFrontmatter(content: string): string | undefined {
  const match = content.match(/^gist_filename:\s*(.+)\s*$/m);
  if (match) {
    let filename = match[1].trim();
    // Strip surrounding quotes if present
    if ((filename.startsWith('"') && filename.endsWith('"')) || (filename.startsWith("'") && filename.endsWith("'"))) {
      filename = filename.slice(1, -1);
    }
    return filename;
  }
  return undefined;
}
```

- [ ] **Step 2: Run build to verify no syntax errors**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): add getGistFilenameFromFrontmatter()

Used to track Gist filename for rename support

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Update `addGistFrontmatter()` to include `gist_filename`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace the `addGistFrontmatter()` method (lines 604-615)**

```typescript
private addGistFrontmatter(content: string, gistId: string, gistUrl: string, gistFilename: string): string {
  const frontmatter = `gist_id: "${gistId}"
gist_url: "${gistUrl}"
gist_filename: "${gistFilename}"
`;
  if (content.startsWith('---')) {
    // Insert after opening --- and frontmatter block
    const endOfFrontmatter = content.indexOf('---', 3);
    if (endOfFrontmatter !== -1) {
      return content.slice(0, endOfFrontmatter + 3) + '\n' + frontmatter + content.slice(endOfFrontmatter + 3);
    }
  }
  // No frontmatter exists, add at top
  return '---\n' + frontmatter + '---\n' + content;
}
```

- [ ] **Step 2: Update all call sites of `addGistFrontmatter()`**

Find and update calls (around lines 477, 481):
- Line 477: `this.addGistFrontmatter(finalContent, gistResult.gistId!, gistResult.gistUrl!)`
  → Change to: `this.addGistFrontmatter(finalContent, gistResult.gistId!, gistResult.gistUrl!, sanitizedTitle + ext)`
- Line 481: same call already updated above

- [ ] **Step 3: Run build to verify no syntax errors**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): add gist_filename to frontmatter schema

addGistFrontmatter() now adds gist_filename field

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Add "Update Gist" command

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add new `update-gist` command after `paste-to-note` command (after line 191)**

```typescript
this.addCommand({
  id: 'update-gist',
  name: 'Update Gist',
  editorCallback: async (editor: Editor) => {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('No active file found.');
      return;
    }
    await this.updateGistForFile(file);
  },
});
```

- [ ] **Step 2: Add right-click menu item for Update Gist (after file-menu registration, around line 204)**

Add after the file-menu item for "Rename & Share to Gist":

```typescript
this.registerEvent(
  this.app.workspace.on('file-menu', (menu, file) => {
    if (file instanceof TFile && file.extension === 'md') {
      menu.addItem((item) =>
        item
          .setTitle('Update Gist')
          .setIcon('lucide-refresh-cw')
          .onClick(() => this.updateGistForFile(file))
      );
    }
  })
);
```

- [ ] **Step 3: Add `updateGistForFile()` method**

Add after `copyTitleAndGistLink()` method (around line 602):

```typescript
/**
 * Update an existing Gist with local file content.
 * No AI title generation, no rename, no GFM transformation.
 */
private async updateGistForFile(file: TFile): Promise<void> {
  try {
    const content = await this.app.vault.cachedRead(file);
    const gistId = this.getGistIdFromFrontmatter(content);
    const gistFilename = this.getGistFilenameFromFrontmatter(content);

    if (!gistId) {
      new Notice('No Gist found. Use "Rename & Share to Gist" first.');
      return;
    }

    const statusBarItem = this.addStatusBarItem();
    statusBarItem.setText('Updating Gist...');

    // Extract raw markdown body (remove frontmatter for upload)
    let uploadContent = content;
    if (content.startsWith('---')) {
      const endOfFrontmatter = content.indexOf('---', 3);
      if (endOfFrontmatter !== -1 && endOfFrontmatter < 50) {
        // Frontmatter exists and is at the start
        uploadContent = content.slice(endOfFrontmatter + 3).trim();
      }
    }

    // Determine old and new filename
    const localBasename = file.basename + '.' + file.extension;
    const oldFilename = gistFilename || localBasename;
    const newFilename = localBasename;

    // PATCH update to existing Gist
    const gistResult = await this.gistService.updateGist(uploadContent, newFilename, oldFilename, gistId);

    if (gistResult.success) {
      // Update frontmatter with new gist info
      const updatedFrontmatter = this.addGistFrontmatter(
        content,
        gistResult.gistId!,
        gistResult.gistUrl!,
        newFilename
      );
      await this.app.vault.modify(file, updatedFrontmatter);
      new Notice(`Gist updated: ${gistResult.gistUrl}`);
    } else {
      new Notice(`Failed to update Gist: ${gistResult.error}`);
    }

    statusBarItem.remove();
  } catch (error) {
    new Notice(`Failed to update Gist: ${(error as Error).message}`);
  }
}
```

- [ ] **Step 4: Run build to verify no syntax errors**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): add Update Gist command

- New command 'update-gist' for pure content sync
- No AI, no rename, no GFM transformation
- Updates frontmatter on success

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Shorten all command names

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update command names (lines 63-80)**

Change:
- Line 65: `'Rename title and share to Gist'` → `'Rename & Share to Gist'`
- Line 71: `'Copy title and Gist link'` → `'Copy Gist Link'`
- Line 83: `'Paste clipboard & share to Gist'` → `'Paste & Share to Gist'`

- [ ] **Step 2: Update menu item titles (lines 198, 215)**

Change:
- Line 198: `'.setTitle('Rename title and share to Gist')` → `'.setTitle('Rename & Share to Gist')`
- Line 215: `'.setTitle(`Rename ${markdownFiles.length} titles and share to Gist`)` → `'.setTitle(`Rename ${markdownFiles.length} Titles & Share to Gist`)`

- [ ] **Step 3: Run build to verify no syntax errors**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "refactor(main): shorten command names

- Rename title and share to Gist → Rename & Share to Gist
- Copy title and Gist link → Copy Gist Link
- Paste clipboard & share to Gist → Paste & Share to Gist
- Rename N titles and share to Gist → Rename N Titles & Share to Gist

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Final build verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 2: Review changed files**

Run: `git diff --stat HEAD~9`
Expected: Changes in `src/gistService.ts` and `src/main.ts` only

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| PATCH in-place update (existing Gist) | Task 3 |
| `updateGist()` method | Task 1 |
| `fetchGist()` for legacy fallback | Task 2 |
| `publishToGist()` branches: PATCH vs POST | Task 3 |
| Remove `deleteGist()` | Task 4 |
| `getGistFilenameFromFrontmatter()` | Task 5 |
| `addGistFrontmatter()` with gist_filename | Task 6 |
| "Update Gist" command | Task 7 |
| Right-click menu for Update Gist | Task 7 |
| Shorten command names | Task 8 |
| Frontmatter update after PATCH success | Task 7 |
| 422 legacy recovery with fetchGist | Task 3 |
| Retry only for network/408/429/5xx | Task 3 |

All spec requirements covered.
