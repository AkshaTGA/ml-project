#!/usr/bin/env bash
# CPU-only install. The CUDA PyTorch wheel is several gigabytes and is not required.
set -euo pipefail
cd "$(dirname "$0")"
python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
.venv/bin/pip install --no-cache-dir -r requirements.txt
# Native Booster API only. --no-deps skips the CUDA NCCL wheel xgboost would otherwise pull.
.venv/bin/pip install --no-cache-dir --no-deps "xgboost>=2.1"
echo "Installed. Start with: .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8100"
echo "Endpoints: /targets/{slug}/predict  /yield/predict  /soil/predict  /cattle/predict"
