export interface ReleasePlatform {
  url: string;
  signature: string;
}

export interface ReleaseManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: {
    'darwin-aarch64'?: ReleasePlatform;
    'darwin-x86_64'?: ReleasePlatform;
    'windows-x86_64'?: ReleasePlatform;
  };
}

export type ReleaseManifestPlatform = keyof ReleaseManifest['platforms'];
