//! Ajustes persistentes: re-export del núcleo (`opendoc_core::settings`).
//!
//! La ruta real (`app_data_dir`) la resuelve `lib.rs`; aquí solo se
//! re-exportan los tipos y la carga/guardado puros.

pub use opendoc_core::settings::*;
