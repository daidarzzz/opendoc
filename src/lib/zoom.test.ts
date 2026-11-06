import { describe, expect, it } from "vitest";
import { clampZoom, formatZoom, zoomIn, zoomOut, ZOOM_MAX, ZOOM_MIN } from "./zoom";

describe("zoom", () => {
  it("sube y baja por pasos fijos", () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomIn(1.1)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomOut(0.9)).toBe(0.8);
  });

  it("niveles intermedios se ajustan al paso siguiente/anterior", () => {
    expect(zoomIn(1.05)).toBe(1.1);
    expect(zoomOut(1.05)).toBe(1);
  });

  it("respeta los topes", () => {
    expect(zoomIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomOut(ZOOM_MIN)).toBe(ZOOM_MIN);
  });

  it("valores rotos caen a 1 y se acotan", () => {
    expect(clampZoom("2")).toBe(1);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
  });

  it("formatea en porcentaje", () => {
    expect(formatZoom(1.25)).toBe("125%");
    expect(formatZoom(0.67)).toBe("67%");
  });
});
