"""Offline unprivileged assembly; no approval, download, installation or AWS calls.
Use only after review of the exact-base inventory. Zod validation is mandatory
before packaging. Never prints LockSha256 for an incomplete inventory.
"""
import hashlib
import json
from pathlib import Path
import shutil
import sys

PINS = {
    'node': ('node-v24.21.0-linux-x64.tar.xz', 'fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6'),
    'pnpm': ('pnpm-11.17.0.tgz', '644eb5079654e87dae59a07e62d7f098162b9ce58f06077328b5ddefca1c8541'),
}


def assemble(inventory_dir, artifact_dir, output):
    path = inventory_dir / 'package-inventory.json'
    inventory = json.loads(path.read_text())
    if inventory['status'] != 'RESOLVED_REQUIRES_OWNER_REVIEW' or inventory['ssmInstallation']['strategy'] != 'snap':
        raise ValueError('Complete reviewed Snap base inventory required')
    if inventory['baseAmi']['ImageId'] != 'ami-0ba4172b23e57d5a8':
        raise ValueError('Candidate differs')
    output.mkdir(parents=True, exist_ok=False)
    artifacts = {}
    for name, (file, expected) in PINS.items():
        data = (artifact_dir / file).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError('Approved artifact differs: ' + name)
        (output / file).write_bytes(data)
        artifacts[name] = {'file': file, 'sha256': expected}
    artifacts['ssm'] = {'file': 'amazon-ssm-agent.snap', 'sha256': inventory['ssmInstallation']['artifactSha256']}
    all_artifacts = [artifacts['ssm'], *inventory['installedOrUpgraded']]
    for artifact in all_artifacts:
        filename = artifact['file']
        if Path(filename).name != filename:
            raise ValueError('Unexpected inventory artifact path')
        data = (inventory_dir / filename).read_bytes()
        if hashlib.sha256(data).hexdigest() != artifact['sha256']:
            raise ValueError('Inventory artifact changed')
        if (output / filename).exists():
            raise ValueError('Artifact identity collision')
        (output / filename).write_bytes(data)
    lock = {'schemaVersion': '2', 'baseAmiId': inventory['baseAmi']['ImageId'],
            'kernelAbi': inventory['kernelAbi'],
            'packageInventorySha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'baseInventory': inventory['basePackages'], 'nodeVersion': '24.21.0',
            'ssmInstallation': inventory['ssmInstallation'],
            'dockerBase': 'node@sha256:5cbc7caba8c2c0f0bca675d1b61b9f2857e1cf1853c6164ee9dd409501a936e7',
            'artifacts': artifacts, 'packages': inventory['installedOrUpgraded']}
    (output / 'lock.json').write_text(json.dumps(lock, sort_keys=True, indent=2) + '\n')
    print(json.dumps({'status': 'ASSEMBLED_REQUIRES_ZOD_VALIDATION_AND_OWNER_APPROVAL',
                      'LockSha256': hashlib.sha256((output / 'lock.json').read_bytes()).hexdigest()}))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: assemble-tool-lock.py inventory-directory approved-artifact-directory new-output-directory')
    assemble(*map(Path, sys.argv[1:]))
