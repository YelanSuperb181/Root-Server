import { defineConfig } from "vite";

// Root loads the built client from client/dist; relative asset paths keep it
// working wherever Root serves it from.
export default defineConfig({
  base: "./",
  server: { open: true },
});
