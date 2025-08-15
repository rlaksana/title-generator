# 🔧 CDN Troubleshooting Guide

This guide helps resolve BRAT installation issues caused by GitHub CDN propagation delays.

## 🚨 Common Error Messages

### "This does not seem to be an obsidian plugin as there is no manifest.json file"
- **Cause**: CDN hasn't propagated the manifest.json file yet
- **Solution**: Wait 5-10 minutes and try again

### "The release is not complete arxi cannot be download main.js is missing"
- **Cause**: CDN hasn't propagated the main.js file yet
- **Solution**: Use force-release script or wait for propagation

## 🛠️ Quick Fix Commands

### 1. Check CDN Status
```bash
npm run check-cdn
```
This will:
- Check if release assets are accessible
- Verify file sizes and integrity
- Test BRAT compatibility
- Show CDN propagation status

### 2. Force Release Recreation
```bash
npm run force-release
```
This will:
- Delete and recreate the current release
- Trigger fresh CDN propagation
- Verify asset accessibility
- Wait for CDN to update

### 3. Get Help
```bash
npm run release-help
```
Shows available commands and BRAT installation info.

## 📋 BRAT Installation

**Repository URL**: `rlaksana/title-generator`

### Step-by-Step:
1. Install BRAT plugin in Obsidian
2. Open BRAT settings
3. Click "Add Beta Plugin"
4. Enter: `rlaksana/title-generator`
5. Click "Add Plugin"

### If Installation Fails:
1. Wait 5-10 minutes for CDN propagation
2. Run `npm run check-cdn` to verify status
3. Try again, or use `npm run force-release`
4. Refresh BRAT plugin list
5. Check GitHub Status: https://githubstatus.com

## 🔍 Manual Verification

### Check Asset URLs Directly:
```bash
# Replace v3.0.X with actual version
curl -I https://github.com/rlaksana/title-generator/releases/download/v3.0.X/main.js
curl -I https://github.com/rlaksana/title-generator/releases/download/v3.0.X/manifest.json
```

### Expected Response:
```
HTTP/2 200
content-type: application/javascript
content-length: [file-size]
```

## 🚀 Automated Solutions

### GitHub Actions Improvements:
Our release workflow now includes:
- **Retry Logic**: Multiple attempts to create releases
- **CDN Verification**: Checks asset accessibility before completing
- **Mirror Releases**: Temporary duplicate releases for CDN warming
- **Extended Timeouts**: Longer waits for CDN propagation

### CDN Propagation Timeline:
- **Initial**: 30 seconds - 2 minutes
- **Regional**: 5-10 minutes  
- **Global**: 10-30 minutes
- **Cache Refresh**: Up to 1 hour

## 📊 Status Monitoring

### GitHub Status Pages:
- **Main**: https://githubstatus.com
- **API**: https://kctbh9vrtdwd.statuspage.io

### CDN Components:
- GitHub Releases
- Raw Content Delivery
- Asset Downloads

## 🔧 Developer Commands

### For Plugin Developers:
```bash
# Build plugin
npm run build

# Check current CDN status
npm run check-cdn

# Force release recreation
npm run force-release

# Test locally
npm run dev
```

## 🆘 Emergency Manual Installation

If CDN issues persist:

1. **Download Files Directly**:
   - Go to: https://github.com/rlaksana/title-generator/releases/latest
   - Download `main.js` and `manifest.json`

2. **Manual Installation**:
   ```bash
   # Navigate to your vault
   cd /path/to/your/vault
   
   # Create plugin directory
   mkdir -p .obsidian/plugins/title-generator
   
   # Copy files
   cp ~/Downloads/main.js .obsidian/plugins/title-generator/
   cp ~/Downloads/manifest.json .obsidian/plugins/title-generator/
   ```

3. **Enable Plugin**:
   - Restart Obsidian
   - Go to Settings → Community Plugins
   - Enable "Title Generator"

## 📞 Support

### Report Issues:
- **GitHub Issues**: https://github.com/rlaksana/title-generator/issues
- **Include**: CDN check results, error messages, timestamps

### Quick Diagnostics:
```bash
# Run full diagnostic
npm run check-cdn

# Check specific version
node scripts/check-cdn-status.js

# Force fix
npm run force-release
```

---

*This guide is automatically updated with each release to ensure CDN reliability.*