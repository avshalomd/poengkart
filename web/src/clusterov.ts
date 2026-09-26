import { bucketOf, chanceMode, pctS, schoolChance } from "./chance";
import { BINS, colorFor, esc, fmt, schoolPressure } from "./helpers";
import { t } from "./i18n";
import { hideSheet, openSheetHistory, setModalTrap, showSheet } from "./intro";
import { mapZoom, viewSchool } from "./map";
import { placeLabel } from "./places";
import { openSide } from "./sidebar";
import { S } from './state';
import type { School } from './types';

/* ================= a cluster's schools, as a list =================
   A tap on a cluster used to zoom only, and a small town's «2» said nothing
   about which two schools, or where. A cluster of up to CLUSTER_LIST schools
   now opens their names, places and figures; one of them opens its school,
   and «Vis på kartet» does what the tap used to (zoom in, or fan out). */
export const CLUSTER_LIST = 15;
let rows: School[] = [];
let onZoom: (() => void) | null = null;
let opener: HTMLElement | null = null;

export function openClusterOv(schools: School[], place: string | null, zoom: () => void, from?: HTMLElement) {
  rows = [...schools].sort((a, b) => a.name.localeCompare(b.name, 'no'));
  onZoom = zoom;
  opener = from || null;
  document.getElementById('clusterov-h')!.textContent = place ? t('clusterHeadIn', rows.length, place) : t('clusterHead', rows.length);
  document.getElementById('clusterov-x')!.setAttribute('aria-label', t('close'));
  const figure = (s: School) => {
    if (chanceMode()) {
      const sc = schoolChance(s, S.mapCat, S.myPoints);
      return sc ? `<span class="ch b-${bucketOf(sc.best)}" title="${esc(t('clusterBest'))}">${esc(pctS(sc.best))}</span>` : '';
    }
    const pr: any = schoolPressure(s, S.mapCat);
    if (pr.kind === 'open') return `<span class="chip open">${esc(t('listOpen'))}</span>`;
    if (pr.kind !== 'points') return '';
    const band = BINS.findIndex(b => pr.v < b.max);
    return `<span class="chip b${band}" style="background:${colorFor(pr.v)}" title="${esc(pr.year)}">${esc(fmt(pr.v))}</span>`;
  };
  document.getElementById('clusterov-body')!.innerHTML =
    `<div class="clist">` + rows.map((s, i) =>
      `<button type="button" class="crow" data-i="${i}"><span class="w"><span class="n">${esc(s.name)}</span>` +
      `<span class="p">${esc(placeLabel(s))}</span></span>${figure(s)}</button>`).join('') + `</div>` +
    `<button type="button" class="cta" id="clusterov-zoom">${esc(t('clusterZoom'))}</button>`;
  document.querySelectorAll('#clusterov .crow').forEach((b: any) => b.onclick = () => pickCluster(+b.dataset.i));
  document.getElementById('clusterov-zoom')!.onclick = () => {
    const z = onZoom;
    dismiss();
    // back on the cluster first: a fan-out hands focus on from the cluster
    // that held it (map.ts spider), and a zoom from a key finds it again
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    z?.();
  };
  showSheet('clusterov');
  setModalTrap();
  openSheetHistory();
  setTimeout(() => (document.querySelector('#clusterov .crow') as any)?.focus(), 40);
}
// out of the way at once, handing the sheet's history entry on, as a search
// hit does (pickOv): a Back must not reopen what the reader has left
function dismiss() {
  hideSheet('clusterov');
  setModalTrap();
  if ((history.state || {}).pkSheet) try { history.replaceState(null, '', location.href); } catch (e) {}
}
export function pickCluster(i: number) {
  const s = rows[i];
  if (!s) return;
  dismiss();
  if (s.lat && S.map && S.view === 'map') viewSchool(s, Math.max(mapZoom(), 10));
  openSide(s);
}
export function closeClusterOv(fromHistory?) {
  if (!fromHistory && (history.state || {}).pkSheet) { history.back(); return; }
  hideSheet('clusterov');
  setModalTrap();
  (opener && opener.isConnected && !opener.hidden ? opener : S.map?.getCanvas())?.focus({ preventScroll: true });
}
