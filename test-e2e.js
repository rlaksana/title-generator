#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// --- Mock Obsidian APIs ---
// This is the key to running outside of Obsidian.
// We create simple JavaScript objects that mimic the real Obsidian APIs.
const mockObsidian = {
  Notice: class {
    constructor(message, duration) {
      console.log(`[NOTICE] ${message} (duration: ${duration || 'default'})`);
    }
  },
  requestUrl: async (options) => {
    console.log(`[MOCK API CALL] to ${options.url}`);
    const { body } = options;
    const requestBody = JSON.parse(body);

    // Simulate Gemini response issue
    if (options.url.includes('generativelanguage.googleapis.com')) {
      return {
        status: 200,
        json: {
          candidates: [
            {
              content: {
                parts: [{ text: 'Untitled' }],
              },
            },
          ],
        },
      };
    }

    // Simulate LMStudio response issue
    if (options.url.includes('/v1/chat/completions')) {
      return {
        status: 200,
        json: {
          choices: [
            {
              message: {
                content: '<think>The user wants a title about cats.</think>A Tale of Two Kitties',
              },
            },
          ],
        },
      };
    }
    
    // Simulate a generic good response for other providers
    return {
        status: 200,
        json: {
            choices: [
                {
                    message: {
                        content: 'This is a Good Title'
                    }
                }
            ]
        }
    }
  },
};

// --- Load Compiled Code ---
// We load the compiled 'main.js' which contains all the plugin logic.
// This is much simpler than re-implementing the logic in JS.
const compiledPluginPath = path.join(__dirname, 'dist', 'main.js');
if (!fs.existsSync(compiledPluginPath)) {
  console.error('Error: Compiled plugin not found at dist/main.js');
  console.error('Please run the build command first (e.g., `npm run build`)');
  process.exit(1);
}

// We need to trick the plugin into using our mock Obsidian APIs.
// We replace Node's 'require' function temporarily.
const originalRequire = require;
// eslint-disable-next-line no-global-assign
require = (moduleName) => {
  if (moduleName === 'obsidian') {
    return mockObsidian;
  }
  return originalRequire(moduleName);
};

const AIService = require('./src/aiService').AIService;

if (!AIService) {
    console.error('Error: Could not load AIService from dist/main.js.');
    console.error('Please ensure AIService is exported from the bundle for testing.');
    process.exit(1);
}


// --- Test Runner ---
async function runTest(provider) {
  console.log(`\n--- Testing Provider: ${provider.toUpperCase()} ---`);

  // Mock settings for the test
  const settings = {
    aiProvider: provider,
    maxContentLength: 2000,
    maxTitleLength: 50,
    customPrompt: 'Generate a title for the following content. Max length: {max_length} characters.',
    refinePrompt: 'Refine this title to be under {max_length} characters: {title}',
    lowerCaseTitles: false,
    removeForbiddenChars: true,
    // Add dummy keys/urls to pass validation
    googleApiKey: 'test-key',
    lmstudioUrl: 'http://localhost:1234',
    openAiApiKey: 'test-key',
    anthropicApiKey: 'test-key',
    ollamaUrl: 'http://localhost:11434',
  };

  // The AIService takes a function that returns the current settings.
  const getSettings = () => settings;
  const aiService = new AIService(getSettings);

  const noteContent = 'This is a test note about cats and their adventures.';
  
  try {
    const title = await aiService.generateTitle(noteContent);

    console.log(`Provider: ${provider}`);
    console.log(`Generated Title: "${title}"`);

    if (!title || title.toLowerCase() === 'untitled' || title.includes('<think>')) {
        console.error(`FAIL: Test for ${provider} produced an invalid title.`);
    } else {
        console.log(`SUCCESS: Test for ${provider} passed.`);
    }
    
  } catch (error) {
    console.error(`FAIL: An error occurred during the ${provider} test:`, error);
  }
}

async function main() {
  console.log('🧪 Starting end-to-end plugin simulation...');
  
  // Run tests for the problematic providers
  await runTest('google');
  await runTest('lmstudio');
  await runTest('openai'); // Test a "good" case

  console.log('\n✅ Simulation finished.');
}

main();