# Crop yield service

District yield for **rice, wheat and maize**, in tonnes per hectare. A random forest reads the state, district, crop, season, year, and features built only from earlier years of `yield_history.csv` (previous yield, mean of the last three records, years since that record, and how many records exist).

The fitted pipeline is `AgriAssist/ML Models/crop_yield_model/crop_yield_pipeline.joblib` (scikit-learn 1.6.1). This process does not load the pasture model.

```bash
cd yield-service
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python smoke_test.py
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8200
```

- `GET /health`
- `GET /catalog` — states, districts, crops, seasons, year range
- `POST /predict` — JSON `state`, `district`, `crop`, `season`, `year`

Names are matched ignoring case. A year is predicted from records with `Crop_Year` strictly before that year, so 2016 uses history through 2015. The number is a district estimate, not one farm.
