# Upgrade Guide: v1.x → v2.0

This guide walks you through migrating from **Title Generator v1.x** to **Enhanced Title Generator v2.0**.

---

## 1. What’s New in v2.0

- **Multi-Provider Support**: OpenAI, Anthropic (Claude), Google Gemini, and local Ollama.
- **Smart Filename Sanitization**: Removes OS-forbidden characters, normalizes whitespace, trims leading/trailing dots & spaces, falls back to `Untitled`.
- **Configurable Title Length**: Enforce maximum title length (default 200 chars) with word-boundary truncation.
- **Custom Prompts & Temperature**: Edit the AI prompt and adjust creativity (0.0–1.0).
- **Model Selection**: Choose a model per provider.
- **Backward Compatibility**: Your existing OpenAI API key and lowercase‐titles toggle are preserved by default.

---

## 2. Pre-Upgrade Checklist

1. **Backup your vault** (or at least the `.obsidian/plugins/title-generator` folder).
2. Note your **OpenAI API key** (if used).
3. Record any custom settings you used (e.g. lowercase titles).

---

## 3. Installation & Migration Steps

1. **Remove v1.x**  
   - Close Obsidian.  
   - Delete the `.obsidian/plugins/title-generator` folder.  

2. **Copy v2.0 Files**  
   - Extract or clone the v2.0 release into `.obsidian/plugins/title-generator`.

3. **Rebuild the Plugin**  
   ```bash
   cd .obsidian/plugins/title-generator
   npm install
   npm run build
   ```

4. **Restore Settings**  
   - Open Obsidian.  
   - In **Settings → Community plugins → Enhanced Title Generator**, re-enter your **OpenAI API key** (or other provider keys).  
   - Configure **Provider**, **Model**, **Temperature**, **Max Title Length**, etc.  

5. **Verify Functionality**  
   - Run **Generate title** on a note.  
   - Confirm title sanitization and truncation behave as expected.  

---

## 4. Settings Migration Guide

| Old Setting          | New Setting                          |
|----------------------|--------------------------------------|
| `OpenAI API key`     | **AI Provider** set to _OpenAI_ → re-enter key under **OpenAI API Key** |
| `Lower-case titles`  | **Lower-case Titles** toggle         |
| N/A                  | **Max Title Length** (default 200)   |
| N/A                  | **Remove Forbidden Characters** ✓    |
| N/A                  | **Custom Prompt** & **Temperature**  |

---

## 5. Troubleshooting

- **Plugin not loading**:  
  - Ensure `manifest.json` version is `2.0.0`.  
  - Run `npm run build` and reload Obsidian.

- **API errors**:  
  - Verify each provider’s API key or local Ollama server URL.  
  - Check network connectivity or local Ollama service status (`http://localhost:11434`).

- **Invalid filename**:  
  - Confirm **Remove Forbidden Characters** is enabled.  
  - Adjust **Max Title Length** to avoid platform filename limits.

---

## 6. Recommended Defaults

- **AI Provider**: OpenAI  
- **Model**: `gpt-3.5-turbo-instruct`  
- **Temperature**: 0.7  
- **Max Title Length**: 200  
- **Remove Forbidden Characters**: ✔  
- **Lower-case Titles**: ✘  

---

*After completing these steps, your plugin will be upgraded to v2.0.0 with full multi-provider and filename handling features.*
