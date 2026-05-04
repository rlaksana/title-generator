import {
  App,
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  Setting,
  TFile,
  WorkspaceLeaf,
  normalizePath,
  Modal,
} from 'obsidian';
import path from 'path-browserify';
import { AIService } from './aiService';
import { DEFAULT_SETTINGS, TitleGeneratorSettingTab } from './settings';
import { initializeLogger, getLogger, updateLoggerConfig } from './logger';
import { initializeErrorHandler, getErrorHandler } from './errorHandler';
import {
  initializeValidationService,
  getValidationService,
} from './validation';
import { PLUGIN_NAME, UI_CONFIG } from './constants';
import { GfmService } from './gfmService';
import { GistService } from './gistService';
import type {
  TitleGeneratorSettings,
  FileOperationResult,
  BatchOperationProgress,
} from './types';

export default class TitleGeneratorPlugin extends Plugin {
  settings: TitleGeneratorSettings;
  aiService: AIService;
  gfmService: GfmService;
  gistService: GistService;
  private logger = initializeLogger({
    debugMode: false,
    pluginName: PLUGIN_NAME,
  });
  private errorHandler = initializeErrorHandler();
  private validationService = initializeValidationService();

  async onload() {
    try {
      await this.loadSettings();
      this.addStyles();

      // Update logger with current debug mode setting
      updateLoggerConfig({ debugMode: this.settings.debugMode });

      // Initialize AI service with enhanced error handling
      this.aiService = new AIService(() => this.settings);

      // Initialize GFM service
      this.gfmService = new GfmService();

      // Initialize Gist service
      this.gistService = new GistService(() => ({
        githubPat: this.settings.githubPat,
        enableGistAutoShare: this.settings.enableGistAutoShare,
      }));

      this.addCommand({
        id: 'generate-title',
        name: 'Rename & Share to Gist',
        editorCallback: (editor: Editor) => this.generateTitleForEditor(editor),
      });

      this.addCommand({
        id: 'copy-title-gist-link',
        name: 'Copy Gist Link',
        editorCallback: (editor: Editor) => {
          const file = this.app.workspace.getActiveFile();
          if (!file) {
            new Notice('No active file found.');
            return;
          }
          this.copyTitleAndGistLink(file);
        },
      });

      this.addCommand({
        id: 'paste-and-share-to-gist',
        name: 'Paste & Share to Gist',
        callback: async () => {
          try {
            // Check for required keys (needs Gist)
            const ready = await this.checkAndPromptForKeys(true);
            if (!ready) return;

            const clipboardText = await navigator.clipboard.readText();
            if (!clipboardText.trim()) {
              new Notice('Clipboard is empty.');
              return;
            }
            // Check if current tab is empty (no MarkdownView = "No file is open")
            // If empty, reuse the tab. If not empty, create a new tab.
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            let leaf: WorkspaceLeaf;
            if (!activeView) {
              // Empty tab - use the current leaf
              leaf = this.app.workspace.getLeaf(false)!;
            } else {
              // Has content - create a new tab
              leaf = this.app.workspace.getLeaf('tab');
            }
            // Create a new untitled note and open it in the leaf
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `Paste-${timestamp}.md`;
            const newFile = await this.app.vault.create(filename, '');
            await leaf.openFile(newFile);
            // Wait for the file to be available
            let activeFile: TFile | null = null;
            let attempts = 0;
            while (attempts < 20) {
              activeFile = this.app.workspace.getActiveFile();
              if (activeFile) break;
              await new Promise(resolve => setTimeout(resolve, 100));
              attempts++;
            }
            if (!activeFile) {
              new Notice('Failed to create new note.');
              return;
            }
            // Replace content with clipboard
            if (leaf.view) {
              const editor = (leaf.view as any).editor as Editor | null;
              if (editor) editor.replaceSelection(clipboardText);
            }
            await this.processSingleFile(activeFile, clipboardText, { forceGfm: true, forceGist: true });
          } catch (error) {
            new Notice(`Failed to paste and share: ${(error as Error).message}`);
          }
        },
      });

      this.addCommand({
        id: 'paste-to-note',
        name: 'Paste to new note',
        callback: async () => {
          try {
            // Check for required keys (AI key only, no Gist needed)
            const ready = await this.checkAndPromptForKeys(false);
            if (!ready) return;

            const clipboardText = await navigator.clipboard.readText();
            if (!clipboardText.trim()) {
              new Notice('Clipboard is empty.');
              return;
            }
            // Check if current tab is empty (no MarkdownView = "No file is open")
            // If empty, reuse the tab. If not empty, create a new tab.
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            let leaf: WorkspaceLeaf;
            if (!activeView) {
              // Empty tab - use the current leaf
              leaf = this.app.workspace.getLeaf(false)!;
            } else {
              // Has content - create a new tab
              leaf = this.app.workspace.getLeaf('tab');
            }
            // Create a new untitled note and open it in the leaf
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `Paste-${timestamp}.md`;
            const newFile = await this.app.vault.create(filename, '');
            await leaf.openFile(newFile);
            // Wait for the file to be available
            let activeFile: TFile | null = null;
            let attempts = 0;
            while (attempts < 20) {
              activeFile = this.app.workspace.getActiveFile();
              if (activeFile) break;
              await new Promise(resolve => setTimeout(resolve, 100));
              attempts++;
            }
            if (!activeFile) {
              new Notice('Failed to create new note.');
              return;
            }
            // Replace content with clipboard
            if (leaf.view) {
              const editor = (leaf.view as any).editor as Editor | null;
              if (editor) editor.replaceSelection(clipboardText);
            }
            // Normal flow - no forced GFM or Gist
            await this.processSingleFile(activeFile, clipboardText);
          } catch (error) {
            new Notice(`Failed to paste to note: ${(error as Error).message}`);
          }
        },
      });

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

      this.registerEvent(
        this.app.workspace.on('file-menu', (menu, file) => {
          if (file instanceof TFile && file.extension === 'md') {
            menu.addItem((item) =>
              item
                .setTitle('Rename & Share to Gist')
                .setIcon('lucide-edit-3')
                .onClick(() => this.generateTitleForFile(file))
            );
            menu.addItem((item) =>
              item
                .setTitle('Update Gist')
                .setIcon('lucide-refresh-cw')
                .onClick(() => this.updateGistForFile(file))
            );
          }
        })
      );

      this.registerEvent(
        this.app.workspace.on('files-menu', (menu, files) => {
          const markdownFiles = files.filter(
            (f) => f instanceof TFile && f.extension === 'md'
          ) as TFile[];

          if (markdownFiles.length > 0) {
            menu.addItem((item) =>
              item
                .setTitle(`Rename ${markdownFiles.length} Titles & Share to Gist`)
                .setIcon('lucide-edit-3')
                .onClick(() =>
                  this.generateTitlesForMultipleFiles(markdownFiles)
                )
            );
          }
        })
      );

      this.addSettingTab(new TitleGeneratorSettingTab(this.app, this));
      this.logger.info('Plugin loaded successfully');
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'plugin-onload',
      });
    }
  }

  addStyles() {
    const css = `
      .${UI_CONFIG.CSS_CLASSES.SEARCH_CONTAINER} {
        position: relative;
      }
      .${UI_CONFIG.CSS_CLASSES.SEARCH_CONTAINER} input {
        width: 100%;
        box-sizing: border-box;
      }
      .${UI_CONFIG.CSS_CLASSES.SEARCH_RESULTS} {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background-color: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
        border-radius: var(--radius-m);
        z-index: 10;
        max-height: ${UI_CONFIG.MAX_DROPDOWN_HEIGHT}px;
        overflow-y: auto;
        min-width: 100%;
        box-sizing: border-box;
      }
      .${UI_CONFIG.CSS_CLASSES.SEARCH_ITEM} {
        padding: 8px 12px;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .${UI_CONFIG.CSS_CLASSES.SEARCH_ITEM_HOVER} {
        background-color: var(--background-modifier-hover);
      }
      .${UI_CONFIG.CSS_CLASSES.SEARCH_ITEM}.${UI_CONFIG.CSS_CLASSES.SEARCH_ITEM_SELECTED} {
        background-color: var(--background-modifier-success);
        color: var(--text-on-accent);
      }
    `;
    const styleEl = document.createElement('style');
    styleEl.id = 'title-generator-styles';
    styleEl.innerHTML = css;
    document.head.appendChild(styleEl);
    this.register(() => styleEl.remove());
  }

  async loadSettings() {
    let loadedData = (await this.loadData()) || {};

    // Migration for a typo in a previous version
    if (loadedData.openaiModel && !loadedData.openAiModel) {
      if ((loadedData as any).debugMode)
        console.log('Migrating old setting `openaiModel` to `openAiModel`');
      loadedData.openAiModel = loadedData.openaiModel;
      delete loadedData.openaiModel;
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async generateTitleForEditor(editor: Editor): Promise<void> {
    try {
      // Check for required keys
      const ready = await this.checkAndPromptForKeys(false);
      if (!ready) return;

      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        this.errorHandler.handleError(new Error('No active file found'), {
          context: 'generate-title-editor',
        });
        return;
      }
      const content = editor.getValue();
      await this.processSingleFile(activeFile, content);
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'generate-title-editor',
      });
    }
  }

  private async generateTitleForFile(file: TFile): Promise<void> {
    try {
      // Check for required keys
      const ready = await this.checkAndPromptForKeys(false);
      if (!ready) return;

      const content = await this.app.vault.cachedRead(file);
      await this.processSingleFile(file, content);
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'generate-title-file',
        file: file.path,
      });
    }
  }

  private async generateTitlesForMultipleFiles(files: TFile[]): Promise<void> {
    // Check for required keys
    const ready = await this.checkAndPromptForKeys(false);
    if (!ready) return;

    const total = files.length;
    const statusBarItem = this.addStatusBarItem();
    const progress: BatchOperationProgress = {
      total,
      processed: 0,
      succeeded: 0,
      failed: 0,
    };

    const updateStatus = () => {
      statusBarItem.setText(
        `Generating titles: ${progress.processed}/${total} (${progress.succeeded} succeeded, ${progress.failed} failed)`
      );
    };

    updateStatus();
    this.logger.info(`Starting batch title generation for ${total} files`);

    const errors: Error[] = [];

    for (const file of files) {
      progress.current = file.basename;
      try {
        await this.generateTitleForFile(file);
        progress.succeeded++;
        this.logger.debug(`Successfully generated title for ${file.path}`);
      } catch (error) {
        progress.failed++;
        errors.push(error as Error);
        this.logger.error(`Failed to generate title for ${file.path}`, error);
      } finally {
        progress.processed++;
        updateStatus();
      }
    }

    if (errors.length > 0) {
      this.errorHandler.handleMultipleErrors(errors, {
        context: 'batch-generation',
      });
    }

    statusBarItem.setText(
      `Title generation complete: ${progress.succeeded} succeeded, ${progress.failed} failed`
    );
    setTimeout(
      () => statusBarItem.remove(),
      UI_CONFIG.NOTIFICATION_DURATION.MEDIUM
    );

    this.logger.info(`Batch title generation completed`, progress);
  }

  private async processSingleFile(
    file: TFile,
    content: string,
    options?: { forceGfm?: boolean; forceGist?: boolean }
  ): Promise<FileOperationResult> {
    if (!content.trim()) {
      const error = this.errorHandler.createGenerationError(
        'Note is empty. Cannot generate title.'
      );
      this.errorHandler.handleError(error);
      return { success: false, originalPath: file.path, error: error.message };
    }

    const statusBarItem = this.addStatusBarItem();
    statusBarItem.setText('Generating title...');

    try {
      // Validate content before processing
      const sanitizedContent = this.validationService.sanitizeInput(content);

      this.logger.debug(`Generating title for file: ${file.path}`);
      const newTitle = await this.aiService.generateTitle(sanitizedContent);

      if (newTitle) {
        // Sanitize the generated title
        const sanitizedTitle =
          this.validationService.sanitizeFilename(newTitle);

        let finalContent = content;

        // Reformat body to GFM if enabled (or forced by command)
        if (this.settings.enableGfmReformatting || options?.forceGfm) {
          statusBarItem.setText('Reformatting body for Gist...');
          const preTransformed = this.gfmService.preTransform(finalContent, this.settings.stripCitations);
          const reformatted = await this.aiService.reformatForGfm(
            preTransformed,
            this.settings.gfmPrompt,
            sanitizedTitle
          );
          if (reformatted) {
            finalContent = this.gfmService.postTransform(reformatted, this.settings.cleanQAPrefix);
          }
        }

        const { dir, ext } = path.parse(file.path);
        let candidatePath = normalizePath(`${dir}/${sanitizedTitle}${ext}`);
        let counter = 1;

        while (this.app.vault.getAbstractFileByPath(candidatePath)) {
          candidatePath = normalizePath(
            `${dir}/${sanitizedTitle} (${counter})${ext}`
          );
          counter++;
        }

        if (candidatePath !== file.path) {
          await this.app.fileManager.renameFile(file, candidatePath);

          // Update content if it was modified
          if (finalContent !== content) {
            await this.app.vault.modify(
              this.app.vault.getAbstractFileByPath(candidatePath) as TFile,
              finalContent
            );
          }

          // Gist auto-share after rename
          const didGfmReformat = (this.settings.enableGfmReformatting || options?.forceGfm) && finalContent !== content;
          const didGistShare = (this.settings.enableGistAutoShare || options?.forceGist) && this.settings.githubPat;
          let gistUrlForNotice: string | undefined;

          if (didGistShare) {
            // Get existing gist_id from frontmatter if file was previously shared
            const existingGistId = this.getGistIdFromFrontmatter(finalContent);

            statusBarItem.setText('Publishing to Gist...');
            const gistResult = await this.gistService.publishToGist(
              finalContent,
              sanitizedTitle + ext,
              existingGistId
            );

            if (gistResult.success) {
              // Add frontmatter with gist_id, gist_url, and gist_filename
              const frontmatterContent = this.updateGistFrontmatter(finalContent, gistResult.gistId!, gistResult.gistUrl!, sanitizedTitle + ext);
              await this.app.vault.modify(
                this.app.vault.getAbstractFileByPath(candidatePath) as TFile,
                frontmatterContent
              );

              // Copy to clipboard
              const clipboardText = `${sanitizedTitle} | ${gistResult.gistUrl}`;
              navigator.clipboard.writeText(clipboardText);
              gistUrlForNotice = gistResult.gistUrl;
            } else {
              // ROLLBACK: Rename file back to original and restore original content
              new Notice(`Gist publish failed after 3 attempts. Rolling back file rename.`);
              await this.app.fileManager.renameFile(
                this.app.vault.getAbstractFileByPath(candidatePath) as TFile,
                file.path
              );
              // Also rollback the content - remove gist frontmatter that was added
              await this.app.vault.modify(file, content);
              // Return failure
              return { success: false, originalPath: file.path, error: gistResult.error };
            }
          }

          // Build descriptive success notice
          let noticeParts: string[] = [];
          noticeParts.push(`Title: "${sanitizedTitle}"`);
          if (didGfmReformat) noticeParts.push('GFM reformatted');
          if (gistUrlForNotice) noticeParts.push('shared to Gist');
          new Notice(`${noticeParts.join(' • ')} — copied to clipboard!`);
          this.logger.info(`File renamed: ${file.path} → ${candidatePath}`);
          return {
            success: true,
            originalPath: file.path,
            newPath: candidatePath,
          };
        } else {
          // Update content even if filename didn't change
          if (finalContent !== content) {
            await this.app.vault.modify(file, finalContent);
          }

          new Notice(`Generated title is the same as the current one.`);
          this.logger.debug(
            `No rename needed for ${file.path}: title unchanged`
          );
          return { success: true, originalPath: file.path, newPath: file.path };
        }
      } else {
        const error = this.errorHandler.createGenerationError(
          'Title generation returned empty result'
        );
        this.errorHandler.handleError(error);
        return {
          success: false,
          originalPath: file.path,
          error: error.message,
        };
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'process-single-file',
        file: file.path,
      });
      return {
        success: false,
        originalPath: file.path,
        error: (error as Error).message,
      };
    } finally {
      statusBarItem.remove();
    }
  }

  
  
  private getGistIdFromFrontmatter(content: string): string | undefined {
    const match = content.match(/^gist_id:\s*(.+)\s*$/m);
    if (match) {
      let id = match[1].trim();
      // Strip surrounding quotes if present
      if ((id.startsWith('"') && id.endsWith('"')) || (id.startsWith("'") && id.endsWith("'"))) {
        id = id.slice(1, -1);
      }
      return id;
    }
    return undefined;
  }

  private getGistUrlFromFrontmatter(content: string): string | undefined {
    const match = content.match(/^gist_url:\s*(.+)\s*$/m);
    if (match) {
      let url = match[1].trim();
      // Strip surrounding quotes if present
      if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
        url = url.slice(1, -1);
      }
      return url;
    }
    return undefined;
  }

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

  private async copyTitleAndGistLink(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.cachedRead(file);
      const gistUrl = this.getGistUrlFromFrontmatter(content);

      if (!gistUrl) {
        new Notice('No Gist link found in this file. Generate a title first to create a Gist.');
        return;
      }

      // Extract title from filename (basename without extension)
      const title = file.basename;

      const clipboardText = `${title} | ${gistUrl}`;
      await navigator.clipboard.writeText(clipboardText);
      new Notice(`Copied: ${title} | ${gistUrl}`);
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        context: 'copy-title-gist-link',
        file: file.path,
      });
      new Notice('Failed to copy title and Gist link.');
    }
  }

  /**
   * Update an existing Gist with local file content.
   * No AI title generation, no rename, no GFM transformation.
   */
  private async updateGistForFile(file: TFile): Promise<void> {
    const statusBarItem = this.addStatusBarItem();
    try {
      const content = await this.app.vault.cachedRead(file);
      statusBarItem.setText('Updating Gist...');
      statusBarItem.setText('Updating Gist...');

      const gistId = this.getGistIdFromFrontmatter(content);
      const gistFilename = this.getGistFilenameFromFrontmatter(content);

      if (!gistId) {
        new Notice('No Gist found. Use "Rename & Share to Gist" first.');
        statusBarItem.remove();
        return;
      }

      // Extract raw markdown body (remove frontmatter for upload)
      const { body: uploadContent } = this.parseFrontmatter(content);

      // Determine old and new filename
      const localBasename = file.basename + '.' + file.extension;
      const oldFilename = gistFilename || localBasename;
      const newFilename = localBasename;

      // PATCH update to existing Gist
      const gistResult = await this.gistService.updateGist(uploadContent, newFilename, oldFilename, gistId);

      if (gistResult.success) {
        // Update frontmatter with new gist info
        const updatedFrontmatter = this.updateGistFrontmatter(
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
      statusBarItem.remove();
      new Notice(`Failed to update Gist: ${(error as Error).message}`);
    }
  }

  private parseFrontmatter(content: string): { fm: Map<string, string>; body: string; hasFrontmatter: boolean } {
    if (!content.startsWith('---')) {
      return { fm: new Map(), body: content, hasFrontmatter: false };
    }
    const afterOpening = content.slice(3); // skip ---
    const closingIndex = afterOpening.indexOf('\n---');
    if (closingIndex === -1) {
      return { fm: new Map(), body: content, hasFrontmatter: false };
    }
    const fmContent = afterOpening.slice(0, closingIndex);
    const body = afterOpening.slice(closingIndex + 4); // skip \n---
    const fm = new Map<string, string>();
    for (const line of fmContent.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        let val = line.slice(colonIdx + 1).trim();
        // Strip surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        fm.set(key, val);
      }
    }
    return { fm, body, hasFrontmatter: true };
  }

  private serializeFrontmatter(fm: Map<string, string>, body: string, existingYamlPrefix: string = ''): string {
    // Build frontmatter string preserving insertion order
    const lines: string[] = [];
    fm.forEach((val, key) => {
      // Quote values that need it (contain special chars)
      const needsQuotes = val.includes(':') || val.includes('#') || val.includes('"') || val.includes("'") || val.startsWith(' ') || val.endsWith(' ');
      lines.push(`${key}: ${needsQuotes ? `"${val.replace(/"/g, '\\"')}"` : val}`);
    });
    const fmStr = lines.join('\n');
    if (existingYamlPrefix !== '') {
      return `${existingYamlPrefix}\n${fmStr}\n---\n${body}`;
    }
    return `---\n${fmStr}\n---\n${body}`;
  }

  private updateGistFrontmatter(content: string, gistId: string, gistUrl: string, gistFilename: string): string {
    const { fm, body, hasFrontmatter } = this.parseFrontmatter(content);
    fm.set('gist_id', gistId);
    fm.set('gist_url', gistUrl);
    fm.set('gist_filename', gistFilename);
    if (!hasFrontmatter) {
      return this.serializeFrontmatter(fm, body);
    }
    // Reconstruct with same structure (first \n after opening ---)
    const afterOpening = content.slice(3);
    const closingIndex = afterOpening.indexOf('\n---');
    const yamlPrefix = '---\n' + afterOpening.slice(0, closingIndex);
    return this.serializeFrontmatter(fm, body, yamlPrefix);
  }

  /**
   * Check if required API keys are present, prompt user if missing
   * @returns Promise<boolean> true if ready to proceed, false if cancelled/prompted
   */
  private async checkAndPromptForKeys(needsGist: boolean = false): Promise<boolean> {
    const aiKeyMissing = !this.settings.openAiApiKey &&
                         !this.settings.anthropicApiKey &&
                         !this.settings.googleApiKey &&
                         !this.settings.openRouterApiKey;
    const gistMissing = needsGist && !this.settings.githubPat;

    if (!aiKeyMissing && !gistMissing) {
      return true; // All keys present
    }

    return new Promise((resolve) => {
      const modal = new ApiKeyPromptModal(this.app, this, { needsGist }, async (success) => {
        if (success) {
          await this.saveSettings();
          // Re-check after save
          const aiKeyNow = this.settings.openAiApiKey ||
                           this.settings.anthropicApiKey ||
                           this.settings.googleApiKey ||
                           this.settings.openRouterApiKey;
          const gistOkNow = !needsGist || !!this.settings.githubPat;
          resolve(!!aiKeyNow && gistOkNow);
        } else {
          resolve(false);
        }
      });
      modal.open();
    });
  }
}

/**
 * Modal for prompting user to enter API keys when missing
 */
class ApiKeyPromptModal extends Modal {
  private plugin: TitleGeneratorPlugin;
  private needsGist: boolean;
  private onComplete: (success: boolean) => void;
  private updateInputVisibility: () => void = () => {};

  constructor(app: App, plugin: TitleGeneratorPlugin, options: { needsGist: boolean }, onComplete: (success: boolean) => void) {
    super(app);
    this.plugin = plugin;
    this.needsGist = options.needsGist;
    this.onComplete = onComplete;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.setText('API Keys Required');

    // AI Provider selection
    new Setting(contentEl)
      .setName('AI Provider')
      .setDesc('Select your AI provider')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('openai', 'OpenAI')
          .addOption('anthropic', 'Anthropic')
          .addOption('google', 'Google Gemini')
          .addOption('openrouter', 'OpenRouter')
          .setValue(this.plugin.settings.aiProvider)
          .onChange((value) => {
            this.plugin.settings.aiProvider = value as any;
            this.updateInputVisibility();
          });
      });

    // OpenAI API Key
    const openaiSetting = new Setting(contentEl)
      .setName('OpenAI API Key')
      .setDesc('Required for OpenAI models')
      .addText((text) => {
        text.inputEl.type = 'password';
        text.inputEl.placeholder = 'sk-...';
        text.setValue(this.plugin.settings.openAiApiKey);
        text.onChange((value) => {
          this.plugin.settings.openAiApiKey = value;
        });
      });

    // Anthropic API Key
    const anthropicSetting = new Setting(contentEl)
      .setName('Anthropic API Key')
      .setDesc('Required for Claude models')
      .addText((text) => {
        text.inputEl.type = 'password';
        text.inputEl.placeholder = 'sk-ant-...';
        text.setValue(this.plugin.settings.anthropicApiKey);
        text.onChange((value) => {
          this.plugin.settings.anthropicApiKey = value;
        });
      });

    // Google API Key
    const googleSetting = new Setting(contentEl)
      .setName('Google API Key')
      .setDesc('Required for Gemini models')
      .addText((text) => {
        text.inputEl.type = 'password';
        text.inputEl.placeholder = 'AI...';
        text.setValue(this.plugin.settings.googleApiKey);
        text.onChange((value) => {
          this.plugin.settings.googleApiKey = value;
        });
      });

    // OpenRouter API Key
    const openrouterSetting = new Setting(contentEl)
      .setName('OpenRouter API Key')
      .setDesc('Required for OpenRouter models')
      .addText((text) => {
        text.inputEl.type = 'password';
        text.inputEl.placeholder = 'sk-...';
        text.setValue(this.plugin.settings.openRouterApiKey);
        text.onChange((value) => {
          this.plugin.settings.openRouterApiKey = value;
        });
      });

    // GitHub PAT (only if needed)
    let gistSetting: Setting | null = null;
    if (this.needsGist) {
      gistSetting = new Setting(contentEl)
        .setName('GitHub Personal Access Token')
        .setDesc('Required for Gist publishing')
        .addText((text) => {
          text.inputEl.type = 'password';
          text.inputEl.placeholder = 'ghp_...';
          text.setValue(this.plugin.settings.githubPat);
          text.onChange((value) => {
            this.plugin.settings.githubPat = value;
          });
        });
    }

    // Helper to show/hide based on provider
    this.updateInputVisibility = () => {
      const provider = this.plugin.settings.aiProvider;
      openaiSetting.settingEl.style.display = provider === 'openai' ? '' : 'none';
      anthropicSetting.settingEl.style.display = provider === 'anthropic' ? '' : 'none';
      googleSetting.settingEl.style.display = provider === 'google' ? '' : 'none';
      openrouterSetting.settingEl.style.display = provider === 'openrouter' ? '' : 'none';
    };
    this.updateInputVisibility();

    // Buttons
    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText('Cancel');
        btn.onClick(() => {
          this.close();
          this.onComplete(false);
        });
      })
      .addButton((btn) => {
        btn.setButtonText('Save & Continue');
        btn.setCta();
        btn.onClick(() => {
          // Validate at least one AI key is set
          const hasAiKey = !!(
            this.plugin.settings.openAiApiKey ||
            this.plugin.settings.anthropicApiKey ||
            this.plugin.settings.googleApiKey ||
            this.plugin.settings.openRouterApiKey
          );
          if (!hasAiKey) {
            new Notice('Please enter at least one AI API key');
            return;
          }
          if (this.needsGist && !this.plugin.settings.githubPat) {
            new Notice('Please enter a GitHub Personal Access Token');
            return;
          }
          this.close();
          this.onComplete(true);
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
