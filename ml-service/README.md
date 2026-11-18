# Biomass model service

A separate process from the AgriAssist API. One ResNet-50 backbone embeds the pasture photo. Five XGBoost models, each with its own URL, turn that embedding plus four vegetation statistics into one biomass measurement.

| Measurement | API |
|---|---|
| Clover (`Dry_Clover_g`) | `POST /targets/dry-clover/predict` |
| Dead material (`Dry_Dead_g`) | `POST /targets/dry-dead/predict` |
| Green vegetation (`Dry_Green_g`) | `POST /targets/dry-green/predict` |
| Total dry matter (`Dry_Total_g`) | `POST /targets/dry-total/predict` |
| Green dry matter (`GDM_g`) | `POST /targets/gdm/predict` |

Send the photo as multipart field `image`. The response includes the prediction in grams per sample quadrat, the four vegetation inputs, and a Grad-CAM JPEG (base64) drawn on the photo.

## What the models read

From `Biomass_prediciton/run.py`:

1. Resize the RGB photo to 224×224, scale to 0–1, ImageNet-normalize, and run ResNet-50 with the classifier removed. That is a 2048-d embedding.
2. On the **original** 0–255 pixels (not the resized tensor), compute excess-green mean, excess-green standard deviation, excess-green mean of the top 10% of pixels, and a GNDVI proxy mean.
3. Concatenate to 2052 features and run the XGBoost model for the requested measurement.

Grad-CAM backpropagates `dot(embedding, xgboost contributions of those 2048 columns)` into ResNet `layer4`.

## Weights

XGBoost files are read from `Biomass_prediciton/` (`BIOMASS_WEIGHTS_DIR` overrides that).

The shared backbone is the `backbone_full` checkpoint in that same directory. A `.pt` file or the zipped download (`backbone_full (1).pt.zip`) both work; Torch reads the zip directly. `BIOMASS_BACKBONE` overrides the path. If neither file is present, the service uses torchvision ImageNet ResNet-50 with the classifier removed and every prediction includes a warning. Restart the service after adding the file.

## Run

```bash
cd AgriAssist/ml-service
bash install.sh
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8100
```

`install.sh` installs the CPU PyTorch wheel. Check `GET /health` and `GET /targets`.

AgriAssist calls this service when `BIOMASS_API_URL=http://127.0.0.1:8100`.
