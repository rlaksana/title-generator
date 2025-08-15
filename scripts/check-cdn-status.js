#!/usr/bin/env node

/**
 * CDN Status Checker for Obsidian Plugin Releases
 * Helps troubleshoot BRAT installation issues
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const REPO_OWNER = 'rlaksana';
const REPO_NAME = 'title-generator';
const REQUIRED_FILES = ['main.js', 'manifest.json'];

/**
 * Make HTTP request with promise
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
          url: url
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Request timeout for ${url}`));
    });
    
    req.end();
  });
}

/**
 * Get latest release information
 */
async function getLatestRelease() {
  try {
    const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
    const response = await makeRequest(apiUrl);
    
    if (response.statusCode !== 200) {
      throw new Error(`GitHub API error: ${response.statusCode}`);
    }
    
    return JSON.parse(response.data);
  } catch (error) {
    console.error('❌ Failed to fetch latest release:', error.message);
    throw error;
  }
}

/**
 * Check if asset is accessible
 */
async function checkAssetAccessibility(assetUrl, assetName) {
  const results = {
    accessible: false,
    size: 0,
    redirects: [],
    error: null,
    timing: {
      start: Date.now(),
      end: null
    }
  };
  
  try {
    console.log(`🔍 Checking ${assetName}: ${assetUrl}`);
    
    // Follow redirects manually to track them
    let currentUrl = assetUrl;
    let redirectCount = 0;
    const maxRedirects = 5;
    
    while (redirectCount < maxRedirects) {
      const response = await makeRequest(currentUrl, { method: 'HEAD' });
      
      if (response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers.location;
        if (location) {
          results.redirects.push({
            from: currentUrl,
            to: location,
            statusCode: response.statusCode
          });
          currentUrl = location;
          redirectCount++;
          console.log(`  ↳ Redirect ${redirectCount}: ${response.statusCode} → ${location}`);
        } else {
          break;
        }
      } else if (response.statusCode === 200) {
        results.accessible = true;
        results.size = parseInt(response.headers['content-length'] || '0');
        console.log(`  ✅ Accessible (${results.size} bytes)`);
        break;
      } else {
        results.error = `HTTP ${response.statusCode}`;
        console.log(`  ❌ Error: ${results.error}`);
        break;
      }
    }
    
    if (redirectCount >= maxRedirects) {
      results.error = 'Too many redirects';
      console.log(`  ❌ Error: ${results.error}`);
    }
    
  } catch (error) {
    results.error = error.message;
    console.log(`  ❌ Error: ${results.error}`);
  }
  
  results.timing.end = Date.now();
  return results;
}

/**
 * Check GitHub CDN status
 */
async function checkGitHubCDNStatus() {
  console.log('🌐 Checking GitHub CDN status...');
  
  try {
    // Check GitHub status API
    const statusResponse = await makeRequest('https://kctbh9vrtdwd.statuspage.io/api/v2/status.json');
    const statusData = JSON.parse(statusResponse.data);
    
    console.log(`📊 GitHub Status: ${statusData.status.description}`);
    
    // Check specific component for releases
    if (statusData.components) {
      const releaseComponent = statusData.components.find(c => 
        c.name.toLowerCase().includes('release') || 
        c.name.toLowerCase().includes('download')
      );
      
      if (releaseComponent) {
        console.log(`📦 Release System: ${releaseComponent.status}`);
      }
    }
    
  } catch (error) {
    console.log('⚠️  Could not check GitHub status:', error.message);
  }
}

/**
 * Test BRAT compatibility
 */
async function testBRATCompatibility(release) {
  console.log('\n🔧 Testing BRAT compatibility...');
  
  // Check if manifest.json has required fields
  const manifestAsset = release.assets.find(a => a.name === 'manifest.json');
  if (!manifestAsset) {
    console.log('❌ manifest.json not found in release assets');
    return false;
  }
  
  try {
    const manifestResponse = await makeRequest(manifestAsset.browser_download_url);
    const manifest = JSON.parse(manifestResponse.data);
    
    const requiredFields = ['id', 'name', 'version', 'minAppVersion'];
    const missingFields = requiredFields.filter(field => !manifest[field]);
    
    if (missingFields.length > 0) {
      console.log(`❌ Missing required fields in manifest.json: ${missingFields.join(', ')}`);
      return false;
    }
    
    console.log('✅ manifest.json has all required fields');
    console.log(`   Plugin ID: ${manifest.id}`);
    console.log(`   Version: ${manifest.version}`);
    console.log(`   Min App Version: ${manifest.minAppVersion}`);
    
    return true;
    
  } catch (error) {
    console.log('❌ Failed to validate manifest.json:', error.message);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Title Generator - CDN Status Checker');
  console.log('=' .repeat(60));
  
  try {
    // Get latest release info
    console.log('📋 Fetching latest release information...');
    const release = await getLatestRelease();
    
    console.log(`📦 Latest Release: ${release.tag_name}`);
    console.log(`📅 Published: ${new Date(release.published_at).toLocaleString()}`);
    console.log(`🔗 Release URL: ${release.html_url}`);
    
    // Check GitHub CDN status
    await checkGitHubCDNStatus();
    
    console.log('\n🔍 Checking asset accessibility...');
    
    // Check each required file
    const assetResults = [];
    for (const fileName of REQUIRED_FILES) {
      const asset = release.assets.find(a => a.name === fileName);
      
      if (!asset) {
        console.log(`❌ ${fileName} not found in release assets`);
        assetResults.push({ name: fileName, accessible: false, error: 'Asset not found' });
        continue;
      }
      
      const result = await checkAssetAccessibility(asset.browser_download_url, fileName);
      result.name = fileName;
      result.downloadUrl = asset.browser_download_url;
      assetResults.push(result);
      
      // Wait between checks to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Test BRAT compatibility
    const isBRATCompatible = await testBRATCompatibility(release);
    
    // Generate report
    console.log('\n📊 SUMMARY REPORT');
    console.log('=' .repeat(60));
    
    const allAccessible = assetResults.every(r => r.accessible);
    console.log(`🎯 Overall Status: ${allAccessible && isBRATCompatible ? '✅ READY' : '❌ ISSUES DETECTED'}`);
    
    console.log('\n📁 Asset Status:');
    assetResults.forEach(result => {
      const status = result.accessible ? '✅' : '❌';
      const timing = result.timing.end ? `(${result.timing.end - result.timing.start}ms)` : '';
      console.log(`   ${status} ${result.name}: ${result.accessible ? result.size + ' bytes' : result.error} ${timing}`);
    });
    
    console.log(`\n🔧 BRAT Compatible: ${isBRATCompatible ? '✅ YES' : '❌ NO'}`);
    
    if (!allAccessible) {
      console.log('\n🔧 TROUBLESHOOTING TIPS:');
      console.log('   1. Wait 5-10 minutes for CDN propagation');
      console.log('   2. Try refreshing BRAT plugin list');
      console.log('   3. Check GitHub Status page: https://githubstatus.com');
      console.log('   4. Use manual installation if CDN issues persist');
    }
    
    console.log('\n📋 BRAT Installation:');
    console.log(`   Repository: ${REPO_OWNER}/${REPO_NAME}`);
    console.log(`   Latest Version: ${release.tag_name}`);
    
  } catch (error) {
    console.error('❌ CDN Status Check Failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, checkAssetAccessibility, getLatestRelease };