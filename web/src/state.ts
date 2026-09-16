/* The app's mutable state: every former top-level let of web/index.html,
   under its original name, so a reader of the old file finds it here. */
import type L from 'leaflet';
import type {
  BugContext, ChartState, Choice, Dataset, Lang, ListSort, Model, School, SearchHit, SideReturn, View,
} from './types';

export const S = {
  lang: 'no' as Lang,
  DATA: null as Dataset | null,
  map: null as L.Map | null,
  markerLayer: null as L.MarkerClusterGroup | null,
  MODEL: null as Model | null,   // data/model.json — forecasts; optional
  myPoints: null as number | null,   // the reader's own points, or null
  showOld: false,   // show programme areas with no figures lately
  allLevels: false,   // show Vg2 and up as well; Vg1 alone is the default (levelScope)
  HOME: null as L.LatLngBounds | null,   // bounds of the whole dataset, the map's home view
  mapCat: 'all' as string,
  mapFylke: 'all' as string,
  current: null as School | null,   // selected school
  // undefined until initHelpers() runs, which main.ts does before boot and every
  // test that touches the panel does in its beforeEach — so every read of
  // S.chart.prog is after the assignment, and the field is typed as what it is
  // from then on rather than forcing a guard at each of its fourteen readers
  chart: undefined as unknown as ChartState,
  _newestByFylke: null as Record<string, number> | null,
  choices: [] as Choice[],
  choicesNote: null as string | null,   // why the last add was refused; rendered once
  pickNoteTimer: null as ReturnType<typeof setTimeout> | null,
  ptsBad: false,
  labelMarkers: undefined as unknown as () => void,   // set by initMap(), then by every drawMarkers()
  mapFocusPending: 0,   // when Enter zoomed into a cluster, for the focus to follow
  tileLayer: null as L.TileLayer | null,
  miniMap: null as L.Map | null,
  miniMapRO: null as ResizeObserver | null,
  sideOpener: null as Element | null,   // the marker or cluster that opened the panel, for Escape to return to
  sideReturn: null as SideReturn | null,   // a wish or the search button, for closing to return to
  sideClosing: false,   // a ✕ in flight: the next popstate is a CLOSE,
                        // whatever school the entry underneath names
  chanceMoreOpen: false,
  contactOpener: null as HTMLElement | null,   // the control that opened the sheet; focus returns to it
  bugCtx: null as BugContext | null,   // the snapshot, taken when a bug button was pressed
  DATA_STAMP: '',   // schools.json's Last-Modified, when the server sends one
  sheetPushPending: false,   // openSheetHistory() called while closeSide's back() is in flight
  searchIx: null as { s: School; f: string }[] | null,
  ovAct: -1,
  ovHits: [] as SearchHit[],
  locLayer: null as L.LayerGroup | null,
  locBtnEl: null as HTMLElement | null,
  locBusy: false,
  view: 'map' as View,
  listSort: undefined as unknown as ListSort,   // set by initListview()
  refitPending: false,   // a county switch made while the map was hidden
  calcGrades: {} as Record<string, number>,
};
