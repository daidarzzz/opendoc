// Clic derecho en toda la app: se anula el menú del navegador y se abre el
// de OpenDoc según dónde se pulse (pestaña, árbol, campo de texto, texto
// seleccionado o fondo). El del docset lo construye `docMenuEntries`, que
// usa el Viewer al recibir `opendoc-context` del iframe.
import { useEffect } from "react";
import { platform } from "@tauri-apps/plugin-os";
import { copyText, readText } from "../lib/clipboard";
import { t as translate, type I18nKey, type I18nVars } from "../lib/i18n";
import { canGoBack, canGoForward } from "../lib/tabHistory";
import { useContextMenu, type MenuEntry } from "../store/contextMenu";
import { useFind } from "../store/find";
import { useLang } from "../store/lang";
import { usePalette } from "../store/palette";
import { useTabs } from "../store/tabs";

type T = (key: I18nKey, vars?: I18nVars) => string;

function tr(): T {
  const lang = useLang.getState().lang;
  return (key, vars) => translate(lang, key, vars);
}

/** Modificador mostrado en los atajos (⌘ en macOS). */
export function modLabel(): string {
  try {
    return platform() === "macos" ? "⌘" : "Ctrl";
  } catch {
    return "Ctrl";
  }
}

/** Recorta la selección para mostrarla dentro de una etiqueta. */
export function snippet(text: string, max = 24): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function searchInDocs(text: string): void {
  const q = text.replace(/\s+/g, " ").trim().slice(0, 100);
  const palette = usePalette.getState();
  palette.setOpen(true);
  palette.setQuery(q);
}

export interface DocContext {
  selection: string;
  link: string | null;
  linkTitle: string;
  /** Envía al iframe visible la orden de seleccionar todo. */
  selectAll: () => void;
}

/** Entradas del menú dentro del docset. */
export function docMenuEntries(ctx: DocContext): MenuEntry[] {
  const t = tr();
  const mod = modLabel();
  const tabs = useTabs.getState();
  const active = tabs.active();
  const sel = ctx.selection.trim();
  const out: MenuEntry[] = [];
  if (sel !== "") {
    out.push(
      { kind: "item", id: "copy", icon: "copy", label: t("menu.copy"), hint: `${mod} C`, onSelect: () => void copyText(ctx.selection) },
      { kind: "item", id: "search-sel", icon: "search", label: t("menu.searchSelection", { text: snippet(sel) }), onSelect: () => searchInDocs(sel) },
      { kind: "item", id: "find-sel", icon: "find", label: t("menu.findSelection", { text: snippet(sel) }), onSelect: () => useFind.getState().openFind(sel) },
      { kind: "separator", id: "s1" },
    );
  }
  if (ctx.link) {
    const link = ctx.link;
    out.push(
      { kind: "item", id: "open-tab", icon: "tab", label: t("menu.openNewTab"), onSelect: () => useTabs.getState().openTabUrl(link, ctx.linkTitle) },
      { kind: "separator", id: "s2" },
    );
  }
  out.push(
    { kind: "item", id: "back", icon: "back", label: t("menu.back"), hint: "Alt ←", disabled: !active || !canGoBack(active), onSelect: () => useTabs.getState().goBack() },
    { kind: "item", id: "forward", icon: "forward", label: t("menu.forward"), hint: "Alt →", disabled: !active || !canGoForward(active), onSelect: () => useTabs.getState().goForward() },
    { kind: "separator", id: "s3" },
  );
  if (sel === "") {
    out.push({ kind: "item", id: "find", icon: "find", label: t("menu.findInPage"), hint: `${mod} F`, onSelect: () => useFind.getState().openFind() });
  }
  out.push(
    { kind: "item", id: "select-all", icon: "select", label: t("menu.selectAll"), hint: `${mod} A`, onSelect: ctx.selectAll },
    { kind: "separator", id: "s4" },
    { kind: "zoom", id: "zoom" },
  );
  return out;
}

function isEditable(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    const textual = ["text", "search", "url", "email", "tel", "password", ""].includes(el.type);
    return textual && !el.readOnly && !el.disabled;
  }
  return false;
}

function fieldMenu(field: HTMLInputElement | HTMLTextAreaElement): MenuEntry[] {
  const t = tr();
  const mod = modLabel();
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? 0;
  const selected = field.value.slice(start, end);
  const isPassword = field instanceof HTMLInputElement && field.type === "password";
  return [
    {
      kind: "item", id: "cut", icon: "cut", label: t("menu.cut"), hint: `${mod} X`, disabled: selected === "" || isPassword,
      onSelect: () => {
        void copyText(selected).then(() => {
          field.focus();
          field.setSelectionRange(start, end);
          document.execCommand("delete");
        });
      },
    },
    { kind: "item", id: "copy", icon: "copy", label: t("menu.copy"), hint: `${mod} C`, disabled: selected === "" || isPassword, onSelect: () => void copyText(selected) },
    {
      kind: "item", id: "paste", icon: "paste", label: t("menu.paste"), hint: `${mod} V`,
      onSelect: () => {
        void readText().then((text) => {
          if (text === null) return;
          field.focus();
          field.setSelectionRange(start, end);
          // insertText dispara `input`, así React ve el cambio.
          document.execCommand("insertText", false, text);
        });
      },
    },
    { kind: "separator", id: "s1" },
    {
      kind: "item", id: "select-all", icon: "select", label: t("menu.selectAll"), hint: `${mod} A`, disabled: field.value === "",
      onSelect: () => {
        field.focus();
        field.select();
      },
    },
  ];
}

function tabMenu(tabId: string): MenuEntry[] {
  const t = tr();
  const mod = modLabel();
  const tabs = useTabs.getState();
  const others = tabs.tabs.filter((x) => x.id !== tabId).map((x) => x.id);
  return [
    { kind: "item", id: "new", icon: "tab", label: t("menu.newTab"), hint: `${mod} T`, onSelect: () => { useTabs.getState().newTab(); usePalette.getState().setOpen(true); } },
    { kind: "item", id: "reopen", icon: "reopen", label: t("menu.reopenTab"), hint: `${mod} ⇧ T`, disabled: tabs.closed.length === 0, onSelect: () => useTabs.getState().reopenLast() },
    { kind: "separator", id: "s1" },
    { kind: "item", id: "close", icon: "close", label: t("menu.closeTab"), hint: `${mod} W`, onSelect: () => useTabs.getState().closeTab(tabId) },
    {
      kind: "item", id: "close-others", label: t("menu.closeOtherTabs"), disabled: others.length === 0,
      onSelect: () => {
        const s = useTabs.getState();
        s.activateTab(tabId);
        for (const id of others) useTabs.getState().closeTab(id);
      },
    },
  ];
}

function treeMenu(el: HTMLElement): MenuEntry[] | null {
  const t = tr();
  const docsetId = el.dataset.ctxDocset;
  if (!docsetId) return null;
  if (el.dataset.ctx === "doc") {
    return [
      { kind: "item", id: "open-tab", icon: "tab", label: t("menu.openNewTab"), onSelect: () => void useTabs.getState().openHome(docsetId, { newTab: true }) },
    ];
  }
  const name = el.dataset.ctxName;
  const path = el.dataset.ctxPath;
  if (el.dataset.ctx === "entry" && name !== undefined && path !== undefined) {
    return [
      { kind: "item", id: "open-tab", icon: "tab", label: t("menu.openNewTab"), onSelect: () => void useTabs.getState().openEntry(docsetId, { name, path }, { newTab: true }) },
      { kind: "item", id: "copy", icon: "copy", label: t("menu.copy"), onSelect: () => void copyText(name) },
    ];
  }
  return null;
}

function generalMenu(): MenuEntry[] {
  const t = tr();
  const mod = modLabel();
  return [
    { kind: "item", id: "search", icon: "search", label: t("menu.searchDocs"), hint: `${mod} K`, onSelect: () => usePalette.getState().setOpen(true) },
    { kind: "item", id: "new", icon: "tab", label: t("menu.newTab"), hint: `${mod} T`, onSelect: () => { useTabs.getState().newTab(); usePalette.getState().setOpen(true); } },
    { kind: "item", id: "catalog", icon: "catalog", label: t("menu.openCatalog"), hint: "F3", onSelect: () => useTabs.getState().openCatalogTab() },
  ];
}

/** Menú para un clic derecho dentro de la ventana principal. */
export function appMenuEntries(target: EventTarget | null): MenuEntry[] {
  const el = target instanceof Element ? target : null;
  // Dentro del propio menú no se abre otro.
  if (el?.closest("[role='menu']")) return [];
  if (isEditable(el)) return fieldMenu(el);
  const tab = el?.closest<HTMLElement>("[data-opendoc-tab-id]");
  if (tab?.dataset.opendocTabId) return tabMenu(tab.dataset.opendocTabId);
  const row = el?.closest<HTMLElement>("[data-ctx]");
  const fromTree = row ? treeMenu(row) : null;
  if (fromTree) return fromTree;
  const selection = window.getSelection()?.toString() ?? "";
  if (selection.trim() !== "") {
    const t = tr();
    return [
      { kind: "item", id: "copy", icon: "copy", label: t("menu.copy"), hint: `${modLabel()} C`, onSelect: () => void copyText(selection) },
      { kind: "item", id: "search-sel", icon: "search", label: t("menu.searchSelection", { text: snippet(selection) }), onSelect: () => searchInDocs(selection) },
    ];
  }
  return generalMenu();
}

export function useAppContextMenu(): void {
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      const entries = appMenuEntries(e.target);
      if (entries.length === 0) return;
      useContextMenu.getState().show(e.clientX, e.clientY, entries);
    };
    document.addEventListener("contextmenu", onContext);
    return () => document.removeEventListener("contextmenu", onContext);
  }, []);
}
