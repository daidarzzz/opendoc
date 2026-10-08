import { defineConfig } from "vitest/config";

// Runner de tests del frontend (lógica pura: tabHistory, iframeMessages…).
// Sin plugins ni jsdom: solo node. El cableado al CI queda como siguiente.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
