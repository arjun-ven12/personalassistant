"""Unprivileged Node archive path regression; no recipe or executable runs."""
import importlib.util
import io
from pathlib import Path
import tarfile
import unittest

spec = importlib.util.spec_from_file_location('prepare', Path(__file__).parents[1] / 'prepare.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
PREFIX = 'node-v24.21.0-linux-x64'

class NodeArchiveTest(unittest.TestCase):
    def archive(self, entries):
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode='w') as archive:
            for name, directory in entries:
                member = tarfile.TarInfo(name)
                member.type = tarfile.DIRTYPE if directory else tarfile.REGTYPE
                archive.addfile(member)
        data.seek(0)
        return tarfile.open(fileobj=data)

    def test_official_root_directory_shape(self):
        with self.archive([(PREFIX, True), (PREFIX + '/bin/node', False)]) as archive:
            prepare.validate_node_archive(archive, PREFIX)

    def test_root_file_traversal_foreign_and_duplicate_entries_deny(self):
        for entries in [[(PREFIX, False)], [(PREFIX + '/../escape', False)],
                        [('/' + PREFIX + '/escape', False)], [('foreign/bin/node', False)],
                        [(PREFIX, True), (PREFIX, True)]]:
            with self.subTest(entries=entries), self.archive(entries) as archive:
                with self.assertRaises(ValueError):
                    prepare.validate_node_archive(archive, PREFIX)
