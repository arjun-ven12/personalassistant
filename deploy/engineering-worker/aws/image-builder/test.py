"""Read-only image checks plus one bounded disposable offline container probe.
Runs as root ONLY in Image Builder build/test instances. No workload bootstrap.
Destructive, network and signed-worker release gates remain separate.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess


def run(*args):
    return subprocess.check_output(args, text=True, timeout=60).strip()


def verify():
    if os.getuid() != 0 or os.uname().machine != 'x86_64':
        raise ValueError('Expected x86_64 builder')
    lock = json.loads(Path('/etc/athena-build-lock.json').read_text())
    assert run('/usr/local/bin/node', '--version') == 'v' + lock['nodeVersion']
    ssm = lock['ssmInstallation']
    if ssm['strategy'] == 'snap':
        unit = 'snap.amazon-ssm-agent.amazon-ssm-agent.service'
        assert not Path('/usr/bin/amazon-ssm-agent').exists()
        assert Path('/snap/amazon-ssm-agent/current').resolve() == Path('/snap/amazon-ssm-agent') / ssm['revision']
        assert hashlib.sha256(Path('/var/lib/snapd/snaps/amazon-ssm-agent_' + ssm['revision'] + '.snap').read_bytes()).hexdigest() == ssm['artifactSha256']
        rows = run('/usr/bin/snap', 'list', '--unicode=never', 'amazon-ssm-agent').splitlines()
        assert len(rows) == 2 and rows[1].split()[1:3] == [ssm['runtimeVersion'], ssm['revision']] and 'held' in rows[1].split()[-1].split(',')
        binary = '/snap/amazon-ssm-agent/current/amazon-ssm-agent'
    else:
        unit = 'amazon-ssm-agent.service'
        assert not Path('/snap/amazon-ssm-agent/current').exists()
        assert run('/usr/bin/dpkg-query', '-W', '-f=${Version}', 'amazon-ssm-agent') == ssm['packageVersion']
        binary = '/usr/bin/amazon-ssm-agent'
    assert run(binary, '-version') == 'SSM Agent version: ' + ssm['runtimeVersion']
    assert run('/usr/bin/systemctl', 'is-active', unit) == 'active'
    assert os.uname().release == lock['kernelAbi']
    changed = {p['name'] for p in lock['packages']}
    for package in lock['baseInventory']:
        if package['name'] not in changed and package['name'] not in ('ec2-instance-connect', 'openssh-server', 'openssh-sftp-server'):
            assert run('/usr/bin/dpkg-query', '-W', '-f=${Version}', package['name']) == package['version']
    for package in lock['packages']:
        assert run('/usr/bin/dpkg-query', '-W', '-f=${Version}', package['name']) == package['version']
    for file in ('/usr/bin/git', '/usr/bin/python3', '/usr/bin/docker', '/usr/sbin/iptables'):
        assert Path(file).is_file() and os.access(file, os.X_OK)
    assert Path('/sys/fs/cgroup/cgroup.controllers').is_file()
    assert int(Path('/proc/sys/kernel/pid_max').read_text()) <= 512
    for process in Path('/proc').iterdir():
        if process.name.isdigit():
            assert int(process.name) < 512
            try:
                for thread in (process / 'task').iterdir():
                    assert int(thread.name) < 512
            except FileNotFoundError:
                pass  # Process exited; never ignore a live out-of-range thread.
    assert len(Path('/proc/swaps').read_text().splitlines()) == 1
    assert len(os.sched_getaffinity(0)) <= 2
    memory_kib = int(Path('/proc/meminfo').read_text().split('MemTotal:')[1].split()[0])
    assert memory_kib <= 4096 * 1024
    assert int(run('/usr/bin/findmnt', '-b', '-n', '-o', 'SIZE', '/')) <= 10 * 1024 ** 3
    assert run('/usr/bin/systemctl', 'is-enabled', unit) == 'enabled'
    for unit in ('athena-watchdog.service', 'athena-deadline.timer'):
        assert run('/usr/bin/systemctl', 'is-enabled', unit) == 'enabled'
    for unit in ('ssh.service', 'ssh.socket', 'sshd.service'):
        mask = subprocess.run(['/usr/bin/systemctl', 'is-enabled', unit], text=True, capture_output=True, timeout=30).stdout.strip()
        assert mask == 'masked', 'SSH mask differs: ' + unit + ' state=' + mask[:80]
    assert not Path('/etc/ssh').exists()
    assert not Path('/usr/sbin/sshd').exists()
    assert not Path('/usr/lib/openssh/sftp-server').exists()
    assert not run('/usr/bin/dpkg', '--audit')
    for package in ('ec2-instance-connect', 'openssh-server', 'openssh-sftp-server'):
        state = subprocess.run(['/usr/bin/dpkg-query', '-W', '-f=${db:Status-Status}', package], text=True, capture_output=True, timeout=30)
        assert state.returncode == 1 or state.stdout.strip() == 'not-installed'
    assert not any(Path('/run/athena').iterdir())
    for path in ('/opt/athena-build', '/opt/athena-tools', '/root/.aws', '/root/.ssh', '/root/.docker', '/root/.npm'):
        assert not Path(path).exists()
    run('/usr/bin/systemd-analyze', 'verify', '/etc/systemd/system/athena-worker.service', '/etc/systemd/system/athena-watchdog.service', '/etc/systemd/system/athena-expire.service', '/etc/systemd/system/athena-deadline.timer', '/etc/systemd/system/athena-network.service')
    assert not any(Path('/workspace').rglob('*.*'))
    assert Path('/proc/sys/net/ipv6/conf/all/disable_ipv6').read_text().strip() == '1'
    daemon = json.loads(Path('/etc/docker/daemon.json').read_text())
    assert daemon['exec-opts'] == ['native.cgroupdriver=systemd']
    assert not daemon.get('hosts')
    listeners = run('/usr/bin/ss', '-H', '-ltn').splitlines()
    assert not any(line.split()[3].rsplit(':', 1)[-1] in ('22', '2375', '2376') for line in listeners)
    assert run('/usr/bin/docker', 'info', '--format', '{' * 2 + '.CgroupVersion' + '}' * 2) == '2'
    assert run('/usr/bin/docker', 'info', '--format', '{' * 2 + '.CgroupDriver' + '}' * 2) == 'systemd'
    assert not run('/usr/bin/docker', 'ps', '-aq')
    manifest_path = Path('/etc/athena/image-manifest.json')
    manifest = json.loads(manifest_path.read_text())
    # Same canonical JS encoding as sealEc2Image; Python dumps differs.
    runtime_digest = run('/usr/local/bin/node', '-e', "const fs=require('node:fs'),c=require('node:crypto');console.log(c.createHash('sha256').update(JSON.stringify(JSON.parse(fs.readFileSync('/etc/athena/image-manifest.json','utf8')))).digest('hex'))")
    for file, expected in manifest['files'].items():
        path = Path(file)
        stat = path.lstat()
        assert path.is_file() and not path.is_symlink() and stat.st_uid == 0 and not stat.st_mode & 0o022
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected
    for tag, expected in manifest['images'].items():
        assert run('/usr/bin/docker', 'image', 'inspect', '--format', '{' * 2 + '.Id' + '}' * 2, tag) == 'sha256:' + expected
        assert run('/usr/bin/docker', 'image', 'inspect', '--format', '{' * 2 + '.Config.User' + '}' * 2, tag) == '65532:65532'
    # This finite script checks a real seccomp/no-new-privileges/read-only/offline
    # container; it does NOT exhaust resources or access signer/metadata secrets.
    probe = "const fs=require('node:fs');const s=fs.readFileSync('/proc/self/status','utf8');if(!/^NoNewPrivs:[ \\t]+1$/m.test(s)||!/^Seccomp:[ \\t]+2$/m.test(s))throw Error('containment');try{fs.writeFileSync('/athena-test','x');throw Error('writable root')}catch(e){if(e.code!=='EROFS')throw e}if(fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim()!=='32')throw Error('pid quota');if(fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim()!=='134217728')throw Error('memory quota');if(fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim()!=='50000 100000')throw Error('cpu quota');if(process.getuid()!==65532||!/^CapEff:[ \\t]+0+$/m.test(s))throw Error('privilege');if(fs.existsSync('/etc/athena')||fs.existsSync('/run/athena')||fs.existsSync('/var/run/docker.sock'))throw Error('host mount');if(fs.readFileSync('/proc/net/route','utf8').trim().split('\\n').length!==1)throw Error('network route');console.log('safe-probe-ok')"
    assert run('/usr/bin/docker', 'run', '--rm', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=32', '--memory=128m', '--cpus=0.5', '--user=65532:65532', '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m', 'alexa-engineering-node:1', 'node', '-e', probe) == 'safe-probe-ok'
    record = json.loads(Path('/etc/athena-image-build.json').read_text())
    assert record['sealedRuntimeSha256'] == runtime_digest
    assert record['releaseStatus'] == 'PENDING_LIVE_RELEASE_GATE'
    assert record['runtimePermissionsActivated'] is False and record['previewEnabled'] is False
    print(json.dumps({'status': 'SAFE_IMAGE_CHECKS_PASSED_NOT_RELEASED', 'sealedRuntimeSha256': runtime_digest}))


if __name__ == '__main__':
    verify()
