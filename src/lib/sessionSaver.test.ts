import { describe, expect, it, vi } from "vitest";
import { SessionSaver } from "./sessionSaver";
import type { SessionData } from "./types";

function data(n: number): SessionData {
  return { version: 1, tabs: [], active: n };
}

describe("SessionSaver", () => {
  it("no guarda nada antes de hidratar", async () => {
    const write = vi.fn(async (_json: string) => {});
    const saver = new SessionSaver(write);
    saver.requestSave(data(1));
    await saver.flush();
    await new Promise((r) => setTimeout(r, 20));
    expect(write).not.toHaveBeenCalled();
    saver.markHydrated();
    saver.requestSave(data(1));
    await saver.flush();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("fusiona pendientes y escribe solo el último, sin solapes", async () => {
    const seen: string[] = [];
    let inFlight = 0;
    let maxFlight = 0;
    const write = vi.fn(async (json: string) => {
      inFlight += 1;
      maxFlight = Math.max(maxFlight, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      seen.push(json);
      inFlight -= 1;
    });
    const saver = new SessionSaver(write);
    saver.markHydrated();
    saver.requestSave(data(1));
    saver.requestSave(data(2));
    saver.requestSave(data(3));
    await saver.flush();
    expect(maxFlight).toBe(1);
    expect(seen).toHaveLength(2);
    expect(seen[seen.length - 1]).toBe(JSON.stringify(data(3)));
  });

  it("no reescribe si el contenido no cambió", async () => {
    const write = vi.fn(async (_json: string) => {});
    const saver = new SessionSaver(write);
    saver.markHydrated();
    saver.requestSave(data(1));
    await saver.flush();
    saver.requestSave(data(1));
    await saver.flush();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("un fallo conserva el pendiente para el próximo intento", async () => {
    let fail = true;
    const seen: string[] = [];
    const saver = new SessionSaver(async (json: string) => {
      if (fail) throw new Error("disco lleno");
      seen.push(json);
    });
    saver.markHydrated();
    saver.requestSave(data(1));
    await saver.flush();
    expect(seen).toHaveLength(0);
    fail = false;
    saver.requestSave(data(1));
    await saver.flush();
    expect(seen).toHaveLength(1);
  });

  it("flush espera a la escritura en curso", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const seen: string[] = [];
    const saver = new SessionSaver(async (json: string) => {
      await gate;
      seen.push(json);
    });
    saver.markHydrated();
    saver.requestSave(data(5));
    const flushing = saver.flush();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toHaveLength(0);
    release();
    await flushing;
    expect(seen).toHaveLength(1);
  });
});
