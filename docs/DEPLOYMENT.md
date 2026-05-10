# Vercel deployment — manual user steps

This document is the runbook for deploying `apps/web` (the cue marketing site) to Vercel for the first time. After the initial setup, every git push to `main` deploys automatically — no further manual steps.

## Prerequisites

- Vercel CLI installed: `vercel --version` should print `53.x` or newer (already installed by Plan 3 Task 11)
- A Vercel account on the `amdrentcorp-5032s-projects` team

## Path A — Interactive (recommended for first-time setup)

Run these from `cue/apps/web/`:

### 1. Authenticate

```bash
cd "C:\Users\amdre\OneDrive\Desktop\AI ARCHITECTURE SOLUTIONS - GTM\Interview Help\cue\apps\web"
vercel login
```

Vercel opens a browser tab. Sign in with the email tied to `amdrentcorp-5032s-projects`. Confirm the device. Return to the terminal.

### 2. Link the project

```bash
vercel link
```

Vercel prompts:

| Prompt | Answer |
|---|---|
| Set up and deploy? | **N** (we want to link first, then configure env, then deploy) |
| Which scope? | **`amdrentcorp-5032s-projects`** |
| Link to existing project? | **N** |
| What's your project's name? | **`cue-web`** |
| In which directory is your code located? | **`./`** (you're already in `apps/web`) |
| Want to modify these settings? | **N** (we use `vercel.ts` for config) |

This writes `apps/web/.vercel/project.json` (gitignored).

### 3. Configure environment variables

You'll need a GitHub repository for the cue source. If you haven't created one yet, do that first (any name — `cue` or `cue-app` are fine; visibility public or private both work).

```bash
# Set GITHUB_REPO for production environment
vercel env add GITHUB_REPO production
# When prompted for the value, paste: <your-github-username>/<repo-name>
# Example: amdrentcorp/cue

# Optional but recommended — GITHUB_TOKEN bumps API rate limit from 60/hr to 5000/hr
vercel env add GITHUB_TOKEN production
# Generate a fine-grained PAT at https://github.com/settings/personal-access-tokens/new
# Permissions needed:
#   - Contents: Read-only (for accessing release assets)
# Repository access: just the cue repo (or "Public Repositories" if your repo is public)
# Paste the token when prompted.
```

Repeat for `preview` and `development` environments if you want them populated:

```bash
vercel env add GITHUB_REPO preview
vercel env add GITHUB_TOKEN preview
```

### 4. Deploy a preview

```bash
vercel
```

Wait for the build to complete (~2-3 min for first build; ~30s for subsequent). Vercel prints the preview URL when done. Open it and verify:

- `/` renders Hero + Features + HowItWorks + DownloadCTA
- `/eula` renders the personal-use license
- `/changelog` renders CHANGELOG.md content
- `/download` shows your detected platform
- `/api/manifest` returns `{ "error": "No release available" }` (expected — no GitHub release yet)
- `/api/download/windows-x86_64` returns the same expected 404

### 5. Promote to production

```bash
vercel --prod
```

Prints the production URL (e.g., `cue-web-amdrentcorp-5032s-projects.vercel.app`). Save this URL — paste it back to Claude when you return so the implementer can run Task 11.7 verification.

### 6. (Optional) Custom domain

If you've registered a domain (`usecue.io`, `trycue.app`, or whatever):

```bash
vercel domains add usecue.io
vercel alias <production-url> usecue.io
```

DNS records appear in the Vercel dashboard. Update them at your registrar.

---

## Path B — Non-interactive (using a Vercel API token)

If you want Claude / a CI pipeline to deploy without browser auth:

1. Generate a Vercel access token: https://vercel.com/account/tokens
   - Scope: full account or just `cue-web` after the project exists
2. Export the token in your shell:
   ```bash
   export VERCEL_TOKEN=<your-token>     # bash
   $env:VERCEL_TOKEN = "<your-token>"   # PowerShell
   ```
3. Tell Claude to deploy with `vercel deploy --token=$VERCEL_TOKEN --yes` from `apps/web/`. The `--yes` flag accepts all prompts with their defaults.

Path B is faster for repeat deploys but requires the project to already exist — Path A's `vercel link` step is still needed once.

---

## What's deployed on first run

The marketing site goes live with the following functioning even before you have any cue desktop binaries:

- All five pages (`/`, `/download`, `/eula`, `/changelog`, custom 404)
- The two API routes (returning helpful 404 JSON until the first GitHub Release)
- Cache headers (`Cache-Control: public, max-age=...` on static assets and APIs)
- Legacy redirects (`/install` → `/download`, `/license` → `/eula`)

The site stays in this "no release yet" state until your first `git tag v0.1.0 && git push --tags` — at which point GitHub Actions (`.github/workflows/release.yml`, already in place) builds + uploads desktop binaries, and the download page + manifest endpoint instantly start serving real assets without any further code changes.
