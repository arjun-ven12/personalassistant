"""Pure parser regression/security checks; no AWS, root or instance commands."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('freeze', Path(__file__).resolve().parents[1] / 'freeze-packages.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

SOURCE = '''## Note, this file is written by cloud-init on first boot of an instance
## modifications made here will not survive a re-bundle.
##

# See http://help.ubuntu.com/community/UpgradeNotes for how to upgrade to
# newer versions of the distribution.

## Ubuntu distribution repository
## Types: Append deb-src to enable the fetching of source package.
Types: deb
URIs: http://ap-southeast-1.ec2.archive.ubuntu.com/ubuntu/
Suites: noble noble-updates noble-backports
Components: main universe restricted multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

## Ubuntu security updates. Aside from URIs and Suites,
## this should mirror your choices in the previous section.
Types: deb
URIs: http://security.ubuntu.com/ubuntu
Suites: noble-security
Components: main universe restricted multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
'''


class SourcesTest(unittest.TestCase):
    def test_real_cloud_init_comment_paragraphs(self):
        self.assertEqual(module.validate_sources(SOURCE), 2)

    def test_signature_and_repository_boundaries(self):
        for text in (
            SOURCE.replace('/usr/share/keyrings/ubuntu-archive-keyring.gpg', '/tmp/other.gpg'),
            SOURCE.replace('http://security.ubuntu.com/ubuntu', 'http://evil.example/ubuntu'),
            SOURCE.replace('http://security.ubuntu.com/ubuntu', 'http://token@security.ubuntu.com/ubuntu'),
            SOURCE + '\nTrusted: yes\n',
            SOURCE.replace('Types: deb\n', 'Types: deb\nTypes: deb\n'),
            SOURCE.replace('Suites: noble-security', 'Suites: jammy-security'),
            SOURCE.replace('Components: main universe restricted multiverse', 'Components: main unknown'),
            SOURCE.replace('URIs: http://security.ubuntu.com/ubuntu', 'URIs: '),
            '# Comments alone\n\n## Signed-By: ignored\n',
        ):
            with self.subTest(text=text), self.assertRaises(ValueError):
                module.validate_sources(text)


if __name__ == '__main__':
    unittest.main()
