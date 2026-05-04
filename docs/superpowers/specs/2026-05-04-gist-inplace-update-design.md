# Gist In-Place Update — Design Spec

## Context

When a document has been shared to GitHub Gist, users need to sync local content changes back to the existing Gist without running the full title-generation pipeline. Currently, re-sharing a file deletes the old Gist and creates a new one — this creates duplicate Gists if the delete fails.

## Goals

1. Add "Update Gist" command to sync local content → existing Gist only
2. Change Gist sharing from delete+create to **PATCH in-place update** when Gist already exists
3. Track Gist filename in frontmatter for rename support
4. Shorten all command names

## Frontmatter Schema

```yaml
gist_id: "abc123..."
gist_url: "https://gist.github.com/..."
gist_filename: "original-title.md"
```

**Important:** Gist content does NOT include frontmatter. Local file has frontmatter; Gist contains only the markdown body. `Rename & Share to Gist` applies GFM transformation to body before publishing. `Update Gist` uploads raw markdown body exactly as stored locally.

## Command Changes

| Command ID | Old Name | New Name |
|------------|----------|----------|
| `generate-title` | "Rename title and share to Gist" | "Rename & Share to Gist" |
| `copy-title-gist-link` | "Copy title and Gist link" | "Copy Gist Link" |
| `paste-and-share-to-gist` | "Paste clipboard & share to Gist" | "Paste & Share to Gist" |
| (file-menu) | "Rename title and share to Gist" | "Rename & Share to Gist" |
| (files-menu) | "Rename N titles and share to Gist" | "Rename N Titles & Share to Gist" |
| (new) `update-gist` | — | "Update Gist" |

### New Command: `update-gist`

- **Trigger**: Command palette or right-click file menu
- **Behavior**:
  1. Read `gist_id` and `gist_filename` from frontmatter
  2. If no `gist_id` found → Notice "No Gist found. Use 'Rename & Share to Gist' first."
  3. Read local file content (raw markdown body only — no frontmatter, no GFM transformation)
  4. Determine `oldFilename` and `newFilename`:
     - If `gist_filename` exists: `oldFilename = newFilename = gist_filename`
     - Otherwise: fetch remote Gist filename, use that as oldFilename, current local basename as newFilename
  5. PATCH update to existing Gist via GitHub API
  6. On success: update frontmatter with `gist_id` (from response), `gist_url` (from response.html_url), `gist_filename`
  7. Show success/failure Notice
- **No AI, no rename, no GFM transformation**

## GistService Changes

### New Method: `updateGist()`

```typescript
async updateGist(
  content: string,
  newFilename: string,
  oldFilename: string,
  gistId: string
): Promise<GistPublishResult & { status?: number }>
```

Uses `PATCH /gists/{gist_id}`:

```json
{
  "description": "newFilename.md",
  "files": {
    "oldFilename.md": {
      "filename": "newFilename.md",
      "content": "updated content..."
    }
  }
}
```

Description is always set to the (new) filename. If filename unchanged, `filename` field still included (GitHub handles no-op gracefully).

### Modified Method: `publishToGist()`

```
IF existingGistId present:
  → updateGist()  (PATCH, in-place)
ELSE:
  → createGist()  (POST, new)
```

Delete logic removed. GistService no longer calls `deleteGist()`.

### Removed: `deleteGist()`

Method deleted. No longer needed.

## Legacy Migration Fallback

When `gist_filename` is missing (file shared before this update):

1. Use current local basename as newFilename
2. Attempt PATCH with local basename as oldFilename
3. If PATCH returns 422 (file not found):
   - GET `/gists/{gist_id}`
   - If Gist has exactly one file, extract that remote filename as oldFilename
   - Retry PATCH once with correct oldFilename
4. Persist `gist_filename` in frontmatter after successful update

## Retry Policy

Retry only for:
- Network timeout / DNS failure / socket failure
- HTTP 408 (Request Timeout)
- HTTP 429 (Rate Limited), respecting `Retry-After` header if present
- HTTP 5xx (Server Errors)

Do NOT retry for:
- 401 Unauthorized → show auth error, exit immediately
- 403 Forbidden → show permission error, exit immediately
- 404 Not Found → Gist may have been deleted manually, show error suggesting re-share
- 422 Unprocessable Entity → treat as file-not-found in legacy scenario only (see Legacy Migration Fallback)

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `update-gist` on file without `gist_id` | Notice "No Gist found. Use 'Rename & Share to Gist' first." |
| Gist API returns 404 | Show error "Gist not found. It may have been deleted. Use 'Rename & Share to Gist' to create a new one." |
| Gist API returns 401 | Show auth error Notice, no retry |
| Network failure | Retry up to 3x with 1s delay, then failure notice |
| PATCH returns 422 (legacy) | Fetch remote filename, retry once |
| PATCH succeeds | Update frontmatter from response, show success Notice |

## Frontmatter Handling

### New: `getGistFilenameFromFrontmatter()`

Reads `gist_filename` from frontmatter. Returns undefined if not present (legacy file).

### Updated: `addGistFrontmatter()`

Now includes all three fields:
```typescript
const frontmatter = `gist_id: "${gistId}"
gist_url: "${gistUrl}"
gist_filename: "${filename}"
`;
```

## Rename Behavior (in "Rename & Share to Gist")

When title changes and filename needs to change:

1. `oldFilename = gist_filename` (from frontmatter)
2. `newFilename = sanitized new title + extension`
3. PATCH with description + rename + content update in one call
4. Update frontmatter with new `gist_filename`, `gist_url` from response

## One Gist Per File

This plugin always creates one Gist per markdown file. Each Gist contains a single file.

## Verification

| Test | Expected |
|------|----------|
| Legacy file: has `gist_id`, no `gist_filename`, run `Update Gist` | PATCH succeeds using recovered remote filename; frontmatter gains `gist_filename` |
| Run "Rename & Share to Gist" with new title | Gist renamed (description + file) + content updated, `gist_id` unchanged |
| Gist manually deleted, run `Update Gist` | Notice suggests re-share; no local metadata destroyed |
| Token invalid (401) | Auth error shown; no retry loop |
| Network failure | Retries max 3x, then failure notice |
| Success on `Update Gist` | Frontmatter updated (id, url, filename from response), success Notice shown |
| Verify `gist_url` unchanged after Update Gist | URL remains stable (same gist ID) |
