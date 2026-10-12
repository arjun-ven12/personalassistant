"""Fixed pre-publication cleanup. Root on disposable AWS builder only.
Image Builder's default SanitizeInstance follows this; never override user data
or use skip_cleanup markers. Preserve live AWSTOE/SSM state until it finishes.
"""
from pathlib import Path
import shutil
import subprocess


def remove(path):
    item = Path(path)
    if item.is_dir() and not item.is_symlink():
        shutil.rmtree(item)
    elif item.exists() or item.is_symlink():
        item.unlink()


def clean():
    if subprocess.check_output(['/usr/bin/id', '-u'], text=True).strip() != '0':
        raise ValueError('Disposable image build root required')
    subprocess.run(['/usr/bin/docker', 'builder', 'prune', '--all', '--force'], check=True, timeout=120)
    # Keep the two reviewed local task images. Never prune all image layers.
    for path in ('/opt/athena-tools', '/opt/athena-build', '/tmp/athena-tools.tar', '/tmp/athena-payload.tar', '/root/.aws', '/root/.ssh', '/root/.npm', '/root/.cache', '/root/.docker', '/root/.bash_history', '/root/.python_history', '/etc/ssh', '/var/cache/apt/archives', '/var/log/cloud-init.log', '/var/log/cloud-init-output.log'):
        remove(path)
    for home in Path('/home').iterdir():
        if home.is_dir():
            for name in ('.aws', '.ssh', '.npm', '.cache', '.docker', '.bash_history'):
                remove(home / name)
    # AWS default sanitation removes build logs, cloud-init, SSH host keys and
    # orchestration residue immediately before CreateImage, not during AWSTOE.
    if any(Path('/run/athena').iterdir()):
        raise ValueError('Unexpected workload material in image builder')


if __name__ == '__main__':
    clean()
