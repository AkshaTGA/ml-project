# Soil profile service

Assigns a soil test to one of four groups learned from 257 Bareilly (Uttar Pradesh) samples. The pipeline is a standard scaler plus KMeans, saved in `AgriAssist/ML Models/soil_profile_model/soil_profile_pipeline.joblib` (scikit-learn 1.6.1).

Inputs, in this order: pH, EC (millimhos/cm), organic carbon (%), N, P and K (kg/ha). The response is a cluster number, a plain description of that group, the group's medians, and a flag when the sample is farther from every centre than 95% of the training rows. The number is not a fertility grade and not a fertilizer dose.

```bash
cd soil-service
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python smoke_test.py
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8300
```

- `GET /health`
- `POST /predict` — JSON `ph`, `ec`, `oc`, `n`, `p`, `k` (or `pH`, `EC`, `OC`, `N`, `P`, `K`)
