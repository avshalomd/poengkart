"""sources_r2.py push is the last step of tools/refresh.py: without the R2 keys
it must skip and exit 0, whether or not boto3 is installed, and with them it
needs boto3, so tools/requirements.txt carries it."""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, '..')
KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']


def test_push_without_keys_skips_even_without_boto3(tmp_path):
    fake = tmp_path / 'boto3'
    fake.mkdir()
    (fake / '__init__.py').write_text("raise ModuleNotFoundError(\"No module named 'boto3'\")\n")
    # empty values count as missing, and setdefault keeps them over a local .env.local
    env = {**os.environ, 'PYTHONPATH': str(tmp_path), **{k: '' for k in KEYS}}
    r = subprocess.run([sys.executable, os.path.join(TOOLS, 'sources_r2.py'), 'push'],
                       capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stdout + r.stderr
    assert 'R2 push skipped' in r.stdout


def test_requirements_carry_boto3():
    with open(os.path.join(TOOLS, 'requirements.txt')) as f:
        pins = [line.split('==')[0] for line in f if '==' in line and not line.startswith('#')]
    assert 'boto3' in pins
