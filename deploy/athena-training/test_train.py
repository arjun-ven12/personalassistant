import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import uuid

spec = importlib.util.spec_from_file_location('athena_train', Path(__file__).with_name('train.py'))
trainer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trainer)


def fixture():
    prepared = {'ownerId': str(uuid.uuid4()), 'companyId': str(uuid.uuid4()), 'datasetVersion': 'synthetic-v1',
                'datasetDigest': 'a' * 64, 'formatVersion': 'ATHENA_PATCH_V1'}
    splits = {}
    for i, split in enumerate(('train', 'validation', 'evaluation')):
        sample = {'key': str(i) * 64, 'objectiveId': str(uuid.uuid4()), 'candidateId': str(uuid.uuid4()),
                  'repositoryId': str(uuid.uuid4()), 'taskId': str(uuid.uuid4()), 'category': 'UI',
                  'instruction': f'Synthetic case {i}', 'context': f'Synthetic input {i}', 'response': f'final fixture patch {i}'}
        sample['contentHash'] = trainer.digest([sample['instruction'], sample['context'], sample['response']])
        prepared[split] = [sample]
        splits[split] = [{'key': sample['key'], 'contentHash': sample['contentHash']}]
    prepared['manifestDigest'] = trainer.digest({**{key: prepared[key] for key in ('ownerId', 'companyId', 'datasetVersion', 'datasetDigest', 'formatVersion')}, 'splits': splits})
    return {'runId': str(uuid.uuid4()), 'baseDigest': 'b' * 64, 'prepared': prepared, 'evidence': 'SYNTHETIC',
            'config': {'method': 'LORA', 'seed': 42, 'rank': 8, 'alpha': 16, 'epochs': 1, 'learningRate': 0.0001, 'maxSequenceTokens': 512}}


class OfflineTrainerSecurity(unittest.TestCase):
    def test_valid_fixture_and_deterministic_manifest(self):
        job = fixture()
        prepared, config = trainer.validate_job(job)
        self.assertEqual(prepared['formatVersion'], 'ATHENA_PATCH_V1')
        self.assertEqual(config['method'], 'LORA')
        self.assertEqual(trainer.digest({'b': 2, 'a': 1}), trainer.digest({'a': 1, 'b': 2}))

    def test_no_credential_or_proxy_environment(self):
        for name in ('AWS_ACCESS_KEY_ID', 'GITHUB_TOKEN', 'DATABASE_URL', 'HF_TOKEN', 'HTTPS_PROXY'):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'CREDENTIAL_ENV_DENIED'):
                trainer.check_environment({name: 'synthetic-canary'})
        trainer.check_environment({'HF_HUB_OFFLINE': '1', 'CUDA_VISIBLE_DEVICES': '0'})

    def test_schema_paths_and_unbounded_config_denied(self):
        for field in ('command', 'modelPath', 'executable', 'ownerApproval'):
            job = fixture(); job[field] = 'untrusted'
            with self.assertRaisesRegex(ValueError, 'SCHEMA_DENIED'):
                trainer.validate_job(job)
        for field, value in [('rank', 10000), ('epochs', 0), ('learningRate', float('nan')), ('seed', True)]:
            job = fixture(); job['config'][field] = value
            with self.assertRaisesRegex(ValueError, 'CONFIG_DENIED'):
                trainer.validate_job(job)

    def test_hash_tampering_secret_and_split_leakage_denied(self):
        job = fixture(); job['prepared']['train'][0]['response'] = 'tampered'
        with self.assertRaisesRegex(ValueError, 'CONTENT_HASH'):
            trainer.validate_job(job)
        job = fixture(); job['prepared']['train'][0]['response'] = 'password = "synthetic-canary-value"'
        with self.assertRaisesRegex(ValueError, 'TEXT_DENIED'):
            trainer.validate_job(job)
        job = fixture(); job['prepared']['train'][0]['objectiveId'] = job['prepared']['evaluation'][0]['objectiveId']
        with self.assertRaisesRegex(ValueError, 'SPLIT_LEAKAGE'):
            trainer.validate_job(job)

    def test_pickle_code_and_symlinks_are_not_model_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'config.json').write_text('{}')
            self.assertEqual(len(trainer.artifact_inventory(root)), 1)
            (root / 'weights.bin').write_bytes(b'synthetic')
            with self.assertRaisesRegex(ValueError, 'ARTIFACT_TYPE_DENIED'):
                trainer.artifact_inventory(root)
            (root / 'weights.bin').unlink()
            (root / 'linked.json').symlink_to(root / 'config.json')
            with self.assertRaisesRegex(ValueError, 'SYMLINK_DENIED'):
                trainer.artifact_inventory(root)


if __name__ == '__main__':
    unittest.main()
