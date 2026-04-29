# Title Generator v3.0.95

> **Latest Update**: Three commands now available — generate title from note, paste to new note, or paste & share to Gist. Auto version bump enabled.

A completely rewritten Obsidian plugin to generate note titles using multiple AI providers with optional Gist sharing and GFM formatting.

## Key Features

- **Three Workflow Commands**:
  - **Rename title & (optional) Gist share** — Generate title for current note, optionally publish to Gist
  - **Paste & Share to Gist** — Read clipboard, create new note, generate title, reformat to GFM, publish to GitHub Gist
  - **Paste to new note** — Read clipboard, create new note, generate title (no GFM/Gist)
- **Dynamic Model Loading with Search**: Automatically detects and loads available models from your configured AI providers
- **GFM Reformatting**: Transform AI-generated content into clean GitHub Flavored Markdown (task lists, tables, fenced code blocks, strikethrough)
- **Citation/Reference Cleaning**: Strip citation markers from AI output (works with Perplexity, Semantic Scholar, etc.)
- **Q&A Prefix Stripping**: Remove Q&A patterns (Q:/Question: / A:/Answer:) from Perplexity-generated content
- **Smart Duplicate Detection**: AI-powered duplicate detection during GFM reformatting
- **Gist Auto-Share**: Automatically publish reformatted content to GitHub Gist with frontmatter tracking
- **Multi-Provider AI**: Choose from OpenAI, Anthropic, Google Gemini, or OpenRouter
- **Intelligent Title Refinement**: AI shortens titles while preserving meaning
- **Mobile-First Design**: All API calls use Obsidian's native `fetch` API

## Installation

### Via BRAT (Recommended)
1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) in Obsidian
2. Open BRAT settings and click "Add Beta Plugin"
3. Enter repository: `rlaksana/title-generator`
4. Click "Add Plugin" and enable it

> **Having BRAT installation issues?** Check our [CDN Troubleshooting Guide](CDN_TROUBLESHOOTING.md) for quick fixes.

### Via Community Plugins (When Available)
1. Ensure you have the latest version of Obsidian
2. Install the plugin via the Community Plugins browser in Obsidian
3. Enable the plugin in your settings

### Manual Installation
1. Download the `main.js` and `manifest.json` files from the latest [GitHub Release](https://github.com/rlaksana/title-generator/releases)
2. Place these files in your vault's `.obsidian/plugins/title-generator/` directory
3. Reload Obsidian and enable the plugin

## Usage

### Command Palette
Open the command palette (`Ctrl/Cmd + P`) and search for one of:

| Command | Description |
|---------|-------------|
| **Rename title & (optional) Gist share** | Generate title for current/selected note(s). Optional Gist share if enabled in settings. |
| **Paste clipboard & share to Gist** | Read clipboard → create new note → generate title → reformat GFM → publish to Gist → open note |
| **Paste to new note** | Read clipboard → create new note → generate title (normal flow, no GFM/Gist) |
| **Copy title and Gist link** | Copy formatted title + Gist URL from current note |

### File Menu
Right-click a note in the file explorer:
- **"Rename title & (optional) Gist share"** — Process single note
- **"Rename N titles & (optional) Gist share"** — Batch process multiple notes

### First-Time Setup
When you run a command for the first time (or keys are missing), a popup will appear asking for your API keys:
- **AI API Key** — Required for all commands. Choose your provider and enter the key.
- **GitHub PAT** — Required only for Paste & Share to Gist command.

No need to navigate to Settings — keys are entered directly in the popup and saved automatically.

## Settings

Open **Settings → Title Generator** to configure:

### AI Provider Settings
| Setting | Description | Default |
|---------|-------------|---------|
| **AI Provider** | Select AI service (OpenAI, Anthropic, Google, OpenRouter) | `OpenAI` |
| **API Key** | Your API key for the selected provider | (empty) |
| **Model** | AI model to use (auto-detected from provider) | Auto |
| **Temperature** | AI creativity level (0.0 = deterministic, 1.0 = creative) | `0.7` |

### Title Settings
| Setting | Description | Default |
|---------|-------------|---------|
| **Lower-case titles** | Convert all titles to lowercase | `false` |
| **Remove forbidden chars** | Strip OS-forbidden characters from filenames | `true` |
| **Max Title Length** | Maximum characters for generated title | `200` |
| **Max Content Length** | Max characters sent to AI (for cost savings) | `2000` |

### GFM Reformatting Settings
| Setting | Description | Default |
|---------|-------------|---------|
| **Enable GFM reformatting** | Transform content to GitHub Flavored Markdown | `false` |
| **Strip citations** | Remove citation markers [1], [^1], etc. | `false` |
| **Strip Q&A prefix** | Remove Q:/Question: and A:/Answer: patterns (Perplexity) | `false` |
| **GFM Prompt** | Custom prompt for GFM reformatting AI request | (default) |

### Gist Auto-Share Settings
| Setting | Description | Default |
|---------|-------------|---------|
| **Enable Gist auto-share** | Automatically publish to GitHub Gist after title generation | `false` |
| **GitHub PAT** | Personal Access Token with `gist` scope | (empty) |

## GFM Reformatting

When enabled, the plugin transforms content using AI:

- **Task Lists**: `- [ ]`, `- [x]`, `[X]` → standardized `- [ ]` format
- **Tables**: Normalizes separators, alignment markers (`:---`, `:---:`, `---:`)
- **Code Blocks**: Converts indented code (4+ spaces) to fenced ```` ``` ````
- **Strikethrough**: `<del>`, `<s>`, `<strike>` → `~~text~~`
- **URLs**: Auto-links bare URLs with angle brackets
- **HTML Sanitization**: Removes dangerous tags while preserving safe structural HTML

### Clean Duplicate Detection
AI-powered detection identifies and removes duplicate content during reformatting, including:
- Title-to-content duplication
- Consecutive duplicate paragraphs
- Near-duplicate variations

## Dynamic Model Loading

The plugin auto-detects available models from providers:

### Model Loading Triggers
- Setting or changing an API key
- Switching between AI providers
- Clicking the reload button next to model dropdown
- Opening settings (if models are older than 1 hour)

### Example Models (Auto-detected)
- **OpenAI**: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, etc.
- **Anthropic**: `claude-sonnet-4-5`, `claude-3-5-sonnet-latest`, etc.
- **Google Gemini**: `gemini-3-flash-preview`, `gemini-1.5-pro-latest`, etc.

## Thinking Mode (Google Gemini 3)

| Level | Description |
| ----- | ----------- |
| `Off` | Standard generation |
| `Low` | Minimal reasoning |
| `Medium` | Balanced reasoning |
| `High` | Maximum reasoning depth |

## Troubleshooting

### General Issues
- **Invalid API Key**: Verify key in your provider's dashboard
- **Network Errors**: Ensure internet connection for cloud providers
- **No Title Generated**: Check Obsidian console (`Ctrl/Cmd + Shift + I`)

### Model Loading Issues
- **Models Not Loading**: Click reload button (🔄) next to model dropdown
- **"Loading models..." Stuck**: Check connection and API key
- **Fallback Models**: Curated list shown if auto-detection fails

## License

MIT © Richard Laksana
