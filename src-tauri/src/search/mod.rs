//! Búsqueda en memoria (`search/`): re-export del núcleo compartido
//! (`opendoc_core::search`).
//!
//! La búsqueda interactiva se hace en `opendoc-core`, no con `LIKE` en SQL
//! (SPEC §4.2).

pub use opendoc_core::search::*;
