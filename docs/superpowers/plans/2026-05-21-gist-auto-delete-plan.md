# Gist Auto-Delete on Note Deletion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a note is deleted from Obsidian vault, automatically delete the corresponding GitHub Gist if one exists.

**Architecture:** Maintain a `gistFileMap: Record<gistId, { filename: string; path: string }>` in plugin settings. On vault delete event, look up the file's gist_id from this map, call `gistService.deleteGist()`, and clean up the map entry. On gist creation/update, sync the map.

**Tech Stack:** Obsidian Plugin API, GitHub Gist API v3

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/types.ts:268-320` | Add `gistFileMap` to `TitleGeneratorSettings` interface |
| `src/settings.ts:28-99` | Add default empty `gistFileMap: {}` to `DEFAULT_SETTINGS` |
| `src/gistService.ts` | Add `deleteGist()` method using DELETE `/gists/{gist_id}` |
| `src/main.ts` | Register delete event listener, maintain gistFileMap sync |

---

## Task 1: Add `gistFileMap` to Settings Types and Defaults

**Files:**
- Modify: `src/types.ts:268` — add `gistFileMap` field to `TitleGeneratorSettings`
- Modify: `src/settings.ts:28` — add `gistFileMap: {}` to `DEFAULT_SETTINGS`

- [ ] **Step 1: Add `GistFileMapEntry` interface and `gistFileMap` field to `TitleGeneratorSettings` in types.ts**

```typescript
// In types.ts, after line 318 (before the closing brace of TitleGeneratorSettings)

// Gist file mapping entry
export interface GistFileMapEntry {
  filename: string;
  path: string;
}

// Add to TitleGeneratorSettings interface (around line 319)
gistFileMap: Record<string, GistFileMapEntry>;
```

- [ ] **Step 2: Add `gistFileMap: {}` to DEFAULT_SETTINGS in settings.ts**

```typescript
// In settings.ts, after line 98 (before the closing brace of DEFAULT_SETTINGS)
gistFileMap: {},
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/settings.ts
git commit -m "feat: add gistFileMap to settings for gist tracking

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Add `deleteGist()` Method to GistService

**Files:**
- Modify: `src/gistService.ts` — add `deleteGist()` method

- [ ] **Step 1: Add `GistDeleteResult` interface and `deleteGist()` method to gistService.ts**

Add this interface near the top of the file (after line 11, before the GistSettings interface):

```typescript
/**
 * Result of a Gist delete operation
 */
export interface GistDeleteResult {
  success: boolean;
  error?: string;
}
```

Add this method to the `GistService` class (after line 369, after `isRetryableStatus`):

```typescript
/**
 * Delete a Gist by ID via the GitHub API.
 * Uses DELETE /gists/{gist_id} endpoint.
 */
async deleteGist(gistId: string): Promise<GistDeleteResult> {
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

    // 204 No Content = success
    if (response.status === 204) {
      return { success: true };
    }

    // 401 Unauthorized
    if (response.status === 401) {
      new Notice('GitHub authentication failed. Cannot delete Gist.', 7000);
      return {
        success: false,
        error: 'Authentication failed. Please check your GitHub PAT.',
      };
    }

    // 404 Not Found — gist already gone, treat as success
    if (response.status === 404) {
      return { success: true };
    }

    return {
      success: false,
      error: `Gist deletion failed (${response.status}): ${response.text}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Failed to delete Gist: ${errorMessage}`,
    };
  }
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/gistService.ts
git commit -m "feat(gistService): add deleteGist() method

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Register Vault Delete Event and Sync GistFileMap

**Files:**
- Modify: `src/main.ts` — add delete event listener, sync gistFileMap on gist create/update

- [ ] **Step 1: Register vault delete event listener in onload()**

Find in `main.ts` around line 244 (after `this.addSettingTab(...)`):

```typescript
// Register vault delete event to auto-delete corresponding Gist
this.registerEvent(
  this.app.vault.on('delete', async (file) => {
    if (!(file instanceof TFile) || file.extension !== 'md') return;

    // Look up gist_id from the persistent map
    const filePath = file.path;
    let gistIdToDelete: string | undefined;
    let updatedMap = { ...this.settings.gistFileMap };

    for (const [gistId, entry] of Object.entries(updatedMap)) {
      if (entry.path === filePath) {
        gistIdToDelete = gistId;
        break;
      }
    }

    if (!gistIdToDelete) return;

    // Attempt to delete the Gist
    const result = await this.gistService.deleteGist(gistIdToDelete);

    // Clean up the map
    const { [gistIdToDelete]: _, ...rest } = updatedMap;
    this.settings.gistFileMap = rest;
    await this.saveSettings();

    if (!result.success) {
      new Notice('Failed to delete Gist from GitHub');
    }
  })
);
```

- [ ] **Step 2: Sync gistFileMap when new Gist is created (in processSingleFile)**

Find in `main.ts` around line 496 (after successful gist publish, before `// Copy to clipboard`):

```typescript
// Sync gistFileMap when gist is created/updated
if (gistResult.success && gistResult.gistId) {
  this.settings.gistFileMap[gistResult.gistId] = {
    filename: sanitizedTitle + ext,
    path: candidatePath,
  };
  await this.saveSettings();
}
```

- [ ] **Step 3: Clean up old gist_id from map when Gist is updated**

In `processSingleFile`, when an existing gist is being updated (line 485-492), the old gist_id entry should remain in the map but will be cleaned up on delete. No additional action needed since we update the entry with the new gistId if it changes. However, if the note is renamed and gets a NEW gist_id (not just updated), the old entry becomes orphan. Add this logic:

After the `this.settings.gistFileMap[gistResult.gistId] = {...}` block:

```typescript
// If this was an update (existingGistId was present), clean up the old entry
if (existingGistId && existingGistId !== gistResult.gistId) {
  delete this.settings.gistFileMap[existingGistId];
}
```

- [ ] **Step 4: Also sync map in updateGistForFile**

Find in `main.ts` around line 671-681 (after successful `gistService.updateGist`):

```typescript
// Sync gistFileMap
this.settings.gistFileMap[gistResult.gistId!] = {
  filename: newFilename,
  path: file.path,
};
await this.saveSettings();
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: auto-delete Gist when note is deleted from vault

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Verification

1. `npm run build` passes
2. Manual test:
   - Create a note, run "Rename & Share to Gist" → note has `gist_id` in frontmatter
   - Verify `gistFileMap` has an entry in plugin data
   - Delete the note from Obsidian vault
   - Gist should be deleted from GitHub
   - If Gist API fails, Notice should appear saying "Failed to delete Gist from GitHub"
