# Enhanced Title Generator v3.0.10

> **Latest Update**: Auto version bump enabled - every commit/push increments version automatically. Added **Debug Mode** toggle for troubleshooting logs.

A completely rewritten Obsidian plugin to generate note titles using multiple AI providers. This new version is built for stability, efficiency, and intelligence, with guaranteed compatibility on both Desktop and Mobile (Android/iOS).

## Key Features

- **Dynamic Model Loading**: Automatically detects and loads available models from your configured AI providers - no more hardcoded model lists!
- **Intelligent Title Refinement**: If an AI-generated title is too long, the plugin asks the AI to shorten it, preserving the core meaning instead of just cutting it off.
- **Cost-Efficient Analysis**: Limit the amount of text sent to the AI (e.g., the first 2000 characters) to significantly reduce token usage and cost on long notes.
- **Multi-Provider AI**: Choose from OpenAI, Anthropic, or Google Gemini.
- **Smart Model Caching**: Models are cached with TTL (1 hour) and automatically refreshed when API keys change.
- **Mobile-First Design**: All API calls use Obsidian's native `fetch` API, ensuring 100% compatibility on mobile devices and removing heavy dependencies.
- **Fully Customizable Prompts**: Tailor the initial prompt and the refinement prompt to fit your exact needs.
- **Smart Filename Sanitization**: Automatically removes OS-forbidden characters and normalizes whitespace to create safe, clean filenames.
- **Debug Mode**: Enable detailed console logging for troubleshooting.

## Installation

1.  Ensure you have the latest version of Obsidian.
2.  Install the plugin via the Community Plugins browser in Obsidian.
3.  Enable the plugin in your settings.

Alternatively, for manual installation:
1.  Download the `main.js` and `manifest.json` files from the latest [GitHub Release](https://github.com/rlaksana/obsidian-title-generator/releases).
2.  Place these files in your vault's `.obsidian/plugins/enhanced-title-generator/` directory.
3.  Reload Obsidian and enable the plugin.

## Usage

-   **Command Palette**: Open the command palette (`Ctrl/Cmd + P`) and search for "Generate title for current note".
-   **File Menu**: Right-click a note in the file explorer and select "Generate title". You can also select multiple notes to process them in a batch.

## Settings

Open **Settings → Enhanced Title Generator** to configure the plugin.

| Setting                      | Description                                                                                             | Default                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **AI Provider**              | Select your preferred AI service (OpenAI, Anthropic, Google Gemini).                            | `OpenAI`                                                                                               |
| **API Key**     | Your API key for the selected cloud service.                 | (empty)                                                                     |
| **Model**                    | The specific AI model to use for generation. Models are loaded dynamically from your provider.          | Auto-detected from provider                                                                            |
| **Initial Prompt**           | The prompt template for the first request. Use `{max_length}` as a placeholder.                         | `Generate a concise, descriptive title for the following text. The title must be a maximum of {max_length} characters.` |
| **Refinement Prompt**        | The prompt used if the first title is too long. Use `{max_length}` and `{title}`.                       | `The following title is too long. Please shorten it to be under {max_length} characters, while preserving its core meaning: "{title}"` |
| **Temperature**              | Controls AI creativity (0.0 = deterministic, 1.0 = highly creative).                                    | `0.7`                                                                                                  |
| **Max Title Length**         | The maximum number of characters for the final title.                                                   | `200`                                                                                                  |
| **Max Content Length for AI**| The maximum number of characters from the note to send to the AI to save on costs.                      | `2000`                                                                                                 |
| **Lower-case titles**        | If enabled, converts all titles to lower case.                                                          | `false`                                                                                                |
| **Remove forbidden chars**   | If enabled, strips characters that are invalid in filenames.                                            | `true`                                                                                                 |
| **Debug mode**               | Enable detailed console logging for troubleshooting.                                                    | `false`                                                                                                |

## Dynamic Model Loading

The plugin now automatically detects and loads available models from your configured AI providers:

### How It Works

1. **Auto-Detection**: When you set an API key or server URL, the plugin automatically queries for available models
2. **Smart Caching**: Models are cached for 1 hour to reduce API calls and improve performance
3. **Reload Button**: Click the refresh button next to the model dropdown to manually reload models
4. **Error Handling**: Clear error messages help troubleshoot connection issues
5. **Fallback Models**: If model loading fails, the plugin falls back to a curated list of popular models

### Model Loading Triggers

- Setting or changing an API key for cloud providers
- Changing API keys for cloud providers
- Switching between AI providers
- Clicking the reload models button
- Opening settings (if models are older than 1 hour)

### Example Models (Auto-detected)

-   **OpenAI**: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-4`, `gpt-3.5-turbo`, etc.
-   **Anthropic**: `claude-3-opus-20240229`, `claude-3-sonnet-20240229`, `claude-3-haiku-20240307`, etc.
-   **Google Gemini**: `gemini-1.5-pro-latest`, `gemini-1.5-flash-latest`, `gemini-1.0-pro`, etc.

## Troubleshooting

### General Issues

-   **Invalid API Key**: Double-check your API key in your provider's dashboard.
-   **Network Errors**: For cloud providers, ensure you have an internet connection.
-   **No Title Generated**: Check the Obsidian developer console (`Ctrl/Cmd + Shift + I`) for any error messages from the plugin.

### Model Loading Issues

-   **Models Not Loading**: Click the reload button (🔄) next to the model dropdown to manually refresh the model list.
-   **"Loading models..." Stuck**: Check your internet connection and API key. The plugin has a 10-second timeout for model queries.
-   **Error Messages in Settings**: Hover over the model dropdown description to see detailed error messages and timestamps.
-   **Fallback Models**: If model loading fails, the plugin will show a curated list of popular models as fallback.

### Provider-Specific Issues

-   **OpenAI**: Ensure your API key has the correct permissions and billing is set up.
-   **Anthropic**: API key must be from the Anthropic Console, not Claude.ai.
-   **Google Gemini**: Use API key from Google AI Studio, not Google Cloud Console.

## License

MIT © Richard Laksana