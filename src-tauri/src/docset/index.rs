//! Lectura de índices SQLite de docsets (T4).
//!
//! - Detección del esquema consultando `sqlite_master` (`type = 'table'`;
//!   así las vistas de compatibilidad como el `CREATE VIEW searchIndex`
//!   de algunos docsets Core Data no provocan falsos positivos).
//! - Apertura en solo lectura: no se crean `-wal`/`-journal` junto al docset.
//! - Una sola consulta por esquema; filas con NULL se saltan y se cuentan.
//! - `Entry` normalizado para ambos esquemas (SPEC §3.3).

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};

use super::model::Entry;

/// Esquema del índice detectado en `sqlite_master`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndexSchema {
    /// Tabla `searchIndex(id, name, type, path)`.
    Standard,
    /// Tablas `ZTOKEN`, `ZTOKENTYPE`, `ZFILEPATH`, `ZTOKENMETAINFORMATION`.
    CoreData,
}

/// Entradas leídas de un `docSet.dsidx`.
#[derive(Debug, Clone)]
pub struct IndexData {
    /// Esquema detectado.
    pub schema: IndexSchema,
    /// Entradas normalizadas.
    pub entries: Vec<Entry>,
    /// Filas saltadas por contener campos NULL.
    pub skipped_nulls: u64,
}

/// Error al leer un índice. Nunca un pánico: el escáner lo registra en issues.
#[derive(Debug, thiserror::Error)]
pub enum IndexError {
    /// El `.dsidx` no se puede abrir en solo lectura.
    #[error("no se puede abrir el índice en solo lectura: {}", path.display())]
    Unreadable {
        /// Ruta del `.dsidx`.
        path: PathBuf,
        /// Error de SQLite subyacente.
        #[source]
        source: rusqlite::Error,
    },
    /// Ningún esquema conocido en `sqlite_master`.
    #[error("esquema de índice no reconocido en {} (tablas: {})", path.display(), tables.join(", "))]
    UnknownSchema {
        /// Ruta del `.dsidx`.
        path: PathBuf,
        /// Tablas encontradas (vacío si no hay ninguna).
        tables: Vec<String>,
    },
    /// Fallo al consultar el índice.
    #[error("error leyendo el índice {}: {source}", path.display())]
    Query {
        /// Ruta del `.dsidx`.
        path: PathBuf,
        /// Error de SQLite subyacente.
        #[source]
        source: rusqlite::Error,
    },
}

/// Lee y normaliza `docSet.dsidx` en una sola pasada.
pub fn read_index(dsidx: &Path, docset_id: &str) -> Result<IndexData, IndexError> {
    let conn =
        Connection::open_with_flags(dsidx, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|source| {
            IndexError::Unreadable {
                path: dsidx.to_path_buf(),
                source,
            }
        })?;
    let tables = list_tables(&conn, dsidx)?;
    match detect_schema(&tables) {
        Some(IndexSchema::Standard) => read_standard(&conn, dsidx, docset_id),
        Some(IndexSchema::CoreData) => read_core_data(&conn, dsidx, docset_id),
        None => Err(IndexError::UnknownSchema {
            path: dsidx.to_path_buf(),
            tables,
        }),
    }
}

/// Tablas reales (`type = 'table'`; las vistas no cuentan).
fn list_tables(conn: &Connection, dsidx: &Path) -> Result<Vec<String>, IndexError> {
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .map_err(|source| IndexError::Query {
            path: dsidx.to_path_buf(),
            source,
        })?;
    let tables = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|source| IndexError::Query {
            path: dsidx.to_path_buf(),
            source,
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|source| IndexError::Query {
            path: dsidx.to_path_buf(),
            source,
        })?;
    Ok(tables)
}

/// `searchIndex` tiene prioridad si coexistiera con las tablas `Z*`.
fn detect_schema(tables: &[String]) -> Option<IndexSchema> {
    let set: HashSet<&str> = tables.iter().map(String::as_str).collect();
    if set.contains("searchIndex") {
        Some(IndexSchema::Standard)
    } else if ["ZTOKEN", "ZTOKENTYPE", "ZFILEPATH", "ZTOKENMETAINFORMATION"]
        .iter()
        .all(|t| set.contains(t))
    {
        Some(IndexSchema::CoreData)
    } else {
        None
    }
}

/// Esquema estándar: `searchIndex(id, name, type, path)`.
fn read_standard(
    conn: &Connection,
    dsidx: &Path,
    docset_id: &str,
) -> Result<IndexData, IndexError> {
    let mut stmt = conn
        .prepare("SELECT name, type, path FROM searchIndex ORDER BY rowid")
        .map_err(|source| IndexError::Query {
            path: dsidx.to_path_buf(),
            source,
        })?;
    let mut entries = Vec::new();
    let mut skipped_nulls = 0_u64;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|source| IndexError::Query {
            path: dsidx.to_path_buf(),
            source,
        })?;
    for row in rows {
        let (name, kind, path) = row.map_err(|source| IndexError::Query {
            path: dsidx.to_path_buf(),
            source,
        })?;
        match (name, kind, path) {
            (Some(name), Some(kind), Some(path)) => entries.push(Entry {
                docset_id: docset_id.to_string(),
                kind: normalize_kind(&kind),
                name,
                path,
            }),
            _ => skipped_nulls += 1,
        }
    }
    Ok(IndexData {
        schema: IndexSchema::Standard,
        entries,
        skipped_nulls,
    })
}

/// Esquema Core Data: `ZTOKEN` ⨝ `ZTOKENTYPE` ⨝ `ZTOKENMETAINFORMATION` ⨝
/// `ZFILEPATH`. `LEFT JOIN` para contar (no perder en silencio) los tokens
/// huérfanos; el ancla se reconstruye como `ruta#ancla`.
fn read_core_data(
    conn: &Connection,
    dsidx: &Path,
    docset_id: &str,
) -> Result<IndexData, IndexError> {
    let mut stmt = conn
        .prepare(
            "SELECT t.ZTOKENNAME, ty.ZTYPENAME, f.ZPATH, m.ZANCHOR \
             FROM ZTOKEN t \
             LEFT JOIN ZTOKENTYPE ty ON ty.Z_PK = t.ZTOKENTYPE \
             LEFT JOIN ZTOKENMETAINFORMATION m ON m.Z_PK = t.ZMETAINFORMATION \
             LEFT JOIN ZFILEPATH f ON f.Z_PK = m.ZFILE \
             ORDER BY t.Z_PK",
        )
        .map_err(|source| IndexError::Query {
            path: dsidx.to_path_buf(),
            source,
        })?;
    let mut entries = Vec::new();
    let mut skipped_nulls = 0_u64;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|source| IndexError::Query {
            path: dsidx.to_path_buf(),
            source,
        })?;
    for row in rows {
        let (name, kind, path, anchor) = row.map_err(|source| IndexError::Query {
            path: dsidx.to_path_buf(),
            source,
        })?;
        match (name, kind, path) {
            (Some(name), Some(kind), Some(path)) => {
                let full_path = match anchor {
                    Some(a) if !a.is_empty() => format!("{path}#{a}"),
                    _ => path,
                };
                entries.push(Entry {
                    docset_id: docset_id.to_string(),
                    kind: normalize_kind(&kind),
                    name,
                    path: full_path,
                });
            }
            _ => skipped_nulls += 1,
        }
    }
    Ok(IndexData {
        schema: IndexSchema::CoreData,
        entries,
        skipped_nulls,
    })
}

/// Normaliza el tipo a un conjunto coherente. Insensible a mayúsculas y
/// espacios; unas pocas abreviaturas genéricas (`func`, `meth`, `prop`,
/// `ctor`, `const`, `var`); vacío → `"Unknown"`; lo no reconocido se
/// conserva tal cual (p. ej. códigos estilo Apple como `cl` o `tdef`, cuyo
/// mapeo varía por docset).
pub fn normalize_kind(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::from("Unknown");
    }
    match trimmed.to_lowercase().as_str() {
        "class" => "Class",
        "struct" => "Struct",
        "union" => "Union",
        "enum" => "Enum",
        "protocol" => "Protocol",
        "interface" => "Interface",
        "trait" => "Trait",
        "category" => "Category",
        "function" | "func" => "Function",
        "method" | "meth" => "Method",
        "constructor" | "ctor" => "Constructor",
        "destructor" => "Destructor",
        "operator" => "Operator",
        "property" | "prop" => "Property",
        "constant" | "const" => "Constant",
        "variable" | "var" => "Variable",
        "macro" => "Macro",
        "typedef" => "Typedef",
        "namespace" => "Namespace",
        "module" => "Module",
        "guide" => "Guide",
        "section" => "Section",
        "page" => "Page",
        "file" => "File",
        _ => trimmed,
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Crea un `.dsidx` sintético con esquema estándar.
    fn make_standard_dsidx(dir: &Path) -> PathBuf {
        let path = dir.join("docSet.dsidx");
        let conn = Connection::open(&path).expect("crear dsidx");
        conn.execute_batch(
            "CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);
             INSERT INTO searchIndex(name, type, path) VALUES
               ('printf', 'Function', 'man/printf.html'),
               ('malloc', 'func', 'man/malloc.html'),
               ('Xyz', 'Doohickey', 'x/xyz.html'),
               ('SinTipo', '', 'x/sintipo.html'),
               (NULL, 'Guide', 'x/nulo.html'),
               ('SinRuta', 'Guide', NULL);",
        )
        .expect("poblar dsidx");
        drop(conn);
        path
    }

    #[test]
    fn standard_schema_reads_and_normalizes() {
        let dir = tempfile::tempdir().expect("tempdir");
        let dsidx = make_standard_dsidx(dir.path());

        let data = read_index(&dsidx, "test").expect("leer índice");
        assert_eq!(data.schema, IndexSchema::Standard);
        assert_eq!(data.skipped_nulls, 2);
        assert_eq!(data.entries.len(), 4);
        assert_eq!(data.entries[0].name, "printf");
        assert_eq!(data.entries[0].kind, "Function");
        assert_eq!(data.entries[0].path, "man/printf.html");
        assert_eq!(data.entries[0].docset_id, "test");
        assert_eq!(data.entries[1].kind, "Function"); // 'func' → Function
        assert_eq!(data.entries[2].kind, "Doohickey"); // original conservado
        assert_eq!(data.entries[3].kind, "Unknown"); // tipo vacío
    }

    #[test]
    fn unknown_schema_returns_clear_error() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("docSet.dsidx");
        let conn = Connection::open(&path).expect("crear dsidx");
        conn.execute_batch("CREATE TABLE otra_cosa(id INTEGER PRIMARY KEY);")
            .expect("poblar");
        drop(conn);

        let err = read_index(&path, "test").expect_err("debe fallar");
        match err {
            IndexError::UnknownSchema { tables, .. } => {
                assert_eq!(tables, vec![String::from("otra_cosa")]);
            }
            other => panic!("error inesperado: {other}"),
        }
    }

    #[test]
    fn missing_file_returns_unreadable() {
        let err = read_index(Path::new("no/existe.dsidx"), "test").expect_err("debe fallar");
        assert!(matches!(err, IndexError::Unreadable { .. }));
    }

    #[test]
    fn normalize_kind_cases() {
        assert_eq!(normalize_kind("Class"), "Class");
        assert_eq!(normalize_kind("CLASS"), "Class");
        assert_eq!(normalize_kind("  Method  "), "Method");
        assert_eq!(normalize_kind("meth"), "Method");
        assert_eq!(normalize_kind("WeirdType"), "WeirdType");
        assert_eq!(normalize_kind(""), "Unknown");
        assert_eq!(normalize_kind("   "), "Unknown");
    }

    /// Crea un `.dsidx` sintético mínimo con esquema Core Data: un token
    /// con ancla, uno sin ancla y una fila con nombre NULL.
    fn make_core_data_dsidx(dir: &Path) -> PathBuf {
        let path = dir.join("docSet.dsidx");
        let conn = Connection::open(&path).expect("crear dsidx");
        conn.execute_batch(
            "CREATE TABLE ZTOKEN(Z_PK INTEGER PRIMARY KEY, ZMETAINFORMATION INTEGER, ZTOKENTYPE INTEGER, ZTOKENNAME VARCHAR);
             CREATE TABLE ZTOKENTYPE(Z_PK INTEGER PRIMARY KEY, ZTYPENAME VARCHAR);
             CREATE TABLE ZFILEPATH(Z_PK INTEGER PRIMARY KEY, ZPATH VARCHAR);
             CREATE TABLE ZTOKENMETAINFORMATION(Z_PK INTEGER PRIMARY KEY, ZFILE INTEGER, ZANCHOR VARCHAR);
             INSERT INTO ZTOKENTYPE(Z_PK, ZTYPENAME) VALUES (1, 'Method'), (2, 'WeirdKind');
             INSERT INTO ZFILEPATH(Z_PK, ZPATH) VALUES (1, 'a/b.html');
             INSERT INTO ZTOKENMETAINFORMATION(Z_PK, ZFILE, ZANCHOR) VALUES (1, 1, 'frag'), (2, 1, NULL);
             INSERT INTO ZTOKEN(Z_PK, ZMETAINFORMATION, ZTOKENTYPE, ZTOKENNAME) VALUES
               (1, 1, 1, 'do_thing'),
               (2, 2, 2, 'otra'),
               (3, 2, 1, NULL);",
        )
        .expect("poblar dsidx");
        drop(conn);
        path
    }

    #[test]
    fn core_data_rebuilds_anchor_and_counts_nulls() {
        let dir = tempfile::tempdir().expect("tempdir");
        let dsidx = make_core_data_dsidx(dir.path());

        let data = read_index(&dsidx, "syn").expect("leer índice");
        assert_eq!(data.schema, IndexSchema::CoreData);
        assert_eq!(data.skipped_nulls, 1);
        assert_eq!(data.entries.len(), 2);
        assert_eq!(data.entries[0].path, "a/b.html#frag");
        assert_eq!(data.entries[0].kind, "Method");
        assert_eq!(data.entries[1].path, "a/b.html");
        assert_eq!(data.entries[1].kind, "WeirdKind");
    }

    /// Lee un fixture real y resume (nº entradas, tipos). Falla si el
    /// esquema detectado no es el esperado.
    fn read_fixture(dsidx: &str, id: &str, expected: IndexSchema) -> IndexData {
        let data = read_index(Path::new(dsidx), id).expect("leer índice real");
        assert_eq!(data.schema, expected);
        assert!(
            !data.entries.is_empty(),
            "el índice real debe tener entradas"
        );
        assert!(
            data.entries.iter().all(|e| !e.name.is_empty()),
            "sin nombres vacíos"
        );
        assert!(
            data.entries.iter().all(|e| !e.path.is_empty()),
            "sin rutas vacías"
        );
        assert!(
            data.entries.iter().all(|e| e.docset_id == id),
            "docset_id propagado"
        );
        data
    }

    fn kinds_of(data: &IndexData) -> Vec<&str> {
        let mut kinds: Vec<&str> = data.entries.iter().map(|e| e.kind.as_str()).collect();
        kinds.sort_unstable();
        kinds.dedup();
        kinds
    }

    #[test]
    fn real_css_index_is_core_data() {
        let data = read_fixture(
            "tests/fixtures/CSS.docset/Contents/Resources/docSet.dsidx",
            "css",
            IndexSchema::CoreData,
        );
        assert_eq!(data.entries.len(), 1249);
        assert_eq!(data.skipped_nulls, 0);
        let kinds = kinds_of(&data);
        for expected in ["Class", "Function", "Guide", "Property"] {
            assert!(kinds.contains(&expected), "falta tipo {expected}");
        }
        // Tipos propios de este docset que se conservan tal cual.
        for preserved in ["Element", "Keyword", "Type"] {
            assert!(kinds.contains(&preserved), "falta tipo {preserved}");
        }
    }

    #[test]
    fn real_cpp_index_is_core_data_despite_view() {
        // Este .dsidx trae además `CREATE VIEW searchIndex`: la detección
        // solo mira `type = 'table'`, así que debe salir CoreData.
        let data = read_fixture(
            "tests/fixtures/C++.docset/Contents/Resources/docSet.dsidx",
            "c++",
            IndexSchema::CoreData,
        );
        assert_eq!(data.entries.len(), 7225);
        assert_eq!(data.skipped_nulls, 0);
        let kinds = kinds_of(&data);
        for expected in ["Function", "Struct", "Guide"] {
            assert!(kinds.contains(&expected), "falta tipo {expected}");
        }
    }

    #[test]
    fn real_python_index_is_core_data() {
        let data = read_fixture(
            "tests/fixtures/Python_3.docset/Contents/Resources/docSet.dsidx",
            "python_3",
            IndexSchema::CoreData,
        );
        assert_eq!(data.entries.len(), 14695);
        assert_eq!(data.skipped_nulls, 0);
        let kinds = kinds_of(&data);
        for expected in ["Class", "Function", "Method"] {
            assert!(kinds.contains(&expected), "falta tipo {expected}");
        }
    }

    #[test]
    fn reading_does_not_create_files_next_to_docset() {
        let resources = Path::new("tests/fixtures/CSS.docset/Contents/Resources");
        let before = snapshot_names(resources);
        read_index(&resources.join("docSet.dsidx"), "css").expect("leer");
        assert_eq!(snapshot_names(resources), before);
    }

    /// Nombres de fichero ordenados de un directorio (solo tests).
    fn snapshot_names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .expect("leer dir")
            .map(|e| {
                e.expect("entrada")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        names.sort();
        names
    }

    #[test]
    fn real_index_read_is_fast() {
        let start = std::time::Instant::now();
        let css = read_index(
            Path::new("tests/fixtures/CSS.docset/Contents/Resources/docSet.dsidx"),
            "css",
        )
        .expect("leer css");
        let cpp = read_index(
            Path::new("tests/fixtures/C++.docset/Contents/Resources/docSet.dsidx"),
            "c++",
        )
        .expect("leer c++");
        let elapsed = start.elapsed();
        eprintln!(
            "índices reales: css={} + c++={} entradas en {elapsed:?}",
            css.entries.len(),
            cpp.entries.len()
        );
        assert!(
            elapsed.as_secs() < 5,
            "lectura demasiado lenta: {elapsed:?}"
        );
    }
}
