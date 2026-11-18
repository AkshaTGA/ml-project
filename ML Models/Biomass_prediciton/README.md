# Biomass prediction

This repository contains two biomass prediction approaches from the original notebooks and a command line implementation of the final target conditioned DINO ViT-S/16 model. The approaches predict five biomass measurements from pasture images:

- `Dry_Clover_g`
- `Dry_Dead_g`
- `Dry_Green_g`
- `Dry_Total_g`
- `GDM_g`

The source data is stored in long format. Each row pairs an image and target name with one biomass value; test predictions use the competition submission columns `sample_id` and `target`.

## Approaches in the notebooks

### Approach 1: target conditioned DINO with vegetation cross attention

This is the final model block retained in `Notebooks/using-resnet-embeddings-xgboost.ipynb`. Despite the original filename, the final block uses a frozen DINO ViT-S/16 backbone; the earlier ResNet, XGBoost, and MLP experiments were removed.

1. **Read and prepare data.** Training rows provide an image path, target name, biomass value, species, state, average height, and NDVI metadata. Species and state are encoded as class IDs. Each target name is mapped to a stable integer ID.
2. **Standardize images.** Images are converted to RGB, resized to 224 by 224, converted to tensors, and normalized with ImageNet channel statistics.
3. **Extract visual tokens.** The pretrained DINO ViT-S/16 produces a 14 by 14 grid of patch tokens. The class token is removed. The backbone is frozen, so learning happens in the fusion and prediction layers rather than in the pretrained image encoder.
4. **Add a vegetation signal.** The ExG vegetation index (`2G - R - B`) is computed from the image and resized to the same 14 by 14 grid as the DINO tokens.
5. **Build local and global views.** The patch grid is averaged into 2 by 2 local tiles and 7 by 7 global tiles. The aligned ExG value is appended to each tile representation, then separate projection layers map both views to the embedding dimension.
6. **Exchange information with cross attention.** Global tiles attend to local tiles, and local tiles attend to the updated global tiles. This lets the model combine broad pasture context with smaller vegetation patterns.
7. **Pool and condition on the requested target.** Learned attention pooling, mean pooling, and max pooling summarize the fused image tokens. A learned embedding represents the requested target name. The image summary and target embedding are concatenated, so the same image can produce a different output for each biomass measurement.
8. **Predict with multitask heads.** Separate heads predict biomass, plant height, NDVI, species, and state. Training combines their losses: biomass MSE has weight 1.0; height and NDVI MSE each have weight 0.2; species and state cross entropy each have weight 0.1. AdamW updates the trainable layers.
9. **Generate predictions.** Inference evaluates each test row's image and target ID, clamps negative biomass predictions to zero, and writes one `sample_id,target` row per request.

The current scripts implement this approach in `model.py`, `utils.py`, `train.py`, and `test.py`. The external DINO checkpoint is required and is not stored in the repository. The original notebook's final training code included a pretrained checkpoint and train-loop settings; the cleaned scripts make data, checkpoint, seed, and training parameters configurable.

### Approach 2: SigLIP feature ensemble and DINOv3 neural model

The source of this approach is `Notebooks/dinov3-baseline-lb-0-70-aeed8c.ipynb`. Its notebook originally contains a SigLIP feature pipeline, a DINOv3 ViT-Huge model, validation/inference code, and a final blend. The cleaned notebook retains only the last ensemble block. Its upstream model training and inference blocks are therefore documented here but are not part of the current command line scripts.

#### SigLIP image and semantic features

1. Training metadata is pivoted from long rows to one row per image with five target columns. Test data is prepared in the same per-image form.
2. Each image is split into overlapping patches. A local SigLIP image encoder extracts patch features, which are averaged into one embedding per image.
3. Text prompts describing bare soil, sparse/medium/dense pasture, green vegetation, dead material, clover, and grass are encoded with SigLIP's text encoder. Similarities between image and concept embeddings form semantic features; ratios summarize greenness, clover-to-grass, and pasture cover.
4. A supervised feature engine scales image embeddings and adds PCA components, PLS projections, Gaussian-mixture probabilities, and normalized semantic features.
5. Fold-specific regressors are fitted on scaled target values. The original notebook uses gradient boosting model families (HistGradientBoosting, GradientBoosting, CatBoost, and LightGBM) and averages predictions. Clover is handled specially in the notebook's feature ensemble.

#### DINOv3 neural model

The neural branch uses a DINOv3 ViT-Huge image backbone with local token-mixing modules, biomass output heads, fold training, weighted R2 validation, and test-time augmentation. Fold predictions are aggregated during inference. The notebook post-processes predictions to derive consistent biomass totals and enforce non-negative values.

#### Final blend and mass balance

The final notebook block reads an existing SigLIP submission and DINO submission, aligns their rows by `sample_id`, and computes a weighted blend (configured as 0.4 SigLIP and 0.6 DINO in that block). It uses DINO predictions alone for `Dry_Clover_g`. Predictions are reshaped to one row per image, then reconciled to satisfy:

```text
Dry_Green_g + Dry_Clover_g = GDM_g
GDM_g + Dry_Dead_g = Dry_Total_g
```

In the retained block, clover is held fixed while GDM and total are recomputed from the component predictions; outputs are clipped to non-negative values and converted back to the long submission format. The input files `submission70.csv` and `submission72.csv` are expected artifacts and are not included here.

## Repository layout

- `utils.py`: image preprocessing, metadata encoding, datasets, deterministic seeding, and R2 helper.
- `model.py`: the target conditioned DINO ViT-S/16 model used by the scripts.
- `train.py`: model training and checkpoint saving.
- `test.py`: long-format prediction generation.
- `eval.py`: overall/per-target R2 and RMSE evaluation.
- `requirements.txt`: Python dependencies.
- `Notebooks/`: cleaned source notebooks. Each contains only its final retained code block, with execution outputs and comment lines removed.

## Reproduce the scripted DINO cross-attention approach

Use Python 3.10 or newer. Install the PyTorch build suited to your hardware, then install the listed packages:

```bash
pip install -r requirements.txt
```

Place `train.csv`, `test.csv`, and the referenced images under `data/`. Put the pretrained DINO ViT-S/16 checkpoint at `checkpoints/dino_deitsmall16_pretrain.pth`. CSV image paths can be absolute or relative to `--data-root`.

Train with a fixed seed:

```bash
python train.py --train-csv data/train.csv --data-root data \
  --dino-checkpoint checkpoints/dino_deitsmall16_pretrain.pth \
  --output-dir artifacts --epochs 50 --batch-size 8 --seed 42
```

The script writes `artifacts/latest.pt` and periodic epoch checkpoints. Resume from a checkpoint with:

```bash
python train.py --resume artifacts/latest.pt
```

Create predictions and evaluate them against matching long-format labels:

```bash
python test.py --test-csv data/test.csv --data-root data \
  --checkpoint artifacts/latest.pt \
  --dino-checkpoint checkpoints/dino_deitsmall16_pretrain.pth \
  --output submission.csv
python eval.py --truth data/validation.csv --predictions validation_predictions.csv
```

For meaningful evaluation, `validation_predictions.csv` must be generated from the same held-out rows in `validation.csv`; the test split has no known labels. The scripts set random seeds and deterministic cuDNN options. Small numeric differences may remain across hardware and software builds.

## Scope and reproducibility notes

The scripts package the DINO cross-attention approach as the maintained runnable pipeline. They do not currently reproduce the DINOv3/SigLIP ensemble training stages: those require their encoder weights, fold assignments, and model dependencies, and only the final ensemble notebook block was retained. Reproducing that blend requires generating both input submission files first. Neither pretrained model weights, competition images, nor generated submissions are included in this repository.
