"""Repack a trusted official 0.6.0 VSIX with this checkout's attachment build.

Usage: python3 scripts/package-shared-backend.py ORIGINAL.vsix OUTPUT.vsix
Preserves the original platform runtime; never downloads or executes package scripts.
"""
import hashlib
import json
from pathlib import Path
import sys
import zipfile
import xml.etree.ElementTree as ET

source, target = map(Path, sys.argv[1:])
root = Path(__file__).resolve().parent.parent
package = json.loads((root / 'package.json').read_text())
assert source.resolve() != target.resolve()
assert not target.exists(), 'Refusing to overwrite an existing artifact'
replacements = {'extension/package.json': (root / 'package.json').read_bytes()}
for name in ['extension.cjs', 'runtime/shared-history-worker.mjs', 'runtime/gateway-runtime.mjs', 'webview/chat.js']:
    replacements['extension/dist/' + name] = (root / 'dist' / name).read_bytes()
with zipfile.ZipFile(source) as original:
    old = json.loads(original.read('extension/package.json'))
    assert old['version'] == '0.6.0' and old['publisher'] == 'skymecode'
    assert old['name'] == package['name']
    assert old['dependencies'] == package['dependencies'], 'Runtime dependency drift'
    manifest = original.read('extension.vsixmanifest').decode()
    ns = '{http://schemas.microsoft.com/developer/vsx-schema/2011}'
    identity = ET.fromstring(manifest).find(f'{ns}Metadata/{ns}Identity')
    assert identity is not None and identity.attrib['Version'] == '0.6.0'
    replacements['extension.vsixmanifest'] = manifest.replace('Version="0.6.0"', f'Version="{package["version"]}"', 1).encode()
    assert set(replacements).issubset(original.namelist())
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as result:
        for entry in original.infolist():
            result.writestr(entry, replacements.get(entry.filename, original.read(entry.filename)))
with zipfile.ZipFile(target) as result:
    assert result.testzip() is None
print(json.dumps({'version': package['version'], 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'artifact_sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'bytes': target.stat().st_size}))
