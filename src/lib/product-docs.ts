import fs from 'fs';
import path from 'path';

export function getDocsDir(templateId: number): string {
  const base = process.env.PRODUCT_DOCS_DIR ?? './data/product-docs';
  return path.join(base, String(templateId));
}

export function getDocPath(templateId: number, docType: 'label' | 'sds'): string {
  return path.join(getDocsDir(templateId), `${docType}.pdf`);
}

export function ensureDocsDir(templateId: number): void {
  fs.mkdirSync(getDocsDir(templateId), { recursive: true });
}

export function docExists(templateId: number, docType: 'label' | 'sds'): boolean {
  try { fs.accessSync(getDocPath(templateId, docType)); return true; } catch { return false; }
}
