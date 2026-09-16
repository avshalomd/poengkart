import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach } from 'vitest';

// happy-dom replaces the global URL with its own, which resolves a relative
// URL against the environment's window.location rather than the base passed
// in — `new URL('../index.html', import.meta.url)` silently became
// http://localhost:3000/index.html instead of a file:// path. Node's own
// url/path modules sidestep that.
const here = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(here, '../index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));

beforeEach(() => {
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
  localStorage.clear();
  (window as any).performance.mark ??= () => {};
  (SVGElement.prototype as any).getBBox ??= () => ({ x: 0, y: 0, width: 100, height: 20 });
});
