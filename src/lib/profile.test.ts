import { describe, expect, it, vi } from "vitest";
import { isProfileEnabled, pmark, setProfileEnabled } from "./profile";

describe("profile", () => {
  it("apagado por defecto y sin ruido", () => {
    setProfileEnabled(false);
    expect(isProfileEnabled()).toBe(false);
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    try {
      pmark("algo", { a: 1 });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      setProfileEnabled(false);
    }
  });

  it("encendido escribe una línea", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    try {
      setProfileEnabled(true);
      expect(isProfileEnabled()).toBe(true);
      pmark("hito", { ms: 3 });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain("[profile] hito");
    } finally {
      spy.mockRestore();
      setProfileEnabled(false);
    }
  });
});
