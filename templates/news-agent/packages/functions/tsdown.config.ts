import { defineConfig } from "tsdown";

// Only firebase-admin and firebase-functions are provided by the Firebase runtime.
// Bundle everything else so Cloud Build's npm install doesn't need to resolve
// workspace:* deps or transitive dependencies of workspace packages.
const FIREBASE_RUNTIME_PACKAGES = /^(firebase-admin|firebase-functions)(\/|$)/;

export default defineConfig({
	entry: ["src/index.ts"],
	format: "esm",
	platform: "node",
	deps: {
		neverBundle: FIREBASE_RUNTIME_PACKAGES,
	},
	clean: true,
});
