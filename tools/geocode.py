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
    n = re.sub(r'\bvid[ae]reg\w*\b', ' ', n)       # videregående/vidaregåande/videreg
    n = re.sub(r'\b(vgs|vg)\b', ' ', n)
    n = re.sub(r'\b(skole|skule|skulen|skolen|avdeling)\b', ' ', n)
    n = re.sub(r'\bavd\.?\b', ' ', n)
    n = n.replace('st.', 'st ')
    n = re.sub(r'[.,/()]', ' ', n).replace('-', ' ')
    return re.sub(r'\s+', ' ', n).strip()


def has_coords(u):
    return u.get('lat') and u.get('lon') and abs(u['lat']) > 1


def kartverket(address, fylke=None):
    """NSR stores addresses as "Street 16, 3629, NORE"; Kartverket's free-text
    search does not like the bare postcode in the middle, so try structured
    variants before giving up. Every hit is checked against the school's own
    county — a bare street name matches the same street anywhere in Norway
    (this put Numedal in Møre og Romsdal and Askøy in Vesterålen)."""
    if not address:
        return None
    parts = [p.strip() for p in address.split(',') if p.strip()]
    street = parts[0] if parts else ''
    street = re.sub(r'(\d+)\s*-\s*\d+$', r'\1', street)      # "Kabelgata 10-12"
    m = re.match(r'^(.*?)\s+(\d+)\s*[A-Za-z]?$', street)
    name, number = (m.group(1), m.group(2)) if m else (street, None)
    postnr = next((p for p in parts if re.fullmatch(r'\d{4}', p)), None)
    poststed = parts[-1] if len(parts) > 1 and parts[-1] != postnr else None
    # Kartverket matches a street name, not "street + number" free text
    tries = []
    if name and postnr:
        tries.append({'adressenavn': name, 'postnummer': postnr})
    if name and poststed:
        tries.append({'adressenavn': name, 'poststed': poststed})
    if name:
        tries.append({'sok': name})
    for params in tries:
        params['treffPerSide'] = 20
        try:
            hits = get('https://ws.geonorge.no/adresser/v1/sok?'
                       + urllib.parse.urlencode(params)).get('adresser', [])
        except Exception:
            continue
        hits = [h for h in hits
                if not fylke or str(h.get('kommunenummer', '')).startswith(fylke)]
        if not hits:
            continue
        exact = [h for h in hits if number and str(h.get('nummer')) == number]
        h = (exact or hits)[0]
        p = h['representasjonspunkt']
        return p['lat'], p['lon']
    return None


def stedsnavn(name, fylke=None):
    """Third tier: Kartverket's place-name register lists schools as named
    objects, which rescues schools NSR has dropped or renamed."""
    try:
        d = get('https://api.kartverket.no/stedsnavn/v1/navn?' + urllib.parse.urlencode(
            {'sok': name, 'treffPerSide': 20, 'utkoordsys': 4258}))
    except Exception:
        return None
    for n in d.get('navn', []):
        if n.get('navneobjekttype') != 'Skole':
            continue
        komm = (n.get('kommuner') or [{}])[0].get('kommunenummer', '')
        if fylke and not str(komm).startswith(fylke):
            continue
        p = n['representasjonspunkt']
        return p['nord'], p['øst']
    return None


def best_match(key, pool):
    exact = [u for u in pool if simplify(u['navn']) == key]
    if exact:
        return exact[0]
    subs = [u for u in pool if 'avd' not in u['navn'].lower()
            and (key in simplify(u['navn']) or simplify(u['navn']) in key)]
    if subs:
        return subs[0]
    # last resort: a branch ("avd") record — better a campus 2 km away than
    # no dot at all, and several counties list only the branch in NSR
    branch = [u for u in pool if key in simplify(u['navn'])]
    return branch[0] if branch else None


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
        # a human-verified coordinate always wins: the address fallback can
        # land on the wrong street inside the right county
        man = MANUAL.get((s.get('fylkesnummer'), key)) \
            or MANUAL.get((s.get('fylkesnummer'), s['name'].lower()))
        if man:
            s['lat'], s['lon'] = man
            s['nsr_name'] = '(manual)'
            continue
        pool = by_fylke.get(s.get('fylkesnummer'), nsr)
        hit = best_match(key, pool)
        if hit and not has_coords(hit):
            pt = kartverket(hit.get('adresse'), s.get('fylkesnummer'))
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
                # counties publish short names ("Numedal"); the register wants
                # the full one
                pt = None
                for cand in (s['name'], f'{s["name"]} videregående skole',
                             f'{s["name"]} vidaregåande skule',
                             (hit or {}).get('navn')):
                    if not cand:
                        continue
                    pt = stedsnavn(cand, s.get('fylkesnummer'))
                    if pt:
                        break
                if pt:
                    s['lat'], s['lon'] = pt
                    s['nsr_name'] = '(stedsnavn)'
                    print(f'  stedsnavn: {s["name"]} -> {pt[0]:.4f},{pt[1]:.4f}')
                else:
                    unmatched.append(f'{s["fylke"]}: {s["name"]}')

    json.dump(data, open(DATA, 'w'), ensure_ascii=False, indent=1)
    ok = sum(1 for s in data['schools'] if s.get('lat'))
    print(f'matched {ok}/{len(data["schools"])} schools with coordinates')
    for u in unmatched:
        print('  UNMATCHED:', u)


if __name__ == '__main__':
    main()
