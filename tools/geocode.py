#!/usr/bin/env python3
"""Attach coordinates to every school in the dataset, nationally.

NSR (Nasjonalt skoleregister) has no server-side filters, so we page the whole
register once, keep active upper-secondary schools, and cache them with their
fylkesnummer. Matching is scoped to the school's own county — school names
repeat across counties (St. Olav exists in both Stavanger and Sarpsborg).
Schools NSR lists without coordinates (lat 0.0) fall back to Kartverket's open
address API.
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
CACHE = os.path.join(HERE, 'nsr-vgs.json')
UA = {'User-Agent': 'poengkart/0.1 (prototype)', 'Accept': 'application/json'}

# schools NSR cannot place and whose address does not geocode either
MANUAL = {
    ('11', 'stavanger offshore tekniske skole'): (58.9271, 5.7052),
    ('11', 'øksnevad'): (58.80082, 5.67142),   # NSR says "Jærveien", matrikkelen "Jærvegen"
}


def get(url, timeout=30):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout))


def fetch_nsr(refresh=False):
    if os.path.exists(CACHE) and not refresh:
        return json.load(open(CACHE))
    units, page, pages = [], 1, None
    while pages is None or page <= pages:
        d = get(f'https://data-nsr.udir.no/v4/enheter?sidenummer={page}&antallPerSide=1000')
        pages = d['AntallSider']
        units += [e for e in d['EnhetListe']
                  if e.get('ErVideregaaendeSkole') and e.get('ErAktiv')]
        print(f'  page {page}/{pages}: {len(units)} VGS so far')
        page += 1
        time.sleep(0.25)
    out = []
    for i, e in enumerate(units):
        try:
            det = get(f'https://data-nsr.udir.no/v3/enhet/{e["Organisasjonsnummer"]}')
        except Exception as ex:
            print(f'  detail failed {e["Navn"]}: {str(ex)[:50]}')
            continue
        k = det.get('Koordinat') or {}
        adr = det.get('Beliggenhetsadresse') or {}
        out.append({
            'orgnr': e['Organisasjonsnummer'], 'navn': det.get('Navn') or e['Navn'],
            'fylke': e.get('Fylkesnummer'), 'lat': k.get('Breddegrad'), 'lon': k.get('Lengdegrad'),
            'url': (det.get('Url') or '').strip(),
            'adresse': ', '.join(x for x in [adr.get('Adresse'), adr.get('Postnr'),
                                             adr.get('Poststed')] if x),
        })
        if i % 100 == 0:
            print(f'  details {i}/{len(units)}')
        time.sleep(0.12)
    json.dump(out, open(CACHE, 'w'), ensure_ascii=False, indent=1)
    return out


def simplify(name):
    n = (name or '').lower()
    n = re.sub(r'\b(videregående|vidaregåande|videregåande|vgs)\b', ' ', n)
    n = re.sub(r'\b(skole|skule|skolen|avd\.?|avdeling)\b', ' ', n)
    n = n.replace('st.', 'st ').replace('.', ' ').replace('-', ' ')
    return re.sub(r'\s+', ' ', n).strip()


def has_coords(u):
    return u.get('lat') and u.get('lon') and abs(u['lat']) > 1


def kartverket(address):
    if not address:
        return None
    q = urllib.parse.urlencode({'sok': address, 'treffPerSide': 1})
    try:
        hits = get(f'https://ws.geonorge.no/adresser/v1/sok?{q}').get('adresser', [])
    except Exception:
        return None
    if hits:
        p = hits[0]['representasjonspunkt']
        return p['lat'], p['lon']
    return None


def best_match(key, pool):
    exact = [u for u in pool if simplify(u['navn']) == key]
    if exact:
        return exact[0]
    subs = [u for u in pool if 'avd' not in u['navn'].lower()
            and (key in simplify(u['navn']) or simplify(u['navn']) in key)]
    return subs[0] if subs else None


def main():
    nsr = fetch_nsr(refresh='--refresh' in os.sys.argv)
    print(f'NSR: {len(nsr)} active upper-secondary schools nationally')
    data = json.load(open(DATA))
    by_fylke = {}
    for u in nsr:
        by_fylke.setdefault(u['fylke'], []).append(u)

    unmatched = []
    for s in data['schools']:
        key = simplify(s['name'])
        pool = by_fylke.get(s.get('fylkesnummer'), nsr)
        hit = best_match(key, pool)
        if hit and not has_coords(hit):
            pt = kartverket(hit.get('adresse'))
            if pt:
                hit = dict(hit, lat=pt[0], lon=pt[1])
                print(f'  kartverket fallback: {s["name"]} -> {pt[0]:.4f},{pt[1]:.4f}')
        if hit and has_coords(hit):
            s['lat'], s['lon'], s['orgnr'] = hit['lat'], hit['lon'], hit['orgnr']
            s['nsr_name'] = hit['navn']
            if hit.get('adresse') and not s.get('address'):
                s['address'] = hit['adresse']
            if hit.get('url') and '@' not in hit['url'] and not s.get('url'):
                s['url'] = hit['url']
        else:
            man = MANUAL.get((s.get('fylkesnummer'), key)) or MANUAL.get((s.get('fylkesnummer'), s['name'].lower()))
            if man:
                s['lat'], s['lon'] = man
                s['nsr_name'] = '(manual)'
            else:
                unmatched.append(f'{s["fylke"]}: {s["name"]}')

    json.dump(data, open(DATA, 'w'), ensure_ascii=False, indent=1)
    ok = sum(1 for s in data['schools'] if s.get('lat'))
    print(f'matched {ok}/{len(data["schools"])} schools with coordinates')
    for u in unmatched:
        print('  UNMATCHED:', u)


if __name__ == '__main__':
    main()
