# Enhanced Title Generator v3.0

A completely rewritten Obsidian plugin to generate note titles using multiple AI providers. This new version is built for stability, efficiency, and intelligence, with guaranteed compatibility on both Desktop and Mobile (Android/iOS).

## Key Features

- **Intelligent Title Refinement**: If an AI-generated title is too long, the plugin asks the AI to shorten it, preserving the core meaning instead of just cutting it off.
- **Cost-Efficient Analysis**: Limit the amount of text sent to the AI (e.g., the first 2000 characters) to significantly reduce token usage and cost on long notes.
- **Multi-Provider AI**: Choose from OpenAI, Anthropic, Google Gemini, or a local Ollama instance.
- **Mobile-First Design**: All API calls use Obsidian's native `fetch` API, ensuring 100% compatibility on mobile devices and removing heavy dependencies.
- **Fully Customizable Prompts**: Tailor the initial prompt and the refinement prompt to fit your exact needs.
- **Smart Filename Sanitization**: Automatically removes OS-forbidden characters and normalizes whitespace to create safe, clean filenames.

## Installation

1.  Ensure you have the latest version of Obsidian.
2.  Install the plugin via the Community Plugins browser in Obsidian.
3.  Enable the plugin in your settings.

Alternatively, for manual installation:
1.  Download the `main.js` and `manifest.json` files from the latest [GitHub Release](https://github.com/jaschaephraim/obsidian-title-generator/releases).
2.  Place these files in your vault’s `.obsidian/plugins/obsidian-enhanced-title-generator/` directory.
3.  Reload Obsidian and enable the plugin.

## Usage

-   **Command Palette**: Open the command palette (`Ctrl/Cmd + P`) and search for "Generate title for current note".
-   **File Menu**: Right-click a note in the file explorer and select "Generate title". You can also select multiple notes to process them in a batch.

## Settings

Open **Settings → Enhanced Title Generator** to configure the plugin.

| Setting                      | Description                                                                                             | Default                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **AI Provider**              | Select your preferred AI service (OpenAI, Anthropic, Google Gemini, Ollama).                            | `OpenAI`                                                                                               |
| **API Key / Server URL**     | Your API key for the selected cloud service, or the URL for your local Ollama instance.                 | (empty) / `http://localhost:11434`                                                                     |
| **Model**                    | The specific AI model to use for generation.                                                            | `gpt-4o-mini`                                                                                          |
| **Initial Prompt**           | The prompt template for the first request. Use `{max_length}` as a placeholder.                         | `Generate a concise, descriptive title for the following text. The title must be a maximum of {max_length} characters.` |
| **Refinement Prompt**        | The prompt used if the first title is too long. Use `{max_length}` and `{title}`.                       | `The following title is too long. Please shorten it to be under {max_length} characters, while preserving its core meaning: "{title}"` |
| **Temperature**              | Controls AI creativity (0.0 = deterministic, 1.0 = highly creative).                                    | `0.7`                                                                                                  |
| **Max Title Length**         | The maximum number of characters for the final title.                                                   | `200`                                                                                                  |
| **Max Content Length for AI**| The maximum number of characters from the note to send to the AI to save on costs.                      | `2000`                                                                                                 |
| **Lower-case titles**        | If enabled, converts all titles to lower case.                                                          | `false`                                                                                                |
| **Remove forbidden chars**   | If enabled, strips characters that are invalid in filenames.                                            | `true`                                                                                                 |

### Default Models

-   **OpenAI**: `gpt-4o-mini`
-   **Anthropic**: `claude-3-haiku-20240307`
-   **Google Gemini**: `gemini-1.5-flash-latest`
-   **Ollama**: `llama3`

## Troubleshooting

-   **Invalid API Key**: Double-check your API key in your provider's dashboard.
-   **Network Errors**: For cloud providers, ensure you have an internet connection. For Ollama, verify your local server is running and accessible at the configured URL.
-   **No Title Generated**: Check the Obsidian developer console (`Ctrl/Cmd + Shift + I`) for any error messages from the plugin.

## License

MIT © Jascha Ephraim & Community