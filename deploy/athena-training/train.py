"""Finite offline general Athena engineering adapter trainer. No application executor.

Only fixed container mounts are used. Launch belongs to a separately reviewed
trainer host; this script cannot deploy, activate, approve, or contact a provider.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import time

ROOT = Path('/training')
MAX_INPUT_BYTES = 16 * 1024 * 1024


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def read_json(path, limit):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > limit:
        raise ValueError('TRAINING_INPUT_DENIED')
    return json.loads(path.read_text())


def check_environment(environment):
    # No production/AWS/GitHub/HF keys or proxy credentials may reach the trainer.
    forbidden = re.compile(r'(TOKEN|SECRET|PASSWORD|CREDENTIAL|DATABASE|AWS_|GITHUB|COOKIE|PRIVATE_KEY|PROXY)', re.I)
    if any(forbidden.search(name) and value for name, value in environment.items()):
        raise ValueError('TRAINER_CREDENTIAL_ENV_DENIED')


def artifact_inventory(directory):
    result = []
    for path in sorted(directory.rglob('*')):
        if path.is_symlink():
            raise ValueError('TRAINING_SYMLINK_DENIED')
        if not path.is_file():
            continue
        if path.suffix not in ('.json', '.safetensors', '.model', '.txt', '.tiktoken'):
            raise ValueError('TRAINING_ARTIFACT_TYPE_DENIED')
        hasher = hashlib.sha256()
        with path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                hasher.update(chunk)
        result.append({'name': path.relative_to(directory).as_posix(), 'digest': hasher.hexdigest()})
    if not result or len(result) > 1000:
        raise ValueError('TRAINING_ARTIFACT_INVENTORY_DENIED')
    return result


def validate_job(job):
    if set(job) != {'runId', 'baseDigest', 'prepared', 'config', 'evidence'}:
        raise ValueError('TRAINING_JOB_SCHEMA_DENIED')
    if job['evidence'] not in ('REAL', 'SYNTHETIC') or not re.fullmatch(r'[a-f0-9]{64}', job['baseDigest']):
        raise ValueError('TRAINING_IDENTITY_DENIED')
    if not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', job['runId']):
        raise ValueError('TRAINING_RUN_ID_DENIED')
    config = job['config']
    bounds = {'seed': (0, 2147483647), 'rank': (4, 64), 'alpha': (4, 128), 'epochs': (1, 5),
              'learningRate': (0.000001, 0.001), 'maxSequenceTokens': (128, 4096)}
    if set(config) != set(bounds) | {'method'} or config['method'] not in ('LORA', 'QLORA'):
        raise ValueError('TRAINING_CONFIG_DENIED')
    for key, (low, high) in bounds.items():
        value = config[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError('TRAINING_CONFIG_DENIED')
        if key != 'learningRate' and not isinstance(value, int):
            raise ValueError('TRAINING_CONFIG_DENIED')
    prepared = job['prepared']
    if set(prepared) != {'ownerId', 'companyId', 'datasetVersion', 'datasetDigest', 'formatVersion', 'manifestDigest', 'train', 'validation', 'evaluation'} or prepared['formatVersion'] != 'ATHENA_PATCH_V1':
        raise ValueError('TRAINING_FORMAT_DENIED')
    for field in ('ownerId', 'companyId'):
        if not isinstance(prepared[field], str) or not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}', prepared[field]):
            raise ValueError('TRAINING_SCOPE_DENIED')
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', prepared['datasetVersion']) or not re.fullmatch(r'[a-f0-9]{64}', prepared['datasetDigest']):
        raise ValueError('TRAINING_DATASET_IDENTITY_DENIED')
    objective_splits = {}
    content_seen = set()
    manifest_splits = {}
    sample_fields = {'key', 'objectiveId', 'candidateId', 'repositoryId', 'taskId', 'category', 'instruction', 'context', 'response', 'contentHash'}
    secret = re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bBearer\s+[A-Za-z0-9._~+/-]{16,}|\b(?:ghp|github_pat|sk)[-_A-Za-z0-9]{16,}|\b(?:password|secret|access_token|api_key)\s*["\x27]?\s*[:=]\s*["\x27]?[^\s"\x27]{8,}', re.I)
    for split in ('train', 'validation', 'evaluation'):
        values = prepared[split]
        if not isinstance(values, list) or not 1 <= len(values) <= 10000:
            raise ValueError('TRAINING_SPLIT_DENIED')
        manifest_splits[split] = []
        for sample in values:
            if set(sample) != sample_fields:
                raise ValueError('TRAINING_SAMPLE_DENIED')
            if not re.fullmatch(r'[a-f0-9]{64}', sample['key']) or sample['category'] not in ('UI', 'CRUD', 'BUGFIX', 'TESTS', 'REFACTOR', 'MULTI_FILE', 'CONVENTIONS', 'DOCS', 'OTHER'):
                raise ValueError('TRAINING_SAMPLE_IDENTITY_DENIED')
            for field, limit in [('instruction', 16000), ('context', 131072), ('response', 131072)]:
                if not isinstance(sample[field], str) or not 1 <= len(sample[field]) <= limit or secret.search(sample[field]):
                    raise ValueError('TRAINING_TEXT_DENIED')
            identity = digest([sample['instruction'], sample['context'], sample['response']])
            if identity != sample['contentHash'] or identity in content_seen:
                raise ValueError('TRAINING_CONTENT_HASH_OR_DUPLICATE_DENIED')
            content_seen.add(identity)
            previous = objective_splits.setdefault(sample['objectiveId'], split)
            if previous != split:
                raise ValueError('TRAINING_SPLIT_LEAKAGE_DENIED')
            manifest_splits[split].append({'key': sample['key'], 'contentHash': sample['contentHash']})
    manifest = {key: prepared[key] for key in ('ownerId', 'companyId', 'datasetVersion', 'datasetDigest', 'formatVersion')}
    manifest['splits'] = manifest_splits
    if digest(manifest) != prepared['manifestDigest']:
        raise ValueError('TRAINING_MANIFEST_HASH_DENIED')
    return prepared, config


def run():
    check_environment(os.environ)
    job = read_json(ROOT / 'input' / 'job.json', MAX_INPUT_BYTES)
    prepared, config = validate_job(job)
    base = ROOT / 'base'
    output = ROOT / 'output'
    if base.is_symlink() or output.is_symlink() or any(output.iterdir()):
        raise ValueError('TRAINING_MOUNT_DENIED')
    if digest(artifact_inventory(base)) != job['baseDigest']:
        raise ValueError('TRAINING_BASE_DIGEST_MISMATCH')
    base_config = read_json(base / 'config.json', 1024 * 1024)
    if base_config.get('model_type') != 'qwen2' or 'auto_map' in base_config:
        raise ValueError('TRAINING_BASE_FAMILY_DENIED')
    # Imports occur only after bounded input, digest and credential checks.
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_DATASETS_OFFLINE='1', HF_HOME='/training/cache', TOKENIZERS_PARALLELISM='false')
    import torch
    import transformers
    import peft
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, Trainer, TrainingArguments, set_seed
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    set_seed(config['seed'])
    started = time.monotonic()
    tokenizer = AutoTokenizer.from_pretrained(str(base), local_files_only=True, trust_remote_code=False)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token_id = tokenizer.eos_token_id
    options = {'local_files_only': True, 'trust_remote_code': False, 'use_safetensors': True}
    if config['method'] == 'QLORA':
        if not torch.cuda.is_available():
            raise ValueError('QLORA_REQUIRES_REVIEWED_CUDA_RUNTIME')
        options.update(quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.float16), device_map={'': 0})
    model = AutoModelForCausalLM.from_pretrained(str(base), **options)
    model.config.use_cache = False
    if config['method'] == 'QLORA':
        model = prepare_model_for_kbit_training(model)
    model = get_peft_model(model, LoraConfig(r=config['rank'], lora_alpha=config['alpha'], target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj'], lora_dropout=0.05, bias='none', task_type='CAUSAL_LM'))

    def encode(samples):
        rows = []
        for sample in samples:
            prefix = tokenizer.apply_chat_template([{'role': 'system', 'content': 'Return the final reviewed unified patch only.'}, {'role': 'user', 'content': sample['instruction'] + '\n\n' + sample['context']}], tokenize=False, add_generation_prompt=True)
            prompt_ids = tokenizer(prefix, add_special_tokens=False)['input_ids']
            target_ids = tokenizer(sample['response'] + tokenizer.eos_token, add_special_tokens=False)['input_ids']
            # Never silently truncate a target into a falsely correct patch.
            if len(prompt_ids) + len(target_ids) > config['maxSequenceTokens']:
                raise ValueError('TRAINING_SEQUENCE_TOO_LONG')
            rows.append({'input_ids': prompt_ids + target_ids, 'attention_mask': [1] * (len(prompt_ids) + len(target_ids)), 'labels': [-100] * len(prompt_ids) + target_ids})
        return rows

    def collate(rows):
        length = max(len(row['input_ids']) for row in rows)
        return {key: torch.tensor([row[key] + [padding] * (length - len(row[key])) for row in rows]) for key, padding in [('input_ids', tokenizer.pad_token_id), ('attention_mask', 0), ('labels', -100)]}

    args = TrainingArguments(output_dir=str(output / 'checkpoints'), num_train_epochs=config['epochs'], learning_rate=config['learningRate'], per_device_train_batch_size=1,
        gradient_accumulation_steps=4, per_device_eval_batch_size=1, seed=config['seed'], data_seed=config['seed'],
        report_to='none', push_to_hub=False, save_strategy='no', logging_strategy='no', disable_tqdm=True, save_safetensors=True)
    trainer = Trainer(model=model, args=args, train_dataset=encode(prepared['train']), eval_dataset=encode(prepared['validation']), data_collator=collate)
    train_metrics = trainer.train().metrics
    validation_metrics = trainer.evaluate()
    # Held-out evaluation samples are not consumed by fitting or validation.
    adapter = output / 'adapter'
    model.save_pretrained(str(adapter), safe_serialization=True)
    adapter_digest = digest(artifact_inventory(adapter))
    result = {'runId': job['runId'], 'artifact': {'adapterDigest': adapter_digest, 'baseDigest': job['baseDigest'], 'manifestDigest': prepared['manifestDigest'],
        'evidence': job['evidence'], 'hardware': f'{platform.machine()} cuda={torch.cuda.is_available()}',
        'runtime': f'torch={torch.__version__} transformers={transformers.__version__} peft={peft.__version__}',
        'durationMs': int((time.monotonic() - started) * 1000), 'computeCostUsd': None,
        'trainLoss': train_metrics.get('train_loss'), 'validationLoss': validation_metrics.get('eval_loss')}}
    for key in ('trainLoss', 'validationLoss'):
        if result['artifact'][key] is not None and not math.isfinite(result['artifact'][key]):
            raise ValueError('TRAINING_NONFINITE_METRICS')
    (output / 'result.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    try:
        run()
    except Exception:
        # No stack trace, input text, filesystem dump or credential is emitted.
        raise SystemExit('ATHENA_TRAINING_FAILED_NO_PROMOTION')
