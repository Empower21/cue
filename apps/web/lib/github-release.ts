import 'server-only';
import type { ReleaseManifestPlatform } from '@cue/shared';

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubAsset[];
}

const PLATFORM_ASSET_PATTERNS: Record<ReleaseManifestPlatform, RegExp> = {
  // Tauri's default bundle naming: cue_<version>_<arch>.<ext>
  // Examples: cue_0.1.0_aarch64.dmg, cue_0.1.0_x64_en-US.msi
  'darwin-aarch64': /_aarch64.*\.dmg$/i,
  'darwin-x86_64': /(_x64|_x86_64).*\.dmg$/i,
  'windows-x86_64': /\.msi$/i,
};

const SIGNATURE_ASSET_PATTERNS: Record<ReleaseManifestPlatform, RegExp> = {
  // Tauri updater signatures end in .sig
  'darwin-aarch64': /\.app\.tar\.gz\.sig$/i,
  'darwin-x86_64': /(_x64|_x86_64).*\.app\.tar\.gz\.sig$/i,
  'windows-x86_64': /\.zip\.sig$/i,
};

const UPDATER_BUNDLE_PATTERNS: Record<ReleaseManifestPlatform, RegExp> = {
  'darwin-aarch64': /\.app\.tar\.gz$/i,
  'darwin-x86_64': /(_x64|_x86_64).*\.app\.tar\.gz$/i,
  'windows-x86_64': /\.zip$/i,
};

function getRepo(): string | null {
  const repo = process.env.GITHUB_REPO;
  if (!repo || !repo.includes('/')) return null;
  return repo;
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  const repo = getRepo();
  if (!repo) return null;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers,
    // Cache with Next's data cache for 5 minutes
    next: { revalidate: 300 },
  });

  if (res.status === 404) return null; // no releases yet
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);

  return (await res.json()) as GitHubRelease;
}

export async function getInstallerUrl(platform: ReleaseManifestPlatform): Promise<string | null> {
  const release = await fetchLatestRelease();
  if (!release || release.draft) return null;
  const pattern = PLATFORM_ASSET_PATTERNS[platform];
  const asset = release.assets.find((a) => pattern.test(a.name));
  return asset?.browser_download_url ?? null;
}

export interface ManifestPlatformAsset {
  url: string;
  signature: string;
}

export interface UpstreamManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Partial<Record<ReleaseManifestPlatform, ManifestPlatformAsset>>;
}

async function fetchSignature(url: string): Promise<string> {
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return '';
  return (await res.text()).trim();
}

export async function getUpdaterManifest(): Promise<UpstreamManifest | null> {
  const release = await fetchLatestRelease();
  if (!release || release.draft) return null;

  const platforms: Partial<Record<ReleaseManifestPlatform, ManifestPlatformAsset>> = {};
  for (const platform of Object.keys(UPDATER_BUNDLE_PATTERNS) as ReleaseManifestPlatform[]) {
    const bundlePattern = UPDATER_BUNDLE_PATTERNS[platform];
    const sigPattern = SIGNATURE_ASSET_PATTERNS[platform];
    const bundle = release.assets.find((a) => bundlePattern.test(a.name));
    const sig = release.assets.find((a) => sigPattern.test(a.name));
    if (!bundle || !sig) continue;
    platforms[platform] = {
      url: bundle.browser_download_url,
      signature: await fetchSignature(sig.browser_download_url),
    };
  }

  // Tauri's updater requires version without the leading "v"
  const version = release.tag_name.replace(/^v/, '');

  return {
    version,
    notes: release.body || release.name || '',
    pub_date: release.published_at,
    platforms,
  };
}
