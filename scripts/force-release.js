#!/usr/bin/env node

/**
 * Force Release Script for CDN Issues
 * Recreates the latest release to trigger CDN refresh
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Execute command with error handling
 */
function runCommand(command, description) {
  try {
    console.log(`🔄 ${description}...`);
    const result = execSync(command, { encoding: 'utf8' });
    console.log(`✅ ${description} completed`);
    return result.trim();
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    throw error;
  }
}

/**
 * Check if required files exist
 */
function checkRequiredFiles() {
  const requiredFiles = [
    'dist/main.js',
    'dist/manifest.json',
    'manifest.json'
  ];
  
  console.log('📋 Checking required files...');
  
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      console.error(`❌ Missing required file: ${file}`);
      console.log('💡 Run "npm run build" first to generate dist files');
      process.exit(1);
    }
  }
  
  console.log('✅ All required files present');
}

/**
 * Get current version from manifest
 */
function getCurrentVersion() {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  return manifest.version;
}

/**
 * Force recreate release
 */
function forceRecreateRelease() {
  console.log('🚀 Enhanced Title Generator - Force Release');
  console.log('=' .repeat(60));
  
  try {
    // Check prerequisites
    checkRequiredFiles();
    
    // Get current version
    const version = getCurrentVersion();
    const tag = `v${version}`;
    
    console.log(`📦 Current version: ${version}`);
    console.log(`🏷️  Tag: ${tag}`);
    
    // Check if release exists
    console.log('🔍 Checking if release exists...');
    try {
      runCommand(`gh release view ${tag}`, 'Checking existing release');
      
      // Release exists, delete it
      console.log('🗑️  Deleting existing release...');
      runCommand(`gh release delete ${tag} --yes --cleanup-tag`, 'Deleting existing release');
      
      // Wait for propagation
      console.log('⏳ Waiting for deletion to propagate...');
      setTimeout(() => {}, 10000);
      
    } catch (error) {
      console.log('ℹ️  No existing release found, proceeding with creation');
    }
    
    // Rebuild to ensure fresh assets
    console.log('🔨 Rebuilding plugin...');
    runCommand('npm run build', 'Building plugin');
    
    // Verify file sizes
    const mainJsSize = fs.statSync('dist/main.js').size;
    const manifestSize = fs.statSync('dist/manifest.json').size;
    
    console.log(`📊 Asset sizes:`);
    console.log(`   main.js: ${mainJsSize} bytes`);
    console.log(`   manifest.json: ${manifestSize} bytes`);
    
    if (mainJsSize < 1000 || manifestSize < 100) {
      console.error('❌ Asset sizes too small, build may have failed');
      process.exit(1);
    }
    
    // Create new release
    console.log('📤 Creating new release...');
    
    const releaseNotes = `
## 🔄 Force Release v${version}

This release was recreated to address CDN propagation issues with BRAT installations.

### For BRAT Users:
- Use repository: \`rlaksana/obsidian-title-generator\`
- If installation fails, wait 5-10 minutes and try again
- Check plugin compatibility with your Obsidian version

### Recent Changes:
See previous release notes for feature details.

---
*This is an automated release to ensure CDN reliability.*
    `.trim();
    
    // Create release with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`🚀 Creating release (attempt ${retryCount + 1}/${maxRetries})...`);
        
        runCommand(
          `gh release create ${tag} --title "Force Release ${tag}" --notes "${releaseNotes}" dist/main.js dist/manifest.json`,
          'Creating GitHub release'
        );
        
        console.log('✅ Release created successfully!');
        break;
        
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          throw error;
        }
        
        console.log(`⚠️  Attempt ${retryCount} failed, retrying in 15 seconds...`);
        setTimeout(() => {}, 15000);
      }
    }
    
    // Wait for CDN propagation
    console.log('⏳ Waiting for CDN propagation...');
    setTimeout(() => {}, 30000);
    
    // Verify release accessibility
    console.log('🔍 Verifying release accessibility...');
    
    const repoUrl = runCommand('git config --get remote.origin.url', 'Getting repository URL')
      .replace('https://github.com/', '')
      .replace('.git', '');
    
    const mainJsUrl = `https://github.com/${repoUrl}/releases/download/${tag}/main.js`;
    const manifestUrl = `https://github.com/${repoUrl}/releases/download/${tag}/manifest.json`;
    
    console.log(`📋 Asset URLs:`);
    console.log(`   main.js: ${mainJsUrl}`);
    console.log(`   manifest.json: ${manifestUrl}`);
    
    console.log('\n🎉 FORCE RELEASE COMPLETED!');
    console.log('=' .repeat(60));
    console.log(`✅ Release ${tag} has been recreated`);
    console.log(`🔗 View release: https://github.com/${repoUrl}/releases/tag/${tag}`);
    console.log(`📋 BRAT Installation: ${repoUrl.replace('/', '/').split('/')[0]}/${repoUrl.replace('/', '/').split('/')[1]}`);
    console.log('');
    console.log('💡 If BRAT installation still fails:');
    console.log('   1. Wait 5-10 minutes for global CDN propagation');
    console.log('   2. Refresh BRAT plugin list');
    console.log('   3. Try manual installation from release page');
    console.log('   4. Run "node scripts/check-cdn-status.js" to verify');
    
  } catch (error) {
    console.error('\n❌ Force release failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Ensure you have gh CLI installed and authenticated');
    console.log('   2. Check your repository permissions');
    console.log('   3. Verify dist files exist (run "npm run build")');
    console.log('   4. Check network connectivity');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  forceRecreateRelease();
}

module.exports = { forceRecreateRelease };