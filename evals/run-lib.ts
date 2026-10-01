/* The eval's deterministic graders, apart from the runner so unit tests can
   hold them to account (a wrong grader makes every score a lie). */

export function detectLang(text: string): 'no' | 'en' {
  const no = (text.match(/\b(og|jeg|du|er|ikke|på|med|det|som|har|kan|til|en|et|skole|sjanse|deg|din|dine|vil|må)\b/gi) || []).length
    + (text.match(/[æøå]/gi) || []).length * 0.3;
  const en = (text.match(/\b(the|and|you|is|not|your|with|that|can|have|school|chance|are|would|she|he|her|his|this)\b/gi) || []).length;
  return no >= en ? 'no' : 'en';
}

const num = (s: string) => parseFloat(s.replace(/\s/g, '').replace(',', '.'));
/** The figures an answer states: decimals (46,4 · 4.64) and percentages (34 %). */
export function figuresIn(text: string) {
  const out: { raw: string; v: number; pct: boolean }[] = [];
  // a phone number (116 111, 800 333 21) and a date or year are not figures
  const clean = text.replace(/\b\d{3} ?\d{2,3}( ?\d{2})?\b/g, ' ').replace(/\b(19|20)\d{2}(\/\d{2})?\b/g, ' ');
  for (const m of clean.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s?%|(?<![\d.,])(\d{1,2}[.,]\d{1,2})(?![\d.,]*\d)/g)) {
    if (m[1]) out.push({ raw: m[0], v: num(m[1]), pct: true });
    else out.push({ raw: m[0], v: num(m[2]), pct: false });
  }
  return out;
}
export function ungrounded(text: string, sources: string[]) {
  const pool = new Set<number>();
  for (const src of sources) for (const m of src.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const v = num(m[0]);
    for (const x of [v, v / 10, v * 10, v / 100, v * 100]) pool.add(Math.round(x * 100) / 100);
  }
  for (const c of [70, 35, 95, 100, 50]) pool.add(c);
  const near = (v: number, tol: number) => [...pool].some(p => Math.abs(p - v) <= tol);
  return figuresIn(text).filter(f => !near(f.v, f.pct ? 1 : 0.051)).map(f => f.raw);
}
