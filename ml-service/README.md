# AgriAssist ML service

One process for the four trained models. Each model has its own path. AgriAssist talks to this service when `ML_API_URL=http://127.0.0.1:8100`.

| Model | API |
|---|---|
| Clover (`Dry_Clover_g`) | `POST /targets/dry-clover/predict` |
| Dead material (`Dry_Dead_g`) | `POST /targets/dry-dead/predict` |
| Green vegetation (`Dry_Green_g`) | `POST /targets/dry-green/predict` |
| Total dry matter (`Dry_Total_g`) | `POST /targets/dry-total/predict` |
| Green dry matter (`GDM_g`) | `POST /targets/gdm/predict` |
| District yield | `GET /yield/catalog` · `POST /yield/predict` |
| Soil profile | `POST /soil/predict` |
| Cattle liveweight | `POST /cattle/predict` |

`GET /health` reports every model. `GET /yield/health`, `GET /soil/health` and `GET /cattle/health` report one.

## Biomass

Send the pasture photo as multipart field `image`. The response is grams per sample quadrat, four vegetation inputs, and a Grad-CAM JPEG (base64).

From `Biomass_prediciton/run.py`:

1. Resize the RGB photo to 224×224, scale to 0–1, ImageNet-normalize, and run ResNet-50 with the classifier removed. That is a 2048-d embedding.
2. On the **original** 0–255 pixels (not the resized tensor), compute excess-green mean, excess-green standard deviation, excess-green mean of the top 10% of pixels, and a GNDVI proxy mean.
3. Concatenate to 2052 features and run the XGBoost model for the requested measurement.

Grad-CAM backpropagates `dot(embedding, xgboost contributions of those 2048 columns)` into ResNet `layer4`.

XGBoost files are read from `AgriAssist/ML Models/Biomass_prediciton/` (`BIOMASS_WEIGHTS_DIR` overrides that). The shared backbone is the `backbone_full` checkpoint in that same directory. A `.pt` file or the zipped download (`backbone_full (1).pt.zip`) both work; Torch reads the zip directly. `BIOMASS_BACKBONE` overrides the path. If neither file is present, the service uses torchvision ImageNet ResNet-50 with the classifier removed and every prediction includes a warning.

## Yield, soil, cattle

JSON in, JSON out. Pipelines stay in `AgriAssist/ML Models/` (scikit-learn 1.6.1).

- **Yield:** `state`, `district`, `crop`, `season`, `year`. Tonnes per hectare for rice, wheat or maize. `GET /yield/catalog` fills the Tools menus.
- **Soil:** `ph`, `ec`, `oc`, `n`, `p`, `k`. One of four Bareilly groups, not a fertilizer dose.
- **Cattle:** `heart_girth` and `body_length` in centimetres. Liveweight in kilograms. Not a scale, and not for calves, goats or buffaloes.

## Run

```bash
cd AgriAssist/ml-service
bash install.sh
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8100
```

`install.sh` installs the CPU PyTorch wheel plus scikit-learn 1.6.1. Check `GET /health`.

```bash
.venv/bin/python smoke_tabular.py
```
