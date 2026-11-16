/* odc(1) — the CLI page.
   Theme, language and install tabs, plus Fig. 1: a small, faithful model of
   the odc TUI (same layout, palette, query syntax and keys) running over a
   handful of real entries. It plays once when it scrolls into view and then
   hands the keyboard to the reader. */
(function () {
  "use strict";
  var root = document.documentElement;
  var KEY = "opendoc-landing";
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } }
  function save(patch) {
    var s = load();
    for (var k in patch) s[k] = patch[k];
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ───────────────────────── Spanish (English is read from the markup) ───────────────────────── */
  var ES = {
    "man.title": "Manual de OpenDoc",
    "nav.queries": "Consultas", "nav.reading": "Lectura", "nav.keys": "Teclas", "nav.tools": "Herramientas", "nav.install": "Instalar",
    "hero.kicker": "La línea de comandos de OpenDoc",
    "hero.title": "El manual, <em>en tu prompt.</em>",
    "hero.name": "busca y lee docsets offline desde la terminal",
    "hero.lede": "El buscador de OpenDoc, sin la ventana — y hasta instala la documentación. Un lector a pantalla completa cuando quieres explorar, texto plano cuando quieres encadenar con una tubería, JSON cuando tu editor lo pide. Los mismos docsets, el mismo índice, sin red.",
    "install.copy": "Copiar",
    "hero.meta": "Un solo binario · GPL-3.0 · sin cuenta, sin telemetría",
    "hero.releases": "Todas las versiones →",
    "fig.aria": "Demo interactiva del lector de terminal de odc. Escribe para buscar, flechas para moverte, Intro para leer, Escape para volver.",
    "fig.try": "clic · escribe · ↵",
    "fig.no": "Fig. 1 — odc, en directo",
    "fig.1": "La consulta. <code>rust:</code> la limita a un docset; la etiqueta lo indica.",
    "fig.2": "Resultados mientras escribes, con las letras que coinciden resaltadas y el tipo real del símbolo.",
    "fig.3": "El lector: la sección exacta, compuesta — encabezados, listas, código resaltado.",
    "fig.4": "Esta es tuya: haz clic, escribe, usa ↑ ↓, Intro, <kbd class=\"k\">/</kbd> y Esc.",
    "s1.note": "Ejecuta <code>odc</code> sin nada más y se abre el lector. Si lo encadenas con una tubería, muestra la ayuda.",
    "s1.title": "Ocho verbos. <em>Un índice.</em>",
    "s1.text": "<code>odc</code> carga la misma carpeta de docsets y el mismo índice en memoria que la app de OpenDoc: lo que encuentras en una, lo encuentras en la otra. Todos los comandos entienden la misma consulta.",
    "s1.tui": "El lector a pantalla completa.",
    "s1.search": "Una tabla de coincidencias ordenada — o JSON para scripts.",
    "s1.show": "Imprime una entrada, compuesta para la terminal. Alias: <code>cat</code>.",
    "s1.open": "Abre la página en tu navegador, o solo imprime su ruta.",
    "s1.list": "Lo que tienes instalado, con el número de entradas.",
    "s1.comp": "Autocompletado para bash, zsh, fish, PowerShell y elvish.",
    "s1.docsets": "Explora DevDocs y los feeds de Dash y gestiona tus docsets — sin la app de escritorio.",
    "s1.update": "Se actualiza solo desde GitHub Releases, con checksums verificados.",
    "s2.note": "También valen nombres cortos: <code>py</code>, <code>js</code>, <code>ts</code>, <code>rs</code>, <code>sh</code>.",
    "s2.title": "Di dónde buscar, <em>y luego qué.</em>",
    "s2.text": "Una consulta es texto difuso con hasta dos prefijos opcionales. Sin ellos, <code>odc</code> busca en todo; con uno, el pajar se reduce antes de comparar la primera letra.",
    "s2.ds": "docset", "s2.dsd": "Id, nombre o alias. Opcional.",
    "s2.kd": "tipo", "s2.kdd": "<code>fn</code>, <code>struct</code>, <code>trait</code>, <code>macro</code>… Opcional.",
    "s2.tx": "texto", "s2.txd": "Difuso. Varias palabras coinciden en cualquier orden.",
    "s2.figno": "Fig. 2 — Anatomía de una consulta",
    "s2.figcap": "DevDocs guarda una categoría donde Dash guarda el tipo de símbolo, así que <code>odc</code> lee el tipo real de la propia página: un método es <code>fn</code>, <code>struct.Vec.html</code> es un <code>struct</code>.",
    "s2.th1": "Escribes", "s2.th2": "Obtienes",
    "s2.q1": "Búsqueda difusa en todos los docsets instalados.",
    "s2.q2": "Solo la documentación de Rust.",
    "s2.q3": "Python, por su alias. Las palabras pueden ir en cualquier orden.",
    "s2.q4": "Funciones y métodos que se llamen algo como <i>map</i>, en todos los lenguajes.",
    "s2.q5": "Las dos cosas a la vez.",
    "s2.q6": "Un doble dos puntos nunca es un prefijo: C++ sigue siendo C++.",
    "s2.ctx": "Dentro de un proyecto, <code>odc</code> detecta <code>Cargo.toml</code>, <code>package.json</code>, <code>go.mod</code> o <code>pyproject.toml</code> y pone ese lenguaje primero. <code>--no-context</code> lo desactiva.",
    "s3.note": "Lo que no cabe en pantalla pasa por <code>less -R</code>, o por tu <code>$PAGER</code>.",
    "s3.title": "La sección que pediste, <em>no la página entera.</em>",
    "s3.text": "Las páginas de documentación son largas; un método son unos pocos párrafos dentro de una. <code>odc show</code> encuentra esos párrafos — aunque la página ponga la descripción al lado de su encabezado y no debajo — y los compone para la terminal: firma, encabezados, listas, tablas y código resaltado.",
    "s3.aria": "Salida de odc show rust:Vec::push en la terminal: la firma, una descripción breve, los pánicos, un ejemplo y la complejidad.",
    "s3.code": "Solo la firma y los ejemplos. Una chuleta en una línea.",
    "s3.raw": "Texto plano, sin color. El color también se apaga solo en tuberías o con <code>NO_COLOR</code>.",
    "s3.copy": "Directo al portapapeles: <code>wl-copy</code>, <code>xclip</code>, <code>xsel</code>, el del sistema — u OSC 52, que funciona por SSH.",
    "s3.json": "Nombre, tipo, firma, bloques de código y texto, con versión. Ver § 5.",
    "s3.width": "Ajusta a un ancho fijo en lugar del de la terminal.",
    "s4.name": "El lector",
    "s4.note": "Por debajo de 90 columnas, el lector se pliega en un solo panel. Prueba a estrechar esta ventana.",
    "s4.title": "Un lector, <em>no un paginador.</em>",
    "s4.text": "Escribe y la lista te sigue; para y aparece la página. Después, quédate: sigue enlaces dentro del docset, salta entre secciones, busca en la página, guarda lo que consultas a menudo.",
    "s4.f1h": "Buscar en la página",
    "s4.f1": "Pulsa <kbd class=\"k\">/</kbd>, escribe y se resaltan todas las coincidencias; <kbd class=\"k\">n</kbd> y <kbd class=\"k\">N</kbd> las recorren. En minúsculas ignora mayúsculas; con alguna mayúscula, no.",
    "s4.f2h": "Índice",
    "s4.f2": "Los encabezados de la página en una lista que puedes filtrar. Directo a <i>Examples</i> o <i>Panics</i> sin desplazarte.",
    "s4.f3h": "Relacionados",
    "s4.f3": "¿Estás leyendo <code>Vec::push</code>? <kbd class=\"k\">r</kbd> lista los otros 241 símbolos de <code>Vec</code>, listos para abrir.",
    "s4.f4h": "Favoritos y recientes",
    "s4.f4": "<kbd class=\"k\">m</kbd> marca con una estrella lo que lees; <kbd class=\"k\">H</kbd> recupera tus estrellas y tus últimas cien páginas, sin buscar.",
    "s4.f5h": "Enlaces que llevan a algún sitio",
    "s4.f5": "<kbd class=\"k\">Tab</kbd> recorre los enlaces de la página, <kbd class=\"k\">Intro</kbd> sigue uno dentro del docset, <kbd class=\"k\">⌫</kbd> vuelve.",
    "s4.f6h": "Ratón, si te apetece",
    "s4.f6": "Rueda para desplazarte, clic para elegir. Arrastra sobre el texto para copiarlo; doble clic para una palabra, triple para la línea.",
    "s4.keys": "Todas las teclas",
    "s4.ks": "Mientras buscas", "s4.kr": "Mientras lees",
    "k.s1": "Moverte por los resultados", "k.s2": "Leer la entrada elegida", "k.s3": "Elegir docset · tipo",
    "k.s4": "Favoritos y recientes", "k.s5": "Estrella · índice · relacionados", "k.s6": "Copiar ejemplo · abrir en el navegador",
    "k.s7": "Borrar la consulta, luego salir",
    "k.r1": "Desplazar · página · inicio · final", "k.r2": "Buscar en la página · siguiente · anterior", "k.r3": "Sección anterior · siguiente",
    "k.r4": "Índice · relacionados", "k.r5": "Siguiente enlace · seguir · volver", "k.r6": "Copiar ejemplo · todo · firma",
    "k.r7": "Estrella · favoritos y recientes", "k.r8": "Volver a buscar · ayuda · salir",
    "s5.note": "El JSON lleva un campo <code>version</code>, así que las herramientas que lo usan siguen funcionando.",
    "s5.title": "Texto para tuberías. <em>JSON para herramientas.</em>",
    "s5.text": "Todo lo que muestra el lector lo puede pedir un script. Así se construyen las integraciones con editores sobre <code>odc</code>: preguntan, responde, y no hay nada más que instalar.",
    "s5.c1": "La firma de cualquier cosa, para un tooltip o un snippet",
    "s5.c2": "Un fichero para abrir en un webview, sin pasar por el navegador",
    "s5.c3": "Candidatos para un selector — Telescope, fzf, una paleta de comandos",
    "s5.e1": "Busca y previsualiza dentro del editor. Hecho exactamente con estos comandos.",
    "s5.e2h": "Tu shell", "s5.e2": "<code>odc completions zsh &gt; ~/.zfunc/_odc</code> — subcomandos y flags con Tab.",
    "s5.e3h": "Cualquier otra cosa", "s5.e3": "Si puede lanzar un proceso y leer JSON, puede buscar en tu documentación.",
    "s6.name": "Entorno",
    "s6.note": "Todos los flags pueden ir antes o después del subcomando.",
    "s6.title": "Comparte estantería <em>con la app.</em>",
    "s6.text": "<code>odc</code> lee la carpeta de docsets que elegiste en OpenDoc: lo que instalas en la app aparece en la terminal, y lo que instalas con <code>odc docsets install</code> aparece en la app. ¿Sin la app? <code>odc</code> gestiona la carpeta por su cuenta. Para apuntarlo a otro sitio:",
    "s6.d1": "La carpeta con los paquetes <code>*.docset</code>. También <code>OPENDOC_DOCSETS</code>.",
    "s6.d2": "Dónde se descomprimen los docsets comprimidos. También <code>OPENDOC_TARIX_CACHE</code>.",
    "s6.d3": "Dónde se guardan favoritos y recientes. Por defecto, <code>cli-state.json</code> en la carpeta de datos de OpenDoc.",
    "s6.d4": "Sin color, en ningún sitio. Las tuberías y redirecciones reciben texto plano de todos modos.",
    "s6.d5": "El paginador para salidas largas. <code>less -R</code> si no está definido.",
    "s6.exit": "Códigos de salida",
    "s6.x0": "Hecho — incluida una búsqueda sin resultados o un selector cancelado.",
    "s6.x1": "Algo falló: no hay carpeta de docsets, un docset desconocido, una página que no se pudo leer.",
    "s6.x2": "La línea de comandos en sí estaba mal.",
    "s7.name": "Véase también",
    "s7.a": "La app de escritorio: pestañas, un catálogo de docsets, instalación con un clic.",
    "s7.b": "El motor que comparten: escaneo, índices, tarix y búsqueda difusa.",
    "s7.c": "Código, incidencias y notas de versión de <code>odc</code>.",
    "foot.fin": "Feliz lectura.", "foot.colophon": "Colofón",
    "foot.type": "Compuesto en Newsreader e IBM Plex Mono. La terminal es JetBrains Mono sobre Catppuccin Mocha, como en tu máquina.",
    "foot.thanks": "Créditos",
    "foot.thanksText": "Paleta de <a href=\"https://catppuccin.com/\">Catppuccin</a> (MIT). Hecho con <a href=\"https://ratatui.rs/\">Ratatui</a> y <a href=\"https://github.com/trishume/syntect\">syntect</a>. Dash y Zeal son marcas de sus respectivos dueños.",
    "foot.source": "Código", "foot.releases": "Notas de versión"
  };

  var EN = {}, ENA = {};
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    var k = el.getAttribute("data-i18n");
    if (!(k in EN)) EN[k] = el.innerHTML;
  });
  document.querySelectorAll("[data-i18n-aria]").forEach(function (el) { ENA[el.getAttribute("data-i18n-aria")] = el.getAttribute("aria-label"); });

  /* ───────────────────────── install ───────────────────────── */
  var INSTALL = {
    unix: {
      p: "$ ", cmd: "curl -fsSL https://raw.githubusercontent.com/daidarzzz/opendoc-cli/master/install.sh | sh",
      en: "Installs <code>odc</code> and <code>opendoc-cli</code> in <code>~/.local/bin</code>. x86_64 and Apple Silicon.",
      es: "Instala <code>odc</code> y <code>opendoc-cli</code> en <code>~/.local/bin</code>. x86_64 y Apple Silicon."
    },
    windows: {
      p: "PS> ", cmd: "irm https://raw.githubusercontent.com/daidarzzz/opendoc-cli/master/install.ps1 | iex",
      en: "Installs <code>odc.exe</code> in <code>$HOME\\.local\\bin</code> and adds it to your user PATH.",
      es: "Instala <code>odc.exe</code> en <code>$HOME\\.local\\bin</code> y lo añade a tu PATH de usuario."
    },
    cargo: {
      p: "$ ", cmd: "cargo install --git https://github.com/daidarzzz/opendoc-cli",
      en: "Builds from source with Rust and puts both binaries in <code>~/.cargo/bin</code>.",
      es: "Compila desde el código con Rust y deja los dos binarios en <code>~/.cargo/bin</code>."
    }
  };
  var ua = navigator.userAgent || "";
  var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  var installOs = /win/i.test(plat + ua) && !/android/i.test(ua) ? "windows" : "unix";
  var copyTimer = null;

  function renderInstall() {
    var i = INSTALL[installOs];
    var pre = document.getElementById("install-pre");
    pre.innerHTML = '<span class="p">' + i.p.replace(">", "&gt;") + "</span>" + i.cmd;
    document.getElementById("install-note").innerHTML = root.lang === "es" ? i.es : i.en;
    document.querySelectorAll(".install-tabs button").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.dataset.os === installOs));
    });
  }
  document.querySelectorAll(".install-tabs button").forEach(function (b) {
    b.addEventListener("click", function () { installOs = b.dataset.os; renderInstall(); });
  });
  document.getElementById("copy").addEventListener("click", function () {
    var btn = this, text = INSTALL[installOs].cmd;
    var done = function () {
      btn.classList.add("done");
      btn.textContent = root.lang === "es" ? "Copiado" : "Copied";
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () {
        btn.classList.remove("done");
        btn.textContent = root.lang === "es" ? ES["install.copy"] : EN["install.copy"];
      }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    } else {
      var r = document.createRange();
      r.selectNodeContents(document.getElementById("install-pre"));
      var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
  });

  /* ───────────────────────── language & theme ───────────────────────── */
  function setLang(lang) {
    var dict = lang === "es" ? ES : EN;
    root.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      if (dict[k] != null) el.innerHTML = dict[k];
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-aria");
      el.setAttribute("aria-label", (lang === "es" ? ES[k] : ENA[k]) || ENA[k]);
    });
    var lt = document.getElementById("lang-toggle");
    lt.textContent = lang === "es" ? "EN" : "ES";
    lt.setAttribute("aria-label", lang === "es" ? "Switch to English" : "Cambiar a español");
    renderInstall();
    fillVersion();
    if (tui) tui.draw();
  }

  var mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function setTheme(pref) {
    root.dataset.themePref = pref;
    root.dataset.theme = pref === "system" ? (mq && mq.matches ? "dark" : "light") : pref;
  }
  if (mq && mq.addEventListener) mq.addEventListener("change", function () { if (root.dataset.themePref === "system") setTheme("system"); });
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var next = root.dataset.theme === "dark" ? "light" : "dark";
    setTheme(next); save({ theme: next });
  });
  document.getElementById("lang-toggle").addEventListener("click", function () {
    var next = root.lang === "es" ? "en" : "es";
    setLang(next); save({ lang: next });
  });

  /* ───────────────────────── version from the latest release ───────────────────────── */
  var version = null;
  function fillVersion() {
    if (version) document.querySelectorAll(".ver").forEach(function (el) { el.textContent = version; });
  }
  if (window.fetch) {
    fetch("https://api.github.com/repos/daidarzzz/opendoc-cli/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || typeof j.tag_name !== "string" || !/^v?\d+\.\d+\.\d+$/.test(j.tag_name)) return;
        version = j.tag_name.replace(/^v/, "");
        fillVersion();
      })
      .catch(function () {});
  }

  /* ═════════════════════════ Fig. 1 — the TUI ═════════════════════════ */

  /* A small corpus. Text is paraphrased from each project's reference docs;
     `x` = inline code, *x* = emphasis, [x] = link. */
  var DOCSETS = {
    rust: { name: "Rust", lang: "rust", meta: "" },
    python: { name: "Python 3", lang: "py" },
    javascript: { name: "JavaScript", lang: "js" },
    go: { name: "Go", lang: "go" },
    bash: { name: "Bash", lang: "sh" }
  };
  var E = [
    { d: "rust", k: "fn", n: "std::vec::Vec::push", sig: "pub fn push(&mut self, value: T)", meta: "Stable since Rust version 1.0.0", b: [
      ["p", "Appends an element to the back of a collection."],
      ["h", "Panics"], ["p", "Panics if the new capacity exceeds `isize::MAX` *bytes*."],
      ["h", "Examples"], ["code", "let mut vec = vec![1, 2];\nvec.push(3);\nassert_eq!(vec, [1, 2, 3]);"],
      ["h", "Time complexity"], ["p", "Takes amortized O(1) time. If the vector’s length would exceed its capacity after the push, O(*capacity*) time is taken to copy the vector’s elements to a larger allocation. This expensive operation is offset by the *capacity* O(1) insertions it allows."],
      ["p", "See also [Vec::push_within_capacity] and [Vec::reserve]."]] },
    { d: "rust", k: "fn", n: "std::vec::Vec::push_within_capacity", sig: "pub fn push_within_capacity(&mut self, value: T) -> Result<(), T>", meta: "Unstable (vec_push_within_capacity)", b: [
      ["p", "Appends an element if there is sufficient spare capacity, otherwise an error is returned with the element."],
      ["p", "Unlike [Vec::push] this method will not reallocate when there’s insufficient capacity. The caller should use [Vec::reserve] or [Vec::try_reserve] to ensure that there is enough capacity."],
      ["h", "Examples"], ["code", "let mut vec = Vec::with_capacity(1);\nassert!(vec.push_within_capacity(1).is_ok());\nassert!(vec.push_within_capacity(2).is_err());"]] },
    { d: "rust", k: "fn", n: "std::vec::Vec::pop", sig: "pub fn pop(&mut self) -> Option<T>", meta: "Stable since Rust version 1.0.0", b: [
      ["p", "Removes the last element from a vector and returns it, or `None` if it is empty."],
      ["h", "Examples"], ["code", "let mut vec = vec![1, 2, 3];\nassert_eq!(vec.pop(), Some(3));\nassert_eq!(vec, [1, 2]);"],
      ["h", "Time complexity"], ["p", "Takes O(1) time."]] },
    { d: "rust", k: "fn", n: "std::vec::Vec::insert", sig: "pub fn insert(&mut self, index: usize, element: T)", meta: "Stable since Rust version 1.0.0", b: [
      ["p", "Inserts an element at position `index` within the vector, shifting all elements after it to the right."],
      ["h", "Panics"], ["p", "Panics if `index > len`."],
      ["h", "Examples"], ["code", "let mut vec = vec!['a', 'b', 'c'];\nvec.insert(1, 'd');\nassert_eq!(vec, ['a', 'd', 'b', 'c']);"],
      ["h", "Time complexity"], ["p", "Takes O(`Vec::len`) time. All items after the insertion index must be shifted to the right."]] },
    { d: "rust", k: "fn", n: "std::vec::Vec::with_capacity", sig: "pub fn with_capacity(capacity: usize) -> Vec<T>", meta: "Stable since Rust version 1.0.0", b: [
      ["p", "Constructs a new, empty `Vec<T>` with at least the specified capacity."],
      ["p", "The vector will be able to hold at least `capacity` elements without reallocating. It is important to note that although the returned vector has the minimum capacity specified, the vector will have a zero *length*."],
      ["h", "Examples"], ["code", "let mut vec = Vec::with_capacity(10);\nassert_eq!(vec.len(), 0);\nassert!(vec.capacity() >= 10);"]] },
    { d: "rust", k: "struct", n: "std::vec::Vec", sig: "pub struct Vec<T, A = Global> where A: Allocator { /* private fields */ }", meta: "", b: [
      ["p", "A contiguous growable array type, written as `Vec<T>`, short for ‘vector’."],
      ["h", "Examples"], ["code", "let mut vec = Vec::new();\nvec.push(1);\nvec.push(2);\nassert_eq!(vec.len(), 2);"],
      ["h", "Capacity and reallocation"], ["p", "The capacity of a vector is the amount of space allocated for any future elements that will be added onto the vector. This is not to be confused with the *length* of a vector."],
      ["ul", ["[Vec::push] — append an element", "[Vec::pop] — remove the last one", "[Vec::insert] — insert anywhere"]]] },
    { d: "rust", k: "fn", n: "std::collections::VecDeque::push_back", sig: "pub fn push_back(&mut self, value: T)", meta: "Stable since Rust version 1.0.0", b: [
      ["p", "Appends an element to the back of the deque."],
      ["h", "Examples"], ["code", "use std::collections::VecDeque;\n\nlet mut buf = VecDeque::new();\nbuf.push_back(1);\nbuf.push_back(3);\nassert_eq!(3, *buf.back().unwrap());"]] },
    { d: "rust", k: "fn", n: "std::collections::HashMap::insert", sig: "pub fn insert(&mut self, k: K, v: V) -> Option<V>", meta: "Stable since Rust version 1.0.0", b: [
      ["p", "Inserts a key-value pair into the map."],
      ["p", "If the map did not have this key present, `None` is returned. If it did, the value is updated and the old value is returned."],
      ["h", "Examples"], ["code", "use std::collections::HashMap;\n\nlet mut map = HashMap::new();\nassert_eq!(map.insert(37, \"a\"), None);\nassert_eq!(map.insert(37, \"b\"), Some(\"a\"));"]] },
    { d: "rust", k: "fn", n: "std::iter::Iterator::map", sig: "fn map<B, F>(self, f: F) -> Map<Self, F>\nwhere\n    F: FnMut(Self::Item) -> B,", meta: "Stable since Rust version 1.0.0", b: [
      ["p", "Takes a closure and creates an iterator which calls that closure on each element."],
      ["p", "`map()` transforms one iterator into another, by means of its argument: something that implements `FnMut`."],
      ["h", "Examples"], ["code", "let a = [1, 2, 3];\nlet mut iter = a.iter().map(|x| 2 * x);\nassert_eq!(iter.next(), Some(2));"]] },
    { d: "rust", k: "macro", n: "std::vec", sig: "macro_rules! vec { ... }", meta: "Stable since Rust version 1.0.0", b: [
      ["p", "Creates a [Vec] containing the arguments."],
      ["p", "`vec!` allows `Vec`s to be defined with the same syntax as array expressions."],
      ["code", "let v = vec![1, 2, 3];\nlet zeros = vec![0; 5];"]] },
    { d: "rust", k: "fn", n: "std::fs::read_to_string", sig: "pub fn read_to_string<P: AsRef<Path>>(path: P) -> io::Result<String>", meta: "Stable since Rust version 1.26.0", b: [
      ["p", "Reads the entire contents of a file into a string."],
      ["h", "Errors"], ["p", "This function will return an error if `path` does not already exist, or if its contents are not valid UTF-8."],
      ["h", "Examples"], ["code", "use std::fs;\n\nfn main() -> std::io::Result<()> {\n    let text = fs::read_to_string(\"notes.txt\")?;\n    Ok(())\n}"]] },
    { d: "rust", k: "trait", n: "std::fmt::Display", sig: "pub trait Display {\n    fn fmt(&self, f: &mut Formatter<'_>) -> Result;\n}", meta: "", b: [
      ["p", "Format trait for an empty format, `{}`."],
      ["p", "Implementing this trait for a type will automatically implement the `ToString` trait for the type, allowing the usage of the `.to_string()` method."]] },
    { d: "python", k: "fn", n: "json.dumps", sig: "json.dumps(obj, *, skipkeys=False, ensure_ascii=True, indent=None, sort_keys=False, **kw)", meta: "", b: [
      ["p", "Serialize *obj* to a JSON formatted `str`."],
      ["p", "If *indent* is a non-negative integer or string, JSON array elements and object members will be pretty-printed with that indent level."],
      ["code", "import json\njson.dumps({\"b\": 1, \"a\": [1, 2]}, sort_keys=True)\n# '{\"a\": [1, 2], \"b\": 1}'"]] },
    { d: "python", k: "fn", n: "json.loads", sig: "json.loads(s, *, cls=None, object_hook=None, parse_float=None, **kw)", meta: "", b: [
      ["p", "Deserialize *s* (a `str`, `bytes` or `bytearray` containing a JSON document) to a Python object."],
      ["p", "If the data being deserialized is not a valid JSON document, a `JSONDecodeError` will be raised."]] },
    { d: "python", k: "fn", n: "os.path.join", sig: "os.path.join(path, *paths)", meta: "", b: [
      ["p", "Join one or more path segments intelligently. The return value is the concatenation of *path* and all members of *paths*, with exactly one directory separator following each non-empty part except the last."],
      ["code", "import os\nos.path.join(\"src\", \"odc\", \"main.py\")\n# 'src/odc/main.py'"]] },
    { d: "python", k: "fn", n: "str.split", sig: "str.split(sep=None, maxsplit=-1)", meta: "", b: [
      ["p", "Return a list of the words in the string, using *sep* as the delimiter string. If *maxsplit* is given, at most *maxsplit* splits are done."],
      ["code", "'1,2,3'.split(',')\n# ['1', '2', '3']\n'1 2 3'.split(maxsplit=1)\n# ['1', '2 3']"]] },
    { d: "python", k: "fn", n: "itertools.chain", sig: "itertools.chain(*iterables)", meta: "", b: [
      ["p", "Make an iterator that returns elements from the first iterable until it is exhausted, then proceeds to the next iterable, until all of the iterables are exhausted."]] },
    { d: "javascript", k: "fn", n: "Array.prototype.map", sig: "map(callbackFn, thisArg)", meta: "Baseline · widely available", b: [
      ["p", "Creates a new array populated with the results of calling a provided function on every element in the calling array."],
      ["h", "Parameters"], ["ul", ["`callbackFn` — a function to execute for each element", "`thisArg` — a value to use as `this`"]],
      ["h", "Examples"], ["code", "const numbers = [1, 4, 9];\nconst roots = numbers.map((n) => Math.sqrt(n));\n// roots is [1, 2, 3]"]] },
    { d: "javascript", k: "fn", n: "Array.prototype.push", sig: "push(element1, element2, /* …, */ elementN)", meta: "Baseline · widely available", b: [
      ["p", "Adds the specified elements to the end of an array and returns the new length of the array."],
      ["code", "const animals = [\"pigs\", \"goats\"];\nconst count = animals.push(\"cows\");\n// count is 3"]] },
    { d: "javascript", k: "fn", n: "Promise.all", sig: "Promise.all(iterable)", meta: "Baseline · widely available", b: [
      ["p", "Takes an iterable of promises and returns a single promise that fulfills when all of them fulfill, with an array of their values. It rejects as soon as any input rejects."],
      ["code", "const [a, b] = await Promise.all([fetchA(), fetchB()]);"]] },
    { d: "javascript", k: "fn", n: "Object.entries", sig: "Object.entries(obj)", meta: "Baseline · widely available", b: [
      ["p", "Returns an array of a given object’s own enumerable string-keyed property key-value pairs."],
      ["code", "for (const [key, value] of Object.entries({ a: 1, b: 2 })) {\n  console.log(`${key}: ${value}`);\n}"]] },
    { d: "go", k: "fn", n: "fmt.Println", sig: "func Println(a ...any) (n int, err error)", meta: "", b: [
      ["p", "Println formats using the default formats for its operands and writes to standard output. Spaces are always added between operands and a newline is appended."],
      ["code", "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"docs, offline\")\n}"]] },
    { d: "go", k: "fn", n: "strings.Split", sig: "func Split(s, sep string) []string", meta: "", b: [
      ["p", "Split slices *s* into all substrings separated by *sep* and returns a slice of the substrings between those separators."],
      ["code", "fmt.Printf(\"%q\\n\", strings.Split(\"a,b,c\", \",\"))\n// [\"a\" \"b\" \"c\"]"]] },
    { d: "go", k: "fn", n: "context.WithTimeout", sig: "func WithTimeout(parent Context, timeout time.Duration) (Context, CancelFunc)", meta: "", b: [
      ["p", "WithTimeout returns `WithDeadline(parent, time.Now().Add(timeout))`."],
      ["p", "Canceling this context releases resources associated with it, so code should call cancel as soon as the operations running in this Context complete."]] },
    { d: "bash", k: "builtin", n: "echo", sig: "echo [-neE] [arg …]", meta: "Bash builtin", b: [
      ["p", "Output the *args*, separated by spaces, terminated with a newline. The return status is 0 unless a write error occurs."],
      ["ul", ["`-n` — do not print the trailing newline", "`-e` — interpret backslash escapes", "`-E` — do not interpret them"]]] },
    { d: "bash", k: "builtin", n: "read", sig: "read [-ers] [-a aname] [-d delim] [-p prompt] [name …]", meta: "Bash builtin", b: [
      ["p", "One line is read from the standard input, and the first word is assigned to the first *name*, the second word to the second *name*, and so on."]] }
  ];

  var ALIAS = { rust: "rust", rs: "rust", python: "python", py: "python", javascript: "javascript", js: "javascript", go: "go", bash: "bash", sh: "bash" };
  var KINDS = { fn: "fn", function: "fn", method: "fn", struct: "struct", trait: "trait", macro: "macro", builtin: "builtin" };
  var KIND_CLASS = { fn: "fn", struct: "struct", trait: "trait", macro: "macro" };

  var T = {
    en: { results: "results", result: "result", list: "Results", all: "all", ph: "type to search…  (rust:Vec::push · fn:map)", none: "No matches.",
      s: [["↑↓", "move"], ["Enter", "read"], ["^D", "docset"], ["^T", "kind"], ["F2", "recents", 1], ["F1", "help", 1], ["Esc", "clear/quit", 1]],
      r: [["/", "find"], ["[ ]", "sections"], ["O", "outline", 1], ["r", "related", 1], ["m", "★", 1], ["Tab", "links", 1], ["Esc", "back"]],
      find: "Enter keep · Esc cancel", nomatch: "no matches" },
    es: { results: "resultados", result: "resultado", list: "Resultados", all: "todos", ph: "escribe para buscar…  (rust:Vec::push · fn:map)", none: "Sin coincidencias.",
      s: [["↑↓", "navegar"], ["Enter", "leer"], ["^D", "docset"], ["^T", "tipo"], ["F2", "recientes", 1], ["F1", "ayuda", 1], ["Esc", "limpiar/salir", 1]],
      r: [["/", "buscar"], ["[ ]", "secciones"], ["O", "índice", 1], ["r", "relacionados", 1], ["m", "★", 1], ["Tab", "enlaces", 1], ["Esc", "atrás"]],
      find: "Enter fijar · Esc cancelar", nomatch: "sin coincidencias" }
  };

  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*([^*]+)\*/g, "<i>$1</i>")
      .replace(/\[([^\]]+)\]/g, '<span class="lnk">$1</span>');
  }

  /* A tiny highlighter: enough to look like syntect's base16-mocha. */
  var KW = {
    rust: "as break const continue crate else enum fn for if impl in let loop match mod move mut pub ref return self Self static struct trait type unsafe use where while macro_rules",
    py: "and as def elif else for from if import in is not or return None True False with",
    js: "async await break case class const else for function if let new of return this const",
    go: "func package import return var const type struct if else for range go defer map chan",
    sh: ""
  };
  function highlight(code, lang) {
    var kw = {}; (KW[lang] || "").split(" ").forEach(function (w) { if (w) kw[w] = 1; });
    var re = /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*!?)|([\s\S])/g;
    var out = "", m;
    while ((m = re.exec(code))) {
      if (m[1]) {
        // `#` only starts a comment in Python and shell.
        if (m[1][0] === "#" && lang !== "py" && lang !== "sh") { out += esc(m[1][0]); re.lastIndex = m.index + 1; continue; }
        out += '<span class="hl-c">' + esc(m[1]) + "</span>";
      } else if (m[2]) out += '<span class="hl-s">' + esc(m[2]) + "</span>";
      else if (m[3]) out += '<span class="hl-n">' + m[3] + "</span>";
      else if (m[4]) {
        var w = m[4], next = code.charAt(re.lastIndex);
        if (kw[w]) out += '<span class="hl-k">' + w + "</span>";
        else if (/!$/.test(w) || next === "(") out += '<span class="hl-f">' + w + "</span>";
        else if (/^[A-Z]/.test(w)) out += '<span class="hl-t">' + w + "</span>";
        else out += w;
      } else out += esc(m[5]);
    }
    return out;
  }

  /* Query: the same prefix rules as odc (`docset:`, `kind:`, `::` is never a prefix). */
  function parse(raw) {
    var q = { docset: null, kind: null, text: raw.trim() };
    for (var i = 0; i < 2; i++) {
      var c = q.text.indexOf(":");
      if (c <= 0 || q.text.charAt(c + 1) === ":") break;
      var head = q.text.slice(0, c).toLowerCase();
      if (/\s/.test(head)) break;
      if (!q.docset && ALIAS[head]) { q.docset = ALIAS[head]; q.text = q.text.slice(c + 1).replace(/^\s+/, ""); continue; }
      if (!q.kind && KINDS[head]) { q.kind = KINDS[head]; q.text = q.text.slice(c + 1).replace(/^\s+/, ""); continue; }
      break;
    }
    return q;
  }

  /* Fuzzy match of every word; prefers contiguous runs and shorter names. */
  function match(name, text) {
    var words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return { score: 0, pos: [] };
    var low = name.toLowerCase(), score = 0, pos = [];
    for (var w = 0; w < words.length; w++) {
      var word = words[w], at = low.indexOf(word);
      if (at >= 0) {
        score += 200 + word.length * 10 - at * .5 + (at === 0 || /[:._ ]/.test(low.charAt(at - 1)) ? 60 : 0);
        for (var k = 0; k < word.length; k++) pos.push(at + k);
        continue;
      }
      var i = 0, j = 0, gaps = 0, last = -1;
      for (; i < low.length && j < word.length; i++) {
        if (low.charAt(i) === word.charAt(j)) { if (last >= 0) gaps += i - last - 1; pos.push(i); last = i; j++; }
      }
      if (j < word.length) return null;
      score += 100 - gaps * 2;
    }
    return { score: score - name.length * .8, pos: pos };
  }

  function search(raw) {
    var q = parse(raw), out = [];
    E.forEach(function (e, i) {
      if (q.docset && e.d !== q.docset) return;
      if (q.kind && e.k !== q.kind) return;
      var m = q.text ? match(e.n, q.text) : { score: -i, pos: [] };
      if (m) out.push({ e: e, score: m.score, pos: m.pos });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return { q: q, hits: out };
  }

  /* ───────────────────────── the widget ───────────────────────── */
  var term = document.getElementById("term");
  var tui = null;
  if (term) tui = (function () {
    var $ = function (id) { return document.getElementById(id); };
    var elQ = $("t-q"), elCount = $("t-count"), elUl = $("t-ul"), elList = $("t-list"), elRead = $("t-read"),
        elDoc = $("t-doc"), elCrumb = $("t-crumb"), elPct = $("t-pct"), elFoot = $("t-foot"), elSearch = $("t-search"),
        elListTitle = $("t-list-title"), elLScroll = $("t-lscroll");
    var st = { q: "", sel: 0, focus: "search", res: search(""), shown: null, find: null, typing: false };

    function L() { return T[root.lang === "es" ? "es" : "en"]; }
    function kindClass(k) { return KIND_CLASS[k] || "other"; }
    function lineH() { return parseFloat(getComputedStyle(elDoc).lineHeight) || 20; }

    function drawQuery() {
      var t = L(), q = st.res.q, html = "";
      html += q.docset ? '<span class="t-chip">' + DOCSETS[q.docset].name + "</span>" : '<span class="t-chip all">' + t.all + "</span>";
      if (q.kind) html += '<span class="t-chip kind b-' + kindClass(q.kind) + '">' + q.kind + "</span>";
      html += st.q ? "<span>" + esc(st.q) + "</span>" : "";
      if (st.focus === "search") html += '<span class="t-caret"></span>';
      if (!st.q) html += '<span class="t-ph">' + t.ph + "</span>";
      elQ.innerHTML = html;
      var n = st.res.hits.length;
      elCount.textContent = " " + n + " " + (n === 1 ? t.result : t.results) + " ";
    }

    function drawList() {
      var t = L(), q = st.res.q, hits = st.res.hits;
      elListTitle.textContent = " " + t.list + " ";
      if (!hits.length) { elUl.innerHTML = '<li class="t-empty">' + t.none + "</li>"; return; }
      elUl.innerHTML = hits.map(function (h, i) {
        var name = "", p = {};
        h.pos.forEach(function (x) { p[x] = 1; });
        for (var c = 0; c < h.e.n.length; c++) name += p[c] ? "<b>" + esc(h.e.n.charAt(c)) + "</b>" : esc(h.e.n.charAt(c));
        var kc = kindClass(h.e.k);
        return '<li class="' + (i === st.sel ? "on" : "") + '" data-i="' + i + '">' +
          '<span class="k c-' + kc + '">' + h.e.k.slice(0, 6) + '</span><span class="n">' + name + "</span>" +
          (q.docset ? "" : '<span class="d">' + h.e.d + "</span>") + "</li>";
      }).join("");
      // keep the selection in view
      var li = elUl.children[st.sel];
      if (li) {
        var top = li.offsetTop - elUl.offsetTop, h = elLScroll.clientHeight - li.offsetHeight * 2;
        elLScroll.scrollTop = top > h ? top - h : 0;
      }
    }

    function drawDoc() {
      var hit = st.res.hits[st.sel];
      if (!hit) { elDoc.innerHTML = ""; elCrumb.textContent = ""; st.shown = null; return; }
      if (st.shown === hit.e) return;
      st.shown = hit.e;
      var e = hit.e, ds = DOCSETS[e.d], lang = ds.lang, kc = kindClass(e.k);
      var html = '<div class="hd"><span class="badge b-' + kc + '">' + e.k + '</span><span class="ttl">' + esc(e.n) + "</span></div>";
      html += '<div><span class="src">' + e.d + "</span>" + (e.meta ? '<span class="meta">  ·  ' + esc(e.meta) + "</span>" : "") + "</div>";
      if (e.sig) html += '<div class="sig">' + highlight(e.sig, lang) + "</div>";
      html += '<div class="rule">' + new Array(240).join("─") + "</div>";
      e.b.forEach(function (b, i) {
        if (b[0] === "p") html += "<p>" + inline(b[1]) + "</p>";
        else if (b[0] === "h") html += '<div class="h">' + esc(b[1]) + "</div>";
        else if (b[0] === "code") html += '<div class="code">' + highlight(b[1], lang) + "</div>";
        else if (b[0] === "ul") html += "<ul>" + b[1].map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ul>";
      });
      elDoc.innerHTML = html;
      elDoc.scrollTop = 0;
      elCrumb.textContent = " " + e.n + " ";
      if (st.find) applyFind(false);
    }

    function drawPct() {
      var max = elDoc.scrollHeight - elDoc.clientHeight;
      elPct.textContent = " " + (max <= 0 ? 100 : Math.round(elDoc.scrollTop / max * 100)) + "% ";
    }

    function drawFoot() {
      var t = L(), html = "";
      if (st.find && st.find.editing) {
        var info = !st.find.term ? "" : st.find.n ? "  " + (st.find.cur + 1) + "/" + st.find.n : "  " + t.nomatch;
        elFoot.innerHTML = '<span class="find">/</span><span class="fq">' + esc(st.find.term) + '</span><span class="t-caret" style="margin-left:0"></span><span>' + info + "   " + t.find + "</span>";
        return;
      }
      if (st.find && st.find.n) html += '<span class="find">/' + esc(st.find.term) + " " + (st.find.cur + 1) + "/" + st.find.n + "</span>";
      (st.focus === "search" ? t.s : t.r).forEach(function (h) {
        var kname = { "↑↓": "ArrowDown", "Enter": "Enter", "Esc": "Escape", "/": "/", "[ ]": "]" }[h[0]] || "";
        html += '<span class="' + (h[2] ? "opt" : "") + (kname ? " tap" : "") + '" data-key="' + kname + '"><span class="kk">' + h[0] + '</span><span class="lbl">' + h[1] + "</span></span>";
      });
      elFoot.innerHTML = html;
    }

    function draw() {
      term.dataset.focus = st.focus;
      elSearch.classList.toggle("on", st.focus === "search");
      elList.classList.toggle("on", st.focus === "search");
      elRead.classList.toggle("on", st.focus === "reader");
      drawQuery(); drawList(); drawDoc(); drawFoot(); drawPct();
    }

    /* find in page: wrap matches of the text (not the header) in <mark> */
    function clearMarks() {
      elDoc.querySelectorAll("mark").forEach(function (m) { m.replaceWith(document.createTextNode(m.textContent)); });
      elDoc.normalize();
    }
    function applyFind(jump) {
      clearMarks();
      var f = st.find; f.n = 0;
      if (!f.term) { drawFoot(); return; }
      var smart = /[A-Z]/.test(f.term), needle = smart ? f.term : f.term.toLowerCase();
      var walker = document.createTreeWalker(elDoc, NodeFilter.SHOW_TEXT), nodes = [], n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(function (node) {
        var text = node.nodeValue, hay = smart ? text : text.toLowerCase(), idx = hay.indexOf(needle);
        if (idx < 0) return;
        var frag = document.createDocumentFragment(), last = 0;
        while (idx >= 0) {
          frag.appendChild(document.createTextNode(text.slice(last, idx)));
          var mk = document.createElement("mark"); mk.textContent = text.slice(idx, idx + needle.length);
          frag.appendChild(mk); f.n++;
          last = idx + needle.length; idx = hay.indexOf(needle, last);
        }
        frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
      });
      if (f.cur >= f.n) f.cur = 0;
      showCurrent(jump);
      drawFoot();
    }
    function showCurrent(jump) {
      var marks = elDoc.querySelectorAll("mark");
      marks.forEach(function (m, i) { m.classList.toggle("cur", i === st.find.cur); });
      var cur = marks[st.find.cur];
      if (cur && jump) {
        var top = cur.offsetTop - elDoc.offsetTop, h = elDoc.clientHeight;
        if (top < elDoc.scrollTop || top > elDoc.scrollTop + h - lineH() * 2) elDoc.scrollTop = Math.max(0, top - h / 3);
      }
      drawPct();
    }

    function setQuery(q) { st.q = q; st.res = search(q); st.sel = 0; st.shown = null; st.find = null; draw(); }
    function move(d) {
      var n = st.res.hits.length; if (!n) return;
      st.sel = Math.max(0, Math.min(n - 1, st.sel + d)); st.find = null; draw();
    }
    function scroll(lines) { elDoc.scrollTop += lines * lineH(); drawPct(); }
    function jumpHeading(fwd) {
      var hs = [].slice.call(elDoc.querySelectorAll(".h")), y = elDoc.scrollTop + 2, target = null;
      hs.forEach(function (h) {
        var top = h.offsetTop - elDoc.offsetTop;
        if (fwd && top > y && target === null) target = top;
        if (!fwd && top < y - 4) target = top;
      });
      if (target !== null) { elDoc.scrollTop = target; drawPct(); }
    }

    /* one key, in the same spirit as handle_search_key / handle_reader_key */
    function key(k) {
      if (st.find && st.find.editing) {
        if (k === "Escape") { st.find = null; clearMarks(); }
        else if (k === "Enter") { st.find.editing = false; if (!st.find.n) { st.find = null; clearMarks(); } }
        else if (k === "Backspace") { st.find.term = st.find.term.slice(0, -1); applyFind(true); }
        else if (k === "ArrowDown") { step(1); }
        else if (k === "ArrowUp") { step(-1); }
        else if (k.length === 1) { st.find.term += k; applyFind(true); }
        else return false;
        drawFoot(); return true;
      }
      if (st.focus === "search") {
        if (k === "Escape") { if (st.q) setQuery(""); else { term.blur(); return true; } }
        else if (k === "Enter" || k === "Tab" || (k === "ArrowRight")) { if (st.res.hits.length) { st.focus = "reader"; draw(); } else return k !== "Tab" ? true : false; }
        else if (k === "ArrowDown") move(1);
        else if (k === "ArrowUp") move(-1);
        else if (k === "PageDown") scroll(8);
        else if (k === "PageUp") scroll(-8);
        else if (k === "Backspace") setQuery(st.q.slice(0, -1));
        else if (k.length === 1) setQuery(st.q + k);
        else return false;
        return true;
      }
      // reader
      if (k === "Escape") { if (st.find) { st.find = null; clearMarks(); drawFoot(); } else { st.focus = "search"; draw(); } }
      else if (k === "i" || k === "Backspace" || k === "h" || k === "ArrowLeft") { st.find = null; clearMarks(); st.focus = "search"; draw(); }
      else if (k === "q") { st.focus = "search"; draw(); term.blur(); }
      else if (k === "/") { st.find = { term: "", editing: true, cur: 0, n: 0 }; clearMarks(); drawFoot(); }
      else if ((k === "n" || k === "N") && st.find && st.find.n) step(k === "n" ? 1 : -1);
      else if (k === "j" || k === "ArrowDown") scroll(1);
      else if (k === "k" || k === "ArrowUp") scroll(-1);
      else if (k === " " || k === "PageDown") scroll(Math.max(1, Math.floor(elDoc.clientHeight / lineH()) - 2));
      else if (k === "b" || k === "PageUp") scroll(-Math.max(1, Math.floor(elDoc.clientHeight / lineH()) - 2));
      else if (k === "g" || k === "Home") { elDoc.scrollTop = 0; drawPct(); }
      else if (k === "G" || k === "End") { elDoc.scrollTop = elDoc.scrollHeight; drawPct(); }
      else if (k === "]" || k === "n") jumpHeading(true);
      else if (k === "[" || k === "N") jumpHeading(false);
      else if (k === "J") move(1);
      else if (k === "K") move(-1);
      else return false;
      return true;
    }
    function step(d) {
      var f = st.find; if (!f || !f.n) return;
      f.cur = (f.cur + d + f.n) % f.n; showCurrent(true); drawFoot();
    }

    /* the user takes over */
    var timers = [], playing = false;
    function stop() { timers.forEach(clearTimeout); timers = []; playing = false; term.classList.remove("typing"); }
    term.addEventListener("keydown", function (ev) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      stop(); term.classList.remove("idle");
      if (key(ev.key)) ev.preventDefault();
    });
    term.addEventListener("mousedown", function () { stop(); term.classList.remove("idle"); });
    elUl.addEventListener("click", function (ev) {
      var li = ev.target.closest("li[data-i]"); if (!li) return;
      var i = +li.dataset.i;
      // A second click (or tap) on the selected entry opens it, as Enter does.
      if (i === st.sel && st.focus === "search") { st.focus = "reader"; draw(); return; }
      st.sel = i; st.find = null; st.focus = "search"; draw();
    });
    // The key hints in the footer double as buttons (handy on touch screens).
    elFoot.addEventListener("click", function (ev) {
      var hint = ev.target.closest("[data-key]"); if (!hint || !hint.dataset.key) return;
      stop(); term.classList.remove("idle"); key(hint.dataset.key);
    });
    elRead.addEventListener("click", function () { if (st.res.hits.length && st.focus !== "reader") { st.focus = "reader"; draw(); } });
    elDoc.addEventListener("wheel", function (ev) {
      if (document.activeElement !== term) return;
      ev.preventDefault(); scroll(ev.deltaY > 0 ? 3 : -3);
    }, { passive: false });
    window.addEventListener("resize", function () { st.shown = null; draw(); });

    /* the opening act: type a query, look around, read, find */
    function play() {
      playing = true; term.classList.add("typing");
      var t = 700, at = function (ms, fn) { t += ms; timers.push(setTimeout(fn, t)); };
      "rust:Vec::push".split("").forEach(function (ch) { at(85 + Math.random() * 70, function () { key(ch); }); });
      at(1000, function () { key("ArrowDown"); });
      at(520, function () { key("ArrowDown"); });
      at(520, function () { key("ArrowDown"); });
      at(700, function () { key("ArrowUp"); });
      at(400, function () { key("ArrowUp"); });
      at(400, function () { key("ArrowUp"); });
      at(800, function () { key("Enter"); });
      for (var i = 0; i < 4; i++) at(200, function () { key("j"); });
      at(700, function () { key("/"); });
      "elem".split("").forEach(function (ch) { at(130, function () { key(ch); }); });
      at(700, function () { key("Enter"); });
      at(900, function () { key("n"); });
      at(1200, function () { key("Escape"); });
      at(500, function () { key("g"); });
      at(900, function () { stop(); term.classList.add("idle"); });
    }

    draw();
    if (reduce || !("IntersectionObserver" in window)) {
      setQuery("rust:Vec::push");
      term.classList.add("idle");
    } else {
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        if (document.activeElement !== term) play();
      }, { threshold: 0.5 });
      io.observe(term);
    }
    return { draw: function () { st.shown = null; draw(); } };
  })();

  /* ───────────────────────── init ───────────────────────── */
  var s = load();
  setTheme(root.dataset.themePref || "system");
  setLang(s.lang || ((navigator.language || "en").toLowerCase().indexOf("es") === 0 ? "es" : "en"));
})();
