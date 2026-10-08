//! Índice en memoria para la búsqueda interactiva (T5).
//!
//! - `build` consume las `Entry` de los docsets abribles y las deja en un
//!   `Vec` contiguo. El llamador decide qué entra: los docsets tarix con
//!   `MissingDocuments` (p. ej. el C++ de Zeal) no se indexan hasta v1.0.
//! - `docset_id` y `kind` se repiten miles de veces: se internan en
//!   `Arc<str>` vía pool para no duplicar `String` por entrada.
//! - `Matcher` de nucleo (~135 KB de scratch) y el buffer UTF-32 se
//!   reutilizan entre búsquedas; `search` (en `query.rs`) toma
//!   `&mut SearchIndex` por eso, pero es determinista y no toca Tauri
//!   (T6 lo llamará tras `Mutex`/`spawn_blocking`).

use std::collections::HashMap;
use std::sync::Arc;

use nucleo_matcher::{Config, Matcher};

use crate::browse::BrowseCache;
use crate::docset::Entry;

/// Una entrada lista para buscar.
#[derive(Debug, Clone)]
pub struct IndexedEntry {
    /// Nombre de la API (`str.format`, `std::vector`...).
    pub name: String,
    /// Ruta relativa a `Documents/`, con ancla si la hay.
    pub path: String,
    /// Tipo normalizado. Internado: compartido entre entradas.
    pub kind: Arc<str>,
    /// Slug del docset. Internado: compartido entre entradas.
    pub docset_id: Arc<str>,
}

/// Todas las entradas cargadas + scratch reutilizable de nucleo.
pub struct SearchIndex {
    pub(crate) entries: Vec<IndexedEntry>,
    pub(crate) matcher: Matcher,
    pub(crate) utf32_buf: Vec<char>,
    pool: HashMap<String, Arc<str>>,
    /// Navegación por tipos: orden + conteos, reconstruida en cada
    /// `build`/`extend` (ver `browse`).
    pub(crate) browse: BrowseCache,
}

impl SearchIndex {
    /// Índice vacío con matcher y buffers listos.
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            matcher: Matcher::new(Config::DEFAULT),
            utf32_buf: Vec::with_capacity(256),
            pool: HashMap::new(),
            browse: BrowseCache::empty(),
        }
    }

    /// Construye el índice desde las entradas de los docsets abribles.
    pub fn build(entries: Vec<Entry>) -> Self {
        let mut index = Self::new();
        index.extend(entries);
        index.entries.shrink_to_fit();
        index
    }

    /// Añade entradas compartiendo el internado (p. ej. tarix instalados
    /// después de la carga inicial) y reconstruye la navegación.
    pub fn extend(&mut self, entries: Vec<Entry>) {
        let Self {
            entries: mine,
            pool,
            ..
        } = self;
        mine.extend(entries.into_iter().map(|e| IndexedEntry {
            name: e.name,
            path: e.path,
            kind: intern(pool, &e.kind),
            docset_id: intern(pool, &e.docset_id),
        }));
        self.browse = BrowseCache::rebuild(&self.entries);
    }

    /// Número de entradas indexadas.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// `true` si no hay entradas.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

impl Default for SearchIndex {
    fn default() -> Self {
        Self::new()
    }
}

/// Devuelve el `Arc<str>` canónico para `s`, creando una sola asignación
/// por valor distinto.
fn intern(pool: &mut HashMap<String, Arc<str>>, s: &str) -> Arc<str> {
    if let Some(shared) = pool.get(s) {
        return shared.clone();
    }
    let shared: Arc<str> = Arc::from(s);
    pool.insert(s.to_string(), shared.clone());
    shared
}

/// Entrada de prueba (`cfg(test)` para compartir entre tests del módulo).
#[cfg(test)]
pub(crate) fn entry(id: &str, name: &str, kind: &str) -> Entry {
    Entry {
        docset_id: id.to_string(),
        name: name.to_string(),
        kind: kind.to_string(),
        path: format!("{name}.html"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_strings_are_interned() {
        let index = SearchIndex::build(vec![
            entry("css", "grid", "Property"),
            entry("css", "color", "Property"),
            entry("cpp", "vector", "Class"),
        ]);
        assert_eq!(index.len(), 3);
        assert!(Arc::ptr_eq(&index.entries[0].kind, &index.entries[1].kind));
        assert!(Arc::ptr_eq(
            &index.entries[0].docset_id,
            &index.entries[1].docset_id
        ));
        assert!(!Arc::ptr_eq(
            &index.entries[0].docset_id,
            &index.entries[2].docset_id
        ));
    }
}
