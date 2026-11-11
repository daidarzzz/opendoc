// Visor de documentación (T8 + pestañas V2-3): el HTML del docset aislado
// en iframes (sandbox="allow-scripts", origen opaco). Solo la pestaña
// activa monta sus 3 iframes: el visible, el que guarda la página vecina del
// historial y uno libre para cargar o precargar la siguiente.
// El hijo reporta navegaciones/anclas/scroll/teclas por postMessage
// (inyectado por el protocolo); aquí se valida todo: fuente = el iframe
// visible, forma exacta, URLs opendoc de docsets cargados, título ≤200 sin
// controles, scrollY finito en rango y teclas a ≤10/s.
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorDetails } from "./ErrorDetails";
import { Welcome } from "./Welcome";
import { useT } from "../hooks/useT";
import { useDocsets } from "../store/docsets";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";
import {
  isActivatedMessage,
  CONTEXT_RATE_MAX,
  CONTEXT_RATE_WINDOW_MS,
  rateAllow,
  validateContextMessage,
  validateFindResultMessage,
  validateTocActiveMessage,
  validateTocMessage,
  validateKeyMessage,
  validateNavigateMessage,
  validateNavMessage,
  validateOpenTabMessage,
  validatePrefetchMessage,
  validateReadyMessage,
  validateScrollMessage,
} from "../lib/iframeMessages";
import { normalizeBackendUrl, toBackendUrl } from "../lib/iframeMessages";
import { viewerUrl } from "../lib/opendocUrl";
import { currentEntry, sameDocument } from "../lib/tabHistory";
import { FRAME_SLOTS, findLoadedFrame, isPendingFrameLoad, pickFrameSlot } from "../lib/viewerFrames";
import { formatZoom } from "../lib/zoom";
import { docMenuEntries } from "../hooks/useAppContextMenu";
import { useContextMenu } from "../store/contextMenu";
import { useFind } from "../store/find";
import { useZoom } from "../store/zoom";
import { usePrefs } from "../store/prefs";
import { docDarkFor, type UiPrefs } from "../lib/prefs";
import { docsetOfUrl } from "../lib/recent";
import { useTheme } from "../store/theme";
import { CatalogView } from "./CatalogView";
import { FindBar } from "./FindBar";
import { PageToc } from "./PageToc";
import { useToc } from "../store/toc";

/** Envía al iframe el estado de búsqueda actual (o lo limpia). */
function sendFind(win: Window, dir: -1 | 0 | 1): void {
  const f = useFind.getState();
  if (f.open && f.query !== "") {
    win.postMessage({ type: "opendoc-find", query: f.query, dir }, "*");
  } else {
    win.postMessage({ type: "opendoc-find-clear" }, "*");
    if (f.open) f.setResult(0, 0);
  }
}

const frameSlotIndexes = Array.from({ length: FRAME_SLOTS }, (_, i) => i);

function emptySlots<T>(value: T): T[] {
  return Array.from({ length: FRAME_SLOTS }, () => value);
}

/** URLs vecinas del historial de la pestaña activa (las que conviene
 *  conservar cargadas para que atrás/adelante sea instantáneo). */
function neighborUrls(): string[] {
  const tab = useTabs.getState().active();
  if (!tab) return [];
  const out: string[] = [];
  for (const i of [tab.historyIndex - 1, tab.historyIndex + 1]) {
    const e = tab.history[i];
    if (e) out.push(normalizeBackendUrl(e.url));
  }
  return out;
}

/** `src` del iframe para una URL backend (null si no es válida). */
function frameSrc(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return viewerUrl(url);
  } catch {
    return undefined;
  }
}

/** ¿Se oscurece esta página? Solo con la opción beta activa, la app en
 *  tema oscuro y su docset no excluido. */
function isDocDark(
  url: string | null | undefined,
  appDark: boolean,
  prefs: Pick<UiPrefs, "docDarkMode" | "docDarkOff">,
): boolean {
  const docsetId = appDark && url ? docsetOfUrl(url) : null;
  return docsetId !== null && docDarkFor(prefs, docsetId);
}

/** Tema del contenido que se manda al iframe (estado actual de los stores). */
function docTheme(url: string | null | undefined): "light" | "dark" {
  return isDocDark(url, useTheme.getState().resolved === "dark", usePrefs.getState()) ? "dark" : "light";
}

/** Ctrl/Cmd+rueda: acumula el desplazamiento para que el pellizco del
 *  trackpad no salte de golpe varios pasos. */
function makeWheelZoom(): (e: WheelEvent) => void {
  let acc = 0;
  let last = 0;
  return (e) => {
    acc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const now = Date.now();
    if (Math.abs(acc) < 50 || now - last < 80) return;
    last = now;
    if (acc < 0) useZoom.getState().zoomIn();
    else useZoom.getState().zoomOut();
    acc = 0;
  };
}

export function Viewer() {
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const tabError = useTabs((s) => s.error);
  const childNav = useTabs((s) => s.childNav);
  const childScroll = useTabs((s) => s.childScroll);
  const childKey = useTabs((s) => s.childKey);
  const openTabUrl = useTabs((s) => s.openTabUrl);
  const newTab = useTabs((s) => s.newTab);
  const { docsets, loading, dirMissing, savedDir, choose, pending, extract, extractingIds } = useDocsets();
  const docsetsError = useDocsets((s) => s.error);
  const { t } = useT();
  // URLs backend canónicas (`opendoc://…`) por slot; el `src` real se
  // calcula al renderizar (en Windows es http://opendoc.localhost/…).
  const [frameUrls, setFrameUrls] = useState<(string | null)[]>(() => emptySlots<string | null>(null));
  const [frameVersions, setFrameVersions] = useState<number[]>(() => emptySlots(0));
  const [frontFrame, setFrontFrame] = useState<number | null>(null);
  const showToc = usePrefs((s) => s.toc);
  const tocItems = useToc((s) => (frontFrame === null ? undefined : s.byFrame[frontFrame]));
  const tocActive = useToc((s) => (frontFrame === null ? 0 : (s.active[frontFrame] ?? 0)));
  const [transitioning, setTransitioning] = useState(false);
  const frames = useRef<(HTMLIFrameElement | null)[]>(emptySlots<HTMLIFrameElement | null>(null));
  /** Página que muestra de verdad cada slot (la reporta el propio iframe:
   *  incluye navegaciones que el docset hace por su cuenta). */
  const loadedFrameUrls = useRef<(string | null)[]>(emptySlots<string | null>(null));
  const frameVersionsRef = useRef<number[]>(emptySlots(0));
  const lastShown = useRef<number[]>(emptySlots(0));
  /** El usuario ha interactuado con el documento actual de cada slot. */
  const activated = useRef<boolean[]>(emptySlots(false));
  /** El documento actual de cada slot llegó por redirección. */
  const redirected = useRef<boolean[]>(emptySlots(false));
  const frontFrameRef = useRef<number | null>(null);
  const pendingFrame = useRef<{ index: number; url: string; version: number } | null>(null);
  const preloadedFrame = useRef<{ index: number; url: string; version: number } | null>(null);
  const prefetchTime = useRef(0);
  const contextTimes = useRef<number[]>([]);
  const zoomLevel = useZoom((s) => s.level);
  const zoomChangedAt = useZoom((s) => s.changedAt);
  const smoothScroll = usePrefs((s) => s.smoothScroll);
  const docDarkMode = usePrefs((s) => s.docDarkMode);
  const docDarkOff = usePrefs((s) => s.docDarkOff);
  const appDark = useTheme((s) => s.resolved) === "dark";
  const slotDark = (url: string | null): boolean => isDocDark(url, appDark, { docDarkMode, docDarkOff });
  const findSeq = useFind((s) => s.seq);
  const [zoomToast, setZoomToast] = useState(false);

  // WKWebView can route trackpad wheel input to the outer document instead
  // of the nested docset iframe. Relay those deltas to the active frame.
  // Callback ref (not an effect): the <main> node changes between the
  // empty and docset branches, and the listener must always sit on the
  // live node. Pinch (ctrlKey) is swallowed, never relayed as scroll.
  const wheelCleanup = useRef<(() => void) | null>(null);
  const attachWheel = useCallback((viewer: HTMLElement | null): void => {
    wheelCleanup.current?.();
    wheelCleanup.current = null;
    if (!viewer) return;
    const wheelZoom = makeWheelZoom();
    const relayWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (frontFrameRef.current !== null) wheelZoom(event);
        return;
      }
      const index = frontFrameRef.current;
      const frame = index === null ? null : frames.current[index];
      const child = frame?.contentWindow;
      if (!child || (event.deltaX === 0 && event.deltaY === 0)) { event.preventDefault(); return; }
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      child.postMessage(
        {
          type: "opendoc-wheel",
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          ctrlKey: false,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
        "*",
      );
    };
    viewer.addEventListener("wheel", relayWheel, { passive: false, capture: true });
    wheelCleanup.current = () => viewer.removeEventListener("wheel", relayWheel, true);
  }, []);

  const active = tabs.find((t) => t.id === activeId);
  const activeEntry = active ? currentEntry(active) : null;
  const activeTitle = activeEntry?.title ?? "";
  const backendUrl = activeEntry?.url ?? null;
  /** Es la pestaña de catálogo (sin iframe). */
  const isCatalogTab = active?.type === "catalog";
  /** Estado del docset de la pestaña activa: cargado, tarix sin instalar
   *  o ausente (la pestaña se conserva atenuada en ambos casos). */
  const docsetState: "ok" | "pending" | "missing" = isCatalogTab || !activeEntry || !active
    ? "ok"
    : docsets.some((d) => d.id === active.docsetId)
      ? "ok"
      : pending.some((p) => p.id === active.docsetId)
        ? "pending"
        : "missing";

  // Activa un iframe ya cargado o recién terminado y restaura su estado.
  const activateFrame = useCallback((index: number): void => {
    const frame = frames.current[index];
    pendingFrame.current = null;
    if (preloadedFrame.current?.index === index) preloadedFrame.current = null;
    frontFrameRef.current = index;
    lastShown.current[index] = performance.now();
    setFrontFrame(index);
    setTransitioning(false);
    const win = frame?.contentWindow;
    if (!frame || !win) return;
    // Foco al documento nuevo si nadie lo tiene (p. ej. tras Ctrl+K): el
    // teclado y el trackpad apuntan a la página visible y no a la app.
    const focused = document.activeElement;
    if (!focused || focused === document.body || frames.current.includes(focused as HTMLIFrameElement)) {
      frame.focus({ preventScroll: true });
    }
    // Contenido claro original salvo con el modo oscuro beta activado.
    win.postMessage({ type: "opendoc-theme", value: docTheme(loadedFrameUrls.current[index]) }, "*");
    win.postMessage({ type: "opendoc-zoom", level: useZoom.getState().level }, "*");
    win.postMessage({ type: "opendoc-smooth-scroll", enabled: usePrefs.getState().smoothScroll }, "*");
    sendFind(win, 0);
    const tab = useTabs.getState().active();
    const url = tab ? currentEntry(tab)?.url : undefined;
    if (url) {
      const y = tab?.scrolls[url];
      if (y !== undefined) win.postMessage({ type: "opendoc-scroll-to", y }, "*");
    }
  }, []);

  // Carga en el iframe oculto. La página actual sigue visible hasta que la
  // nueva termine de cargar, evitando el destello blanco durante la navegación.
  useEffect(() => {
    // Un docset puede haberse actualizado en disco con las mismas URLs.
    loadedFrameUrls.current = emptySlots<string | null>(null);
    preloadedFrame.current = null;
  }, [docsets]);

  // Monta `url` en el slot `index` (iframe nuevo: key con versión).
  const loadIntoSlot = useCallback((index: number, url: string): { index: number; url: string; version: number } => {
    const versions = [...frameVersionsRef.current];
    versions[index] += 1;
    frameVersionsRef.current = versions;
    loadedFrameUrls.current[index] = null;
    useToc.getState().setItems(index, []); // El índice viejo no sobrevive a otra página.
    activated.current[index] = false;
    redirected.current[index] = false;
    setFrameVersions(versions);
    setFrameUrls((current) => {
      const next = [...current];
      next[index] = url;
      return next;
    });
    return { index, url, version: versions[index] };
  }, []);

  useEffect(() => {
    if (!backendUrl) {
      pendingFrame.current = null;
      preloadedFrame.current = null;
      setTransitioning(false);
      loadedFrameUrls.current = emptySlots<string | null>(null);
      frameVersionsRef.current = emptySlots(0);
      setFrameVersions(emptySlots(0));
      setFrontFrame(null);
      frontFrameRef.current = null;
      setFrameUrls(emptySlots<string | null>(null));
      return;
    }
    const url = normalizeBackendUrl(backendUrl);
    const mounted = (i: number | null): i is number => i !== null && frames.current[i] !== null;
    const cachedIndex = findLoadedFrame(url, loadedFrameUrls.current);
    if (mounted(cachedIndex)) {
      activateFrame(cachedIndex);
      return;
    }
    // Misma página, otra ancla (p. ej. desde Ctrl+K): se mueve el iframe
    // visible sin recargar el documento.
    const front = frontFrameRef.current;
    const frontUrl = front === null ? null : loadedFrameUrls.current[front];
    if (mounted(front) && frontUrl && sameDocument(frontUrl, url)) {
      const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
      frames.current[front]?.contentWindow?.postMessage({ type: "opendoc-hash", hash }, "*");
      loadedFrameUrls.current[front] = url;
      activateFrame(front);
      return;
    }
    setTransitioning(true);
    if (pendingFrame.current?.url === url) return;
    const warmed = preloadedFrame.current;
    if (warmed?.url === url) {
      pendingFrame.current = warmed;
      preloadedFrame.current = null;
      return;
    }
    const index = pickFrameSlot(front, loadedFrameUrls.current, neighborUrls(), lastShown.current, true) ??
      (front === 0 ? 1 : 0);
    if (preloadedFrame.current?.index === index) preloadedFrame.current = null;
    pendingFrame.current = loadIntoSlot(index, url);
  }, [activeId, backendUrl, activateFrame, loadIntoSlot, docsets]);

  // Mensajes del hijo, con validación estricta.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data: unknown = e.data;
      if (typeof data !== "object" || data === null) return;
      const type = (data as Record<string, unknown>)["type"];
      const ids = useDocsets.getState().docsets.map((d) => d.id);
      const sourceIndex = frames.current.findIndex((f) => f !== null && e.source === f.contentWindow);
      if (sourceIndex < 0) return;
      if (type === "opendoc-ready" || type === "opendoc-nav") {
        // Cada iframe dice qué página tiene de verdad: así la caché de
        // atrás/adelante no se cree una URL vieja si el docset navegó solo
        // (JS, formularios, redirecciones) o cambió de ancla.
        const reported = type === "opendoc-ready"
          ? validateReadyMessage(data, true, ids)
          : validateNavMessage(data, true, ids);
        if (reported && type === "opendoc-ready") {
          // Documento nuevo en este slot. Si sustituye a otro sin que
          // nosotros lo pidiéramos y sin interacción del usuario en el
          // anterior (meta refresh, location.replace/href en la carga…),
          // es una redirección: su entrada se sustituirá, no se apilará.
          const prev = loadedFrameUrls.current[sourceIndex];
          const p = pendingFrame.current;
          const requested = p?.index === sourceIndex && sameDocument(p.url, reported.url);
          redirected.current[sourceIndex] = prev !== null && !requested &&
            !sameDocument(prev, reported.url) && !activated.current[sourceIndex];
          activated.current[sourceIndex] = false;
        }
        if (reported) loadedFrameUrls.current[sourceIndex] = reported.url;
      }
      if (type === "opendoc-activated") {
        if (isActivatedMessage(data, true)) activated.current[sourceIndex] = true;
        return;
      }
      if (type === "opendoc-ready") {
        // Zoom cuanto antes (antes del primer pintado) en cualquiera de
        // nuestros iframes, también el que precarga.
        const own = frames.current[sourceIndex]?.contentWindow;
        own?.postMessage({ type: "opendoc-zoom", level: useZoom.getState().level }, "*");
        own?.postMessage({ type: "opendoc-smooth-scroll", enabled: usePrefs.getState().smoothScroll }, "*");
        const ready = validateReadyMessage(data, true, ids);
        if (!ready) return;
        own?.postMessage({ type: "opendoc-theme", value: docTheme(ready.url) }, "*");
        const pending = pendingFrame.current;
        if (pending && pending.index === sourceIndex && sameDocument(pending.url, ready.url)) {
          activateFrame(sourceIndex);
          return;
        }
        if (preloadedFrame.current?.index === sourceIndex) preloadedFrame.current = null;
        return;
      }
      // Índice de la página: se guarda por iframe (también los de reserva).
      if (type === "opendoc-toc") {
        const items = validateTocMessage(data, true);
        if (items) useToc.getState().setItems(sourceIndex, items);
        return;
      }
      if (type === "opendoc-toc-active") {
        const index = validateTocActiveMessage(data, true);
        if (index !== null) useToc.getState().setActive(sourceIndex, index);
        return;
      }
      if (sourceIndex !== frontFrameRef.current) return;
      const frame = frames.current[sourceIndex];
      if (!frame) return;
      if (type === "opendoc-scroll") {
        // Sin puerta de `transitioning` a propósito: el reporte trae su
        // propia URL (incluye el volcado final en pagehide) y childScroll
        // solo acepta URLs del historial de la pestaña activa.
        const sc = validateScrollMessage(data, true);
        const rawUrl: unknown = (data as Record<string, unknown>)["url"];
        const url = typeof rawUrl === "string" ? toBackendUrl(rawUrl) : null;
        if (sc && url) childScroll(url, sc.y);
        return;
      }
      // Clic dentro del docset: el padre no recibe el pointerdown (ni
      // siempre un blur), así que el iframe lo avisa para cerrar el menú.
      if (type === "opendoc-pointerdown") {
        useContextMenu.getState().close();
        return;
      }
      if (type === "opendoc-find-result") {
        const res = validateFindResultMessage(data, true);
        if (res) useFind.getState().setResult(res.total, res.current);
        return;
      }
      // Las teclas (atrás/adelante, pestañas…) son intención del usuario:
      // no se descartan aunque la página siguiente aún esté cargando.
      if (type === "opendoc-key") {
        const kp = validateKeyMessage(data, true);
        if (!kp) return;
        if (kp.key === "f") {
          useFind.getState().openFind();
          return;
        }
        if (kp.key === "find-close") {
          useFind.getState().close();
          return;
        }
        if (kp.key === "zoom-in" || kp.key === "zoom-out" || kp.key === "zoom-reset") {
          const z = useZoom.getState();
          if (kp.key === "zoom-in") z.zoomIn();
          else if (kp.key === "zoom-out") z.zoomOut();
          else z.reset();
          return;
        }
        if (kp.key === "k") {
          usePalette.getState().toggle();
          return;
        }
        // Ctrl/Cmd+T abre pestaña vacía + paleta (no es acción de pestaña).
        if (kp.key === "t" && !kp.shift) {
          newTab();
          usePalette.getState().setOpen(true);
          return;
        }
        childKey(kp.key, kp.shift);
        return;
      }
      if (transitioning) return;
      if (type === "opendoc-context") {
        const req = validateContextMessage(data, true, ids);
        if (!req) return;
        const rate = rateAllow(contextTimes.current, Date.now(), CONTEXT_RATE_MAX, CONTEXT_RATE_WINDOW_MS);
        contextTimes.current = rate.times;
        if (!rate.allowed) return;
        const rect = frame.getBoundingClientRect();
        const win = frame.contentWindow;
        const linkDoc = req.link
          ? useDocsets.getState().docsets.find((d) => d.id === req.link?.slice("opendoc://".length).split("/", 1)[0])
          : undefined;
        useContextMenu.getState().show(
          Math.min(rect.right, Math.max(rect.left, rect.left + req.x)),
          Math.min(rect.bottom, Math.max(rect.top, rect.top + req.y)),
          docMenuEntries({
            selection: req.selection,
            link: req.link,
            linkTitle: linkDoc?.name ?? req.link ?? "",
            selectAll: () => win?.postMessage({ type: "opendoc-select-all" }, "*"),
          }),
        );
        return;
      }
      if (type === "opendoc-nav") {
        const nav = validateNavMessage(data, true, ids);
        if (!nav) return;
        const redirect = redirected.current[sourceIndex];
        redirected.current[sourceIndex] = false;
        childNav(nav.url, nav.title, redirect);
      } else if (type === "opendoc-navigate") {
        const nav = validateNavigateMessage(data, true, ids);
        if (nav) childNav(nav.url, nav.title);
      } else if (type === "opendoc-prefetch") {
        const prefetch = validatePrefetchMessage(data, true, ids);
        const tab = useTabs.getState().active();
        const currentUrl = tab ? currentEntry(tab)?.url : null;
        const now = performance.now();
        if (
          !prefetch || !usePrefs.getState().linkPrefetch || transitioning || pendingFrame.current ||
          frontFrameRef.current === null || prefetch.url === currentUrl ||
          findLoadedFrame(prefetch.url, loadedFrameUrls.current) !== null ||
          preloadedFrame.current?.url === prefetch.url || now - prefetchTime.current < 250
        ) return;
        // Nunca expulsa la página anterior/siguiente del historial: si no
        // hay slot libre, no se precarga.
        const index = pickFrameSlot(
          frontFrameRef.current, loadedFrameUrls.current, neighborUrls(), lastShown.current, false,
        );
        if (index === null) return;
        prefetchTime.current = now;
        preloadedFrame.current = loadIntoSlot(index, prefetch.url);
      } else if (type === "opendoc-open-tab") {
        const req = validateOpenTabMessage(data, true, ids);
        if (!req) return;
        const meta = useDocsets
          .getState()
          .docsets.find((d) => d.id === req.url.slice("opendoc://".length).split("/", 1)[0]);
        openTabUrl(req.url, meta?.name ?? req.url);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [activateFrame, loadIntoSlot, childNav, childScroll, childKey, openTabUrl, newTab, transitioning]);


  // Zoom: se aplica a todos los iframes (uno oculto puede ser la próxima página)
  // y se muestra un aviso breve con el nivel.
  useEffect(() => {
    for (const f of frames.current) {
      f?.contentWindow?.postMessage({ type: "opendoc-zoom", level: zoomLevel }, "*");
    }
  }, [zoomLevel]);

  // Modo oscuro de los docsets (beta): se aplica en caliente, sin recargar.
  useEffect(() => {
    frames.current.forEach((f, i) => {
      f?.contentWindow?.postMessage({ type: "opendoc-theme", value: docTheme(loadedFrameUrls.current[i]) }, "*");
    });
  }, [docDarkMode, docDarkOff, appDark]);

  // Desplazamiento suave: también a todos los iframes.
  useEffect(() => {
    for (const f of frames.current) {
      f?.contentWindow?.postMessage({ type: "opendoc-smooth-scroll", enabled: smoothScroll }, "*");
    }
  }, [smoothScroll]);

  useEffect(() => {
    if (zoomChangedAt === 0) return;
    setZoomToast(true);
    const id = window.setTimeout(() => setZoomToast(false), 1200);
    return () => window.clearTimeout(id);
  }, [zoomChangedAt]);

  // Búsqueda en página: cada petición va al iframe visible. Al escribir se
  // espera un poco (no se recorre el documento en cada tecla).
  useEffect(() => {
    if (findSeq === 0) return;
    const { dir } = useFind.getState();
    const send = () => {
      const index = frontFrameRef.current;
      const win = index === null ? null : frames.current[index]?.contentWindow;
      if (win) sendFind(win, dir);
    };
    if (dir !== 0) {
      send();
      return;
    }
    const id = window.setTimeout(send, 120);
    return () => window.clearTimeout(id);
  }, [findSeq]);

  // Cambiar de pestaña cierra la búsqueda (cada página es otro documento).
  useEffect(() => {
    useFind.getState().close();
  }, [activeId]);

  // Solo promover la carga que sigue siendo la solicitada; un destino lento
  // sustituido por otra navegación no debe robar el visor al destino nuevo.
  const onIframeLoad = (index: number, loadedUrl: string | null, version: number): void => {
    const pending = pendingFrame.current;
    if (!isPendingFrameLoad(pending, index, loadedUrl, version)) {
      if (isPendingFrameLoad(preloadedFrame.current, index, loadedUrl, version) && loadedUrl) {
        loadedFrameUrls.current[index] ??= loadedUrl;
        preloadedFrame.current = null;
      }
      return;
    }
    if (!loadedUrl) return;
    // Sin script inyectado (404, no-HTML) nadie reportó la URL: se asume
    // la pedida. Si el iframe ya la reportó, manda la suya.
    loadedFrameUrls.current[index] ??= loadedUrl;
    activateFrame(index);
  };

  // Pestaña de catálogo: renderiza el catálogo directamente (sin iframe),
  // también sin docsets instalados (es justo cuando más se necesita).
  // No usamos attachWheel porque el catálogo usa scroll nativo del navegador
  if (isCatalogTab) {
    return (
      <main className="flex min-h-0 min-w-0 flex-1 flex-col" role="tabpanel" id="viewer-panel" aria-label={t("catalog.title")}>
        <CatalogView />
      </main>
    );
  }

  // Arranque: hasta que cargan los docsets, el visor queda en blanco (el
  // panel lateral muestra su esqueleto). Si no, una pestaña restaurada
  // parpadearía "docset no encontrado" y la bienvenida "0 docsets".
  if (docsets.length === 0 && loading) {
    return <main className="flex min-w-0 flex-1 flex-col" aria-busy="true" />;
  }

  if (docsets.length === 0 && !loading) {
    return (
      <main ref={attachWheel} className="flex min-w-0 flex-1 flex-col">
        {dirMissing ? (
          <FolderPrompt
            dirMissing={dirMissing}
            savedDir={savedDir}
            choose={choose}
            error={docsetsError}
          />
        ) : (
          <Welcome docCount={0} />
        )}
      </main>
    );
  }

  return (
    <main ref={attachWheel} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" role="tabpanel" id="viewer-panel" aria-label={t("viewer.viewer")}>
      {!activeEntry || docsetState !== "ok" ? (
        <div className={`flex min-h-0 flex-1 flex-col items-center justify-center ${activeEntry ? "p-8" : ""}`}>
          {!activeEntry ? (
            <Welcome docCount={docsets.length} />
          ) : docsetState === "pending" ? (
            <div className="flex max-w-md flex-col items-center gap-4 text-center">
              <p className="text-[15px] text-ink-2">
                {t("viewer.pendingTarix")}
              </p>
              <button
                onClick={() => {
                  if (active) void extract(active.docsetId);
                }}
                disabled={active !== undefined && extractingIds.includes(active.docsetId)}
                className="btn"
              >
                {active !== undefined && extractingIds.includes(active.docsetId)
                  ? t("settings.extracting")
                  : t("common.install")}
              </button>
            </div>
          ) : (
            <p className="max-w-md text-center text-[15px] text-ink-2">
              {t("viewer.docsetMissing")}
            </p>
          )}
          <ErrorDetails error={tabError} />
        </div>
      ) : (
        <>
          {frontFrame === null && (
            <p className="animate-fade-in px-8 py-6 text-[14px] text-muted">{t("viewer.loading", { title: activeTitle })}</p>
          )}
          {/* Los iframes de reserva van `invisible` + `inert`: fuera del
              hit-testing de verdad. Con solo opacity-0/pointer-events-none,
              WebKit (macOS) podía seguir entregándoles el gesto del
              trackpad aunque estén ocultos encima del visible. Fundido
              cruzado breve: `visibility` entra en la transición, así que el
              saliente se desvanece antes de ocultarse (ya inert, sin
              recibir eventos). "Reducir movimiento" lo desactiva. */}
          {frameSlotIndexes.map((index) => (
            <iframe
              key={`${index}:${frameVersions[index]}`}
              ref={(frame) => { frames.current[index] = frame; }}
              src={frameSrc(frameUrls[index])}
              title={t("viewer.iframeTitle", { title: activeTitle })}
              sandbox="allow-scripts"
              scrolling="yes"
              aria-hidden={frontFrame !== index}
              inert={frontFrame !== index}
              className={`h-full min-h-0 w-full flex-1 border-0 ${slotDark(frameUrls[index]) ? "bg-[#1a1a1a]" : "bg-white"} transition-[opacity,visibility] duration-150 ease-out motion-reduce:transition-none ${frontFrame === index ? `visible opacity-100 ${transitioning ? "pointer-events-none" : ""}` : "invisible absolute inset-0 pointer-events-none opacity-0"}`}
              onLoad={() => onIframeLoad(index, frameUrls[index], frameVersions[index])}
            />
          ))}
          <ErrorDetails error={tabError} />
          {showToc && frontFrame !== null && tocItems && (
            <PageToc
              items={tocItems}
              active={tocActive}
              onGo={(index) =>
                frames.current[frontFrame]?.contentWindow?.postMessage({ type: "opendoc-toc-go", index }, "*")
              }
            />
          )}
          <FindBar />
          {zoomToast && (
            <div
              aria-live="polite"
              className="pointer-events-none absolute bottom-4 right-4 z-20 animate-pop-in rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold tabular-nums text-card shadow-float"
            >
              {t("zoom.toast", { pct: formatZoom(zoomLevel) })}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function FolderPrompt({
  dirMissing,
  savedDir,
  choose,
  error,
}: {
  dirMissing: boolean;
  savedDir: string | null;
  choose: () => Promise<void>;
  error: unknown;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      {dirMissing ? (
        <>
          <p className="max-w-md text-[15px] text-ink-2">
            {t("viewer.folderGone")}
            {savedDir ? `: ${savedDir}` : ""} {t("settings.diskHint")}
          </p>
          <button
            onClick={() => void choose()}
            className="btn-primary mt-5 px-4 py-2"
          >
            {t("viewer.chooseAnother")}
          </button>
        </>
      ) : (
        <>
          <p className="max-w-md text-[15px] text-ink-2">
            {t("viewer.pickFolder")}
          </p>
          <button
            onClick={() => void choose()}
            className="btn-primary mt-5 px-4 py-2"
          >
            {t("viewer.chooseFolder")}
          </button>
        </>
      )}
      <ErrorDetails error={error} />
    </div>
  );
}
