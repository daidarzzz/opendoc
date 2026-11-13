// Serializes writes so an older session snapshot cannot overwrite a newer one.
// Saving starts after hydration. Pending writes coalesce, identical snapshots
// are skipped, and a failed write can be retried with the latest state.
import type { SessionData } from "./types";

/** Writes a serialized session snapshot through the supplied backend adapter. */
export type SessionWriter = (json: string) => Promise<unknown>;

export class SessionSaver {
  private hydrated = false;
  private pending: string | null = null;
  private writing = false;
  private lastSent = "";

  constructor(private readonly write: SessionWriter) {}

  /** La restauración terminó (o se decidió no restaurar): ya se puede guardar. */
  markHydrated(): void {
    this.hydrated = true;
  }

  get isHydrated(): boolean {
    return this.hydrated;
  }

  /** Pide guardar (debounced por el llamador). Sin hidratar no hace nada. */
  requestSave(snapshot: SessionData): void {
    if (!this.hydrated) return;
    const json = JSON.stringify(snapshot);
    if (json === this.lastSent) return;
    this.pending = json;
    void this.pump();
  }

  /** Vuelca lo pendiente y espera a que termine (cierre de ventana).
   *  Un fallo no reintenta en bucle: deja el pendiente para el próximo
   *  `requestSave`/`flush`. */
  async flush(): Promise<void> {
    if (!this.hydrated) return;
    for (;;) {
      if (!this.writing && this.pending === null) return;
      if (!this.writing) {
        await this.pump();
        if (this.pending !== null) return;
        continue;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  private async pump(): Promise<void> {
    if (this.writing) return;
    while (this.pending !== null) {
      const ok = await this.writeOne();
      if (!ok) return;
    }
  }

  private async writeOne(): Promise<boolean> {
    const json = this.pending;
    if (json === null) return true;
    this.pending = null;
    this.writing = true;
    try {
      await this.write(json);
      this.lastSent = json;
      return true;
    } catch {
      // Se conserva lo más nuevo: lo pendiente manda sobre lo fallido.
      if (this.pending === null) this.pending = json;
      return false;
    } finally {
      this.writing = false;
    }
  }
}
