import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import { exposeGlobals } from '../src/globals';
import { S } from '../src/state';

// see fixtures.ts / setup.ts: happy-dom's global URL does not resolve a
// relative URL against import.meta.url the way Node's does, so files are
// located via node:path/node:url rather than `new URL(p, import.meta.url)`.
const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '../src');

// A ReservedWord ("if", "for", …) can be the leading token of a guarded call
// — `onclick="if (event.target === this) closeContact()"` appears five times
// in shell.html, once per sheet's backdrop — but it is not an Identifier and
// nothing needs it to be a window global; the same helper it guards is pinned
// separately wherever that sheet's own close button calls it unconditionally.
const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'return']);

// Every file an inline `on*="…"` handler can appear in: the shell partial and
// the layout, and every module, since boot.ts, feedback.ts, intro.ts,
// listview.ts and sidebar.ts all write the same kind of attribute into HTML
// they generate.
function sourceFiles(): string[] {
  const srcTs = readdirSync(srcDir).filter(f => f.endsWith('.ts')).map(f => path.join(srcDir, f));
  return [path.join(here, '../src/shell.html'), path.join(here, '../src/layouts/Base.astro'), ...srcTs];
}

// The contract: every leading identifier of every statement inside every
// inline handler attribute, because an inline handler runs in global scope
// and can only see `window` — a name that is not a window property throws
// ReferenceError the moment the handler runs, silently (finding F1).
function deriveNames(): string[] {
  const names = new Set<string>();
  for (const file of sourceFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\bon[a-z]+="([^"]*)"/g)) {
      for (const statement of match[1].split(';')) {
        const id = /^\s*([A-Za-z_$][\w$]*)/.exec(statement)?.[1];
        if (id && !KEYWORDS.has(id)) names.add(id);
      }
    }
  }
  return [...names].sort();
}

const names = deriveNames();

describe('the window contract the inline handlers rely on', () => {
  it('the derivation itself finds real handlers, not an empty regex', () => {
    expect(names).toEqual(expect.arrayContaining([
      'setView', 'onPoints', 'openBug', 'onMapFylke', 'switchToContact',
      'contactOpener', 'chanceMoreOpen', 'sortList', 'closeSide', 'location',
    ]));
    expect(names.length).toBeGreaterThan(15);
  });

  describe('after exposeGlobals()', () => {
    beforeEach(() => {
      exposeGlobals();
    });

    it('every name an inline handler leads with is a window property', () => {
      const w = window as any;
      for (const name of names) {
        expect(typeof w[name], name).not.toBe('undefined');
      }
    });

    it('writes and reads through to state, for the handlers that assign a field', () => {
      const w = window as any;
      // ontoggle="chanceMoreOpen = this.open"
      w.chanceMoreOpen = true;
      expect(S.chanceMoreOpen).toBe(true);
      // onclick="contactOpener = this; …"
      w.contactOpener = document.body;
      expect(S.contactOpener).toBe(document.body);
      // the read direction of the same accessor
      S.myPoints = 77;
      expect(w.myPoints).toBe(77);
    });

    it('the accessor wins over the element the id names (ledger Ruling 10)', () => {
      const w = window as any;
      expect(w.choices).toBe(S.choices);
      expect(w.map).toBe(S.map);
    });
  });
});
