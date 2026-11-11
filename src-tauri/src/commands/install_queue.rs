//! Cola de instalaciones del catálogo (lógica pura, sin Tauri).
//!
//! Antes el tope de descargas simultáneas contaba como "activas" también
//! las que esperaban hueco: con tres o más pedidas a la vez todas se
//! veían el cupo lleno y se esperaban entre sí para siempre. Aquí las
//! activas y las que esperan van por separado, y el orden es FIFO: solo
//! la primera de la cola puede arrancar cuando queda un hueco.

use std::collections::{HashSet, VecDeque};

/// Máximo de instalaciones simultáneas (feeds distintos) para no saturar
/// CPU, disco ni red. El resto espera en la cola.
pub const MAX_CONCURRENT_INSTALLS: usize = 2;

/// Instalaciones activas y en espera.
#[derive(Debug)]
pub struct InstallQueue {
    max: usize,
    active: HashSet<String>,
    waiting: VecDeque<String>,
}

impl Default for InstallQueue {
    fn default() -> Self {
        Self::new(MAX_CONCURRENT_INSTALLS)
    }
}

impl InstallQueue {
    /// Cola con `max` huecos (mínimo 1).
    pub fn new(max: usize) -> Self {
        Self {
            max: max.max(1),
            active: HashSet::new(),
            waiting: VecDeque::new(),
        }
    }

    /// Pone el feed al final de la cola (si no estaba ya, activo o no).
    pub fn enqueue(&mut self, id: &str) {
        if !self.active.contains(id) && !self.waiting.iter().any(|w| w == id) {
            self.waiting.push_back(id.to_string());
        }
    }

    /// Intenta arrancar el feed: solo si es el primero de la cola y queda
    /// hueco. Devuelve `true` si ya está (o pasa a estar) activo.
    pub fn try_start(&mut self, id: &str) -> bool {
        if self.active.contains(id) {
            return true;
        }
        if self.active.len() >= self.max || self.waiting.front().map(String::as_str) != Some(id) {
            return false;
        }
        self.waiting.pop_front();
        self.active.insert(id.to_string());
        true
    }

    /// ¿Sigue en la cola esperando turno?
    pub fn is_waiting(&self, id: &str) -> bool {
        self.waiting.iter().any(|w| w == id)
    }

    /// Saca de la cola un feed que aún no ha arrancado. Las activas no se
    /// tocan (la descarga ya está en marcha). `true` si estaba esperando.
    pub fn cancel(&mut self, id: &str) -> bool {
        let before = self.waiting.len();
        self.waiting.retain(|w| w != id);
        self.waiting.len() != before
    }

    /// Libera el feed en cualquier estado (termina, falla o se cancela).
    pub fn finish(&mut self, id: &str) {
        self.active.remove(id);
        self.waiting.retain(|w| w != id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Simula varios feeds sondeando a la vez hasta que no avanza nada.
    fn run_until_stable(q: &mut InstallQueue, ids: &[&str]) -> Vec<String> {
        let mut started = Vec::new();
        loop {
            let mut progressed = false;
            for id in ids {
                if q.is_waiting(id) && q.try_start(id) {
                    started.push((*id).to_string());
                    progressed = true;
                }
            }
            if !progressed {
                return started;
            }
        }
    }

    #[test]
    fn varias_a_la_vez_no_se_bloquean_entre_si() {
        // El fallo original: 4 pedidas a la vez y ninguna arrancaba.
        let mut q = InstallQueue::new(2);
        let ids = ["a", "b", "c", "d"];
        for id in ids {
            q.enqueue(id);
        }
        assert_eq!(run_until_stable(&mut q, &ids), ["a", "b"]);
        q.finish("a");
        assert_eq!(run_until_stable(&mut q, &ids), ["c"]);
        q.finish("b");
        q.finish("c");
        assert_eq!(run_until_stable(&mut q, &ids), ["d"]);
        q.finish("d");
        assert!(ids.iter().all(|id| !q.is_waiting(id)));
    }

    #[test]
    fn respeta_el_orden_de_llegada() {
        let mut q = InstallQueue::new(1);
        q.enqueue("a");
        q.enqueue("b");
        q.enqueue("c");
        assert!(!q.try_start("c"), "c no se cuela");
        assert!(!q.try_start("b"));
        assert!(q.try_start("a"));
        assert!(!q.try_start("b"), "sin hueco");
        q.finish("a");
        assert!(!q.try_start("c"), "b va antes");
        assert!(q.try_start("b"));
    }

    #[test]
    fn cancelar_solo_quita_las_que_esperan() {
        let mut q = InstallQueue::new(1);
        q.enqueue("a");
        q.enqueue("b");
        assert!(q.try_start("a"));
        assert!(!q.cancel("a"), "la activa sigue");
        assert!(q.cancel("b"));
        assert!(!q.is_waiting("b"));
        assert!(!q.cancel("b"));
        q.finish("a");
        q.enqueue("c");
        assert!(q.try_start("c"), "la cancelada no deja hueco ocupado");
    }

    #[test]
    fn cancelar_la_primera_deja_pasar_a_la_siguiente() {
        let mut q = InstallQueue::new(1);
        q.enqueue("a");
        q.enqueue("b");
        q.enqueue("c");
        assert!(q.try_start("a"));
        assert!(q.cancel("b"));
        q.finish("a");
        assert!(q.try_start("c"));
    }

    #[test]
    fn duplicados_y_minimo_de_un_hueco() {
        let mut q = InstallQueue::new(0);
        q.enqueue("a");
        q.enqueue("a");
        assert!(q.try_start("a"));
        q.enqueue("a");
        assert!(!q.is_waiting("a"), "activa: no se vuelve a encolar");
        q.finish("a");
        assert!(!q.is_waiting("a"));
    }
}
