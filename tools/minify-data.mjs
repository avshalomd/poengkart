// Minifies the data files in the built site. The repo keeps them indented
// (indent=1) so a data commit reads as a diff, but readers download them:
// indented, schools.json reached the browser as 182 KB of brotli, minified
// about 150 KB (7 Oct 2026). Same JSON, same values; only whitespace goes.
// npm runs it after `build`; a missing file is skipped.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web/dist/data');
for (const name of ['schools.json', 'model.json']) {
  const file = path.join(DATA, name);
  if (!existsSync(file)) continue;
  const before = readFileSync(file);
  const after = JSON.stringify(JSON.parse(before.toString('utf8')));
  writeFileSync(file, after);
  console.log(`minify-data: ${name} ${(before.length / 1024) | 0} KB -> ${(Buffer.byteLength(after) / 1024) | 0} KB`);
}
