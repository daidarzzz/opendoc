import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRelease, detectOS } from '../assets/downloads-data.mjs';
const makeAsset = (name, size = 2500000) => ({ name, size, browser_download_url: `https://github.com/daidarzzz/opendoc/releases/download/v1.2.3/${encodeURIComponent(name)}` });
const release = assets => ({ tag_name: 'v1.2.3', assets });
test('accepts the actual package families, with measured sizes', () => {
  const names = ['OpenDoc_1.2.3_x64-setup.exe', 'OpenDoc_1.2.3_x64_en-US.msi', 'OpenDoc_1.2.3_aarch64.dmg', 'OpenDoc_1.2.3_x64.dmg', 'OpenDoc_1.2.3_amd64.deb', 'OpenDoc-1.2.3-1.x86_64.rpm', 'OpenDoc_1.2.3_amd64.AppImage', 'opendoc-bin-1.2.3-1-x86_64.pkg.tar.zst'];
  const result = parseRelease(release(names.map(name => makeAsset(name))));
  assert.equal(result.version, '1.2.3');
  assert.equal(Object.keys(result.assets).length, 8);
  assert.equal(result.assets.exe.size, 2500000);
});
test('rejects foreign hosts, repositories, tags and signature files', () => {
  const name = 'OpenDoc_1.2.3_x64-setup.exe';
  const valid = makeAsset(name);
  const urls = ['javascript:alert(1)', valid.browser_download_url.replace('github.com','github.com.evil.test'), valid.browser_download_url.replace('opendoc/', 'other/'), valid.browser_download_url.replace('/v1.2.3/', '/v1.2.2/'), valid.browser_download_url + '?redirect=1'];
  assert.deepEqual(parseRelease(release(urls.map(browser_download_url => ({ ...valid, browser_download_url })))).assets, {});
  assert.deepEqual(parseRelease(release([makeAsset(name + '.sig')])).assets, {});
});
test('malformed or prerelease payloads retain release-page fallback', () => {
  for (const value of [null, {}, { tag_name: '<script>' }, { ...release([]), prerelease: true }, { ...release([]), draft: true }, { ...release([]), assets: {} }]) assert.equal(parseRelease(value), null);
  assert.deepEqual(parseRelease(release([])).assets, {});
  assert.equal(parseRelease(release([makeAsset('OpenDoc_1.2.3_amd64.deb', -1)])).assets.deb.size, null);
});
test('desktop detection does not recommend desktop packages to mobile or ChromeOS', () => {
  assert.equal(detectOS('Mozilla', 'Win32'), 'windows');
  assert.equal(detectOS('Mozilla', 'MacIntel'), 'macos');
  assert.equal(detectOS('Mozilla', 'Linux x86_64'), 'linux');
  assert.equal(detectOS('Mozilla', 'MacIntel', 5), null);
  assert.equal(detectOS('Android', 'Linux'), null);
  assert.equal(detectOS('CrOS', 'Linux'), null);
  assert.equal(detectOS('', ''), null);
});
