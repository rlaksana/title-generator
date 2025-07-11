# Enhanced Title Generator v2.0

Generate note titles with multiple AI providers, smart filename handling, and full configuration options.

## Features

- **Multi-Provider AI**: Choose from OpenAI, Anthropic (Claude), Google Gemini, or local Ollama models.
- **Smart Filename Sanitization**: Remove OS-forbidden characters, normalize whitespace, trim dots/spaces, and fallback to “Untitled”.
- **Configurable Title Length**: Enforce a maximum title length (default 200 chars) with word-boundary truncation.
- **Custom Prompts & Temperature**: Craft your prompt and adjust creativity (0–1).
- **Model Selection**: Pick your preferred model per provider.
- **Backward Compatibility**: Existing OpenAI API key and lower-case setting preserved.

## Installation

1. Clone or download this plugin into your vault’s `.obsidian/plugins/title-generator` folder.
2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
3. Reload or restart Obsidian and enable **Enhanced Title Generator** in Community Plugins.

## Usage

- **Command Palette**: `Generate title` runs on the active note content.
- **File Menu**: Right-click a note or multiple notes in the file explorer and select **Generate title(s)**.
- Titles will be sanitized and renamed automatically.

## Settings

Open **Settings → Enhanced Title Generator**:

| Option                    | Description                                         | Default              |
|---------------------------|-----------------------------------------------------|----------------------|
| AI Provider               | Select OpenAI, Anthropic, Google Gemini, Ollama     | OpenAI               |
| OpenAI/Anthropic/Google API Key | Your provider API key                         | (empty)              |
| Ollama Server URL         | Local Ollama endpoint (no key required)            | http://localhost:11434 |
| Model                     | Pick a model available for the chosen provider      | see defaults below   |
| Custom Prompt             | Text template sent before your note content         | “Generate a concise, descriptive title for the following text:” |
| Temperature               | Creativity slider (0.0–1.0)                         | 0.7                  |
| Max Title Length          | Maximum characters for generated titles             | 200                  |
| Remove Forbidden Characters | Strip `< > : " / \\ | ? *` and control chars    | ✓                    |
| Lower-case Titles         | Force title to lowercase                            | ✗                    |

### Default Models

- **OpenAI**: `gpt-3.5-turbo-instruct`
- **Anthropic**: `claude-v1`
- **Google Gemini**: `gemini`
- **Ollama**: `llama2`

## Filename Safety

Sanitization rules:
- Remove OS-forbidden characters: `< > : " | ? * / \\` and control codes.
- Collapse whitespace, trim leading/trailing dots & spaces.
- Fallback to `Untitled` if result is empty.

## Troubleshooting

- **Invalid API Key**: Check your provider dashboard and re-enter key.
- **Network Errors**: Verify internet or local Ollama server is running on port 11434.
- **Model Not Found**: Ensure the selected model is available in your account.

## Upgrade Guide

See [UPGRADE_GUIDE.md](UPGRADE_GUIDE.md) for migration from v1.x to v2.0.

## License

MIT © Jascha Ephraim & Community
