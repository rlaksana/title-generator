import { Notice } from 'obsidian';
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

      if (title.length > settings.maxTitleLength) {
        new Notice('Initial title was too long. Refining...');
        const refinePrompt = settings.refinePrompt
          .replace('{max_length}', settings.maxTitleLength.toString())
          .replace('{title}', title);
        
        title = await this.callAI(refinePrompt, ''); // No additional content needed
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
        new Notice(`Please set your ${settings.aiProvider.toUpperCase()} API key in plugin settings, or switch to Ollama for local generation.`, 8000);
      } else if (error.message.includes('API error')) {
        new Notice(`AI service error: ${error.message}. Check your API key and internet connection.`, 6000);
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
          new Notice('OpenAI API key is not set. Please configure it in plugin settings or switch to Ollama for local generation.', 8000);
          return false;
        }
        break;
      case 'anthropic':
        if (!settings.anthropicApiKey.trim()) {
          new Notice('Anthropic API key is not set. Please configure it in plugin settings or switch to Ollama for local generation.', 8000);
          return false;
        }
        break;
      case 'google':
        if (!settings.googleApiKey.trim()) {
          new Notice('Google Gemini API key is not set. Please configure it in plugin settings or switch to Ollama for local generation.', 8000);
          return false;
        }
        break;
      case 'ollama':
        if (!settings.ollamaUrl.trim()) {
          new Notice('Ollama server URL is not set. Please configure it in plugin settings.', 6000);
          return false;
        }
        break;
      default:
        new Notice('Invalid AI provider selected. Please check plugin settings.', 5000);
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
      default:
        throw new Error('Unsupported AI provider selected.');
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const settings = this.getSettings();
    if (!settings.openAiApiKey) {
      throw new Error('OpenAI API key is not set.');
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: settings.openAiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: settings.temperature,
        max_tokens: settings.maxTitleLength + 50,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
    }
    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() ?? '';
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const settings = this.getSettings();
    if (!settings.anthropicApiKey) {
      throw new Error('Anthropic API key is not set.');
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
    }
    const data = await response.json();
    return data.content[0]?.text?.trim() ?? '';
  }

  private async callGoogle(prompt: string): Promise<string> {
    const settings = this.getSettings();
    if (!settings.googleApiKey) {
      throw new Error('Google Gemini API key is not set.');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.googleModel}:generateContent?key=${settings.googleApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: settings.temperature,
          maxOutputTokens: settings.maxTitleLength + 50,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Google Gemini API error (${response.status}): ${errorBody}`);
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  }

  private async callOllama(prompt: string): Promise<string> {
    const settings = this.getSettings();
    const url = new URL('/api/generate', settings.ollamaUrl).toString();
    const response = await fetch(url, {
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

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorBody}`);
    }
    const data = await response.json();
    return data.response?.trim() ?? '';
  }
}
