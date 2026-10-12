"""Fixed Image Builder root recipe. Never execute on the owner workstation."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile

ROOT = Path('/opt/athena-tools')
# Remove inbound SSH and its dependent EC2 login integration. Retain the
# pinned client package: Snap SSM depends on it; no capability exposes SSH.
SSH_SERVER_PACKAGES = ('ec2-instance-connect', 'openssh-server', 'openssh-sftp-server')


def run(*args):
    return subprocess.check_output(args, text=True, timeout=600).strip()


def check(value, pattern):
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        raise ValueError('Invalid reviewed pin')
    return value


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def extract(archive, destination, expected):
    if digest(archive) != expected:
        raise ValueError('Archive digest mismatch')
    with tarfile.open(archive) as source:
        members = source.getmembers()
        names = [member.name for member in members]
        if len(set(names)) != len(names) or any(
            not member.isfile() or member.size > 2 * 1024 ** 3 or
            member.name.startswith('/') or '..' in Path(member.name).parts
            for member in members
        ):
            raise ValueError('Only bounded, unique regular archive members permitted')
        if sum(member.size for member in members) > 5 * 1024 ** 3:
            raise ValueError('Archive quota exceeded')
        source.extractall(destination, filter='data')


def validate_node_archive(source, prefix):
    # Official Node archives include the exact root directory without a slash.
    # Accept that directory only; every other entry must remain under it.
    members = source.getmembers()
    if len({m.name for m in members}) != len(members) or any(
            (m.name == prefix and not m.isdir()) or
            (m.name != prefix and not m.name.startswith(prefix + '/')) or
            '..' in Path(m.name).parts
            for m in members):
        raise ValueError('Invalid Node archive')


def ssh_unit_masked(unit):
    # systemctl deliberately returns a nonzero status for disabled/masked units.
    # Accept only its exact masked state, never generic command failure.
    state = subprocess.run(['/usr/bin/systemctl', 'is-enabled', unit],
                           text=True, capture_output=True, timeout=30)
    return state.returncode in (0, 1) and state.stdout.strip() == 'masked'


def remove_ssh_server():
    for unit in ('ssh.service', 'ssh.socket', 'sshd.service'):
        run('/usr/bin/systemctl', 'mask', unit)
    installed = run('/usr/bin/dpkg-query', '-W', '-f=${binary:Package}\n').splitlines()
    ssh = [name for name in SSH_SERVER_PACKAGES if name in installed]
    if ssh:
        run('/usr/bin/dpkg', '--purge', *ssh)
    # Debian maintainer scripts can purge systemd masks along with the units.
    # Reapply the fixed masks AFTER package removal, before the reboot/seal.
    for unit in ('ssh.service', 'ssh.socket', 'sshd.service'):
        run('/usr/bin/systemctl', 'mask', unit)
        if not ssh_unit_masked(unit):
            raise ValueError('SSH unit mask missing after purge: ' + unit)
    if Path('/usr/sbin/sshd').exists() or Path('/usr/lib/openssh/sftp-server').exists():
        raise ValueError('SSH server removal failed')
    if run('/usr/bin/dpkg', '--audit'):
        raise ValueError('Broken package state after SSH removal')

def prepare():
    if os.getuid() != 0 or os.uname().machine != 'x86_64':
        raise ValueError('Isolated x86_64 build instance required')
    extract(Path('/tmp/athena-payload.tar'), Path('/opt/athena-build'), os.environ['PAYLOAD_SHA256'])
    payload = json.loads(Path('/opt/athena-build/payload-manifest.json').read_text())
    if payload['status'] != 'REVIEW_REQUIRED_NOT_AN_AMI' or payload['previewEnabled'] or payload['runtimePermissionsActivated']:
        raise ValueError('Payload activation prohibited')
    for name, expected in payload['files'].items():
        if name.startswith('/') or '..' in Path(name).parts:
            raise ValueError('Invalid payload path')
        if digest(Path('/opt/athena-build') / name) != expected:
            raise ValueError('Payload member changed')
    extract(Path('/tmp/athena-tools.tar'), ROOT, os.environ['TOOLS_SHA256'])
    lock_path = ROOT / 'lock.json'
    if digest(lock_path) != os.environ['LOCK_SHA256']:
        raise ValueError('Tool lock changed')
    lock = json.loads(lock_path.read_text())
    # Zod validates this lock before packaging. Recheck every used field here.
    if set(lock) != {'schemaVersion', 'baseAmiId', 'kernelAbi', 'packageInventorySha256', 'baseInventory', 'nodeVersion', 'ssmInstallation', 'dockerBase', 'artifacts', 'packages'} or lock['schemaVersion'] != '2':
        raise ValueError('Unknown tool lock')
    if lock['baseAmiId'] != os.environ['BASE_AMI']:
        raise ValueError('Base AMI pin differs')
    check(lock['nodeVersion'], r'24\.\d+\.\d+')
    ssm_pin = lock['ssmInstallation']
    check(ssm_pin['runtimeVersion'], r'3\.\d+\.\d+\.\d+')
    if tuple(map(int, ssm_pin['runtimeVersion'].split('.'))) < (3, 3, 2746, 0):
        raise ValueError('SSM too old')
    if ssm_pin['artifactSha256'] != lock['artifacts']['ssm']['sha256']:
        raise ValueError('SSM artifact pin differs')
    if ssm_pin['strategy'] == 'snap':
        if set(ssm_pin) != {'strategy', 'runtimeVersion', 'revision', 'artifactSha256', 'refreshHeld'} or ssm_pin['refreshHeld'] is not True:
            raise ValueError('Invalid Snap pin')
        check(ssm_pin['revision'], r'[1-9][0-9]{0,9}')
    elif ssm_pin['strategy'] == 'deb':
        if set(ssm_pin) != {'strategy', 'runtimeVersion', 'packageVersion', 'artifactSha256'}:
            raise ValueError('Invalid DEB pin')
        check(ssm_pin['packageVersion'], re.escape(ssm_pin['runtimeVersion']) + r'-[1-9][0-9]*')
    else:
        raise ValueError('Unsupported SSM strategy')
    check(lock['dockerBase'], r'node@sha256:[a-f0-9]{64}')
    if set(lock['artifacts']) != {'node', 'ssm', 'pnpm'}:
        raise ValueError('Unknown artifacts')
    expected_names = {'lock.json'}
    for key, artifact in lock['artifacts'].items():
        if set(artifact) != {'file', 'sha256'}:
            raise ValueError('Invalid artifact pin')
        check(artifact['file'], r'[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}')
        check(artifact['sha256'], r'[a-f0-9]{64}')
        if artifact['file'] in expected_names or digest(ROOT / artifact['file']) != artifact['sha256']:
            raise ValueError('Artifact collision or digest mismatch')
        expected_names.add(artifact['file'])
    check(lock['kernelAbi'], r'[0-9]+\.[0-9]+\.[0-9]+-[0-9]+-aws')
    check(lock['packageInventorySha256'], r'[a-f0-9]{64}')
    base = lock['baseInventory']
    if not isinstance(base, list) or not 1 <= len(base) <= 2000 or len({p['name'] for p in base}) != len(base):
        raise ValueError('Invalid base inventory')
    for package in base:
        if set(package) != {'name', 'version', 'architecture', 'sourceRepository'} or package['sourceRepository'] != 'base-ami:' + lock['baseAmiId']:
            raise ValueError('Base provenance differs')
        check(package['name'], r'[a-z0-9][a-z0-9+.-]{0,79}')
        if run('/usr/bin/dpkg-query', '-W', '-f=${Version}', package['name']) != package['version'] or run('/usr/bin/dpkg-query', '-W', '-f=${Architecture}', package['name']) != package['architecture']:
            raise ValueError('Pristine base package inventory differs')
    required = {'linux-aws', 'systemd', 'cloud-init', 'iproute2', 'util-linux', 'snapd', 'python3-minimal', 'python3.12', 'python3.12-minimal', 'libpython3.12-stdlib', 'linux-image-' + lock['kernelAbi'], 'linux-modules-' + lock['kernelAbi'], 'git', 'python3', 'docker.io', 'containerd', 'runc', 'iptables', 'ca-certificates', 'xz-utils'}
    packages = lock['packages']
    if not isinstance(packages, list) or not 1 <= len(packages) <= 200:
        raise ValueError('Package inventory quota')
    package_names = set()
    debs = []
    for package in packages:
        if set(package) != {'name', 'version', 'architecture', 'sourceRepository', 'file', 'sha256'}:
            raise ValueError('Unknown package field')
        check(package['name'], r'[a-z0-9][a-z0-9+.-]{0,79}')
        check(package['version'], r'[a-zA-Z0-9][a-zA-Z0-9.+:~_-]{0,127}')
        check(package['file'], r'[a-zA-Z0-9][a-zA-Z0-9._+~-]{0,127}\.deb')
        check(package['sha256'], r'[a-f0-9]{64}')
        check(package['sourceRepository'], r'https?://(?:[a-z0-9.-]+\.ec2\.archive\.ubuntu\.com|archive\.ubuntu\.com|security\.ubuntu\.com)/ubuntu/[^\s]+')
        if package['architecture'] not in ('amd64', 'all'):
            raise ValueError('Wrong package architecture')
        path = ROOT / package['file']
        if package['name'].startswith('openssh') or package['name'] in package_names or package['file'] in expected_names or digest(path) != package['sha256']:
            raise ValueError('Unreviewed package')
        if run('/usr/bin/dpkg-deb', '-f', str(path), 'Package') != package['name'] or run('/usr/bin/dpkg-deb', '-f', str(path), 'Version') != package['version']:
            raise ValueError('DEB identity differs')
        if run('/usr/bin/dpkg-deb', '-f', str(path), 'Architecture') != package['architecture']:
            raise ValueError('Wrong DEB architecture')
        package_names.add(package['name'])
        expected_names.add(package['file'])
        debs.append(str(path))
    if not required <= (package_names | {p['name'] for p in base}) or {str(p.relative_to(ROOT)) for p in ROOT.rglob('*') if p.is_file()} != expected_names:
        raise ValueError('Missing tooling or extra archive members')
    # No mutable apt repository, unpinned upgrade, credential or shell input.
    os.environ['DEBIAN_FRONTEND'] = 'noninteractive'
    run('/usr/bin/dpkg', '--install', *debs)
    for package in packages:
        if run('/usr/bin/dpkg-query', '-W', '-f=${Version}', package['name']) != package['version']:
            raise ValueError('Installed package pin differs')
    node = ROOT / lock['artifacts']['node']['file']
    prefix = 'node-v' + lock['nodeVersion'] + '-linux-x64'
    with tarfile.open(node) as source:
        validate_node_archive(source, prefix)
        source.extractall(ROOT / 'node', filter='data')
    run('/usr/bin/cp', '-a', str(ROOT / 'node' / prefix) + '/.', '/usr/local/')
    if run('/usr/local/bin/node', '--version') != 'v' + lock['nodeVersion']:
        raise ValueError('Node version differs')
    ssm = ROOT / lock['artifacts']['ssm']['file']
    if ssm_pin['strategy'] == 'snap':
        # Retain the base agent: no removal, refresh, channel change or DEB conversion.
        current = Path('/snap/amazon-ssm-agent/current')
        archive = Path('/var/lib/snapd/snaps/amazon-ssm-agent_' + ssm_pin['revision'] + '.snap')
        if Path('/usr/bin/amazon-ssm-agent').exists() or current.resolve() != Path('/snap/amazon-ssm-agent') / ssm_pin['revision'] or digest(archive) != ssm_pin['artifactSha256']:
            raise ValueError('Exact preinstalled Snap required')
        run('/usr/bin/snap', 'refresh', '--hold=forever', 'amazon-ssm-agent')
        unit = 'snap.amazon-ssm-agent.amazon-ssm-agent.service'
        binary = '/snap/amazon-ssm-agent/current/amazon-ssm-agent'
    else:
        if Path('/snap/amazon-ssm-agent').exists():
            raise ValueError('Implicit Snap to DEB conversion prohibited')
        if run('/usr/bin/dpkg-deb', '-f', str(ssm), 'Package') != 'amazon-ssm-agent' or run('/usr/bin/dpkg-deb', '-f', str(ssm), 'Version') != ssm_pin['packageVersion'] or run('/usr/bin/dpkg-deb', '-f', str(ssm), 'Architecture') != 'amd64':
            raise ValueError('SSM package differs')
        run('/usr/bin/dpkg', '--install', str(ssm))
        unit = 'amazon-ssm-agent.service'
        binary = '/usr/bin/amazon-ssm-agent'
        run('/usr/bin/systemctl', 'enable', '--now', unit)
    if run(binary, '-version') != 'SSM Agent version: ' + ssm_pin['runtimeVersion'] or run('/usr/bin/systemctl', 'is-active', unit) != 'active':
        raise ValueError('SSM release or health differs')
    Path('/opt/athena-build/ssm-installation.json').write_text(json.dumps(ssm_pin, sort_keys=True, separators=(',', ':')) + '\n')
    run('/usr/bin/systemctl', 'start', 'docker.service')
    # Docker save/load loses registry manifest identity. Fetch only the reviewed
    # literal digest; no mutable tag or registry credential is used. Container
    # build RUN steps remain network=none with the pinned local pnpm artifact.
    run('/usr/bin/docker', 'pull', '--platform=linux/amd64', lock['dockerBase'])
    run('/usr/bin/docker', 'image', 'inspect', lock['dockerBase'])
    run('/usr/bin/cp', str(ROOT / lock['artifacts']['pnpm']['file']), '/opt/athena-build/image/pnpm.tgz')
    for tag, recipe in [('alexa-engineering-node:1', 'task-node.Dockerfile'), ('athena-registry-proxy:1', 'registry-proxy.Dockerfile')]:
        run('/usr/bin/docker', 'build', '--pull=false', '--network=none', '--build-arg', 'REVIEWED_NODE_IMAGE=' + lock['dockerBase'], '--tag', tag, '--file', '/opt/athena-build/image/' + recipe, '/opt/athena-build')
    if run('/usr/bin/docker', 'run', '--rm', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=32', '--memory=128m', '--cpus=0.5', 'alexa-engineering-node:1', 'pnpm', '--version') != '11.17.0':
        raise ValueError('pnpm version differs')
    # Apply early boot PID setting BEFORE sealing. Reboot happens in AWSTOE.
    run('/usr/bin/install', '-m', '0444', '/opt/athena-build/image/90-athena.conf', '/etc/sysctl.d/90-athena.conf')
    Path('/etc/fstab').write_text('\n'.join(line for line in Path('/etc/fstab').read_text().splitlines() if not re.search(r'\s+swap\s+', line)) + '\n')
    run('/usr/sbin/swapoff', '--all')
    remove_ssh_server()
    Path('/etc/athena-build-lock.json').write_bytes(lock_path.read_bytes())
    os.chmod('/etc/athena-build-lock.json', 0o444)


if __name__ == '__main__':
    prepare()
