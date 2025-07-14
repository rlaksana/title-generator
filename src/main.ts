import { App, Editor, Notice, Plugin, TFile, normalizePath } from 'obsidian';
// Test #4: Confirm consistent version bumping
import path from 'path-browserify';
import { AIService } from './aiService';
import { DEFAULT_SETTINGS, TitleGeneratorSettingTab } from './settings';
import type { TitleGeneratorSettings } from './types';

export { AIService }; // Export for testing

export default class TitleGeneratorPlugin extends Plugin {
  settings: TitleGeneratorSettings;
  aiService: AIService;

  async onload() {
    await this.loadSettings();

    // The AI service is now given a function to get the latest settings dynamically.
    this.aiService = new AIService(() => this.settings);

    this.addCommand({
      id: 'generate-title',
      name: 'Generate title for current note',
      editorCallback: (editor: Editor) => this.generateTitleForEditor(editor),
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem((item) =>
            item
              .setTitle('Generate title')
              .setIcon('lucide-edit-3')
              .onClick(() => this.generateTitleForFile(file))
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
              .setTitle(`Generate titles for ${markdownFiles.length} notes`)
              .setIcon('lucide-edit-3')
              .onClick(() => this.generateTitlesForMultipleFiles(markdownFiles))
          );
        }
      })
    );

    this.addSettingTab(new TitleGeneratorSettingTab(this.app, this));
    console.log('Enhanced Title Generator plugin loaded.');
  }

  async loadSettings() {
    let loadedData = (await this.loadData()) || {};

    // Migration for a typo in a previous version
    if (loadedData.openaiModel && !loadedData.openAiModel) {
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
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No active file. Cannot generate title.');
      return;
    }
    const content = editor.getValue();
    await this.processSingleFile(activeFile, content);
  }

  private async generateTitleForFile(file: TFile): Promise<void> {
    const content = await this.app.vault.cachedRead(file);
    await this.processSingleFile(file, content);
  }

  private async generateTitlesForMultipleFiles(files: TFile[]): Promise<void> {
    const total = files.length;
    const statusBarItem = this.addStatusBarItem();
    let processedCount = 0;

    const updateStatus = () => {
      statusBarItem.setText(`Generating titles: ${processedCount}/${total}...`);
    };

    updateStatus();

    for (const file of files) {
      try {
        await this.generateTitleForFile(file);
      } catch (error) {
        console.error(`Failed to generate title for ${file.path}`, error);
        new Notice(`Failed for ${file.basename}. See console for details.`);
      } finally {
        processedCount++;
        updateStatus();
      }
    }

    statusBarItem.setText(`Title generation complete for ${total} notes.`);
    setTimeout(() => statusBarItem.remove(), 5000);
  }

  private async processSingleFile(file: TFile, content: string): Promise<void> {
    if (!content.trim()) {
      new Notice('Note is empty. Cannot generate title.');
      return;
    }

    const statusBarItem = this.addStatusBarItem();
    statusBarItem.setText('Generating title...');

    try {
      const newTitle = await this.aiService.generateTitle(content);

      if (newTitle) {
        const { dir, ext } = path.parse(file.path);
        let candidatePath = normalizePath(`${dir}/${newTitle}${ext}`);
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(candidatePath)) {
          candidatePath = normalizePath(`${dir}/${newTitle} (${counter})${ext}`);
          counter++;
        }

        if (candidatePath !== file.path) {
          await this.app.fileManager.renameFile(file, candidatePath);
          new Notice(`Title generated: "${newTitle}"`);
        } else {
          new Notice(`Generated title is the same as the current one.`);
        }
      } else {
        new Notice(
          'Title generation failed. Please check settings or console.'
        );
      }
    } catch (error) {
      console.error('Error during title processing:', error);
      new Notice('An unexpected error occurred. See console for details.');
    } finally {
      statusBarItem.remove();
    }
  }
}
