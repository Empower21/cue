import type { ReleaseManifestPlatform } from '@cue/shared';

export interface DetectedPlatform {
  key: ReleaseManifestPlatform | null;
  label: string;
  fileType: 'dmg' | 'msi' | null;
}

export function detectPlatform(userAgent: string | null): DetectedPlatform {
  const ua = (userAgent ?? '').toLowerCase();

  // Apple Silicon Macs
  if (ua.includes('mac os') || ua.includes('macintosh')) {
    // Modern UA strings from Apple Silicon Macs include "AppleWebKit" but the
    // architecture isn't reliably exposed. Default to aarch64 (M-series) since
    // it's now the majority install base for new Macs in 2026; users on Intel
    // can pick the x86_64 build manually from the dropdown.
    return { key: 'darwin-aarch64', label: 'macOS (Apple Silicon)', fileType: 'dmg' };
  }

  if (ua.includes('windows')) {
    return { key: 'windows-x86_64', label: 'Windows', fileType: 'msi' };
  }

  return { key: null, label: 'your platform', fileType: null };
}

export const ALL_PLATFORMS: ReadonlyArray<{ key: ReleaseManifestPlatform; label: string; fileType: 'dmg' | 'msi' }> = [
  { key: 'darwin-aarch64', label: 'macOS (Apple Silicon, M-series)', fileType: 'dmg' },
  { key: 'darwin-x86_64', label: 'macOS (Intel)', fileType: 'dmg' },
  { key: 'windows-x86_64', label: 'Windows (x64)', fileType: 'msi' },
];
