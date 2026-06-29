/**
 * Regenerate homepage images from lab-profile.pdf.
 * Run from repo root: node backend/src/scripts/extract-brochure-images.js
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, '../backend/src/scripts/extract-brochure-images.js');
const r = spawnSync(process.execPath, [script], { stdio: 'inherit' });
process.exit(r.status ?? 1);
