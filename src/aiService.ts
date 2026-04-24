import { Notice, requestUrl } from 'obsidian';
import { sanitizeFilename, truncateTitle } from './utils';
import type {
  TitleGeneratorSettings,
  AIProviderStrategy,
  ApiRequestConfig,
  OpenAIResponse,
  AnthropicResponse,
  GoogleResponse,
} from './types';

/**
 * OpenAI Strategy Implementation
 */
class OpenAIStrategy implements AIProviderStrategy {
  buildRequest(
    prompt: string,
    content: string,
    settings: TitleGeneratorSettings
  ): ApiRequestConfig {
    const fullPrompt = `${prompt}\n\n${content}`.trim();
    const model = settings.openAiModel;

    // Detection for reasoning models (o1, o3, gpt-5)
    const isReasoningModel = model.startsWith('o') || model.includes('gpt-5');

    const body: any = {
      model: model,
      messages: [{ role: 'user', content: fullPrompt }],
    };

    if (isReasoningModel) {
      // Use max_completion_tokens for newer reasoning models.
      // Reasoning models need a larger budget because the total includes hidden 'thinking' tokens.
      // For gpt-5-mini, we provide a generous 5000 token limit for total generation.
      body.max_completion_tokens = 5000;

      // Handle reasoning_effort for GPT-5 models
      if (model.includes('gpt-5')) {
        // gpt-5-mini supports low, medium, high reasoning effort.
        // We map temperature to these levels to give users some control via settings.
        if (settings.temperature <= 0.3) body.reasoning_effort = 'low';
        else if (settings.temperature <= 0.7) body.reasoning_effort = 'medium';
        else body.reasoning_effort = 'high';

        // Note: temperature is typically unsupported/ignored for these models
      }
    } else {
      body.temperature = settings.temperature;
      body.max_tokens = settings.maxTitleLength * 4;
    }

    return {
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.openAiApiKey}`,
      },
      body: JSON.stringify(body),
    };
  }

  parseResponse(response: OpenAIResponse): string {
    return response.choices[0]?.message?.content?.trim() ?? '';
  }
}

/**
 * Anthropic Strategy Implementation
 */
class AnthropicStrategy implements AIProviderStrategy {
  buildRequest(
    prompt: string,
    content: string,
    settings: TitleGeneratorSettings
  ): ApiRequestConfig {
    const fullPrompt = `${prompt}\n\n${content}`.trim();
    const model = settings.anthropicModel;

    // Detection for Claude 3.7+ reasoning models
    const isReasoningModel =
      model.includes('3-7') ||
      model.includes('4-5') ||
      model.includes('haiku-4-5');

    const body: any = {
      model: model,
      messages: [{ role: 'user', content: fullPrompt }],
      max_tokens: isReasoningModel ? 4096 : 1024,
    };

    if (isReasoningModel && settings.anthropicThinkingEnabled) {
      body.thinking = {
        type: 'enabled',
        budget_tokens: settings.anthropicThinkingBudget,
      };
      body.temperature = 1.0;
    } else {
      body.temperature = settings.temperature;
    }

    return {
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    };
  }

  parseResponse(response: AnthropicResponse): string {
    const textContent = response.content.find((c: any) => c.type === 'text');
    return textContent?.text?.trim() ?? '';
  }
}

/**
 * Google Gemini Strategy Implementation
 */
class GoogleStrategy implements AIProviderStrategy {
  buildRequest(
    prompt: string,
    content: string,
    settings: TitleGeneratorSettings
  ): ApiRequestConfig {
    const fullPrompt = `${prompt}\n\n${content}`.trim();
    const model = settings.googleModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.googleApiKey}`;

    const generationConfig: any = {
      temperature: settings.temperature,
    };

    // Detection for Gemini 2.0+ thinking models (including gemini-3)
    const isThinkingModel =
      model.includes('thinking') || model.includes('gemini-3');

    if (isThinkingModel && settings.googleThinkingLevel !== 'OFF') {
      generationConfig.thinkingConfig = {
        thinkingLevel: settings.googleThinkingLevel,
      };
    }

    return {
      url: url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig,
      }),
    };
  }

  parseResponse(response: GoogleResponse): string {
    if (
      !response.candidates ||
      !response.candidates[0] ||
      !response.candidates[0].content ||
      !response.candidates[0].content.parts
    ) {
      return '';
    }

    const textPart = response.candidates[0].content.parts.find(
      (part: any) => part.text && !part.thought
    );

    return textPart?.text?.trim() ?? '';
  }
}

/**
 * OpenRouter Strategy Implementation
 */
class OpenRouterStrategy implements AIProviderStrategy {
  buildRequest(
    prompt: string,
    content: string,
    settings: TitleGeneratorSettings
  ): ApiRequestConfig {
    const fullPrompt = `${prompt}\n\n${content}`.trim();

    const body: any = {
      model: settings.openRouterModel,
      messages: [{ role: 'user', content: fullPrompt }],
      temperature: settings.temperature,
      max_tokens: settings.maxTitleLength * 4,
    };

    if (settings.openRouterReasoningEnabled) {
      body.reasoning = { enabled: true };
    }

    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.openRouterApiKey}`,
      },
      body: JSON.stringify(body),
    };
  }

  parseResponse(response: OpenAIResponse): string {
    return response.choices[0]?.message?.content?.trim() ?? '';
  }
}

/**
 * A service class to handle all AI-powered title generation logic.
 * It uses the Strategy Pattern to handle different AI providers.
 */
export class AIService {
  private getSettings: () => TitleGeneratorSettings;
  private strategies: Record<string, AIProviderStrategy>;

  constructor(getSettings: () => TitleGeneratorSettings) {
    this.getSettings = getSettings;
    this.strategies = {
      openai: new OpenAIStrategy(),
      anthropic: new AnthropicStrategy(),
      google: new GoogleStrategy(),
      openrouter: new OpenRouterStrategy(),
    };
  }

  public async generateTitle(noteContent: string): Promise<string> {
    const settings = this.getSettings();

    if (!this.isConfigurationValid(settings)) {
      return '';
    }

    const content = noteContent.slice(0, settings.maxContentLength);
    const initialPrompt = settings.customPrompt.replace(
      '{max_length}',
      settings.maxTitleLength.toString()
    );

    try {
      const maxAttempts = 3;
      let title = '';

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let currentPrompt: string;
        let currentContent: string;

        if (attempt === 1) {
          currentPrompt = initialPrompt;
          currentContent = content;
        } else {
          new Notice(`Title still too long. Refining... (Attempt ${attempt})`);
          currentPrompt = settings.refinePrompt
            .replace('{max_length}', settings.maxTitleLength.toString())
            .replace('{title}', title);
          currentContent = '';
        }

        const rawTitle = await this.callAI(currentPrompt, currentContent);
        title = this.cleanAIResponse(rawTitle);

        if (title.length > 0 && title.length <= settings.maxTitleLength) {
          break;
        }
      }

      let processedTitle = title;
      if (settings.lowerCaseTitles)
        processedTitle = processedTitle.toLowerCase();
      if (settings.removeForbiddenChars)
        processedTitle = sanitizeFilename(processedTitle);

      return truncateTitle(processedTitle, settings.maxTitleLength);
    } catch (error) {
      this.handleError(error, settings);
      return '';
    }
  }

  async makeAICall(prompt: string, content: string = ''): Promise<string> {
    return await this.callAI(prompt, content);
  }

  /**
   * Reformat content to be GitHub Flavored Markdown (GFM) compliant
   */
  async reformatForGfm(noteContent: string, gfmPrompt: string, title?: string): Promise<string> {
    const settings = this.getSettings();

    if (!this.isConfigurationValid(settings)) {
      return '';
    }

    try {
      let prompt = `${gfmPrompt}\n\n${noteContent}`.trim();
      if (title) {
        prompt += '\n\nIMPORTANT: Before reformatting, check if the beginning of the content duplicates the title "' + title + '". If yes, remove the duplicate lines from the start of the content first, then reformat.';
      }
      return await this.callAI(prompt, '');
    } catch (error) {
      this.handleError(error, settings);
      return '';
    }
  }

  private async callAI(prompt: string, content: string): Promise<string> {
    const settings = this.getSettings();
    const strategy = this.strategies[settings.aiProvider];

    if (!strategy) {
      throw new Error(`Unsupported AI provider: ${settings.aiProvider}`);
    }

    const config = strategy.buildRequest(prompt, content, settings);
    const response = await requestUrl(config);

    if (response.status !== 200) {
      throw new Error(`API error (${response.status}): ${response.text}`);
    }

    return strategy.parseResponse(response.json);
  }

  private isConfigurationValid(settings: TitleGeneratorSettings): boolean {
    const provider = settings.aiProvider;
    const keys = {
      openai: {
        key: settings.openAiApiKey,
        model: settings.openAiModel,
        name: 'OpenAI',
      },
      anthropic: {
        key: settings.anthropicApiKey,
        model: settings.anthropicModel,
        name: 'Anthropic',
      },
      google: {
        key: settings.googleApiKey,
        model: settings.googleModel,
        name: 'Google Gemini',
      },
      openrouter: {
        key: settings.openRouterApiKey,
        model: settings.openRouterModel,
        name: 'OpenRouter',
      },
    };

    const config = (keys as any)[provider];
    if (!config) {
      new Notice('Invalid AI provider selected.');
      return false;
    }

    if (!config.key.trim()) {
      new Notice(`${config.name} API key is not set.`, 8000);
      return false;
    }

    if (!config.model) {
      new Notice(`${config.name} model is not selected.`, 8000);
      return false;
    }

    return true;
  }

  private handleError(error: any, settings: TitleGeneratorSettings) {
    console.error('Title Generation Error:', error);
    const message = error.message || '';

    if (message.includes('API key is not set')) {
      new Notice(
        `Please set your ${settings.aiProvider.toUpperCase()} API key in settings.`,
        8000
      );
    } else if (message.includes('API error')) {
      new Notice(
        `AI service error: ${message}. Check key and connection.`,
        6000
      );
    } else {
      new Notice(`Title generation failed: ${message}`, 5000);
    }
  }

  private cleanAIResponse(response: string): string {
    if (!response) return '';
    let text = response.trim();

    // Remove thinking blocks
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    let best = '';

    const fillerRegex =
      /^(Title:|Generated title:|Suggested title:|The title:|A title:|Here's the title:|Sure, here|I'll|I would|Based on)/i;

    for (const line of lines) {
      if (!fillerRegex.test(line)) {
        best = line;
        break;
      }
    }

    if (!best && lines.length > 0) best = lines[0];

    return best
      .replace(
        /^(Title:|Generated title:|Suggested title:|The title:|A title:|Here's the title:)\s*/i,
        ''
      )
      .replace(/["']/g, '')
      .trim();
  }
}
