import { Notice } from 'obsidian';
import { sanitizeFilename, truncateTitle } from './utils';
import type { AIProvider, TitleGeneratorSettings } from './types';

export class AIService {
  private settings: TitleGeneratorSettings;

  constructor(settings: TitleGeneratorSettings) {
    this.settings = settings;
  }

  public updateSettings(newSettings: TitleGeneratorSettings): void {
    this.settings = newSettings;
  }

  public async generateTitle(noteContent: string): Promise<string> {
    const content = noteContent.slice(0, this.settings.maxContentLength);
    const initialPrompt = this.settings.customPrompt.replace(
      '{max_length}',
      this.settings.maxTitleLength.toString()
    );

    try {
      let title = await this.callAI(initialPrompt, content);

      if (title.length > this.settings.maxTitleLength) {
        new Notice('Initial title was too long. Refining...');
        const refinePrompt = this.settings.refinePrompt
          .replace('{max_length}', this.settings.maxTitleLength.toString())
          .replace('{title}', title);
        
        title = await this.callAI(refinePrompt, ''); // No additional content needed
      }

      // Final processing
      let processedTitle = title;
      if (this.settings.lowerCaseTitles) {
        processedTitle = processedTitle.toLowerCase();
      }
      if (this.settings.removeForbiddenChars) {
        processedTitle = sanitizeFilename(processedTitle);
      }
      
      // Final safeguard truncation
      return truncateTitle(processedTitle, this.settings.maxTitleLength);

    } catch (error) {
      console.error('Title Generation Error:', error);
      new Notice(`AI Error: ${error.message}`);
      return ''; // Return empty string on error
    }
  }

  private async callAI(prompt: string, content: string): Promise<string> {
    const fullPrompt = `${prompt}\n\n${content}`.trim();

    switch (this.settings.aiProvider) {
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
    if (!this.settings.openAiApiKey) {
      throw new Error('OpenAI API key is not set.');
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.settings.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: this.settings.openAiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.settings.temperature,
        max_tokens: this.settings.maxTitleLength + 50,
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
    if (!this.settings.anthropicApiKey) {
      throw new Error('Anthropic API key is not set.');
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.settings.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.settings.anthropicModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.settings.temperature,
        max_tokens: this.settings.maxTitleLength + 50,
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
    if (!this.settings.googleApiKey) {
      throw new Error('Google Gemini API key is not set.');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.settings.googleModel}:generateContent?key=${this.settings.googleApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: this.settings.temperature,
          maxOutputTokens: this.settings.maxTitleLength + 50,
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
    const url = new URL('/api/generate', this.settings.ollamaUrl).toString();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.settings.ollamaModel,
        prompt,
        stream: false,
        options: {
          temperature: this.settings.temperature,
          num_predict: this.settings.maxTitleLength + 50,
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