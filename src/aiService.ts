import { Notice, requestUrl } from 'obsidian';
import { sanitizeFilename, truncateTitle } from './utils';
import type { TitleGeneratorSettings } from './types';

/**
 * A service class to handle all AI-powered title generation logic.
 * It pulls settings dynamically to ensure it always has the latest values.
 */
export class AIService {
  /**
   * A function that returns the current plugin settings.
   */
  private getSettings: () => TitleGeneratorSettings;

  constructor(getSettings: () => TitleGeneratorSettings) {
    this.getSettings = getSettings;
  }

  public async generateTitle(noteContent: string): Promise<string> {
    const settings = this.getSettings();

    // Validate configuration before proceeding
    if (!this.isConfigurationValid(settings)) {
      return '';
    }

    const content = noteContent.slice(0, settings.maxContentLength);
    const initialPrompt = settings.customPrompt.replace(
      '{max_length}',
      settings.maxTitleLength.toString()
    );

    try {
      let title = await this.callAI(initialPrompt, content);

      // Clean up AI response - remove thinking process, explanations, etc.
      title = this.cleanAIResponse(title);

      if (title.length > settings.maxTitleLength) {
        new Notice('Initial title was too long. Refining...');
        const refinePrompt = settings.refinePrompt
          .replace('{max_length}', settings.maxTitleLength.toString())
          .replace('{title}', title);

        title = await this.callAI(refinePrompt, ''); // No additional content needed
        title = this.cleanAIResponse(title);
      }

      // Final processing
      let processedTitle = title;
      if (settings.lowerCaseTitles) {
        processedTitle = processedTitle.toLowerCase();
      }
      if (settings.removeForbiddenChars) {
        processedTitle = sanitizeFilename(processedTitle);
      }

      // Final safeguard truncation
      return truncateTitle(processedTitle, settings.maxTitleLength);
    } catch (error) {
      console.error('Title Generation Error:', error);

      // Provide more helpful error messages
      if (error.message.includes('API key is not set')) {
        new Notice(
          `Please set your ${settings.aiProvider.toUpperCase()} API key in plugin settings, or switch to Ollama for local generation.`,
          8000
        );
      } else if (error.message.includes('API error')) {
        new Notice(
          `AI service error: ${error.message}. Check your API key and internet connection.`,
          6000
        );
      } else {
        new Notice(`Title generation failed: ${error.message}`, 5000);
      }

      return ''; // Return empty string on error
    }
  }

  private isConfigurationValid(settings: TitleGeneratorSettings): boolean {
    switch (settings.aiProvider) {
      case 'openai':
        if (!settings.openAiApiKey.trim()) {
          new Notice(
            'OpenAI API key is not set. Please configure it in plugin settings or switch to Ollama for local generation.',
            8000
          );
          return false;
        }
        if (!settings.openAiModel) {
          new Notice(
            'OpenAI model is not selected. Please select a model in the plugin settings.',
            8000
          );
          return false;
        }
        break;
      case 'anthropic':
        if (!settings.anthropicApiKey.trim()) {
          new Notice(
            'Anthropic API key is not set. Please configure it in plugin settings or switch to Ollama for local generation.',
            8000
          );
          return false;
        }
        if (!settings.anthropicModel) {
          new Notice(
            'Anthropic model is not selected. Please select a model in the plugin settings.',
            8000
          );
          return false;
        }
        break;
      case 'google':
        if (!settings.googleApiKey.trim()) {
          new Notice(
            'Google Gemini API key is not set. Please configure it in plugin settings or switch to Ollama for local generation.',
            8000
          );
          return false;
        }
        if (!settings.googleModel) {
          new Notice(
            'Google Gemini model is not selected. Please select a model in the plugin settings.',
            8000
          );
          return false;
        }
        break;
      case 'ollama':
        if (!settings.ollamaUrl.trim()) {
          new Notice(
            'Ollama server URL is not set. Please configure it in plugin settings.',
            6000
          );
          return false;
        }
        if (!settings.ollamaModel) {
          new Notice(
            'Ollama model is not selected. Please select a model in the plugin settings.',
            8000
          );
          return false;
        }
        break;
      case 'lmstudio':
        if (!settings.lmstudioUrl.trim()) {
          new Notice(
            'LM Studio server URL is not set. Please configure it in plugin settings.',
            6000
          );
          return false;
        }
        if (!settings.lmstudioModel) {
          new Notice(
            'LM Studio model is not selected. Please select a model in the plugin settings.',
            8000
          );
          return false;
        }
        break;
      default:
        new Notice(
          'Invalid AI provider selected. Please check plugin settings.',
          5000
        );
        return false;
    }
    return true;
  }

  private async callAI(prompt: string, content: string): Promise<string> {
    const settings = this.getSettings();
    const fullPrompt = `${prompt}\n\n${content}`.trim();

    switch (settings.aiProvider) {
      case 'openai':
        return this.callOpenAI(fullPrompt);
      case 'anthropic':
        return this.callAnthropic(fullPrompt);
      case 'google':
        return this.callGoogle(fullPrompt);
      case 'ollama':
        return this.callOllama(fullPrompt);
      case 'lmstudio':
        return this.callLMStudio(fullPrompt);
      default:
        throw new Error('Unsupported AI provider selected.');
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const settings = this.getSettings();
    if (!settings.openAiApiKey) {
      throw new Error('OpenAI API key is not set.');
    }
    const response = await requestUrl({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: settings.openAiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: settings.temperature,
        max_tokens: settings.maxTitleLength + 50,
      }),
    });

    if (response.status !== 200) {
      throw new Error(`OpenAI API error (${response.status}): ${response.text}`);
    }
    const data = response.json;
    return data.choices[0]?.message?.content?.trim() ?? '';
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const settings = this.getSettings();
    if (!settings.anthropicApiKey) {
      throw new Error('Anthropic API key is not set.');
    }
    const response = await requestUrl({
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: settings.anthropicModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: settings.temperature,
        max_tokens: settings.maxTitleLength + 50,
      }),
    });

    if (response.status !== 200) {
      throw new Error(
        `Anthropic API error (${response.status}): ${response.text}`
      );
    }
    const data = response.json;
    return data.content[0]?.text?.trim() ?? '';
  }

  private async callGoogle(prompt: string): Promise<string> {
    const settings = this.getSettings();
    if (!settings.googleApiKey) {
      throw new Error('Google Gemini API key is not set.');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.googleModel}:generateContent?key=${settings.googleApiKey}`;
    const response = await requestUrl({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: settings.temperature,
          maxOutputTokens: 256, // Increased from maxTitleLength + 50
        },
      }),
    });

    if (response.status !== 200) {
      throw new Error(
        `Google Gemini API error (${response.status}): ${response.text}`
      );
    }
    const data = response.json;

    // Add robust checking for the response structure
    if (
      !data.candidates ||
      !data.candidates[0] ||
      !data.candidates[0].content ||
      !data.candidates[0].content.parts ||
      !data.candidates[0].content.parts[0]
    ) {
      return '';
    }

    const result = data.candidates[0].content.parts[0].text.trim() ?? '';
    return result;
  }

  private async callOllama(prompt: string): Promise<string> {
    const settings = this.getSettings();
    const url = new URL('/api/generate', settings.ollamaUrl).toString();
    const response = await requestUrl({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.ollamaModel,
        prompt,
        stream: false,
        options: {
          temperature: settings.temperature,
          num_predict: settings.maxTitleLength + 50,
        },
      }),
    });

    if (response.status !== 200) {
      throw new Error(`Ollama API error (${response.status}): ${response.text}`);
    }
    const data = response.json;
    return data.response?.trim() ?? '';
  }

  private async callLMStudio(prompt: string): Promise<string> {
    const settings = this.getSettings();
    const url = new URL(
      '/v1/chat/completions',
      settings.lmstudioUrl
    ).toString();
    const response = await requestUrl({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.lmstudioModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: settings.temperature,
        max_tokens: settings.maxTitleLength + 50,
        stream: false,
      }),
    });

    if (response.status !== 200) {
      throw new Error(
        `LM Studio API error (${response.status}): ${response.text}`
      );
    }
    const data = response.json;
    return data.choices[0]?.message?.content?.trim() ?? '';
  }

  /**
   * Clean up AI response to extract just the title
   */
  private cleanAIResponse(response: string): string {
    if (!response) return '';

    let cleaned = response.trim();

    // Recursively remove thinking blocks and re-clean the content inside them
    const thinkMatch = cleaned.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch && thinkMatch[1]) {
      const innerContent = thinkMatch[1].trim();
      const cleanedInner = this.cleanAIResponse(innerContent); // Recursive call
      cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, cleanedInner).trim();
    }

    // Remove common prefixes
    cleaned = cleaned.replace(
      /^(Title:|Generated title:|Suggested title:|The title:|A title:|Here's the title:)\s*/i,
      ''
    );

    // Remove explanations in parentheses or brackets
    cleaned = cleaned.replace(/\([^)]*\)/g, '');
    cleaned = cleaned.replace(/\[[^\]]*\]/g, '');

    // Remove trailing fragments like dashes and incomplete words
    cleaned = cleaned.replace(/[-\s]*$/g, '');
    cleaned = cleaned.replace(/^[-\s]*/g, '');

    // Take only the first line (in case there are multiple lines)
    cleaned = cleaned.split('\n')[0];

    // Remove quotes
    cleaned = cleaned.replace(/["']/g, '');

    // Remove extra whitespace
    cleaned = cleaned.trim();

    return cleaned;
  }
}
