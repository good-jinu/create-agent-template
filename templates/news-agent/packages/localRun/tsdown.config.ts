import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/scraper.ts"],
	format: "esm",
	target: "node24",
	clean: true,
	dts: true,
});
