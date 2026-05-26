// Set METRC_CSV_OUTPUT_DIR env var to control output path (default: ./Metrc-csv-uploads)

import fs from 'fs';
import path from 'path';

function getDateSlug(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export async function writeCsv(
  content: string,
  uploadType: string,
  outputDir: string = process.env.METRC_CSV_OUTPUT_DIR ?? './Metrc-csv-uploads',
): Promise<{ filePath: string; rowCount: number }> {
  const dateSlug = getDateSlug();
  const dir = path.join(outputDir, dateSlug);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const timestamp = Date.now();
  const filename = `${uploadType}-${timestamp}`;
  const tmpPath = path.join(dir, `${filename}.tmp`);
  const finalPath = path.join(dir, `${filename}.csv`);

  // Normalize line endings to CRLF, no BOM
  const normalized = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

  await fs.promises.writeFile(tmpPath, normalized, { encoding: 'utf8' });
  await fs.promises.rename(tmpPath, finalPath);

  // Count data rows (all non-empty lines except the header)
  const lines = normalized.split('\r\n').filter((l) => l.trim().length > 0);
  const rowCount = Math.max(0, lines.length - 1);

  return { filePath: finalPath, rowCount };
}
