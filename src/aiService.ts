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
    console.log('Starting title generation with settings:', {
      provider: settings.aiProvider,
      model:
        settings.aiProvider === 'openai'
          ? settings.openAiModel
          : settings.aiProvider === 'anthropic'
          ? settings.anthropicModel
          : settings.googleModel,
      maxTitleLength: settings.maxTitleLength,
    });

    // Validate configuration before proceeding
    if (!this.isConfigurationValid(settings)) {
      console.error('Configuration is not valid. Aborting.');
      return '';
    }

    const content = noteContent.slice(0, settings.maxContentLength);
    const initialPrompt = settings.customPrompt.replace(
      '{max_length}',
      settings.maxTitleLength.toString()
    );

    try {
      let title = await this.callAI(initialPrompt, content);
      console.log('Raw title from AI:', title);

      // Clean up AI response - remove thinking process, explanations, etc.
      title = this.cleanAIResponse(title);
      console.log('Cleaned title:', title);

      if (title.length > settings.maxTitleLength) {
        new Notice('Initial title was too long. Refining...');
        console.log('Title too long, refining...');
        const refinePrompt = settings.refinePrompt
          .replace('{max_length}', settings.maxTitleLength.toString())
          .replace('{title}', title);

        title = await this.callAI(refinePrompt, ''); // No additional content needed
        console.log('Raw refined title:', title);
        title = this.cleanAIResponse(title);
        console.log('Cleaned refined title:', title);
      }

      // Final processing
      let processedTitle = title;
      if (settings.lowerCaseTitles) {
        processedTitle = processedTitle.toLowerCase();
      }
      if (settings.removeForbiddenChars) {
        processedTitle = sanitizeFilename(processedTitle);
      }

      console.log('Final processed title:', processedTitle);
      // Final safeguard truncation
      return truncateTitle(processedTitle, settings.maxTitleLength);
    } catch (error) {
      console.error('Title Generation Error:', error);

      // Provide more helpful error messages
      if (error.message.includes('API key is not set')) {
        new Notice(
          `Please set your ${settings.aiProvider.toUpperCase()} API key in plugin settings.`,
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
            'OpenAI API key is not set. Please configure it in plugin settings.',
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
            'Anthropic API key is not set. Please configure it in plugin settings.',
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
            'Google Gemini API key is not set. Please configure it in plugin settings.',
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
        max_tokens: settings.maxTitleLength,
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
        max_tokens: settings.maxTitleLength,
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

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: settings.temperature,
        maxOutputTokens: settings.maxTitleLength + 256,
      },
    };

    console.log('Calling Google Gemini API.');
    console.log(
      'Gemini Request URL (key hidden):',
      url.replace(/key=([^&]+)/, 'key=...')
    );
    console.log('Gemini Request Body:', JSON.stringify(requestBody, null, 2));

    const response = await requestUrl({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Gemini Response Status:', response.status);
    console.log('Gemini Raw Response Body:', response.text);

    if (response.status !== 200) {
      console.error('Google Gemini API error. Response:', response.text);
      throw new Error(
        `Google Gemini API error (${response.status}): ${response.text}`
      );
    }
    const data = response.json;

    if (
      !data.candidates ||
      !data.candidates[0] ||
      !data.candidates[0].content ||
      !data.candidates[0].content.parts ||
      !data.candidates[0].content.parts[0]
    ) {
      console.warn('Gemini response is missing expected content.', data);
      // Check for safety ratings, which might indicate a blocked response
      if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        new Notice(
          'Title generation blocked by Google for safety reasons.',
          6000
        );
        console.error(
          'Gemini response blocked due to safety ratings:',
          data.candidates[0].safetyRatings
        );
      }
      return '';
    }

    const extractedText =
      data.candidates[0].content.parts[0].text.trim() ?? '';
    console.log('Extracted text from Gemini:', extractedText);
    return extractedText;
  }

  /**
   * Clean up AI response to extract just the title
   */
  private cleanAIResponse(response: string): string {
    if (!response) return '';

    let textToClean = response.trim();

    // If the entire response is wrapped in a <think> block,
    // extract the content from within the block to be cleaned.
    const thinkMatch = textToClean.match(/^<think>([\s\S]*)<\/think>$/);
    if (thinkMatch && thinkMatch[1]) {
      textToClean = thinkMatch[1].trim();
    }

    // Remove any remaining thinking blocks.
    textToClean = textToClean.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Find the most likely candidate for the title.
    // The best candidate is usually on its own line.
    const lines = textToClean
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let bestCandidate = '';
    for (const line of lines) {
      // The best line is one that doesn't have conversational filler.
      if (
        !/^(Title:|Generated title:|Suggested title:|The title:|A title:|Here's the title:|Sure, here|I'll|I would|Based on)/i.test(
          line
        )
      ) {
        bestCandidate = line;
        break;
      }
    }

    // If no good candidate was found, fall back to the first line.
    if (!bestCandidate && lines.length > 0) {
      bestCandidate = lines[0];
    }

    // Final polish: remove common prefixes and quotes.
    let finalTitle = bestCandidate.replace(
      /^(Title:|Generated title:|Suggested title:|The title:|A title:|Here's the title:)\s*/i,
      ''
    );
    finalTitle = finalTitle.replace(/["']/g, '');

    return finalTitle.trim();
  }
}