/* The data contract, and the ambient declarations for the globals the app
   touches but does not own.

   Everything below is written from the two generated files themselves —
   web/public/data/schools.json and web/public/data/model.json, read with the
   script in the task brief — and not from memory. The rule that decided every
   `?`: a key that is present on every record is required, a key missing from
   even one record is optional. The counts behind each decision are in
   .superpowers/sdd/2026-09-16-rebuild-stage-1-2/task-7-report.md. */

/** One (school, programområde, year) cell. The tokens are the counties' own
    states (CONTEXT.md, "Cell states"): a number is the poenggrense. Only these
    four strings occur in the data — 'open', 'F', 'D' and 'U'. */
export type CellValue = number | 'open' | 'F' | 'D' | 'U';
/** The five values `level` actually takes. 'Vg2/Vg3' is a joined series a
    county publishes as one row; 'Vg4' is the fourth year of a few programmes. */
export type Level = 'Vg1' | 'Vg2' | 'Vg3' | 'Vg4' | 'Vg2/Vg3';

export interface Program {
  program: string;
  program_en: string;
  level: Level;
  /** Udir's two-letter utdanningsprogram code; the keys of CATS in i18n.ts. */
  category: string;
  /** year (as a four-digit string) → the county's published cell */
  values: Record<string, CellValue>;
  grep?: string;
  /** the county's earlier intake, where it publishes more than one round */
  values_r1?: Record<string, CellValue>;
  values_r3?: Record<string, CellValue>;
  means?: Record<string, number>;
  /** former labels for the same series, so a stored wish can be re-keyed */
  aliases?: string[];
  official?: string;
}

export interface School {
  name: string;
  fylke: string;
  fylkesnummer: string;
  /** the intake round the figures are from; null where the county is silent */
  round: string | null;
  programs: Program[];
  nsr_name: string;
  lat: number;
  lon: number;
  catchment?: boolean;
  orgnr?: string;
  url?: string;
  address?: string;
  inntaksregion?: string;
  photo?: string;
  photo_source?: string;
  photo_page?: string;
  photo_credit?: string;
  photo_license?: string;
  photo_position?: string;
  photo_note?: string;
  wiki_url?: string;
  wiki_extract?: string;
  merged_from?: string[];
  merged_year?: number;
  uncertain_years?: number[];
  /** Not in the JSON: progKeyMap() caches each programme's wish key on the
      school object it built it from (chance.ts). */
  _pk?: Map<Program, string>;
}

export interface County {
  code: string;
  fylke: string;
  round: string | null;
  rights: string;
  free_choice: boolean;
  source: string;
  /** how many of this county's schools the dataset carries */
  schools: number;
  levels?: string;
  also_publishes?: string;
  round_note?: string;
  source_file?: string;
  note?: string;
  /** year → round, for the years whose figures come from another round than
      the county's usual one (tools/build_dataset.py writes it only when the
      county has such a year, and none does in the current build). */
  round_years?: Record<string, string>;
}

export interface Dataset {
  counties: County[];
  schools: School[];
  years: number[];
}

/* ---- model.json (tools/model.py) ---- */

/** One programme's forecast for the county's next publication year:
    m = expected threshold, s = its backtest error, pi = P(a queue forms),
    h = how many published years it was fitted on. */
/** j: the step between the series' two newest figures, present only when it
    is larger than meta.jump_points (tools/model.py); its spread s already
    carries meta.sigma_jump_multiplier */
export interface Forecast { m: number; s: number; pi: number; h: number; j?: number }

/** What the county's final round did to its published round, measured on the
    county's own pairs (meta.round_bridge). */
export interface RoundBridge {
  fylke: string;
  from_round: string;
  to_round: string;
  n_pairs: number;
  mean: number;
  sd: number;
  n_had_queue: number;
  n_vanished: number;
  share_vanished: number;
  by_category?: Record<string, { n: number; mean: number; n_had_queue: number; share_vanished: number }>;
}

/** The meta block carries thirty keys; the ones the app reads are named, the
    rest stay `unknown` under the index signature. */
export interface ModelMeta {
  error_quantiles?: number[];
  round_bridge?: Record<string, RoundBridge>;
  sigma_forecast?: Record<string, number>;
  sigma_level_multiplier?: Record<string, number>;
  sigma_group_multiplier?: Record<string, number>;
  sigma_jump_multiplier?: Record<string, number>;
  jump_points?: number;
  backtest_eval_years?: {
    coverage80?: number;
    /** the same scores for Vg1 and for Vg2 and up (tools/model.py, LEVEL_GROUPS) */
    by_level?: { level: string; n: number; coverage80: number; rmse: number; [k: string]: unknown }[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/** Keyed "Fylke|Skolenavn". alpha and programs are absent for the schools the
    fit had too little to say about (9 and 8 of 228 in the build of 17 September 2026). */
export interface ModelSchool {
  year: number;
  round: string | null;
  alpha?: number;
  alpha_se?: number;
  alpha_n?: number;
  alpha_rank?: number;
  /** a county the model holds out (meta.held_out): these forecasts come from
      the county's own figures alone, off the finished fit, and are never
      scored (Satellite in tools/model.py) */
  held_out?: boolean;
  /** programme key (chance.ts progKeyMap) → its forecast */
  programs?: Record<string, Forecast>;
}

export interface Model {
  meta: ModelMeta;
  schools: Record<string, ModelSchool>;
}

/* ---- the app's own shapes ---- */

export type Lang = 'no' | 'en';
export type Band = 'likely' | 'possible' | 'unlikely';
export type View = 'map' | 'list';

/** theme, text size and the colour-blind palette (prefs.ts PREFS). */
export interface Prefs {
  theme: 'auto' | 'light' | 'dark';
  font: 'n' | 'lg' | 'xl';
  cvd: boolean;
}

/** One of the reader's wishes as it is stored: county, school and programme
    key, all strings, so a stored list survives a refresh (chance.ts okChoice). */
export interface Choice { f: string; s: string; k: string }

/** Which programme-area row the school panel's chart is showing. */
/** The school sheet's own state. `cat` is the utdanningsprogram the sheet's
    tabs and headings chose, or null while it follows the map's filter. */
export interface ChartState { prog: Program | null; cat: string | null }

/** The List view's sort: which column, and which way. */
export interface ListSort { key: string; dir: number }

/** A row in the search overlay: one of the school hits, or the single county
    row above them — renderOvList reads `county` first and the school's own
    fields otherwise. */
export interface SearchHit extends Partial<School> { county?: string }

/** Where closeSide() sends focus back to: a control by id, or the wish whose
    aria-label names it. */
export interface SideReturn { id?: string; who?: string | null }

/** The bug report's snapshot (feedback.ts bugContext); `rows` is the only
    field that is a list. */
export type BugContext = Record<string, string | string[]>;


declare global {
  interface Window {
    /* `va` is Vercel Analytics: the page loads it from /_vercel/insights, so it
       may or may not be there, and the two call sites already guard on that. */
    va?: (...a: any[]) => void;
  }
  /* the maplibre-gl version the build vendored under /maplibre/<v>/ (astro.config.mjs `define`) */
  const __MAPLIBRE_VER__: string;
}

export {};
