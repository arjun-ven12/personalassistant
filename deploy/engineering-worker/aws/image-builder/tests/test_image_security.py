"""Unprivileged dependency-removal and actual JS probe regressions. No root recipes."""
import ast
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

HERE = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('prepare', HERE / 'prepare.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)

class ImageSecurityTest(unittest.TestCase):
    def test_purge_server_dependents_keep_snap_client_and_check_integrity(self):
        calls = []
        def run(*args):
            calls.append(args)
            if len(args) >= 2 and args[1] == 'is-enabled':
                return 'masked'
            return 'ec2-instance-connect\nopenssh-server\nopenssh-client\nopenssh-sftp-server\nsnapd\nssh-import-id' if args[0].endswith('dpkg-query') else ''
        with patch.object(prepare, 'run', side_effect=run), patch.object(prepare, 'ssh_unit_masked', side_effect=lambda unit: calls.append(('/usr/bin/systemctl', 'is-enabled', unit)) or True), patch.object(prepare.Path, 'exists', return_value=False):
            prepare.remove_ssh_server()
        self.assertIn(('/usr/bin/dpkg', '--purge', 'ec2-instance-connect', 'openssh-server', 'openssh-sftp-server'), calls)
        self.assertIn(('/usr/bin/dpkg', '--audit'), calls)
        purge_index = calls.index(('/usr/bin/dpkg', '--purge', 'ec2-instance-connect', 'openssh-server', 'openssh-sftp-server'))
        for unit in ('ssh.service', 'ssh.socket', 'sshd.service'):
            self.assertIn(('/usr/bin/systemctl', 'mask', unit), calls[purge_index + 1:])
            self.assertIn(('/usr/bin/systemctl', 'is-enabled', unit), calls[purge_index + 1:])
        self.assertFalse(any('openssh-client' in c or '--force-depends' in c for c in calls))

    def test_server_residue_or_broken_dependencies_deny(self):
        for residue in (True, False):
            def run(*args):
                if len(args) >= 2 and args[1] == 'is-enabled':
                    return 'masked'
                return 'broken dependencies' if args == ('/usr/bin/dpkg', '--audit') else ''
            with self.subTest(residue=residue), patch.object(prepare, 'run', side_effect=run), patch.object(prepare, 'ssh_unit_masked', return_value=True), patch.object(prepare.Path, 'exists', return_value=residue):
                with self.assertRaises(ValueError):
                    prepare.remove_ssh_server()

    def test_purge_removes_masks_and_recipe_reestablishes_them(self):
        masks = set()
        def run(*args):
            if args[0].endswith('dpkg-query'):
                return 'openssh-server\nopenssh-sftp-server\nec2-instance-connect'
            if args[:2] == ('/usr/bin/dpkg', '--purge'):
                masks.clear()  # Model the actual maintainer-script failure.
            if args[:2] == ('/usr/bin/systemctl', 'mask'):
                masks.add(args[2])
            if args[:2] == ('/usr/bin/systemctl', 'is-enabled'):
                return 'masked' if args[2] in masks else 'not-found'
            return ''
        with patch.object(prepare, 'run', side_effect=run), patch.object(prepare, 'ssh_unit_masked', side_effect=lambda unit: unit in masks), patch.object(prepare.Path, 'exists', return_value=False):
            prepare.remove_ssh_server()
        self.assertEqual(masks, {'ssh.service', 'ssh.socket', 'sshd.service'})

    def test_mask_failure_denies(self):
        with patch.object(prepare, 'run', return_value='not-found'), patch.object(prepare, 'ssh_unit_masked', return_value=False):
            with self.assertRaisesRegex(ValueError, 'SSH unit mask missing'):
                prepare.remove_ssh_server()

    def test_exact_mask_state_accepts_systemd_nonzero_but_not_command_failure(self):
        for code, output, expected in [(1, 'masked\n', True), (0, 'masked', True), (2, 'masked', False), (1, 'disabled', False), (1, 'not-found', False), (1, '', False), (0, 'enabled', False)]:
            with self.subTest(code=code, output=output), patch.object(prepare.subprocess, 'run', return_value=subprocess.CompletedProcess([], code, output, '')):
                self.assertEqual(prepare.ssh_unit_masked('ssh.service'), expected)

    def test_actual_offline_probe_accepts_expected_state_and_rejects_each_breach(self):
        tree = ast.parse((HERE / 'test.py').read_text())
        probe = next(ast.literal_eval(n.value) for n in ast.walk(tree) if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'probe' for t in n.targets))
        files = {'/proc/self/status': 'NoNewPrivs:\t1\nSeccomp:\t2\nCapEff:\t00000000\n', '/sys/fs/cgroup/pids.max': '32', '/sys/fs/cgroup/memory.max': '134217728', '/sys/fs/cgroup/cpu.max': '50000 100000', '/proc/net/route': 'Iface Destination\n'}
        cases = [(files, 65532, False, False, True)]
        for path, value in [('/proc/self/status', 'NoNewPrivs:\t0\nSeccomp:\t2\nCapEff:\t00000000\n'), ('/proc/self/status', 'NoNewPrivs:\t1\nSeccomp:\t0\nCapEff:\t00000000\n'), ('/proc/self/status', 'NoNewPrivs:\t1\nSeccomp:\t2\nCapEff:\t00000001\n'), ('/sys/fs/cgroup/pids.max', 'max'), ('/sys/fs/cgroup/memory.max', 'max'), ('/sys/fs/cgroup/cpu.max', 'max 100000'), ('/proc/net/route', 'Iface Destination\neth0 00000000\n')]:
            cases.append(({**files, path: value}, 65532, False, False, False))
        cases.extend([(files, 0, False, False, False), (files, 65532, True, False, False), (files, 65532, False, True, False)])
        for fs, uid, writable, host, success in cases:
            harness = "const vm=require('node:vm');const cfg=JSON.parse(process.argv[1]);const fs={readFileSync:p=>cfg.files[p],existsSync:()=>cfg.host,writeFileSync:()=>{if(!cfg.writable){const e=new Error();e.code='EROFS';throw e}}};vm.runInNewContext(cfg.probe,{require:()=>fs,process:{getuid:()=>cfg.uid},console});"
            config = json.dumps({'probe': probe, 'files': fs, 'uid': uid, 'host': host, 'writable': writable})
            result = subprocess.run(['node', '-e', harness, config], capture_output=True, text=True, timeout=10)
            with self.subTest(uid=uid, writable=writable, host=host, files=fs):
                self.assertEqual(result.returncode == 0, success, result.stderr)
                if success:
                    self.assertEqual(result.stdout.strip(), 'safe-probe-ok')
