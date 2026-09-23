"""Build a clean source archive; no Git history, credentials, outputs or dependencies."""
import hashlib
import json
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
required = ['package.json','package-lock.json','server.mjs','.env.example','.gitignore','.dockerignore','Dockerfile','compose.yaml','README.md','LICENSE']
files = [root / name for name in required]
for folder in ['public','lib','scripts','tests','docs']:
    files.extend(path for path in (root / folder).rglob('*') if path.is_file())
for path in files:
    if path.is_symlink() or 'qa' in path.relative_to(root).parts:
        raise SystemExit('Remove local QA material before packaging')
out = root / 'dist' / f'clinical-live-{version}.zip'
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(files):
        info = zipfile.ZipInfo('clinical-live/' + path.relative_to(root).as_posix(), (2026,1,1,0,0,0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, path.read_bytes())
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
    names = set(archive.namelist())
    for name in required + ['public/index.html', 'lib/providers.mjs', 'lib/contract.mjs']:
        assert 'clinical-live/' + name in names, f'Missing runtime file: {name}'
print(json.dumps({'file':out.name,'files':len(files),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}, indent=2))
