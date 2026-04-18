import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	format: "esm",
	platform: "node",
	noExternal: [/@code-insight\//],
	clean: true,
});
