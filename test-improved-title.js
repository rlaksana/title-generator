#!/usr/bin/env node

// Quick test script for improved title generation
const { AIServiceTester } = require('./test-cli.js');

async function testTitleGeneration() {
  console.log('🧪 Testing improved title generation...\n');
  
  const tester = new AIServiceTester();
  
  // Test cases
  const testCases = [
    {
      content: 'This is a comprehensive guide about how to set up and configure LM Studio for local AI model inference. We will cover installation, model loading, server configuration, and troubleshooting common issues.',
      expected: 'Short, descriptive title'
    },
    {
      content: 'Let me think about this problem. The user wants a solution for managing their productivity. Looking at the requirements, I need to create a system that helps with task management and time tracking.',
      expected: 'Clean title without thinking process'
    }
  ];
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`Test ${i + 1}: ${testCase.expected}`);
    console.log(`Content: ${testCase.content.substring(0, 100)}...`);
    
    try {
      const title = await tester.testLMStudioGeneration(
        'http://192.168.68.145:1234',
        'llama-3',
        `Generate a short, descriptive title for the following text. Output ONLY the title, nothing else. Maximum 60 characters.\n\n${testCase.content}`
      );
      
      console.log(`✅ Generated title: "${title}"`);
      console.log(`   Length: ${title.length} characters`);
      
      // Test clean response function
      const cleaned = cleanAIResponse(title);
      console.log(`   Cleaned: "${cleaned}"`);
      console.log(`   Cleaned length: ${cleaned.length} characters\n`);
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}\n`);
    }
  }
}

// Copy of the cleanAIResponse function for testing
function cleanAIResponse(response) {
  if (!response) return '';
  
  // Remove common AI thinking patterns
  let cleaned = response.trim();
  
  // Remove thinking process markers
  cleaned = cleaned.replace(/^(Let me think|I need to|Okay,|The user wants|Looking at|Based on).*$/gm, '');
  
  // Remove explanations in parentheses or brackets
  cleaned = cleaned.replace(/\([^)]*\)/g, '');
  cleaned = cleaned.replace(/\[[^\]]*\]/g, '');
  
  // Remove quotes around the title
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  
  // Remove "Title:" prefix if present
  cleaned = cleaned.replace(/^(Title:|Generated title:|Suggested title:)\s*/i, '');
  
  // Take only the first line (in case there are multiple lines)
  cleaned = cleaned.split('\n')[0];
  
  // Remove extra whitespace
  cleaned = cleaned.trim();
  
  // If still too long or contains thinking words, try to extract a clean title
  if (cleaned.length > 100 || /\b(think|consider|analyze|create|generate)\b/i.test(cleaned)) {
    // Look for quoted text first
    const quotedMatch = response.match(/["']([^"']+)["']/);
    if (quotedMatch) {
      cleaned = quotedMatch[1];
    } else {
      // Try to find the actual title by looking for capitalized words
      const titleMatch = response.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/);
      if (titleMatch) {
        cleaned = titleMatch[0];
      }
    }
  }
  
  return cleaned.trim();
}

if (require.main === module) {
  testTitleGeneration().catch(console.error);
}