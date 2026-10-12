# Human operator only: run in the Ubuntu inspection terminal, without sudo.
# A child shell preserves the SSH session if collection fails.
/bin/sh <<'ATHENA_OPERATOR_SESSION'
set -eu
printf '%s\n' 'ATHENA_COLLECTOR_V2_COMMENT_PARSER_FIXED'
umask 077
python3 - <<'ATHENA_FIXED_INPUT_COLLECTOR'
"""Unprivileged INPUT REVIEW ONLY on an existing pristine candidate-AMI instance.
No installation, AWS mutations, credentials, shell commands or Image Builder run.
Requires non-secret DescribeImages JSON from the reviewed infrastructure principal.
"""
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.request

AMI = 'ami-0ba4172b23e57d5a8'
INSPECTION_INSTANCE = 'i-09c137314e06b4b47'
SSM_VERSION = '3.3.4793.0'
SSM_REVISION = '13349'
SSM_SHA256 = '53e14f4e402a3de500dbfd162368922a07117638dcfc14c1e2c0340cbf979de7'
SSM_URL = 'https://api.snapcraft.io/api/v1/snaps/download/T09mpujiTnzSdSCuqNkE7YXXTWDq13tC_13349.snap'


def copy_reviewed_snap(destination):
    # Root-only installed archive checksum was collected by the human operator.
    # Retrieve identical public bytes, never chmod/copy the protected source.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(SSM_URL, timeout=60) as source, destination.open('xb') as target:
        count = 0
        while chunk := source.read(1024 * 1024):
            count += len(chunk)
            if count > 128 * 1024 * 1024:
                raise ValueError('Snap archive quota exceeded')
            target.write(chunk)
    if sha(destination) != SSM_SHA256:
        raise ValueError('Public Snap copy differs from installed owner-collected checksum')

REQUIRED = ['docker.io', 'containerd', 'runc', 'git', 'python3', 'linux-aws',
            'iptables', 'ca-certificates', 'xz-utils', 'systemd', 'cloud-init',
            'iproute2', 'util-linux', 'snapd']


def run(*args):
    return subprocess.check_output(args, text=True, timeout=900,
                                   env={'PATH': '/usr/bin:/bin', 'LANG': 'C', 'HOME': str(Path.home())}).strip()


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def validate_image(document):
    images = document.get('Images', [])
    if len(images) != 1:
        raise ValueError('Exactly one DescribeImages result required')
    image = images[0]
    for key, value in {'ImageId': AMI, 'OwnerId': '099720109477', 'Architecture': 'x86_64',
                       'State': 'available', 'VirtualizationType': 'hvm', 'RootDeviceType': 'ebs'}.items():
        if image.get(key) != value:
            raise ValueError('Unreviewed AMI metadata: ' + key)
    mappings = image.get('BlockDeviceMappings', [])
    roots = [mapping for mapping in mappings if 'Ebs' in mapping]
    if any('Ebs' not in mapping and mapping.get('VirtualName') not in ('ephemeral0', 'ephemeral1') for mapping in mappings):
        raise ValueError('Unexpected non-root mapping')
    if len(roots) != 1 or roots[0]['DeviceName'] != image['RootDeviceName'] or not 1 <= roots[0]['Ebs']['VolumeSize'] <= 10:
        raise ValueError('Exactly one <=10 GiB EBS root required')
    if not image.get('CreationDate') or not isinstance(image.get('Public'), bool):
        raise ValueError('AWS CreationDate/public metadata required')
    return image


def validate_sources(text):
    repositories = 0
    for block in re.split(r'\n[ \t]*\n', text):
        lines = [line for line in block.splitlines() if line.strip() and not line.lstrip().startswith('#')]
        if not lines:
            continue  # Canonical cloud-init header paragraphs are not repositories.
        fields = {}
        for line in lines:
            if line[0].isspace() or ':' not in line:
                raise ValueError('Unsupported source field formatting')
            key, value = line.split(':', 1)
            if key in fields or key not in {'Types', 'URIs', 'Suites', 'Components', 'Signed-By'}:
                raise ValueError('Duplicate or unreviewed source field')
            fields[key] = value.strip()
        if fields.get('Types') != 'deb' or fields.get('Signed-By') != '/usr/share/keyrings/ubuntu-archive-keyring.gpg':
            raise ValueError('Only explicit signed Canonical deb822 repositories supported')
        uris = fields.get('URIs', '').split()
        suites = fields.get('Suites', '').split()
        components = fields.get('Components', '').split()
        if not uris or not suites or not components:
            raise ValueError('Incomplete source repository')
        for uri in uris:
            if not re.fullmatch(r'https?://(?:[a-z0-9.-]+\.ec2\.archive\.ubuntu\.com|archive\.ubuntu\.com|security\.ubuntu\.com)/ubuntu/?', uri):
                raise ValueError('Unreviewed source repository')
        if not set(suites) <= {'noble', 'noble-updates', 'noble-security', 'noble-backports'}:
            raise ValueError('Unreviewed Ubuntu suite')
        if not set(components) <= {'main', 'universe', 'restricted', 'multiverse'}:
            raise ValueError('Unreviewed Ubuntu component')
        repositories += 1
    if not repositories:
        raise ValueError('No signed repositories in source file')
    return repositories


def freeze(metadata_file, output):
    if os.getuid() == 0 or os.uname().machine != 'x86_64' or not Path('/etc/os-release').is_file():
        raise ValueError('Run unprivileged on the pristine x86_64 Ubuntu candidate instance')
    release = Path('/etc/os-release').read_text()
    if 'VERSION_ID="24.04"' not in release or 'ID=ubuntu' not in release:
        raise ValueError('Ubuntu 24.04 required')
    image = validate_image(json.loads(metadata_file.read_text()))
    # Only public identity metadata is read. Never enumerate metadata credentials.
    request = urllib.request.Request('http://169.254.169.254/latest/api/token', method='PUT',
                                     headers={'X-aws-ec2-metadata-token-ttl-seconds': '60'})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    token = opener.open(request, timeout=5).read().decode()
    request = urllib.request.Request('http://169.254.169.254/latest/dynamic/instance-identity/document',
                                     headers={'X-aws-ec2-metadata-token': token})
    identity = json.loads(opener.open(request, timeout=5).read())
    if identity['imageId'] != AMI or identity['region'] != 'ap-southeast-1' or identity['instanceId'] != INSPECTION_INSTANCE or identity['accountId'] != '737073451069':
        raise ValueError('Inspection host must be the exact Singapore candidate AMI')
    output.mkdir(exist_ok=False, parents=True)
    for subdir in ('lists/partial', 'archives/partial', 'sources', 'empty'):
        (output / subdir).mkdir(parents=True, exist_ok=True)
    status = Path('/var/lib/dpkg/status')
    shutil.copyfile(status, output / 'base-dpkg-status')
    inherited = []
    for row in run('/usr/bin/dpkg-query', '-W', '-f=${Package}\t${Version}\t${Architecture}\t${db:Status-Status}\n').splitlines():
        name, version, architecture, state = row.split('\t')
        if state == 'installed':
            inherited.append({'name': name, 'version': version, 'architecture': architecture,
                              'sourceRepository': 'base-ami:' + AMI})
    sources = []
    for path in sorted(Path('/etc/apt/sources.list.d').glob('*.sources')):
        text = path.read_text()
        validate_sources(text)
        shutil.copyfile(path, output / 'sources' / path.name)
        sources.append({'file': path.name, 'content': text, 'sha256': sha(path)})
    if not sources or (Path('/etc/apt/sources.list').exists() and any(line.strip() and not line.startswith('#') for line in Path('/etc/apt/sources.list').read_text().splitlines())):
        raise ValueError('Exact deb822 source inventory required')
    options = ['-o', 'Dir::Etc::main=-', '-o', 'Dir::Etc::parts=' + str(output / 'empty'),
               '-o', 'Dir::Etc::sourcelist=-', '-o', 'Dir::Etc::sourceparts=' + str(output / 'sources'),
               '-o', 'Dir::Etc::trusted=-', '-o', 'Dir::Etc::trustedparts=' + str(output / 'empty'),
               '-o', 'Dir::State::status=' + str(output / 'base-dpkg-status'),
               '-o', 'Dir::State::lists=' + str(output / 'lists'),
               '-o', 'Dir::Cache::archives=' + str(output / 'archives'),
               '-o', 'Dir::Cache::pkgcache=', '-o', 'Dir::Cache::srcpkgcache=',
               '-o', 'APT::Sandbox::User=' + getpass.getuser(),
               '-o', 'Acquire::ForceHash=SHA256', '-o', 'Debug::NoLocking=true',
               '-o', 'Dir::State=' + str(output), '-o', 'Dir::Log=' + str(output),
               '-o', 'Acquire::AllowInsecureRepositories=false', '-o', 'APT::Get::AllowUnauthenticated=false']
    run('/usr/bin/apt-get', *options, 'update', '--error-on=any')
    plan = run('/usr/bin/apt-get', *options, '--simulate', '--no-install-recommends', 'install', *REQUIRED)
    (output / 'resolution.txt').write_text(plan + '\n')
    if re.search(r'^Remv ', plan, re.M):
        raise ValueError('Unexpected package removal; review separately')
    pins = []
    for line in plan.splitlines():
        match = re.match(r'^Inst ([a-z0-9+.-]+)(?: \[[^]]+\])? \(([^ ]+) ', line)
        if match:
            pins.append(match[1] + '=' + match[2])
    if not pins:
        raise ValueError('No changed packages; inspect base/recipe before freezing')
    uris = run('/usr/bin/apt-get', *options, '--print-uris', '--yes', '--download-only', '--no-install-recommends', 'install', *pins)
    downloads = {}
    for line in uris.splitlines():
        match = re.match(r"^'([^']+)' ([^ ]+) ([0-9]+) SHA256:([a-f0-9]{64})$", line)
        if match:
            uri, filename, _, expected = match.groups()
            downloads[filename] = (uri, expected)
    run('/usr/bin/apt-get', *options, '--yes', '--download-only', '--no-install-recommends', 'install', *pins)
    packages = []
    for path in sorted((output / 'archives').glob('*.deb')):
        origin, expected = downloads[path.name]
        actual = sha(path)
        if actual != expected:
            raise ValueError('Signed index/artifact digest differs')
        name, version, architecture = run('/usr/bin/dpkg-deb', '-f', str(path), 'Package', 'Version', 'Architecture').splitlines()
        # dpkg-deb emits labelled fields when multiple fields are requested.
        name, version, architecture = [field.split(': ', 1)[-1] for field in (name, version, architecture)]
        if architecture not in ('amd64', 'all') or name.startswith('openssh'):
            raise ValueError('Unreviewed package architecture/name')
        shutil.copyfile(path, output / path.name)
        packages.append({'name': name, 'version': version, 'architecture': architecture,
                         'file': path.name, 'sha256': actual, 'sourceRepository': origin})
    if {p['name'] + '=' + p['version'] for p in packages} != set(pins):
        raise ValueError('Dependency closure/download set differs')
    final = {p['name']: p for p in inherited}
    final.update({p['name']: p for p in packages})
    kernel_images = [name.removeprefix('linux-image-') for name in final if re.fullmatch(r'linux-image-[0-9].*-aws', name)]
    image_meta = next((p for p in packages if p['name'] == 'linux-image-aws'), None)
    dependencies = run('/usr/bin/dpkg-deb', '-f', str(output / image_meta['file']), 'Depends') if image_meta else run('/usr/bin/dpkg-query', '-W', '-f=${Depends}', 'linux-image-aws')
    abi_match = re.search(r'linux-image-([0-9]+\.[0-9]+\.[0-9]+-[0-9]+-aws)', dependencies)
    if not abi_match or 'linux-modules-' + abi_match[1] not in final:
        raise ValueError('Exact AWS kernel image/modules ABI not resolved')
    snap_rows = run('/usr/bin/snap', 'list', '--unicode=never', 'amazon-ssm-agent').splitlines()
    row = snap_rows[1].split()
    revision = row[2]
    if not re.fullmatch(r'[1-9][0-9]{0,9}', revision) or Path('/usr/bin/amazon-ssm-agent').exists():
        raise ValueError('Exactly one Snap SSM installation required')
    if row[1] != SSM_VERSION or revision != SSM_REVISION or Path('/snap/amazon-ssm-agent/current').resolve() != Path('/snap/amazon-ssm-agent') / SSM_REVISION:
        raise ValueError('Observed pinned Snap version/revision differs')
    if run('/snap/amazon-ssm-agent/current/amazon-ssm-agent', '-version') != 'SSM Agent version: ' + SSM_VERSION:
        raise ValueError('SSM binary runtime differs')
    if run('/usr/bin/systemctl', 'is-enabled', 'snap.amazon-ssm-agent.amazon-ssm-agent.service') != 'enabled' or run('/usr/bin/systemctl', 'is-active', 'snap.amazon-ssm-agent.amazon-ssm-agent.service') != 'active':
        raise ValueError('SSM service not enabled and active')
    snap_archive = output / 'amazon-ssm-agent.snap'
    copy_reviewed_snap(snap_archive)
    changed = {p['name'] for p in packages}
    inventory = {'status': 'RESOLVED_REQUIRES_OWNER_REVIEW', 'baseAmi': image,
                 'inspectionInstanceId': identity['instanceId'], 'baseStatusSha256': sha(status),
                 'baseKernelAbi': os.uname().release, 'kernelAbi': abi_match[1], 'kernelImageAbis': sorted(kernel_images),
                 'basePackages': sorted(inherited, key=lambda p: p['name']),
                 'inheritedUnchanged': sorted((p for p in inherited if p['name'] not in changed), key=lambda p: p['name']),
                 'installedOrUpgraded': sorted(packages, key=lambda p: p['name']),
                 'sources': sources, 'signedIndexes': [{'file': p.name, 'sha256': sha(p)} for p in sorted((output / 'lists').iterdir()) if p.is_file() and p.name not in ('lock',)],
                 'ssmInstallation': {'strategy': 'snap', 'runtimeVersion': row[1], 'revision': revision,
                                     'artifactSha256': sha(snap_archive), 'refreshHeld': True}}
    (output / 'package-inventory.json').write_text(json.dumps(inventory, sort_keys=True, indent=2) + '\n')
    # No placeholder LockSha256 or ToolingSha256 is printed. Approved artifact pins
    # must first be assembled with this exact inventory into the final build lock.
    print(json.dumps({'status': inventory['status'], 'inventorySha256': sha(output / 'package-inventory.json')}))


# Fixed metadata supplied by the owner’s reviewed read-only AWS export.
import base64, gzip
review_metadata = json.loads(r'''{"Images":[{"Architecture":"x86_64","BlockDeviceMappings":[{"DeviceName":"/dev/sda1","Ebs":{"DeleteOnTermination":true,"Encrypted":false,"SnapshotId":"snap-0930a0f50200e3c0b","VolumeSize":8,"VolumeType":"gp3"}},{"DeviceName":"/dev/sdb","VirtualName":"ephemeral0"},{"DeviceName":"/dev/sdc","VirtualName":"ephemeral1"}],"BootMode":"uefi-preferred","CreationDate":"2026-09-04T11:46:06.000Z","DeprecationTime":"2028-09-04T11:46:06.000Z","Description":"Canonical, Ubuntu, 24.04, amd64 noble image","EnaSupport":true,"FreeTierEligible":true,"Hypervisor":"xen","ImageId":"ami-0ba4172b23e57d5a8","ImageLocation":"amazon/ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-20260904","ImageOwnerAlias":"amazon","ImageType":"machine","ImdsSupport":"v2.0","Name":"ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-20260904","OwnerId":"099720109477","PlatformDetails":"Linux/UNIX","Public":true,"PublicSsmParameterName":"aws/service/canonical/ubuntu/server/noble/stable/current/amd64/hvm/ebs-gp3/ami-id","RootDeviceName":"/dev/sda1","RootDeviceType":"ebs","SriovNetSupport":"simple","State":"available","UsageOperation":"RunInstances","VirtualizationType":"hvm"}]}''')
metadata_path = Path.home() / 'athena-input-review-metadata.json'
metadata_bytes = (json.dumps(review_metadata, sort_keys=True, indent=2) + '\n').encode()
if metadata_path.exists() and metadata_path.read_bytes() != metadata_bytes:
    raise ValueError('Existing metadata file differs; do not overwrite')
if not metadata_path.exists():
    with metadata_path.open('xb') as stream:
        stream.write(metadata_bytes)
output = Path.home() / 'athena-input-inspection-20261005-retry2'
freeze(metadata_path, output)
print('ATHENA_INVENTORY_BEGIN')
print(base64.b64encode(gzip.compress((output / 'package-inventory.json').read_bytes(), mtime=0)).decode())
print('ATHENA_INVENTORY_END')

ATHENA_FIXED_INPUT_COLLECTOR
ATHENA_OPERATOR_SESSION
