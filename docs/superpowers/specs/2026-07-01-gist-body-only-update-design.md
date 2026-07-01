# Gist Body-Only Update — Design Spec

## Context

The "Update Gist" command and the gist-sharing path of "Rename & Share to Gist"
both exhibit two recurring bugs that break user content:

1. **Frontmatter corruption.** After running Update Gist, the local file's
   frontmatter is missing fields, has stray quotes, or gains bogus entries.
2. **Body truncation.** A file with a 100%-complete body ends up with ~25% of
   its content on the Gist — the rest is silently dropped.

Both share a single root cause: the current code path parses frontmatter with
the defensive `parseFrontmatter()` helper (which scans line-by-line for
`^[A-Za-z0-9_-][A-Za-z0-9_.\- ]*:` keys and treats anything else as body), and
then hands the resulting `body` to the Gist API. When the frontmatter block
contains multi-line values (YAML lists, nested objects, indented continuation
lines), `parseFrontmatter` either absorbs prose as bogus keys (corrupting
body) or stops at the first non-key line and re-attaches the dropped lines to
the body — producing a body that does not match the file. Additionally,
"Update Gist" sends `description: newFilename` in PATCH, which mutates the
Gist title even though the user only wanted a body sync.

The 2026-05-04 spec already stated the correct intent: "Gist content does NOT
include frontmatter. Local file has frontmatter; Gist contains only the
markdown body." This spec implements what that sentence promised.

## Goals

1. Update Gist sends the body of the local file to the Gist API verbatim,
   with zero frontmatter leakage.
2. Update Gist leaves the Gist's `description` and `filename` untouched —
   title is preserved.
3. Rename & Share to Gist (existing-gist path) sends body only and respects
   rename semantics (description + filename rename).
4. Create-new-gist paths (Paste & Share, Rename & Share first-run) also send
   body only — consistent with the spec.
5. No regressions in `Normalize Gist Frontmatter`, GFM pipeline, or other
   commands that legitimately need YAML field-by-field access.

## Non-Goals

- Refactoring `parseFrontmatter()` for multi-line YAML values.
- Adding a YAML parsing dependency (e.g. `gray-matter`).
- Changing the `Normalize Gist Frontmatter` command.
- Auto-cleaning existing gists that already embed frontmatter (user runs
  Update Gist once to overwrite).

## Approach

Add a single helper `extractFrontmatterAndBody()` to `main.ts` that uses the
same anchored regex as the existing `splitFrontmatter()` helper (i.e. treats
the frontmatter block as opaque text), then call it from every path that
needs to send body-only content to the Gist API.

Add an optional `options` parameter to `GistService.publishToGist()` (and
through to `updateGist()`) so the Update Gist command can request
`skipDescription` and `skipFilenameRename`, leaving the Gist's title alone.

`parseFrontmatter()` stays untouched. It remains the right tool for
field-by-field YAML editing (used by `Normalize Gist Frontmatter` and
frontmatter re-write after successful PATCH).

## Architecture

### Helper: `extractFrontmatterAndBody()`

Location: `src/main.ts`, alongside the existing `splitFrontmatter()`.

```typescript
/**
 * Extract frontmatter block and body using simple anchored regex.
 * Use this for "send body only" flows where YAML field shape doesn't matter.
 *
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
}
```

Implementation uses regex `/^---\n([\s\S]*?)\n---\n?/`:

- `^---\n` anchors to file start — `\n---\n` horizontal rules inside body
  do not get treated as frontmatter.
- Non-greedy `([\s\S]*?)` stops at the first closing `\n---\n?`.
- Trailing `\n?` consumes one optional newline after closing fence — same as
  `splitFrontmatter()`.

### Data Flow — Update Gist Command

```
Local file content
   │
   ├──► extractFrontmatterAndBody() ── body verbatim, no YAML parsing
   │
   ├──► gistService.publishToGist(body, localBasename, gistId, {
   │       skipDescription: true,
   │       skipFilenameRename: true
   │     })
   │
   └──► On success, only rewrite local frontmatter if API's gist_url/filename
        differs from what's already stored (no-op otherwise).
```

Update local frontmatter policy:

- If API response `gist_url` equals existing `gist_url` and `gist_filename`
  equals `localBasename` → skip `vault.modify`. The PATCH-only-success path
  should not touch the file unless metadata actually changed.
- This eliminates a class of "frontmatter changes for no reason" bugs.

### Data Flow — Rename & Share to Gist

```
Local file content ──► GFM pipeline ──► finalContent (frontmatter + body)
   │
   ├──► extractFrontmatterAndBody(finalContent)  ── body is GFM-transformed
   │
   ├──► gistService.publishToGist(body, newFilename, existingGistId)
   │       // no options → PATCH sends description=newFilename + filename rename
   │
   └──► Local frontmatter re-written with response gist_url/filename
```

When `existingGistId` is undefined (first-run create), `publishToGist`
dispatches to `createGistWithRetry()` → POST with body only. Description
defaults to filename (unchanged from today).

### Data Flow — Paste & Share to Gist

Clipboard content (no frontmatter expected) → `extractFrontmatterAndBody()`
returns `{ frontmatter: '', body: clipboard, hasFrontmatter: false }`. Body
passed to `publishToGist`. If a `gist_id` exists in target file's frontmatter
(someone pasted then ran Paste & Share), Update path applies the same body
+ skip rules.

## Components & Contracts

### `src/main.ts`

**Add `extractFrontmatterAndBody()`** — see Architecture section.

**Modify `updateGistForFile()`** (currently `main.ts:757`):

- Replace `const { fm, body, hasFrontmatter } = this.parseFrontmatter(content);`
  with `const { body } = this.extractFrontmatterAndBody(content);` — eliminates
  field-by-field parsing entirely for this command.
- Remove the lines that pre-write `gist_url` to `''` and `gist_filename` to
  `newFilename` before upload. Today those mutate the local Map before the
  PATCH; if upload fails, those mutations persist on the next `serialize`.
- Pass `{ skipDescription: true, skipFilenameRename: true }` to
  `publishToGist()`.
- On success: rewrite local frontmatter only if `gist_url` or
  `gist_filename` differs from existing values. Use `parseFrontmatter()` to
  build the Map and `serializeFrontmatter()` to write it back — these remain
  the right tool for field-by-field frontmatter edits. Note: `parseFrontmatter`
  is defensive and emits a `console.warn` if the existing frontmatter is
  malformed; this spec does not change parser semantics.
- Status bar text: keep `Updating Gist...`; on success remove without extra
  text (Notice shows URL).
- On failure: Notice shows `gistResult.error` (already provided by
  `publishToGist`).

**Modify `processSingleFile()` gist-share block** (currently `main.ts:573`):

- Before: `await this.gistService.publishToGist(finalContent, sanitizedTitle + ext, existingGistId);`
- After:
  ```typescript
  const { body: gistBody } = this.extractFrontmatterAndBody(finalContent);
  await this.gistService.publishToGist(gistBody, sanitizedTitle + ext, existingGistId);
  ```
- This applies to both create-new and update-existing dispatch — `publishToGist`
  branches internally.

**Add helper** `getGistUrlFromFrontmatter()`:

```typescript
/**
 * Read gist_url from frontmatter. Used by updateGistForFile to decide
 * whether the local file needs re-writing after PATCH.
 */
private getGistUrlFromFrontmatter(content: string): string | undefined {
  const { fm } = this.parseFrontmatter(content);
  return fm.get('gist_url');
}
```

Mirrors the existing `getGistIdFromFrontmatter()` and
`getGistFilenameFromFrontmatter()` helpers.

### `src/gistService.ts`

**Modify `publishToGist()` signature**:

```typescript
interface PublishOptions {
  /** PATCH only: don't send `description` field, leave Gist title untouched. */
  skipDescription?: boolean;
  /** PATCH only: don't send `filename` rename, leave Gist filename untouched. */
  skipFilenameRename?: boolean;
}

async publishToGist(
  content: string,
  filename: string,
  existingGistId?: string,
  options?: PublishOptions
): Promise<GistPublishResult>;
```

`options` is forwarded to `updateExistingGist()` when `existingGistId` is set;
ignored by `createGistWithRetry()` (create path doesn't use it).

**Modify `updateExistingGist()` signature**:

```typescript
private async updateExistingGist(
  content: string,
  filename: string,
  existingGistId: string,
  options?: PublishOptions  // NEW
): Promise<GistPublishResult>;
```

Pass `options` through to `updateGist()` in the retry loop and the 422
filename-recovery retry path.

**Modify `updateGist()` signature & PATCH body**:

```typescript
async updateGist(
  content: string,
  newFilename: string,
  oldFilename: string,
  gistId: string,
  options?: PublishOptions  // NEW
): Promise<GistPublishResult & { status?: number }>;
```

Build PATCH body conditionally:

```typescript
const fileEntry: Record<string, unknown> = { content };
if (!options?.skipFilenameRename && oldFilename !== newFilename) {
  fileEntry.filename = newFilename;
}
const patchBody: Record<string, unknown> = {
  files: { [oldFilename]: fileEntry },
};
if (!options?.skipDescription) {
  patchBody.description = newFilename;
}
// PATCH with JSON.stringify(patchBody)
```

Defaults preserve today's behavior for any caller that omits `options`.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| File without `gist_id` | Notice "No Gist found. Use 'Rename & Share to Gist' first." — unchanged |
| File with empty `gist_id` value | Same as above (existing helper returns undefined for empty) |
| Body is empty string | PATCH with `content: ""` — GitHub accepts; Gist shows empty file |
| Body contains `\n---\n` horizontal rule | Anchored `^---\n` regex does not absorb — body preserved |
| Frontmatter with multi-line YAML (lists, nested objects) | Non-greedy match stops at first closing `---` — full frontmatter intact, body intact |
| File with malformed frontmatter (no closing `---`) | Return `{ frontmatter: '', body: content, hasFrontmatter: false }` — Gist receives full file. Predictable; user sees oddly-shaped gist, no data loss |
| Gist API returns 422 (legacy filename mismatch) on Update | Retry logic unchanged — fetch remote filename, retry PATCH once. Options preserved on retry |
| Gist API returns 401 | Auth error Notice, no retry — unchanged |
| Gist API returns 404 | "Gist not found" Notice — unchanged |
| Network failure | Retry 3× with 1s delay — unchanged |

## Migration & Rollout

### Risk Assessment

- **Cumulative blast radius:** Medium (touches 2 commands + GistService).
  Mitigated by additive `options?` parameter and one new private method.
- **Backwards compatibility:** `parseFrontmatter` and `splitFrontmatter`
  unchanged. All existing callers of `publishToGist` that omit `options`
  compile and behave identically.
- **Existing gists with embedded frontmatter** (created before this fix):
  not auto-cleaned. User runs Update Gist once → overwritten with body-only.
  Documented in release notes if any.

### Commit Strategy

One commit per concern, per the project's `fix(...):` convention:

1. `docs(spec): design for gist body-only update` — this file
2. `fix(gist): add extractFrontmatterAndBody helper using anchored regex`
3. `fix(gist): send body only from processSingleFile share path`
4. `fix(gist): split body via anchored regex on Update Gist command`
5. `fix(gist): skip description and filename rename on Update Gist command`
6. `chore: bump version to X.Y.Z [skip ci]` — auto-generated

### Rollback

Single `git revert <commit>` per concern. Each commit is independently
reviewable and revertable.

## Verification

`npm run build` is the project's sole automated gate. Per CLAUDE.md,
verification standard is:

| Check | Method |
|-------|--------|
| TypeScript compiles | `npm run build` |
| `extractFrontmatterAndBody` regex does not absorb body prose | code review: regex anchored `^---\n`, non-greedy match |
| Frontmatter multi-line values preserved | code review: regex captures everything between `---\n` and `\n---` |
| Update Gist skips description | code review: `if (!options?.skipDescription) patchBody.description = ...` |
| Update Gist skips filename rename | code review: `if (!options?.skipFilenameRename && old !== new)` |
| Rename & Share still works | code review: caller doesn't pass `options` — defaults unchanged |
| `parseFrontmatter` unchanged | diff scope check |
| `splitFrontmatter` unchanged | diff scope check |

### Acceptance Criteria

1. **Body verbatim.** A file whose frontmatter contains
   `tags:\n  - a\n  - b` (or any multi-line YAML) → Update Gist → Gist content
   matches `body` exactly, byte-for-byte.
2. **Frontmatter untouched on success-without-change.** Update Gist when API
   response matches existing frontmatter values → no `vault.modify` call,
   no frontmatter mutation.
3. **Gist title preserved.** Update Gist → Gist's `description` field
   (visible on `gist.github.com/<id>`) is identical before and after.
4. **Rename behavior preserved.** "Rename & Share to Gist" with new title →
   Gist description and filename change (description set, `filename` field
   in PATCH), `gist_id` unchanged.
5. **Create path body-only.** Paste & Share / first-run Rename & Share →
   Gist content equals local body, no frontmatter.
6. **Build clean.** `npm run build` exits 0, no new TypeScript errors.
