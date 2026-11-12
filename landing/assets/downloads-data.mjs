export const RELEASES = 'https://github.com/daidarzzz/opendoc/releases/latest';
const PREFIX = 'https://github.com/daidarzzz/opendoc/releases/download/';
const suffixes = {
  exe: '_x64-setup.exe', msi: '_x64_en-US.msi',
  dmgArm: '_aarch64.dmg', dmgX64: '_x64.dmg',
  deb: '_amd64.deb', rpm: '.x86_64.rpm', appimage: '_amd64.AppImage',
  arch: '-x86_64.pkg.tar.zst',
};

/** Only accept stable releases and assets belonging to this repository and tag. */
export function parseRelease(value) {
  if (!value || typeof value !== 'object' || value.draft || value.prerelease ||
      typeof value.tag_name !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(value.tag_name) ||
      !Array.isArray(value.assets)) return null;
  const tag = value.tag_name;
  const assets = {};
  for (const asset of value.assets) {
    if (!asset || typeof asset.name !== 'string' || typeof asset.browser_download_url !== 'string') continue;
    let url;
    try { url = new URL(asset.browser_download_url); } catch { continue; }
    if (url.search || url.hash || url.href !== PREFIX + tag + '/' + encodeURIComponent(asset.name)) continue;
    for (const [key, suffix] of Object.entries(suffixes)) {
      const expectedPrefix = key === 'arch' ? 'opendoc-bin-' : 'OpenDoc';
      if (!asset.name.startsWith(expectedPrefix) || !asset.name.endsWith(suffix)) continue;
      assets[key] = {
        url: url.href,
        size: Number.isSafeInteger(asset.size) && asset.size > 0 ? asset.size : null,
      };
    }
  }
  return { version: tag.replace(/^v/, ''), assets };
}

/** Highlight desktop OS only; never guess a CPU architecture or Linux package. */
export function detectOS(ua, platform, touchPoints = 0) {
  if (/iphone|ipad|ipod|android|cros/i.test(ua) || (/mac/i.test(platform) && touchPoints > 1)) return null;
  if (/win/i.test(platform)) return 'windows';
  if (/mac/i.test(platform)) return 'macos';
  if (/linux|x11/i.test(platform)) return 'linux';
  return null;
}
