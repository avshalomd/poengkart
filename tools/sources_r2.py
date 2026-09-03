#!/usr/bin/env python3
"""Mirror sources/ to the public R2 bucket, or fetch it from there.

    .venv/bin/python3 tools/sources_r2.py push     # upload files the bucket lacks
    .venv/bin/python3 tools/sources_r2.py fetch    # download files sources/ lacks, verify hashes

Push needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in the
environment (or in .env.local at the repo root); they are never read from
anywhere else. Fetch needs nothing: the bucket is public and every file is
verified against sources/manifest.json. Objects are never overwritten: push
refuses a name that already exists with a different hash.
"""
import hashlib
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', 'sources')
sys.path.insert(0, HERE)
import sources_manifest as sm                      # noqa: E402

BUCKET = 'poengkart-sources'


def env():
    p = os.path.join(HERE, '..', '.env.local')
    if os.path.exists(p):
        for line in open(p):
            if '=' in line and not line.startswith('#'):
                k, v = line.strip().split('=', 1)
                os.environ.setdefault(k, v.strip('"\''))
    keys = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
    missing = [k for k in keys if not os.environ.get(k)]
    if missing:
        # a refresh on a machine without the keys must still finish; the
        # mirror is a convenience, the manifest is the record
        print(f'R2 push skipped: set {", ".join(missing)} in the environment or .env.local')
        sys.exit(0)
    return [os.environ[k] for k in keys]


def client():
    import boto3
    account, key, secret = env()
    return boto3.client('s3', endpoint_url=f'https://{account}.r2.cloudflarestorage.com',
                        aws_access_key_id=key, aws_secret_access_key=secret, region_name='auto')


def push():
    man = sm.load()
    s3 = client()
    have = {}
    for page in s3.get_paginator('list_objects_v2').paginate(Bucket=BUCKET):
        for o in page.get('Contents', []):
            have[o['Key']] = o
    up = same = 0
    for rel, ent in man['files'].items():
        if rel in have:
            meta = s3.head_object(Bucket=BUCKET, Key=rel).get('Metadata', {})
            if meta.get('sha256') != ent['sha256']:
                # An object this script did not write carries no sha256 metadata;
                # treat that like a mismatch rather than trusting it blindly.
                sys.exit(f'{rel} exists in the bucket with a different or unknown hash; '
                         'upload under a new name or delete the object first')
            same += 1
            continue
        p = os.path.join(ROOT, rel)
        ctype = {'pdf': 'application/pdf', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                 'html': 'text/html; charset=utf-8'}.get(rel.rsplit('.', 1)[-1], 'application/octet-stream')
        s3.upload_file(p, BUCKET, rel, ExtraArgs={'ContentType': ctype, 'Metadata': {'sha256': ent['sha256']}})
        up += 1
        print('uploaded', rel)
    s3.upload_file(sm.MANIFEST, BUCKET, 'manifest.json', ExtraArgs={'ContentType': 'application/json'})
    print(f'{up} uploaded, {same} already there, manifest refreshed')


def fetch():
    man = sm.load()
    base = man['bucket_url'].rstrip('/')
    got = 0
    for rel, ent in man['files'].items():
        p = os.path.join(ROOT, rel)
        if os.path.exists(p) and sm.sha256(p) == ent['sha256']:
            continue
        os.makedirs(os.path.dirname(p), exist_ok=True)
        req = urllib.request.Request(f'{base}/{urllib.request.quote(rel)}',
                                     headers={'User-Agent': 'poengkart-sources/1.0 (+https://github.com/avshalomd/poengkart)'})
        data = urllib.request.urlopen(req).read()   # r2.dev refuses the bare urllib agent
        if hashlib.sha256(data).hexdigest() != ent['sha256']:
            sys.exit(f'{rel}: downloaded file does not match the manifest')
        open(p, 'wb').write(data)
        got += 1
        print('fetched', rel)
    print(f'{got} fetched; sources/ complete and verified')


if __name__ == '__main__':
    {'push': push, 'fetch': fetch}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__))()
