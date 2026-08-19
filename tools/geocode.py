#!/usr/bin/env python3
"""Attach coordinates to the parsed schools via NSR (Nasjonalt skoleregister).

NSR's list API has no server-side filters, so we page through all units once,
keep active upper-secondary schools in Rogaland (fylke 11), fetch each one's
detail record for coordinates, and fuzzy-match against our school names.
Writes web/data/schools.json in place (adds lat/lon/orgnr per school).
"""

import json
import os
import re
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
CACHE = os.path.join(HERE, 'nsr-rogaland-vgs.json')

# last-resort coordinates for schools NSR no longer lists (closed/merged) or
# whose NSR address doesn't geocode (Øksnevad: NSR says "Jærveien", the road
# is registered as "Jærvegen 990, Kleppe" in matrikkelen)
MANUAL = {
    'stavanger offshore tekniske skole': (58.9271, 5.7052),  # Kalhammaren, Stavanger
    'øksnevad': (58.80082, 5.67142),  # Jærvegen 990, Kleppe
}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'poengkart-prototype', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fetch_nsr_rogaland_vgs():
    if os.path.exists(CACHE):
        return json.load(open(CACHE))
    units = []
    page, pages = 1, None
    while pages is None or page <= pages:
        d = get(f'https://data-nsr.udir.no/v4/enheter?sidenummer={page}&antallPerSide=1000')
        pages = d['AntallSider']
        for e in d['EnhetListe']:
            if e.get('ErVideregaaendeSkole') and e.get('ErAktiv') and e.get('Fylkesnummer') == '11':
                units.append(e)
        print(f'page {page}/{pages}: kept {len(units)} so far')
        page += 1
        time.sleep(0.3)
    detailed = []
    for e in units:
        org = e['Organisasjonsnummer']
        try:
            det = get(f'https://data-nsr.udir.no/v3/enhet/{org}')
        except Exception as ex:
            print(f'  detail fail {org} {e["Navn"]}: {ex}')
            continue
        koor = det.get('Koordinat') or {}
        detailed.append({
            'orgnr': org, 'navn': det.get('Navn') or e['Navn'],
            'lat': koor.get('Breddegrad'), 'lon': koor.get('Lengdegrad'),
            'kommune': det.get('Kommune', {}).get('Navn') if isinstance(det.get('Kommune'), dict) else e.get('Kommunenummer'),
        })
        time.sleep(0.2)
    json.dump(detailed, open(CACHE, 'w'), ensure_ascii=False, indent=1)
    return detailed


def simplify(name):
    n = name.lower()
    n = re.sub(r'\b(videregående|vidaregåande|videregåande)\b', '', n)
    n = re.sub(r'\b(skole|skule|avd\.?|avdeling)\b', '', n)
    n = n.replace('st.', 'st ').replace('.', ' ').replace('-', ' ')
    return re.sub(r'\s+', ' ', n).strip()


def has_coords(u):
    return u.get('lat') and u.get('lon') and abs(u['lat']) > 1


def kartverket_geocode(adresse):
    """Fallback: geocode a street address via Kartverket's open address API."""
    import urllib.parse
    q = urllib.parse.urlencode({'sok': adresse, 'treffPerSide': 1})
    d = get(f'https://ws.geonorge.no/adresser/v1/sok?{q}')
    hits = d.get('adresser', [])
    if hits:
        p = hits[0]['representasjonspunkt']
        return p['lat'], p['lon']
    return None


def best_match(key, nsr):
    exact = [u for u in nsr if simplify(u['navn']) == key]
    if exact:
        return exact[0]
    subs = [u for u in nsr
            if 'avd' not in u['navn'].lower()
            and (key in simplify(u['navn']) or simplify(u['navn']) in key)]
    return subs[0] if subs else None


def main():
    nsr = fetch_nsr_rogaland_vgs()
    print(f'NSR: {len(nsr)} active VGS units in Rogaland')
    data = json.load(open(DATA))
    unmatched = []
    for s in data['schools']:
        key = simplify(s['name'])
        hit = best_match(key, nsr)
        if hit and not has_coords(hit):
            # NSR has the school but no coordinates (lat=0) - geocode its address
            try:
                det = get(f'https://data-nsr.udir.no/v3/enhet/{hit["orgnr"]}')
                adr = det.get('Beliggenhetsadresse') or det.get('Postadresse') or {}
                text = f"{adr.get('Adresse', '')}, {adr.get('Poststed', '')}"
                pt = kartverket_geocode(text)
                if pt:
                    hit = dict(hit, lat=pt[0], lon=pt[1], navn=hit['navn'] + ' (adr-geokodet)')
                    print(f'  kartverket fallback for {s["name"]}: {text.strip(", ")} -> {pt}')
            except Exception as ex:
                print(f'  fallback failed for {s["name"]}: {ex}')
        if hit and has_coords(hit):
            s['lat'], s['lon'], s['orgnr'], s['nsr_name'] = hit['lat'], hit['lon'], hit['orgnr'], hit['navn']
        elif key in MANUAL:
            s['lat'], s['lon'] = MANUAL[key]
            s['nsr_name'] = '(manual)'
        else:
            unmatched.append(s['name'])
    json.dump(data, open(DATA, 'w'), ensure_ascii=False, indent=1)
    n_ok = sum(1 for s in data['schools'] if s.get('lat'))
    print(f'matched {n_ok}/{len(data["schools"])} schools with coordinates')
    if unmatched:
        print('UNMATCHED:', unmatched)
        print('NSR names available:', sorted(simplify(u["navn"]) for u in nsr))


if __name__ == '__main__':
    main()
