import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	format: "esm",
	platform: "node",
	// firebase-admin and firebase-functions are provided by the Firebase runtime
	external: ["firebase-admin", "firebase-functions"],
	// bundle workspace packages into the output — Firebase can't resolve workspace:* deps
	noExternal: [/@code-insight\//],
	clean: true,
});
