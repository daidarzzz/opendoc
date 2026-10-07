(() => {
  'use strict';

  const releaseUrl = 'https://api.github.com/repos/daidarzzz/opendoc/releases/latest';
  const releasesPage = 'https://github.com/daidarzzz/opendoc/releases';
  const entries = [
    ['display', 'Property', 'CSS', 'Controls the layout mode used for an element.', 'display: grid;'],
    ['grid', 'Property', 'CSS', 'Creates a grid formatting context for an element.', 'display: grid;'],
    ['grid-template-columns', 'Property', 'CSS', 'Defines the columns of a CSS grid.', 'grid-template-columns: repeat(3, 1fr);'],
    ['grid-template-rows', 'Property', 'CSS', 'Defines the rows of a CSS grid.', 'grid-template-rows: auto 1fr;'],
    ['grid-area', 'Property', 'CSS', 'Assigns an item a name or position in a grid.', 'grid-area: main;'],
    ['grid-auto-flow', 'Property', 'CSS', 'Controls how auto-placed grid items are arranged.', 'grid-auto-flow: column;'],
    ['gap', 'Property', 'CSS', 'Sets the gaps between rows and columns.', 'gap: 1rem;'],
    ['align-items', 'Property', 'CSS', 'Aligns items along the cross axis.', 'align-items: center;'],
    ['justify-content', 'Property', 'CSS', 'Distributes space around content items.', 'justify-content: space-between;'],
    ['flex', 'Property', 'CSS', 'Sets how a flex item grows and shrinks.', 'flex: 1 1 auto;'],
    ['position', 'Property', 'CSS', 'Sets how an element is positioned in a document.', 'position: relative;'],
    ['transform', 'Property', 'CSS', 'Applies a geometric transformation to an element.', 'transform: translateX(1rem);'],
    ['transition', 'Property', 'CSS', 'Defines the transition between property values.', 'transition: color 150ms ease;'],
    ['margin', 'Property', 'CSS', 'Sets the margin area around an element.', 'margin: 0 auto;'],
    ['padding', 'Property', 'CSS', 'Sets the padding area inside an element.', 'padding: 1rem;'],
    ['box-sizing', 'Property', 'CSS', 'Sets how an element’s total size is calculated.', 'box-sizing: border-box;'],
    ['media queries', 'Guide', 'CSS', 'Apply styles based on device or viewport features.', '@media (width > 40rem) { … }'],
    ['Array.map()', 'Method', 'JavaScript', 'Creates a new array from the result of a callback for every element.', 'items.map(item => item.name)'],
    ['Array.filter()', 'Method', 'JavaScript', 'Returns the elements that pass a test in the callback.', 'items.filter(item => item.active)'],
    ['Array.reduce()', 'Method', 'JavaScript', 'Reduces an array to a single value using a callback.', 'values.reduce((sum, n) => sum + n, 0)'],
    ['Array.find()', 'Method', 'JavaScript', 'Returns the first element that matches a test.', 'users.find(user => user.id === id)'],
    ['Array.from()', 'Method', 'JavaScript', 'Creates an array from an iterable or array-like value.', 'Array.from({ length: 3 }, (_, i) => i)'],
    ['Array.includes()', 'Method', 'JavaScript', 'Checks whether an array contains a value.', 'names.includes("Ada")'],
    ['fetch()', 'Function', 'JavaScript', 'Makes a request and returns a promise for the response.', 'const response = await fetch(url)'],
    ['Promise.all()', 'Method', 'JavaScript', 'Waits for all promises to fulfill or one to reject.', 'await Promise.all(tasks)'],
    ['JSON.parse()', 'Method', 'JavaScript', 'Parses a JSON string and constructs a JavaScript value.', 'JSON.parse(text)'],
    ['Object.entries()', 'Method', 'JavaScript', 'Returns an array of key and value pairs.', 'Object.entries(settings)'],
    ['Map', 'Class', 'JavaScript', 'Stores key and value pairs and remembers insertion order.', 'const cache = new Map()'],
    ['Set', 'Class', 'JavaScript', 'Stores unique values of any type.', 'const unique = new Set(values)'],
    ['addEventListener()', 'Method', 'JavaScript', 'Registers an event handler on an event target.', 'button.addEventListener("click", save)'],
    ['querySelector()', 'Method', 'JavaScript', 'Returns the first element matching a CSS selector.', 'document.querySelector("main")'],
    ['async function', 'Guide', 'JavaScript', 'Declares a function that returns a promise.', 'async function load() { … }'],
    ['dict.get()', 'Method', 'Python', 'Returns a value for a key, or a default when absent.', 'user.get("name", "unknown")'],
    ['dict.items()', 'Method', 'Python', 'Returns a view of a dictionary’s key and value pairs.', 'for key, value in config.items():'],
    ['list.append()', 'Method', 'Python', 'Adds an item to the end of a list.', 'queue.append(task)'],
    ['list comprehension', 'Guide', 'Python', 'Builds a list by evaluating an expression for each item.', '[x * 2 for x in values]'],
    ['str.format()', 'Method', 'Python', 'Formats a string using replacement fields.', '"Hello, {}".format(name)'],
    ['str.join()', 'Method', 'Python', 'Joins an iterable of strings with a separator.', '", ".join(names)'],
    ['enumerate()', 'Function', 'Python', 'Adds a counter to an iterable.', 'for i, item in enumerate(items):'],
    ['zip()', 'Function', 'Python', 'Iterates over several iterables in parallel.', 'for name, score in zip(names, scores):'],
    ['pathlib.Path', 'Class', 'Python', 'Represents a filesystem path with path operations.', 'Path("notes/readme.md")'],
    ['json.loads()', 'Function', 'Python', 'Deserializes a JSON document from a string.', 'data = json.loads(text)'],
    ['dataclasses.dataclass', 'Decorator', 'Python', 'Generates common methods for a data class.', '@dataclass\nclass Point: …'],
    ['asyncio.gather()', 'Function', 'Python', 'Runs awaitable objects concurrently.', 'results = await asyncio.gather(*jobs)'],
    ['std::vector', 'Class', 'C++', 'A sequence container that can change size.', 'std::vector<int> values{1, 2, 3};'],
    ['std::string', 'Class', 'C++', 'A sequence of characters with dynamic storage.', 'std::string title = "OpenDoc";'],
    ['std::unique_ptr', 'Class', 'C++', 'Owns an object and deletes it when ownership ends.', 'auto item = std::make_unique<Item>();'],
    ['std::unordered_map', 'Class', 'C++', 'An associative container of key and mapped value.', 'std::unordered_map<std::string, int> counts;'],
    ['std::sort', 'Function', 'C++', 'Sorts the elements in a range.', 'std::sort(values.begin(), values.end());'],
    ['std::optional', 'Class', 'C++', 'Represents a value that may or may not be present.', 'std::optional<int> port = 8080;']
  ].map(([name, kind, docset, description, example]) => ({ name, kind, docset, description, example }));

  const root = document.documentElement;
  const themeButton = document.getElementById('theme-toggle');
  const themeModes = ['system', 'light', 'dark'];
  const themeLabels = { system: 'Sistema', light: 'Claro', dark: 'Oscuro' };
  let theme = 'system';
  try {
    const stored = localStorage.getItem('opendoc-theme');
    if (themeModes.includes(stored)) theme = stored;
  } catch (_) { /* El tema sigue funcionando en modo sistema si el almacenamiento está bloqueado. */ }
  const applyTheme = () => {
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    themeButton.textContent = themeLabels[theme];
    themeButton.setAttribute('aria-label', `Tema actual: ${themeLabels[theme]}. Cambiar tema`);
  };
  themeButton.addEventListener('click', () => {
    theme = themeModes[(themeModes.indexOf(theme) + 1) % themeModes.length];
    applyTheme();
    try { localStorage.setItem('opendoc-theme', theme); } catch (_) { /* La elección dura mientras la página está abierta. */ }
  });
  applyTheme();

  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const count = document.getElementById('result-count');
  const empty = document.getElementById('empty-state');
  const preview = document.getElementById('preview');
  let visibleEntries = entries.slice();
  let activeIndex = 0;

  function subsequenceScore(query, candidate) {
    const q = query.toLocaleLowerCase();
    const c = candidate.toLocaleLowerCase();
    if (!q) return 1;
    if (c === q) return 1000;
    if (c.startsWith(q)) return 800 - c.length / 100;
    let qi = 0;
    let score = 0;
    let previous = -2;
    for (let ci = 0; ci < c.length && qi < q.length; ci += 1) {
      if (c[ci] !== q[qi]) continue;
      score += 10 + (ci === previous + 1 ? 12 : 0) + (ci === 0 || /[._\- (:]/.test(c[ci - 1]) ? 7 : 0);
      previous = ci;
      qi += 1;
    }
    return qi === q.length ? score - c.length / 100 : -1;
  }

  function makeHighlightedName(name, query) {
    const fragment = document.createDocumentFragment();
    if (!query) { fragment.append(document.createTextNode(name)); return fragment; }
    const lowerName = name.toLocaleLowerCase();
    let cursor = 0;
    for (const letter of query.toLocaleLowerCase()) {
      const matchAt = lowerName.indexOf(letter, cursor);
      if (matchAt < 0) continue;
      if (matchAt > cursor) fragment.append(document.createTextNode(name.slice(cursor, matchAt)));
      const mark = document.createElement('mark');
      mark.textContent = name[matchAt];
      fragment.append(mark);
      cursor = matchAt + 1;
    }
    if (cursor < name.length) fragment.append(document.createTextNode(name.slice(cursor)));
    return fragment;
  }

  function selectResult(index) {
    if (!visibleEntries.length) return;
    activeIndex = (index + visibleEntries.length) % visibleEntries.length;
    [...results.children].forEach((option, i) => {
      option.setAttribute('aria-selected', String(i === activeIndex));
      if (i === activeIndex) input.setAttribute('aria-activedescendant', option.id);
    });
    results.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function showPreview(item) {
    const content = preview.querySelector('.preview-content');
    content.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = item.name;
    const description = document.createElement('p');
    description.textContent = item.description;
    const example = document.createElement('code');
    example.textContent = item.example;
    content.append(title, description, example);
  }

  function render() {
    const query = input.value.trim();
    visibleEntries = entries.map((item, originalIndex) => ({ item, originalIndex, score: subsequenceScore(query, item.name) }))
      .filter((row) => row.score >= 0).sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex).slice(0, 8).map((row) => row.item);
    activeIndex = 0;
    results.replaceChildren();
    visibleEntries.forEach((item, index) => {
      const option = document.createElement('li');
      option.id = `demo-option-${index}`;
      option.className = 'result-item';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === 0));
      const name = document.createElement('span');
      name.className = 'result-name';
      name.append(makeHighlightedName(item.name, query));
      const kind = document.createElement('span');
      kind.className = 'result-kind';
      kind.textContent = item.kind;
      const docset = document.createElement('span');
      docset.className = 'result-docset';
      docset.textContent = item.docset;
      option.append(name, kind, docset);
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => { selectResult(index); showPreview(item); input.focus(); });
      results.append(option);
    });
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', visibleEntries.length ? 'demo-option-0' : '');
    count.textContent = query ? `${visibleEntries.length} RESULTADOS` : `${entries.length} ENTRADAS DE EJEMPLO`;
    empty.hidden = visibleEntries.length > 0;
    results.hidden = visibleEntries.length === 0;
    if (visibleEntries.length) showPreview(visibleEntries[0]);
    else preview.querySelector('.preview-content').replaceChildren(Object.assign(document.createElement('p'), { textContent: 'No hay una vista previa disponible.' }));
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); selectResult(activeIndex + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); selectResult(activeIndex - 1); }
    else if (event.key === 'Enter') { event.preventDefault(); if (visibleEntries[activeIndex]) showPreview(visibleEntries[activeIndex]); }
    else if (event.key === 'Escape') { event.preventDefault(); input.value = ''; render(); }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault(); input.focus(); input.select();
    }
    if (event.key === 'Escape' && document.activeElement !== input) {
      input.value = ''; render();
    }
  });
  render();

  function detectPlatform() {
    const platform = `${navigator.userAgent} ${navigator.platform || ''}`.toLowerCase();
    if (platform.includes('win')) return 'windows';
    if (platform.includes('mac')) return 'mac';
    if (platform.includes('linux') || platform.includes('x11')) return 'linux';
    return '';
  }
  const platform = detectPlatform();
  if (platform) {
    document.querySelector(`[data-platform="${platform}"]`)?.classList.add('is-detected');
    const label = document.querySelector(`[data-platform="${platform}"] .detected-label`);
    if (label) label.hidden = false;
  }

  const formatSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
    return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
  };
  function matchingAsset(assets, os) {
    const matches = (extensions) => assets.filter((asset) => extensions.some((ext) => asset.name.toLowerCase().endsWith(ext)));
    if (os === 'windows') return matches(['.exe', '.msi'])[0];
    if (os === 'mac') return matches(['.dmg'])[0];
    if (os === 'linux') return matches(['.appimage', '.deb', '.rpm'])[0];
    return undefined;
  }
  function applyRelease(release) {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const versionText = release.tag_name ? `Versión ${release.tag_name}` : '';
    if (versionText) document.getElementById('release-version').textContent = versionText;
    for (const os of ['windows', 'mac', 'linux']) {
      const asset = matchingAsset(assets, os);
      if (!asset || !asset.browser_download_url) continue;
      const option = document.querySelector(`[data-platform="${os}"]`);
      const link = option.querySelector('.download-button');
      const label = `Descargar para ${os === 'windows' ? 'Windows' : os === 'mac' ? 'macOS' : 'Linux'}`;
      link.href = asset.browser_download_url;
      link.textContent = label;
      link.setAttribute('aria-label', `${label}: ${asset.name}`);
      const detail = [asset.name, formatSize(asset.size)].filter(Boolean).join(', ');
      option.querySelector(`[data-asset-meta="${os}"]`).textContent = detail;
    }
    if (platform) {
      const option = document.querySelector(`[data-platform="${platform}"]`);
      const asset = matchingAsset(assets, platform);
      const hero = document.getElementById('hero-download');
      if (asset?.browser_download_url) {
        hero.href = asset.browser_download_url;
        hero.textContent = `Descargar para ${platform === 'windows' ? 'Windows' : platform === 'mac' ? 'macOS' : 'Linux'}`;
      }
      option?.classList.add('is-detected');
    }
  }
  fetch(releaseUrl, { headers: { Accept: 'application/vnd.github+json' } })
    .then((response) => { if (!response.ok) throw new Error('No hay datos de release disponibles.'); return response.json(); })
    .then((release) => { if (release && Array.isArray(release.assets)) applyRelease(release); })
    .catch(() => { /* Enlace estable a Releases como reserva; no se muestran errores de API. */ });
})();
