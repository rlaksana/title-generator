# Gist Body-Only Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two recurring bugs in Gist sharing — local frontmatter corruption
and body truncation — by extracting body via the anchored `splitFrontmatter`
regex (not field-by-field YAML parsing), and by skipping PATCH `description` /
filename rename on the Update Gist command so the Gist title is preserved.

**Architecture:** Add `extractFrontmatterAndBody()` to `main.ts` (same regex
already used by `splitFrontmatter`). Add optional `PublishOptions` parameter to
`GistService.publishToGist()` / `updateExistingGist()` / `updateGist()` so
callers can request `skipDescription` and `skipFilenameRename`. The Update Gist
command uses both; Rename & Share and create paths pass body only without
options (defaults preserve today’s behavior except now body is sent instead of
full content).

**Tech Stack:** TypeScript, Obsidian Plugin API, GitHub Gist API v3, esbuild,
`npm run build` as the verification gate (no test runner exists for this
source).

## Global Constraints

- Verification gate is `npm run build` only (per project `CLAUDE.md`).
  `npm run lint` is broken (ESLint v10 config mismatch) — do NOT run it.
- One fix per commit. Commit message prefix `fix(gist):`. Spec lives at
  `docs/superpowers/specs/2026-07-01-gist-body-only-update-design.md`.
- Do NOT change `parseFrontmatter()` or `splitFrontmatter()` (still used by
  `Normalize Gist Frontmatter` and GFM pipeline respectively).
- Do NOT add new dependencies.
- Auto-version-bump runs on every commit; before pushing run
  `git pull --rebase` per project `CLAUDE.md`.

## File Map

| File | Change |
|------|--------|
| `src/main.ts` | Add `extractFrontmatterAndBody()`; modify `updateGistForFile()` and `processSingleFile()` gist-share block to call it. |
| `src/gistService.ts` | Add `PublishOptions` interface; thread optional `options` through `publishToGist()` → `updateExistingGist()` → `updateGist()`; build PATCH body conditionally on `skipDescription` / `skipFilenameRename`. |

`getGistUrlFromFrontmatter()` already exists at `src/main.ts:694` — no need to add.

---

## Task 1: Add `extractFrontmatterAndBody()` helper in `main.ts`

**Files:**
- Modify: `src/main.ts` (add private method near existing `splitFrontmatter` at ~line 829)

**Interfaces:**
- Consumes: nothing (pure helper)
- Produces: `extractFrontmatterAndBody(content: string): { frontmatter: string; body: string; hasFrontmatter: boolean }`

- [ ] **Step 1: Implement the helper**

Insert after the existing `splitFrontmatter()` method (around line 829). Keep the same regex as `splitFrontmatter` (anchored, non-greedy, optional trailing newline) — the goal is to treat the frontmatter block as opaque text so multi-line YAML values do not get absorbed or truncated.

```typescript
/**
 * Extract the frontmatter block and the body using a simple anchored regex.
 * Treats the frontmatter as opaque text — does NOT parse YAML fields.
 *
 * Use this for "send body only" flows: Gist update, Gist share body-only.
 * Distinct from parseFrontmatter() which builds a Map for round-trip editing.
 *
 * @returns frontmatter = raw YAML text between --- lines (empty if none),
 *          body = everything after closing ---,
 *          hasFrontmatter = whether the regex matched
 */
private extractFrontmatterAndBody(content: string): {
  frontmatter: string;
  body: string;
  hasFrontmatter: boolean;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: '', body: content, hasFrontmatter: false };
  return {
    frontmatter: match[1],
    body: content.slice(match[0].length),
    hasFrontmatter: true,
  };
}
```

- [ ] **Step 2: Verify build still passes**

Run: `npm run build`
Expected: exits 0, no new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "fix(gist): add extractFrontmatterAndBody helper using anchored regex"
```

---

## Task 2: Add `PublishOptions` and thread it through `GistService`

**Files:**
- Modify: `src/gistService.ts`

**Interfaces:**
- Consumes: same as before — `publishToGist(content, filename, existingGistId?)` callers; new optional 4th arg `options?`
- Produces: `PublishOptions` interface exported inside the module; `publishToGist(content, filename, existingGistId?, options?)`, `updateExistingGist(content, filename, existingGistId, options?)`, `updateGist(content, newFilename, oldFilename, gistId, options?)`

- [ ] **Step 1: Add `PublishOptions` interface**

Insert above the `GistService` class declaration (after the `GistDeleteResult` interface at ~line 19). Per project convention, this type lives in `gistService.ts` and is NOT exported across modules — `main.ts` passes values literally.

```typescript
/**
 * Options for gist publish/update operations.
 *
 * skipDescription — PATCH only: omit `description` so Gist title is preserved.
 * skipFilenameRename — PATCH only: omit `filename` rename so the Gist filename
 *   is preserved.
 *
 * Both default to false (today's behavior). Add new fields here when callers
 * need new toggle points.
 */
interface PublishOptions {
  skipDescription?: boolean;
  skipFilenameRename?: boolean;
}
```

- [ ] **Step 2: Update `publishToGist()` signature and dispatch**

Replace the existing `publishToGist` (around line 40):

```typescript
async publishToGist(
  content: string,
  filename: string,
  existingGistId?: string,
  options?: PublishOptions
): Promise<GistPublishResult> {
  if (existingGistId) {
    return this.updateExistingGist(content, filename, existingGistId, options);
  }

  // Create new gist (same as before). Options intentionally ignored on create.
  const settings = this.getSettings();
  return this.createGistWithRetry(content, filename, settings.githubPat);
}
```

- [ ] **Step 3: Update `updateExistingGist()` signature and pass options down**

Replace the signature at line ~57 and the two `updateGist(...)` call sites inside the retry loop (lines ~68 and ~98):

```typescript
private async updateExistingGist(
  content: string,
  filename: string,
  existingGistId: string,
  options?: PublishOptions
): Promise<GistPublishResult> {
  let lastResult: GistPublishResult & { status?: number } = {
    success: false,
    error: 'Unknown error',
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await this.updateGist(content, filename, filename, existingGistId, options);
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
          // Retry with the actual remote filename, preserving options
          const retryResult = await this.updateGist(content, filename, remoteFilename, existingGistId, options);
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
```

- [ ] **Step 4: Update `updateGist()` PATCH body to honor options**

Replace the method at line ~249. The PATCH body is constructed conditionally on the two new options:

```typescript
async updateGist(
  content: string,
  newFilename: string,
  oldFilename: string,
  gistId: string,
  options?: PublishOptions
): Promise<GistPublishResult & { status?: number }> {
  const settings = this.getSettings();

  // Build the per-file entry. Skip the `filename` rename when caller asks,
  // or when old and new are identical (no-op rename is harmless but pointless).
  const fileEntry: Record<string, unknown> = { content };
  if (
    !options?.skipFilenameRename &&
    oldFilename !== newFilename
  ) {
    fileEntry.filename = newFilename;
  }

  // Build the PATCH body. Skip `description` (a.k.a. Gist title) when caller asks.
  const patchBody: Record<string, unknown> = {
    files: { [oldFilename]: fileEntry },
  };
  if (!options?.skipDescription) {
    patchBody.description = newFilename;
  }

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
      body: JSON.stringify(patchBody),
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

- [ ] **Step 5: Verify build still passes**

Run: `npm run build`
Expected: exits 0. Optional params keep all existing callers working; no error.

- [ ] **Step 6: Commit**

```bash
git add src/gistService.ts
git commit -m "fix(gist): support skipDescription and skipFilenameRename PATCH options"
```

---

## Task 3: Rewrite `updateGistForFile()` to use the new helper and options

**Files:**
- Modify: `src/main.ts:757` (`updateGistForFile()` method)

**Interfaces:**
- Consumes: `extractFrontmatterAndBody()` from Task 1; `publishToGist(..., options)` from Task 2; existing helpers `getGistIdFromFrontmatter()`, `getGistFilenameFromFrontmatter()`, `getGistUrlFromFrontmatter()`, `parseFrontmatter()`, `serializeFrontmatter()`.
- Produces: same external behavior as today (Notice on success/failure); local file is rewritten only when API response actually changed `gist_url`/`gist_filename`.

- [ ] **Step 1: Replace the body of `updateGistForFile()`**

Find and replace the entire method body (from `const statusBarItem` through the closing brace). The new flow:

1. Read file content.
2. Extract body via `extractFrontmatterAndBody()` — not `parseFrontmatter()`.
3. Compute `oldFilename` / `newFilename` exactly as today.
4. Call `publishToGist(body, newFilename, gistId, { skipDescription: true, skipFilenameRename: true })`.
5. On success: rewrite local frontmatter only if `gist_url` or `gist_filename` differs from what's already stored. If neither differs, do NOT call `vault.modify`.
6. On failure: Notice shows `gistResult.error`.

```typescript
private async updateGistForFile(file: TFile): Promise<void> {
  const statusBarItem = this.addStatusBarItem();
  try {
    const content = await this.app.vault.cachedRead(file);
    statusBarItem.setText('Updating Gist...');

    const gistId = this.getGistIdFromFrontmatter(content);
    const gistFilename = this.getGistFilenameFromFrontmatter(content);

    if (!gistId) {
      new Notice('No Gist found. Use "Rename & Share to Gist" first.');
      statusBarItem.remove();
      return;
    }

    // Use anchored split-style extraction so multi-line YAML values
    // (lists, nested objects, indented continuations) are not absorbed
    // into or truncated out of the body. parseFrontmatter()'s key-by-key
    // scan is the wrong tool here — we want body verbatim.
    const { body } = this.extractFrontmatterAndBody(content);

    // Compute filenames. We don't rename the Gist on Update (per spec):
    // pass newFilename === oldFilename so skipFilenameRename is a no-op
    // even when caller forgets to set it.
    const localBasename = file.basename + '.' + file.extension;
    const oldFilename = gistFilename || localBasename;
    const newFilename = localBasename;

    const gistResult = await this.gistService.publishToGist(
      body,
      newFilename,
      gistId,
      { skipDescription: true, skipFilenameRename: true }
    );

    if (gistResult.success) {
      // Only rewrite local frontmatter if API response changed something.
      // Avoid touching the file when nothing actually moved — this is the
      // path that previously corrupted frontmatter on every Update.
      const existingUrl = this.getGistUrlFromFrontmatter(content);
      const urlChanged = !!gistResult.gistUrl && gistResult.gistUrl !== existingUrl;
      const filenameChanged = gistFilename !== newFilename;

      if (urlChanged || filenameChanged) {
        const { fm } = this.parseFrontmatter(content);
        fm.set('gist_url', gistResult.gistUrl!);
        fm.set('gist_filename', newFilename);
        const updatedContent = this.serializeFrontmatter(fm, body);
        await this.app.vault.modify(file, updatedContent);
      }

      new Notice(`Gist updated: ${gistResult.gistUrl}`, 5000);
    } else {
      new Notice(`Gist update failed: ${gistResult.error ?? 'Unknown error'}`, 7000);
    }
    statusBarItem.remove();
  } catch (error) {
    statusBarItem.remove();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    new Notice(`Gist update failed: ${errorMessage}`, 7000);
    console.error('[Title Generator] Gist update error:', error);
  }
}
```

Note: Line numbers in your file may shift after earlier commits. Identify by searching for `private async updateGistForFile(`.

- [ ] **Step 2: Verify build still passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Code review self-check**

Walk through these checks before committing:

- [ ] Does the line `const { body } = this.extractFrontmatterAndBody(content)` replace the old `const { fm, body, hasFrontmatter } = this.parseFrontmatter(content)`?
- [ ] Is the call to `publishToGist` passing `body` (not `content`)?
- [ ] Does the `options` object include both `skipDescription: true` AND `skipFilenameRename: true`?
- [ ] Is the local `vault.modify` inside an `if (urlChanged || filenameChanged)` guard?
- [ ] Are the pre-upload `fm.set('gist_id', gistId)`, `fm.set('gist_url', '')`, `fm.set('gist_filename', newFilename)` lines REMOVED? (They previously mutated state before PATCH success.)
- [ ] Is the unused `contentWithGistFields` variable (defined before the old PATCH call) REMOVED?

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "fix(gist): split body via anchored regex and preserve title on Update Gist"
```

---

## Task 4: Make `processSingleFile()` gist-share path body-only

**Files:**
- Modify: `src/main.ts` gist-share block in `processSingleFile()` around line 573

**Interfaces:**
- Consumes: `extractFrontmatterAndBody()` from Task 1; `publishToGist(..., existingGistId?)` from Task 2 (no `options` here — Create and Rename & Share both want `description`/`filename` behavior on the PATCH path).
- Produces: gist receives body only, both for create and update dispatches.

- [ ] **Step 1: Replace the gist-publish call**

Find:

```typescript
const gistResult = await this.gistService.publishToGist(
  finalContent,
  sanitizedTitle + ext,
  existingGistId
);
```

Replace with:

```typescript
// Gist always receives body only — spec line 22 (2026-05-04):
// "Gist content does NOT include frontmatter. Local file has frontmatter;
// Gist contains only the markdown body." Applies to both create-new
// (existingGistId undefined → POST) and update-existing (→ PATCH).
const { body: gistBody } = this.extractFrontmatterAndBody(finalContent);

const gistResult = await this.gistService.publishToGist(
  gistBody,
  sanitizedTitle + ext,
  existingGistId
);
```

- [ ] **Step 2: Verify build still passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Code review self-check**

- [ ] Is the new variable named `gistBody` (not `body`) to avoid shadowing the outer `body` (used later in `processSingleFile` for unrelated lines)?
- [ ] Is the PATCH `existingGistId` still passed in the third positional arg (not via `options`)?
- [ ] Are there no `options` passed? (Both Create and Rename & Share want the default PATCH behavior — `description: newFilename` and `filename` rename when applicable.)

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "fix(gist): send body only from Rename & Share share path"
```

---

## Task 5: Final review and one-shot verification

**Files:**
- Read: `src/main.ts`, `src/gistService.ts`

- [ ] **Step 1: Verify full build is clean**

Run: `npm run build`
Expected: exits 0. No new TypeScript errors. Bundle emitted.

- [ ] **Step 2: Cross-check that no caller of `parseFrontmatter` was disturbed**

Run: `git diff main~<number-of-fix-commits>..HEAD -- src/main.ts`
Expected: only NEW helper `extractFrontmatterAndBody` added; `parseFrontmatter` body unchanged. Specifically check that lines around `parseFrontmatter()` (the long method near line 838) are byte-identical to before.

- [ ] **Step 3: Cross-check that `splitFrontmatter` is unchanged**

Run: `git diff main~<n>..HEAD -- src/main.ts | grep -A 20 splitFrontmatter`
Expected: shows only the comment-block entry, no body changes.

- [ ] **Step 4: Cross-check that PATCH defaults preserve today's behavior**

Read `gistService.ts:updateGist` and confirm: with `options` undefined, the PATCH body is exactly `{ description: newFilename, files: { [oldFilename]: { filename: newFilename, content } } }` for the rename case, and `{ description: newFilename, files: { [oldFilename]: { content } } }` when filenames match (since `oldFilename === newFilename` skips the `filename` field via the guard).

- [ ] **Step 5: Walk the spec acceptance criteria manually**

Cross-reference each acceptance criterion in `docs/superpowers/specs/2026-07-01-gist-body-only-update-design.md`:

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Body verbatim with multi-line YAML | Read `extractFrontmatterAndBody` — regex anchors at start, non-greedy until `\n---\n?`. Multi-line lists survive. |
| 2 | Frontmatter untouched on success-without-change | In `updateGistForFile`, `vault.modify` is gated by `urlChanged \|\| filenameChanged`. |
| 3 | Gist title preserved on Update | Update calls pass `skipDescription: true`. PATCH body has no `description` field. |
| 4 | Rename & Share rename preserved | Rename & Share does NOT pass `options` — defaults apply; PATCH includes `description` and `filename`. |
| 5 | Create path body-only | `processSingleFile` extracts `gistBody` before every `publishToGist(...)` call. |
| 6 | Build clean | Already verified in Step 1. |

- [ ] **Step 6: Bump version per project convention**

Per `CLAUDE.md`: auto version bump runs on every commit. Confirm by inspecting the latest commits — if no `chore: bump version to ...` commit landed after the fix, run:

```bash
npm run version
git add manifest.json versions.json
git commit -m "chore: bump version to <new-version> [skip ci]"
```

- [ ] **Step 7: Push (only when ready)**

Per `CLAUDE.md`, always `git pull --rebase` before push:

```bash
git pull --rebase
git push
```

---

## Self-Review Notes

- **Spec coverage:** Every goal in the spec maps to a task. Goal 1 (body verbatim) → Task 1 helper + Task 3 caller. Goal 2 (preserve title) → Task 3 caller + Task 2 `skipDescription` plumbing. Goal 3 (Rename behavior) → preserved via Task 2 default-options path + Task 4 caller omitting `options`. Goal 4 (create path body-only) → Task 4. Goal 5 (no regressions) → unchanged `parseFrontmatter` / `splitFrontmatter`, called out in Task 5 Steps 2-3.
- **No placeholders.** All code blocks are complete; all commands are exact.
- **Type consistency:** `PublishOptions` defined in Task 2 is used unchanged by Task 3 and Task 4. `extractFrontmatterAndBody` defined Task 1 used by Task 3 and Task 4 (signature matches). `getGistUrlFromFrontmatter` referenced in Task 3 already exists at `src/main.ts:694` (corrected from spec which incorrectly proposed adding it).
- **Self-correction:** The original spec called for a new `getGistUrlFromFrontmatter` helper. It already exists from the 2026-05-04 work. Task 3 references it directly; Task 1 file map drops the "Add `getGistUrlFromFrontmatter()`" line that was in the spec.
