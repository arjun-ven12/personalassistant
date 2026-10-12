# Required reviewed digest-pinned CUDA/Python base and offline wheel artifact.
ARG TRAINING_BASE_IMAGE
FROM ${TRAINING_BASE_IMAGE}
COPY wheels /wheels
COPY requirements.lock /training/requirements.lock
RUN python -m pip install --no-index --find-links=/wheels --require-hashes -r /training/requirements.lock
COPY train.py /training/train.py
USER 65532:65532
WORKDIR /training
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_DATASETS_OFFLINE=1 HF_HOME=/training/cache
ENTRYPOINT ["python", "-I", "/training/train.py"]
