AGRIASSIST INDIAN CATTLE WEIGHT MODEL

Purpose
-------
Estimate cattle liveweight from two body measurements.

Files
-----
cattle_weight_pipeline.joblib : trained scikit-learn pipeline
evaluation_metrics.json       : dataset ranges and test results
test_predictions.csv          : held-out animal predictions
README.txt                    : this document

Inputs
------
HeartGirth      : heart girth, assumed centimetres
BLBodylengthcm  : body length in centimetres

Pass a pandas DataFrame with these exact column names.
The dataset source must be checked for the exact measurement
definitions and to confirm heart-girth and target-weight units.

Selected model
--------------
Linear Regression

The selected model was refitted on all 517 clean rows.
The held-out evaluation was performed before this final fit.
See evaluation_metrics.json for both model results.

Limitations
-----------
- Experimental course-project model, not a certified weighing method.
- The workbook does not identify each animal's breed, age or sex.
- It has not been validated on independent farms or populations.
- Do not assume it works for calves, goats or buffaloes.
- Predictions outside the training measurement ranges are unreliable.
- The same test split was used for model selection and evaluation.
- Do not treat the prediction as an exact weight.

Dataset
-------
Wasatkar et al., Mendeley Data, DOI 10.17632/vhv6fph7w7.1
https://data.mendeley.com/datasets/vhv6fph7w7/1
License: CC BY 4.0

Environment
-----------
scikit-learn 1.6.1
Load joblib files only from trusted sources.