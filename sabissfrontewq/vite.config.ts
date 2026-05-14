import { defineConfig } from "vite";
import { nitroV2Plugin as nitro } from "@solidjs/vite-plugin-nitro-2";

import { solidStart } from "@solidjs/start/config";

const nitroPreset = process.env.NITRO_PRESET ?? "node-server";

export default defineConfig({
  plugins: [solidStart(), nitro({ preset: nitroPreset })]
});
