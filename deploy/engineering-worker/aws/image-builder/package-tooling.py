"""Unprivileged finite lock/artifact packaging; no download or privileged action."""
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import tarfile

if len(sys.argv) != 3:
    raise SystemExit('Usage: package-tooling.py reviewed-input-directory output-tools.tar')
source, output = map(Path, sys.argv[1:])
lock_bytes = (source / 'lock.json').read_bytes()
lock = json.loads(lock_bytes)
artifacts = list(lock['artifacts'].values()) + lock['packages']
files = {'lock.json': lock_bytes}
for artifact in artifacts:
    name = artifact['file']
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._+~-]{0,127}', name) or name in files:
        raise ValueError('Invalid or duplicate filename')
    path = source / name
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 2 * 1024 ** 3:
        raise ValueError('Invalid artifact')
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != artifact['sha256']:
        raise ValueError('Reviewed artifact digest differs')
    files[name] = data
if sum(map(len, files.values())) > 5 * 1024 ** 3:
    raise ValueError('Tooling archive quota exceeded')
with tarfile.open(output, 'w') as archive:
    for name, data in sorted(files.items()):
        info = tarfile.TarInfo(name)
        info.size = len(data)
        info.mode = 0o444
        info.mtime = 0
        archive.addfile(info, io.BytesIO(data))
print(json.dumps({'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'status': 'PACKAGED_NOT_APPROVED'}))
