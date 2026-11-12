import { RELEASES, parseRelease, detectOS } from './downloads-data.mjs';

const root = document.documentElement;
const storageKey = 'opendoc-landing';
const accents = ['red', 'blue', 'amber', 'catppuccin'];
function load() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function save(patch) {
  try { localStorage.setItem(storageKey, JSON.stringify({ ...load(), ...patch })); } catch { /* Preferences remain usable without storage. */ }
}
const preferences = load();
let language = ['en', 'es'].includes(preferences.lang) ? preferences.lang : (navigator.language.startsWith('es') ? 'es' : 'en');
let theme = ['light', 'dark', 'system'].includes(preferences.theme) ? preferences.theme : 'system';
let release = null;
const media = matchMedia('(prefers-color-scheme: dark)');
const texts = [...document.querySelectorAll('[data-es]')].map(element => ({ element, en: element.textContent, es: element.dataset.es }));
function renderRelease() {
  const status = document.getElementById('release-status');
  const link = document.getElementById('release-link');
  if (!release) return;
  link.textContent = (language === 'es' ? 'Versión ' : 'Version ') + release.version + ' ↗';
  status.textContent = language === 'es'
    ? 'Archivos publicados en GitHub. Si un paquete no está disponible, su botón abre la release.'
    : 'Files published on GitHub. If a package is unavailable, its button opens the release.';
  document.querySelectorAll('a[data-asset]').forEach(element => {
    const asset = release.assets[element.dataset.asset];
    element.href = asset?.url || RELEASES;
    element.title = asset ? (language === 'es' ? 'Descargar archivo' : 'Download file') : (language === 'es' ? 'Ver archivos de la release' : 'View release files');
  });
  document.querySelectorAll('[data-size]').forEach(element => {
    const size = release.assets[element.dataset.size]?.size;
    element.textContent = size ? (size / 1e6).toLocaleString(language, { maximumFractionDigits: 1 }) + ' MB' : (!release.assets[element.dataset.size] ? (language === 'es' ? 'Ver release ↗' : 'View release ↗') : '');
  });
}
function setLanguage(value) {
  language = value;
  root.lang = value;
  texts.forEach(({ element, en, es }) => { element.textContent = value === 'es' ? es : en; });
  document.title = value === 'es' ? 'Descargar OpenDoc — Windows, macOS y Linux' : 'Download OpenDoc — Windows, macOS & Linux';
  const description = value === 'es' ? 'Descarga OpenDoc para Windows, macOS y Linux. Instaladores, novedades y primeros pasos para tu biblioteca de documentación offline.' : 'Download OpenDoc for Windows, macOS and Linux. Installers, release notes and first steps for your offline documentation library.';
  document.querySelector('meta[name="description"]').content = description;
  document.querySelector('meta[property="og:description"]').content = description;
  document.querySelector('meta[property="og:title"]').content = document.title;
  const languageButton = document.getElementById('lang-toggle');
  languageButton.textContent = value === 'es' ? 'EN' : 'ES';
  languageButton.setAttribute('aria-label', value === 'es' ? 'Switch to English' : 'Cambiar a español');
  document.getElementById('theme-toggle').setAttribute('aria-label', value === 'es' ? 'Cambiar tema claro u oscuro' : 'Toggle light or dark theme');
  document.getElementById('accent-seg').setAttribute('aria-label', value === 'es' ? 'Color de acento' : 'Accent color');
  document.querySelector('nav').setAttribute('aria-label', value === 'es' ? 'Navegación' : 'Navigation');
  renderRelease();
}
function setTheme(value) {
  theme = value;
  root.dataset.themePref = value;
  root.dataset.theme = value === 'system' ? (media.matches ? 'dark' : 'light') : value;
}
function setAccent(value) {
  root.dataset.accent = accents.includes(value) ? value : 'red';
  document.querySelectorAll('#accent-seg button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.accent === root.dataset.accent)));
}
document.getElementById('lang-toggle').addEventListener('click', () => {
  setLanguage(language === 'es' ? 'en' : 'es'); save({ lang: language });
});
document.getElementById('theme-toggle').addEventListener('click', () => {
  setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'); save({ theme });
});
document.querySelectorAll('#accent-seg button').forEach(button => button.addEventListener('click', () => {
  setAccent(button.dataset.accent); save({ accent: root.dataset.accent });
}));
media.addEventListener('change', () => { if (theme === 'system') setTheme('system'); });
setTheme(theme); setAccent(preferences.accent); setLanguage(language);
const os = detectOS(navigator.userAgent, navigator.userAgentData?.platform || navigator.platform || '', navigator.maxTouchPoints);
if (os) document.querySelector(`[data-os="${os}"]`)?.classList.add('mine');

// Default links remain usable with no JavaScript, a timeout, rate limiting or malformed data.
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 7000);
fetch('https://api.github.com/repos/daidarzzz/opendoc/releases/latest', {
  headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal,
}).then(response => response.ok ? response.json() : null).then(value => {
  release = parseRelease(value);
  renderRelease();
}).catch(() => { /* The release-page fallback is already visible. */ }).finally(() => clearTimeout(timeout));
