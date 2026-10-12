"""Unprivileged, finite source/bundle packaging. Does not build or publish an AMI."""
from pathlib import Path
import hashlib
import json
import tarfile
import io
import sys

repo = Path(__file__).resolve().parents[3]
source = repo / "deploy/engineering-worker/aws"
if sys.argv[1:] not in ([], ["--candidate"]):
    raise ValueError("Only --candidate is supported")
output = repo / (".local/engineering-worker/phase28_4a_ec2_candidate" if sys.argv[1:] else ".local/engineering-worker/phase28_4a_ec2")
output.mkdir(parents=True, exist_ok=True)
files = {}
build_outputs = json.loads((repo / "apps/api/dist-worker/metafile-esm.json").read_text())["outputs"]
for name in ("provisioned-engineering-worker.js", "ec2-helper.js", "registry-proxy.js"):
    bundle = (repo / "apps/api/dist-worker" / name).read_bytes()
    matches = [value for path, value in build_outputs.items() if path.endswith(f"/{name}")]
    if len(matches) != 1 or matches[0]["bytes"] != len(bundle):
        raise ValueError(f"Missing or inconsistent worker build metadata for {name}")
    if any(not dependency.get("external") or dependency["path"].startswith((".", "/"))
           for dependency in matches[0]["imports"]):
        raise ValueError(f"Worker entry must be self-contained; local module import in {name}")
    files[name] = bundle
for name in (
    "athena-worker.service", "athena-watchdog.service", "athena-expire.service",
    "athena-deadline.timer", "athena-network.service", "90-athena.conf", "daemon.json",
    "task-firewall.rules", "configure-network", "install-image", "task-node.Dockerfile", "99-athena-private.cfg",
    "registry-proxy.Dockerfile", "README.md",
):
    files[f"image/{name}"] = (source / "image" / name).read_bytes()
for name in ("evidence-document.json", "preview-grant-document.json"):
    files[name] = (source / name).read_bytes()
manifest = {
    "schemaVersion": "1", "status": "REVIEW_REQUIRED_NOT_AN_AMI",
    "region": "ap-southeast-1", "previewEnabled": False,
    "runtimePermissionsActivated": False,
    "files": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())},
}
files["payload-manifest.json"] = (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode()
archive = output / "athena-ec2-image-payload.tar"
with tarfile.open(archive, "w") as tar:
    for name, data in sorted(files.items()):
        info = tarfile.TarInfo(name)
        info.size = len(data)
        info.mode = 0o444
        info.uid = info.gid = 0
        info.mtime = 0
        tar.addfile(info, io.BytesIO(data))
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / "payload-manifest.json").write_bytes(files["payload-manifest.json"])
(output / "SHA256SUMS").write_text(f"{digest}  {archive.name}\n")
print(json.dumps({"artifact": str(archive), "sha256": digest, "files": len(files), "status": manifest["status"]}))
