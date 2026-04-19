import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/memory/index.chroma.ts",
		"src/memory/index.firestore.ts",
		"src/memory/index.lancedb.ts",
	],
	format: "esm",
	dts: true,
	clean: true,
});
