#!/usr/bin/env python3
"""The manifest of source documents: sources/manifest.json.

    .venv/bin/python3 tools/sources_manifest.py          # rebuild from sources/
    .venv/bin/python3 tools/sources_manifest.py --check  # verify sources/ against it

One entry per file under sources/ (README excluded): path, size, sha256, and
the provenance carried over from the previous manifest, so a re-run never
loses a case number. Objects in the R2 bucket are named exactly as here and
are immutable: a corrected document gets a new name, never an overwrite.
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', 'sources')
MANIFEST = os.path.join(ROOT, 'manifest.json')
BUCKET_URL = 'https://pub-c369d56420af4a86b26b83c79c442355.r2.dev'   # set once the bucket is public


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def files():
    for county in sorted(os.listdir(ROOT)):
        d = os.path.join(ROOT, county)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if not f.startswith('.'):
                yield f'{county}/{f}'


def load():
    return json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {'files': {}}


def build():
    old = load().get('files', {})
    out = {}
    for rel in files():
        p = os.path.join(ROOT, rel)
        ent = {'size': os.path.getsize(p), 'sha256': sha256(p)}
        ent['provenance'] = old.get(rel, {}).get('provenance', '')
        out[rel] = ent
    man = {'bucket_url': load().get('bucket_url', BUCKET_URL),
           'licence': 'Public records of the fylkeskommuner; derived data NLOD 2.0',
           'files': out}
    json.dump(man, open(MANIFEST, 'w'), ensure_ascii=False, indent=1)
    print(f'{len(out)} files, {sum(e["size"] for e in out.values()) / 1e6:.1f} MB -> {MANIFEST}')
    missing = [k for k, e in out.items() if not e['provenance']]
    if missing:
        print(f'{len(missing)} entries have no provenance yet (fill in manifest.json)')


def check():
    man = load()
    bad = []
    for rel, ent in man['files'].items():
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            bad.append(f'missing: {rel}')
        elif sha256(p) != ent['sha256']:
            bad.append(f'hash differs: {rel}')
    extra = [rel for rel in files() if rel not in man['files']]
    for rel in extra:
        bad.append(f'not in manifest: {rel}')
    if bad:
        sys.exit('\n'.join(bad))
    print(f'{len(man["files"])} source files verified against the manifest')


if __name__ == '__main__':
    check() if '--check' in sys.argv else build()
