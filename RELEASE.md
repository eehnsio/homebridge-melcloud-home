# Release Workflow

This document explains how to publish new versions of homebridge-melcloud-home.

## Quick Start

### Publishing a Stable Release

```bash
# 1. Make your changes and commit them
git add .
git commit -m "Your changes"

# 2. Bump version (updates package.json and creates git tag)
npm version patch   # 1.1.1 -> 1.1.2 (bug fixes)
npm version minor   # 1.1.1 -> 1.2.0 (new features)
npm version major   # 1.1.1 -> 2.0.0 (breaking changes)

# 3. Push commits and tags
git push && git push --tags
```

**That's it!** GitHub Actions will automatically:
- ✅ Build the project
- ✅ Publish to npm with `latest` tag
- ✅ Create a GitHub release with auto-generated changelog

### Publishing a Beta Release

```bash
# 1. Make your changes and commit them
git add .
git commit -m "Experimental feature"

# 2. Create beta version
npm version 1.2.0-beta.1  # or beta.2, beta.3, etc.

# 3. Push commits and tags
git push && git push --tags
```

GitHub Actions will automatically:
- ✅ Build the project
- ✅ Publish to npm with `beta` tag (won't affect users on `latest`)
- ✅ Create a GitHub pre-release

Users can test with: `npm install homebridge-melcloud-home@beta`

## How It Works

### Automatic Beta Detection

The workflow automatically detects if a version is stable or pre-release:

- **Stable**: `v1.2.0`, `v2.0.0` → Published as `latest` tag on npm
- **Beta**: `v1.2.0-beta.1`, `v1.2.0-alpha.1`, `v1.2.0-rc.1` → Published as `beta` tag on npm

### Changelog Generation

The GitHub release automatically includes:
1. **Git log**: All commit messages since the last tag
2. **Auto-generated notes**: GitHub's AI-powered release notes

### Version Tag Format

Always use the `v` prefix for tags:
- ✅ `v1.2.0`
- ✅ `v1.2.0-beta.1`
- ❌ `1.2.0` (won't trigger workflow)

## Workflows

### For Bug Fixes (Patch Release)

```bash
# Fix the bug
git add .
git commit -m "Fix: Resolve issue with mode switching"

# Bump patch version (1.1.1 -> 1.1.2)
npm version patch

# Publish
git push && git push --tags
```

### For New Features (Minor Release)

```bash
# Add the feature
git add .
git commit -m "Add support for fan speed control"

# Bump minor version (1.1.2 -> 1.2.0)
npm version minor

# Publish
git push && git push --tags
```

### For Testing/Experimental Features (Beta)

```bash
# Implement experimental feature
git add .
git commit -m "Experimental: Add zone support"

# Create beta version
npm version 1.2.0-beta.1

# Publish as beta
git push && git push --tags

# After testing, iterate:
npm version 1.2.0-beta.2
git push && git push --tags

# When stable, release as:
npm version 1.2.0
git push && git push --tags
```

### For Breaking Changes (Major Release)

```bash
# Make breaking changes
git add .
git commit -m "BREAKING: Restructure config schema"

# Bump major version (1.2.0 -> 2.0.0)
npm version major

# Publish
git push && git push --tags
```

## npm Dist Tags

Users install different versions using tags:

```bash
# Latest stable (default)
npm install homebridge-melcloud-home
npm install homebridge-melcloud-home@latest

# Beta/testing versions
npm install homebridge-melcloud-home@beta

# Specific version
npm install homebridge-melcloud-home@1.2.0
```

## Manual Publishing (Emergency)

If GitHub Actions fails, you can publish manually:

```bash
# Build
npm run build

# Publish stable
npm publish --provenance --access public

# Or publish beta
npm publish --tag beta --provenance --access public
```

## Troubleshooting

### "Version already published" error
- You've already published this version to npm
- Bump to a new version: `npm version patch`

### GitHub Actions fails
- Check build passes locally: `npm run build`
- Verify `NPM_TOKEN` secret is set in GitHub repository settings
- View logs in GitHub Actions tab

### Tag already exists
```bash
# Delete local tag
git tag -d v1.2.0

# Delete remote tag
git push origin :refs/tags/v1.2.0

# Create new tag
npm version 1.2.0
git push && git push --tags
```

## Best Practices

1. **Always test locally** before publishing
2. **Use beta tags** for experimental features
3. **Write clear commit messages** - they appear in changelogs
4. **Follow semantic versioning**:
   - PATCH: Bug fixes
   - MINOR: New features (backward compatible)
   - MAJOR: Breaking changes
5. **Test beta versions** on your own Homebridge instance before stable release
