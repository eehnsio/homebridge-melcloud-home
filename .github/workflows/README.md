# GitHub Actions Workflows

This directory contains automated workflows for the project.

## Workflows

### `publish.yml` - Automated npm Publishing

**Trigger:** When a new GitHub Release is published

**What it does:**
1. Checks out the code
2. Sets up Node.js 20
3. Installs dependencies
4. Builds the project
5. Publishes to npm with provenance attestation

**Benefits:**
- ✅ Automatic publishing when you create a GitHub release
- ✅ Cryptographic provenance linking package to source code
- ✅ Verified checkmark on npm package page
- ✅ Consistent build environment
- ✅ No need to publish manually from local machine

**Setup Required:**
1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Create a new **Automation** token (not Classic)
3. Copy the token
4. Go to your GitHub repo → Settings → Secrets and variables → Actions
5. Create a new secret named `NPM_TOKEN` and paste the token

### `build.yml` - Build and Test

**Trigger:** On every push to `main` and on pull requests

**What it does:**
1. Tests build on Node.js 20 and 22
2. Verifies dependencies install correctly
3. Checks that TypeScript compiles successfully
4. Validates dist artifacts are created

**Benefits:**
- ✅ Catches build errors early
- ✅ Tests on multiple Node.js versions
- ✅ Validates compatibility before merging PRs

## Publishing Workflow

### Current (Manual):
1. Update version in package.json
2. Update CHANGELOG.md
3. Commit changes
4. Create git tag
5. Push to GitHub
6. Run `npm publish` locally
7. Create GitHub release

### New (Automated):
1. Update version in package.json
2. Update CHANGELOG.md
3. Commit and push changes
4. Create a GitHub Release (with tag v1.x.x)
5. **GitHub Actions automatically publishes to npm!** 🎉

## Creating a Release

1. Go to https://github.com/eehnsio/homebridge-melcloud-home/releases/new
2. Click "Choose a tag" → Create new tag (e.g., `v1.1.2`)
3. Set release title: `v1.1.2`
4. Copy release notes from CHANGELOG.md
5. Click "Publish release"
6. GitHub Actions will automatically:
   - Build the package
   - Run tests
   - Publish to npm with provenance

## Provenance

When published via GitHub Actions, the package will have:
- ✓ Verified provenance attestation
- Link to exact source code commit
- Cryptographic proof package wasn't tampered with
- Visible on npm package page

Learn more: https://docs.npmjs.com/generating-provenance-statements
