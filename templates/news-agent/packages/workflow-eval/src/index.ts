import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_WORKFLOW_EVAL_CASES } from "./cases/definitions";
import { DEFAULT_WORKFLOW_EVAL_CONFIG } from "./config";
import { runWorkflowEvalSuite } from "./runner";

async function main(): Promise<void> {
	console.log(
		`[workflow-eval] provider=${DEFAULT_WORKFLOW_EVAL_CONFIG.provider} cases=${DEFAULT_WORKFLOW_EVAL_CASES.length}`,
	);

	const report = await runWorkflowEvalSuite(
		DEFAULT_WORKFLOW_EVAL_CONFIG,
		DEFAULT_WORKFLOW_EVAL_CASES,
	);

	console.log(JSON.stringify(report, null, 2));
	const reportPath = writeReport(report);
	console.log(`[workflow-eval] saved report to ${reportPath}`);
}

main().catch((error) => {
	console.error("[workflow-eval] failed:", error);
	process.exitCode = 1;
});

function writeReport(report: unknown): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const packageRoot = path.resolve(here, "..");
	const repoRoot = path.resolve(packageRoot, "..", "..");
	const resultDir = path.join(repoRoot, "result");
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const filePath = path.join(resultDir, `workflow-eval-${timestamp}.json`);

	fs.mkdirSync(resultDir, { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

	return filePath;
}
