AGRIASSIST: DISTRICT CROP YIELD MODEL

Files
-----
crop_yield_pipeline.joblib : fitted preprocessing and Random Forest
yield_history.csv          : historical yields needed for inference
evaluation_metrics.json    : held-out test metrics and model details
test_predictions.csv       : predictions for the held-out test year
README.txt                 : this file

Target
------
District-level yield, calculated as production / area.
Interpreted as tonnes/hectare only if source units are confirmed.

Supported crops
---------------
Rice, wheat and maize.

Inputs
------
State_Name, District_Name, Crop, Season, Crop_Year,
previous_yield, historical_mean_3, years_since_previous,
history_count.

For a prediction in year Y, construct historical features only
from records with Crop_Year < Y, for the same state, district,
crop and season. The model needs at least one previous record.

Evaluation
----------
The model was evaluated on dataset year 2015, using earlier
years for training. The final delivered model was then refitted on
all eligible rows. See evaluation_metrics.json for the results.

Limitations
-----------
- District-level estimates are not individual farm predictions.
- This is a historical model, not a guarantee of future harvest.
- Sparse or outdated historical data can make predictions unreliable.
- Confirm dataset units and source coverage before use.
- The model requires compatible pandas, scikit-learn and joblib versions.
- Load joblib files only from trusted sources.