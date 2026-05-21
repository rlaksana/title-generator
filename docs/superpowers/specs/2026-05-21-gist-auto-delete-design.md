# Gist Auto-Delete on Note Deletion — Design Spec

## Context

When a user deletes a note from Obsidian that was previously shared to a GitHub Gist, the Gist remains behind as an orphan. Since Gist is used only for sharing (not storage), orphan Gists are functionally harmless but create clutter in the user's GitHub account.

## Goal

Automatically delete the corresponding GitHub Gist when a note is deleted from Obsidian vault.

## Approach

**A. Option A: Delete on note deletion (chose this)**
- Hook into Obsidian's `app.vault.on('delete', ...)` event
- When a `.md` file is deleted, check its frontmatter for `gist_id`
- If present, call `gistService.deleteGist(gistId)`
- If API call fails, show a `Notice` to the user ("Failed to delete Gist")
- No retry logic — first attempt is sufficient

**B. Option B: Manual delete via right-click menu**
- Rejected — unnecessary UX step for an operation that should be automatic

## Implementation

### Files Touched

- `src/gistService.ts` — add `deleteGist()` method
- `src/main.ts` — register vault delete event listener

### `gistService.deleteGist(gistId: string): Promise<{ success: boolean; error?: string }>`

- Uses DELETE `https://api.github.com/gists/{gist_id}` via GitHub API
- Returns `{ success: true }` on 204 No Content
- Returns `{ success: false, error: string }` on any other status
- No retry logic — if it fails, user gets notified via Notice

### Event Listener in `main.ts`

```typescript
this.registerEvent(
  this.app.vault.on('delete', (file) => {
    if (file instanceof TFile && file.extension === 'md') {
      // Read frontmatter to get gist_id
      // Call gistService.deleteGist(gistId)
      // Show Notice on failure
    }
  })
);
```

**Note:** Cannot use `app.vault.cachedRead()` in delete event since the file is already removed. Instead, use a separate approach — Obsidian does not provide pre-delete content. The `gist_id` must be tracked separately or retrieved from the delete event payload. However, Obsidian's delete event only provides the `TFile` object, not its content.

**Alternative:** Track `gist_id` mapping in plugin data (separate from frontmatter). This requires persisting a `gistId -> filePath` mapping in `loadData()`/`saveData()`.

**Chosen approach:** Read file content synchronously before deletion using `file)` before the delete actually commits. Obsidian's delete event fires after the file is deleted from vault but before it's removed from disk — we can use this timing to attempt reading the file. Actually, Obsidian's `delete` event provides the `TFile` which still has the path. The file content may no longer be accessible via vault APIs.

**Simplest working solution:** Use `app.vault.getAbstractFileByPath(file.path)` check, but since file is already deleted from vault, we cannot read it. The only reliable approach is to maintain a local mapping of `gist_id -> metadata` in plugin data.

**Revised approach:**
1. Maintain a `gistFileMap: Record<gistId, { filename, path }>` in plugin settings/data
2. On note deletion, look up `gist_id` from the file being deleted
3. Call `deleteGist(gistId)`
4. Remove entry from `gistFileMap`

This requires:
- Updating `gistFileMap` whenever a new Gist is created
- Cleaning up `gistFileMap` entry when a Gist is updated (for the old gist_id)
- Cleaning up `gistFileMap` entry when note is deleted

**Alternative (simpler):** Since Obsidian's delete event fires after the file is deleted but the file object still exists with path info, we cannot read frontmatter. Use a persistent mapping.

**Final decision:** Use persistent `gistFileMap` in plugin data. This is the most reliable approach.

## Settings Changes

- No new settings required

## Error Handling

- If Gist delete API fails → show `new Notice('Failed to delete Gist from GitHub')`
- No retry on failure — orphan Gist is acceptable per user requirement

## Verification

- `npm run build` passes
- Manual: delete a note that has `gist_id` in frontmatter, verify Gist is deleted from GitHub, and Notice appears if API fails
