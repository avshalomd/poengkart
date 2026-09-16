/**
 * One-off: split web/src/app.js along its region markers into web/src/*.ts,
 * hoist every top-level let/var into S (web/src/state.ts), and move top-level
 * statements into per-module init() functions. Idempotence is not a goal;
 * run once, review, commit.
 *
 * The one deviation from a naive ts-morph script: every reference rewrite and
 * every statement removal is collected first and applied to the source TEXT in
 * a single descending pass, rather than mutating the AST node by node. A
 * 4 000-line file re-parsed once per replacement is minutes of work and leaves
 * the language service rebuilding between every edit; one text pass is seconds
 * cannot drift. Each statement also carries its own leading trivia and its
 * same-line trailing comment with it, so the authored comments land in the
 * module their code lands in.
 */
import { Project, Node, VariableDeclarationKind, type Statement } from 'ts-morph';
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';

const REGIONS: [RegExp, string][] = [
  [/^\/\* =+ i18n/, 'i18n'], [/^\/\* =+ state & helpers/, 'helpers'], [/^\/\* =+ chance of a place/, 'chance'],
  [/^\/\* =+ map /, 'map'], [/^\/\* =+ static chrome/, 'chrome'], [/^\/\* =+ sidebar/, 'sidebar'],
  [/^\/\* =+ chart/, 'chart'], [/^\/\* =+ program list/, 'programs'], [/^\/\* =+ feedback/, 'feedback'],
  [/^\/\* =+ tooltips/, 'tips'], [/^\/\* =+ intro \/ help/, 'intro'], [/^\/\* =+ preferences/, 'prefs'],
  [/^\/\* =+ school search/, 'search'], [/^\/\* =+ search overlay/, 'searchov'], [/^\/\* =+ geolocation/, 'locate'],
  [/^\/\* =+ list view/, 'listview'], [/^\/\* =+ grade calculator/, 'calc'], [/^\/\* =+ language/, 'lang'],
  [/^\/\* =+ boot/, 'boot'],
];
const SRC = 'web/src/app.js';

/** A statement owns the text from the end of the statement before it up to and
 *  including its own same-line trailing comment: leading blank lines, the
 *  comment block written above it, the code, the `// note` after the semicolon. */
function chunkEnd(text: string, from: number): number {
  const m = /^[^\S\n]*(?:\/\/[^\n]*)?\n/.exec(text.slice(from));
  return m ? from + m[0].length : from;
}

/** Which region each top-level statement belongs to: walk the leading comments
 *  of every statement, a region marker starts a new bucket. */
function bucketize(statements: Statement[]): Map<string, Statement[]> {
  const buckets = new Map<string, Statement[]>(REGIONS.map(([, n]) => [n, []]));
  let region = 'i18n';
  for (const st of statements) {
    for (const c of st.getLeadingCommentRanges()) {
      const hit = REGIONS.find(([re]) => re.test(c.getText()));
      if (hit) region = hit[1];
    }
    buckets.get(region)!.push(st);
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// 1. Read the file and work out which region owns each statement.
const pass1 = new Project({ tsConfigFilePath: 'tsconfig.json', skipAddingFilesFromTsConfig: true });
const src = pass1.addSourceFileAtPath(SRC);
const text = src.getFullText();
const regionOf = new Map<Statement, string>();
for (const [name, list] of bucketize(src.getStatements())) for (const st of list) regionOf.set(st, name);

// 2. Every top-level let/var becomes a field of S; every reference to it
//    becomes S.<name>. Collected here, applied to the text below.
type Field = { name: string; init: string; region: string; note: string };
type Edit = { pos: number; end: number; text: string };
const fields: Field[] = [];
const edits: Edit[] = [];
for (const st of src.getStatements()) {
  if (!Node.isVariableStatement(st)) continue;
  if (st.getDeclarationKind() === VariableDeclarationKind.Const) continue;
  const decls = st.getDeclarations();
  // `let allLevels = false;   // Vg1 alone is the default` — the note belongs
  // with the field, and the field is about to move to another file
  const trail = /^[^\S\n]*(\/\/[^\n]*)\n/.exec(text.slice(st.getEnd()));
  for (const d of decls) {
    const name = d.getName();
    fields.push({
      name,
      init: d.getInitializer()?.getText() ?? 'undefined',
      region: regionOf.get(st) ?? 'helpers',
      note: decls.length === 1 && trail ? trail[1] : '',
    });
    for (const ref of d.findReferencesAsNodes()) {
      if (ref === d.getNameNode()) continue;
      const parent = ref.getParent();
      if (Node.isShorthandPropertyAssignment(parent))
        edits.push({ pos: parent.getStart(), end: parent.getEnd(), text: `${name}: S.${name}` });
      else edits.push({ pos: ref.getStart(), end: ref.getEnd(), text: `S.${name}` });
    }
  }
  // the declaration goes, its leading comment block stays with the code below it
  edits.push({ pos: st.getStart(), end: chunkEnd(text, st.getEnd()), text: '' });
}

// 3. Apply the edits, back to front, and emit state.ts. Initialisers that are
//    plain literals stay in the field; anything else is set in the owning
//    module's init() at its original place.
let out = text;
for (const e of [...edits].sort((a, b) => b.pos - a.pos)) out = out.slice(0, e.pos) + e.text + out.slice(e.end);

const literal = (s: string) => /^(['"`].*['"`]|-?\d+(\.\d+)?|true|false|null|undefined|\[\]|\{\})$/s.test(s.trim());
const deferred = new Map<string, string[]>();
const stateLines = fields.map(f => {
  const note = f.note ? '   ' + f.note : '';
  if (literal(f.init)) return `  ${f.name}: ${f.init} as any,${note}`;
  deferred.set(f.region, [...(deferred.get(f.region) ?? []), `  S.${f.name} = ${f.init};${note}\n`]);
  return `  ${f.name}: undefined as any,${note}`;
});
mkdirSync('web/src', { recursive: true });
writeFileSync('web/src/state.ts', `/* The app's mutable state: every former top-level let of web/index.html,
   under its original name, so a reader of the old file finds it here. */
export const S = {
${stateLines.join('\n')}
};
`);

// 4. Emit one module per region: exports for declarations, init() for the rest.
const pass2 = new Project({ useInMemoryFileSystem: true });
const cut = pass2.createSourceFile('app.js', out);
const cutText = cut.getFullText();
const modules = new Map<string, string>();
for (const [name, list] of bucketize(cut.getStatements())) {
  const decl: string[] = [], body: string[] = [];
  let at = list.length ? list[0].getFullStart() : 0;
  for (const st of list) {
    const end = chunkEnd(cutText, st.getEnd());
    const lead = cutText.slice(at, st.getStart()), code = cutText.slice(st.getStart(), end);
    at = end;
    if (Node.isFunctionDeclaration(st) || Node.isVariableStatement(st) || Node.isClassDeclaration(st))
      decl.push(lead + 'export ' + code);
    else body.push((lead + code).replace(/^(?=[^\n])/gm, '  '));
  }
  const initName = 'init' + name[0].toUpperCase() + name.slice(1);
  const init = [...(deferred.get(name) ?? []), ...body];
  const head = `import { S } from './state';\n`
    + (/\bL\./.test(decl.join('') + init.join('')) ? `import L from 'leaflet';\n` : '');
  modules.set(name, `${head}${decl.join('').replace(/^\n+/, '\n')}\nexport function ${initName}() {\n${init.join('')}}\n`);
}
for (const [name, text] of modules) writeFileSync(`web/src/${name}.ts`, text);
unlinkSync(SRC);

// 5. Resolve cross-module imports with the compiler.
const pass3 = new Project({ tsConfigFilePath: 'tsconfig.json' });
for (const f of pass3.getSourceFiles('web/src/*.ts')) {
  if (f.getBaseName() === 'main.ts') continue;   // rewritten by hand, step 4 of the brief
  f.fixMissingImports();
  f.organizeImports();
}
pass3.saveSync();
console.log('modules:', [...modules.keys()].join(' '));
console.log('state fields:', fields.map(f => f.name).join(' '));
console.log('deferred:', [...deferred].map(([r, l]) => `${r}(${l.length})`).join(' '));
