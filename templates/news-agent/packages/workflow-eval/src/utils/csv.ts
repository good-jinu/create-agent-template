import fs from "node:fs";

export function readCsvFile(filePath: string): string[][] {
	return parseCsv(fs.readFileSync(filePath, "utf8"));
}

export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let inQuotes = false;

	const pushCell = () => {
		row.push(cell);
		cell = "";
	};

	const pushRow = () => {
		// Skip a trailing empty row caused by a final newline.
		if (row.length === 1 && row[0] === "" && rows.length === 0) return;
		rows.push(row);
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		const next = text[i + 1];

		if (inQuotes) {
			if (char === '"') {
				if (next === '"') {
					cell += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				cell += char;
			}
			continue;
		}

		if (char === '"') {
			inQuotes = true;
			continue;
		}

		if (char === ",") {
			pushCell();
			continue;
		}

		if (char === "\n") {
			pushCell();
			pushRow();
			continue;
		}

		if (char === "\r") {
			continue;
		}

		cell += char;
	}

	pushCell();
	if (row.length > 1 || row[0] !== "") {
		pushRow();
	}

	return rows;
}

export function parseCsvObjects<T extends object>(rows: string[][]): T[] {
	if (rows.length === 0) return [];
	const [header, ...body] = rows;
	return body.map((row) => {
		const entry: Record<string, string> = {};
		header.forEach((key, index) => {
			entry[key] = row[index] ?? "";
		});
		return entry as T;
	});
}
