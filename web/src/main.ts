import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import './styles/app.css';

// The app script was written against a global L (the vendored <script defer>);
// keep that contract until the module split.
(window as unknown as { L: typeof L }).L = L;

await import('./app.js');
