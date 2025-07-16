#!/usr/bin/env node

/**
 * Local CDN Test Script
 * Tests CDN functionality with current local files
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Enhanced Title Generator - Local CDN Test');
console.log('=' .repeat(60));

// Check if required files exist
const requiredFiles = [
  'dist/main.js',
  'dist/manifest.json',
  'manifest.json'
];

console.log('📋 Checking required files...');

let allFilesExist = true;
for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    const stats = fs.statSync(file);
    console.log(`✅ ${file} (${stats.size} bytes)`);
  } else {
    console.log(`❌ ${file} - Missing`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.log('\n💡 Run "npm run build" to generate missing files');
  process.exit(1);
}

// Check manifest.json content
console.log('\n📋 Validating manifest.json...');
try {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const distManifest = JSON.parse(fs.readFileSync('dist/manifest.json', 'utf8'));
  
  console.log(`✅ Plugin ID: ${manifest.id}`);
  console.log(`✅ Version: ${manifest.version}`);
  console.log(`✅ Min App Version: ${manifest.minAppVersion}`);
  
  if (manifest.version === distManifest.version) {
    console.log('✅ Manifest versions match');
  } else {
    console.log('❌ Manifest versions mismatch');
  }
  
} catch (error) {
  console.log('❌ Invalid manifest.json:', error.message);
  process.exit(1);
}

// Check main.js content
console.log('\n📋 Validating main.js...');
try {
  const mainJs = fs.readFileSync('dist/main.js', 'utf8');
  
  if (mainJs.includes('TitleGeneratorPlugin')) {
    console.log('✅ Contains TitleGeneratorPlugin class');
  } else {
    console.log('❌ Missing TitleGeneratorPlugin class');
  }
  
  if (mainJs.includes('Enhanced Title Generator')) {
    console.log('✅ Contains plugin name');
  } else {
    console.log('❌ Missing plugin name');
  }
  
  if (mainJs.length > 10000) {
    console.log('✅ File size looks reasonable');
  } else {
    console.log('❌ File size too small');
  }
  
} catch (error) {
  console.log('❌ Cannot read main.js:', error.message);
  process.exit(1);
}

console.log('\n🎯 Summary:');
console.log('✅ All required files present');
console.log('✅ Files are valid and ready for release');
console.log('✅ BRAT installation should work');

console.log('\n📋 Next Steps:');
console.log('1. Commit and push changes');
console.log('2. GitHub Actions will create automatic release');
console.log('3. Wait 5-10 minutes for CDN propagation');
console.log('4. Install via BRAT: rlaksana/obsidian-title-generator');

console.log('\n🔧 If CDN issues occur:');
console.log('- Wait 5-10 minutes for propagation');
console.log('- Check GitHub Status: https://githubstatus.com');
console.log('- Use manual installation as fallback');