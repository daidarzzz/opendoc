//! Manejador del esquema personalizado `opendoc://<docset-id>/<ruta>`.
//!
//! Debe resolver rutas dentro de `Documents/` sin permitir path traversal,
//! devolver el Content-Type correcto y manejar anclas (SPEC §4.3).
