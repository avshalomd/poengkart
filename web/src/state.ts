/* The app's mutable state: every former top-level let of web/index.html,
   under its original name, so a reader of the old file finds it here. */
export const S = {
  lang: 'no' as any,
  DATA: null as any,
  map: null as any,
  markerLayer: null as any,
  MODEL: null as any,   // data/model.json — forecasts; optional
  myPoints: null as any,   // the reader's own points, or null
  showOld: false as any,   // show programme areas with no figures lately
  allLevels: false as any,   // show Vg2 and up as well; Vg1 alone is the default (levelScope)
  HOME: null as any,   // bounds of the whole dataset, the map's home view
  mapCat: 'all' as any,
  mapFylke: 'all' as any,
  current: null as any,   // selected school
  chart: undefined as any,
  _newestByFylke: null as any,
  choices: [] as any,
  choicesNote: null as any,   // why the last add was refused; rendered once
  pickNoteTimer: null as any,
  ptsBad: false as any,
  labelMarkers: undefined as any,
  mapFocusPending: 0 as any,   // when Enter zoomed into a cluster, for the focus to follow
  tileLayer: null as any,
  miniMap: null as any,
  miniMapRO: null as any,
  sideOpener: null as any,   // the marker or cluster that opened the panel, for Escape to return to
  sideReturn: null as any,   // a wish or the search button, for closing to return to
  sideClosing: false as any,   // a ✕ in flight: the next popstate is a CLOSE,
                               // whatever school the entry underneath names
  chanceMoreOpen: false as any,
  contactOpener: null as any,   // the control that opened the sheet; focus returns to it
  bugCtx: null as any,   // the snapshot, taken when a bug button was pressed
  DATA_STAMP: '' as any,   // schools.json's Last-Modified, when the server sends one
  sheetPushPending: false as any,   // openSheetHistory() called while closeSide's back() is in flight
  searchIx: null as any,
  ovAct: -1 as any,
  ovHits: [] as any,
  locLayer: null as any,
  locBtnEl: null as any,
  locBusy: false as any,
  view: 'map' as any,
  listSort: undefined as any,
  refitPending: false as any,   // a county switch made while the map was hidden
  calcGrades: {} as any,
};
