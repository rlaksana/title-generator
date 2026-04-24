# Gist Auto-Share Feature Design

## Context

User wants to automatically share note content to GitHub Gist after title generation and GFM reformatting is complete. The file remains in the Obsidian vault as source of truth, with Gist as a public backup/mirror.

## Requirements Summary

1. **Timing**: Gist publish ONLY after title generation + GFM reformat + file rename complete
2. **Visibility**: Secret Gist (not visible on GitHub profile)
3. **Content**: Full note content after GFM reformat
4. **Error Handling**: Retry 3x on failure; if all fail, rollback file rename entirely
5. **Re-processing**: Delete old Gist → create new Gist (1 Gist per note, identified by stored `gist_id` in frontmatter)
6. **Clipboard**: Auto-copy `"Title | https://gist.github.com/..."` after successful publish
7. **Settings**: Toggle `enableGistAutoShare` + GitHub PAT input

## Data Flow

```
processSingleFile()
  ├─ Generate title (AI)
  ├─ Handle duplicate titles (if enabled)
  ├─ GFM reformat body (if enabled) → finalContent
  ├─ Rename file in vault
  ├─ Write frontmatter (gist_id, gist_url) to vault file
  ├─ Share to Gist (secret, full content after GFM)
  │    ├─ Retry 3x on failure
  │    └─ On 3rd fail: ROLLBACK rename + remove frontmatter
  └─ Copy "Title | URL" to clipboard
```

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `src/gistService.ts` | **CREATE** | Gist API logic (create, delete, retry) |
| `src/types.ts` | MODIFY | Add `GistSettings` interface |
| `src/settings.ts` | MODIFY | Add settings UI (toggle + PAT input) |
| `src/main.ts` | MODIFY | Call gistService after rename, handle rollback |

## Types

### Settings Interface Addition (`types.ts`)

```typescript
interface GistSettings {
  enableGistAutoShare: boolean;
  githubPat: string;
}

interface GistFile {
  filename: string;
  content: string;
}

interface GistApiResponse {
  id: string;
  html_url: string;
  files: Record<string, { raw_url: string }>;
}

interface GistPublishResult {
  success: boolean;
  gistId?: string;
  gistUrl?: string;
  error?: string;
}
```

### Frontmatter Fields (added to note after successful publish)

```yaml
gist_id: "abc123def456..."
gist_url: "https://gist.github.com/user/abc123def456..."
```

## `gistService.ts` API

```typescript
export class GistService {
  constructor(
    private getSettings: () => { githubPat: string; enableGistAutoShare: boolean }
  ) {}

  /**
   * Create or update a secret Gist with note content.
   * If existingGistId is provided, deletes old Gist first (re-processing flow).
   * @returns GistPublishResult
   */
  async publishToGist(
    content: string,
    filename: string,
    existingGistId?: string
  ): Promise<GistPublishResult>

  /**
   * Delete a Gist by ID. Returns true on success.
   */
  private async deleteGist(gistId: string): Promise<boolean>
}
```

## `publishToGist` Implementation Logic

```
1. If existingGistId → call deleteGist(existingGistId)
2. For attempt in [1, 2, 3]:
     a. Format files: { "<filename>": { content } }
     b. POST to https://api.github.com/gists (secret)
     c. If status 201 → return { success: true, gistId, gistUrl }
     d. If attempt < 3 → wait 1s, retry
     e. If attempt === 3 → return { success: false, error }
```

## GitHub API Details

- **Endpoint**: `POST https://api.github.com/gists`
- **Headers**:
  ```
  Authorization: Bearer <githubPat>
  Accept: application/vnd.github+json
  X-GitHub-Api-Version: 2022-11-28
  Content-Type: application/json
  ```
- **Body**:
  ```json
  {
    "description": "<filename>",
    "public": false,
    "files": { "<filename>": { "content": "<full content>" } }
  }
  ```
- **Success**: 201 Created → response contains `id` and `html_url`
- **Auth failure**: 401 Unauthorized → do not retry

## Settings UI (`settings.ts`)

New section after "Gist / GFM Reformatting":

```typescript
/* --- Gist Auto-Share Settings --- */
containerEl.createEl('h3', { text: 'Gist Auto-Share' });

new Setting(containerEl)
  .setName('Auto-share to Gist')
  .setDesc('After generating a title, automatically publish the note to a secret GitHub Gist.')
  .addToggle(toggle => toggle
    .setValue(this.plugin.settings.enableGistAutoShare)
    .onChange(async (value) => {
      this.plugin.settings.enableGistAutoShare = value;
      await this.plugin.saveSettings();
    }));

if (this.plugin.settings.enableGistAutoShare) {
  // GitHub PAT input (same pattern as API key inputs with cancel/ok buttons)
  // ...
}
```

## Rollback Logic (`main.ts`)

If `publishToGist()` fails after 3 retries:

```typescript
// Rollback: rename file back to original path
await this.app.fileManager.renameFile(
  app.vault.getAbstractFileByPath(candidatePath) as TFile,
  file.path  // original path
);
// Remove gist frontmatter if it was added
if (frontmatterAdded) {
  await this.app.vault.modify(file, contentWithoutGistFrontmatter);
}
new Notice('Gist publish failed after 3 attempts. File rename rolled back.');
```

## Clipboard

After successful Gist publish, copy to clipboard:

```typescript
const clipboardText = `${sanitizedTitle} | ${gistUrl}`;
navigator.clipboard.writeText(clipboardText);
new Notice(`Title & Gist URL copied to clipboard!`);
```

## Edge Cases

1. **No GitHub PAT configured**: Show notice "GitHub PAT required for Gist auto-share" and skip Gist publish
2. **File has existing gist_id but Gist no longer exists**: Proceed with create new Gist (graceful)
3. **Network timeout**: Treat as retryable error
4. **Rate limit (403)**: Retry after delay, up to 3 times
5. **Invalid PAT**: 401 → fail immediately without retry, show error notice

## Testing Considerations

- Mock `requestUrl` responses for 201, 401, 403, 500
- Test rollback path when Gist publish fails
- Test that re-processing a file deletes old Gist and creates new one
- Test clipboard content format
