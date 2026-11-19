# District crop yield, soil profile, and cattle liveweight — full model context

This document is the source of truth for the three **tabular** trained models that sit beside the pasture-biomass model. Pasture biomass is specified in `project_context.md` (and the diagram in `image.jpeg`). This file does not describe a crop recommender and it does not describe a livestock-health model. Those are not part of the system.

All three models here are scikit-learn **1.6.1** pipelines, loaded from joblib files. They run inside the single AgriAssist `ml-service` process on port 8100, each on its own path. AgriAssist calls them when a person uses the Tools page or when the agent decides the question needs that measurement. The numbers below are the ones in the saved artifacts, not rounded marketing figures.

| | Crop yield | Soil profile | Cattle liveweight |
|---|---|---|---|
| Question | How many tonnes per hectare did this district harvest, or what does the recent record imply for a later year? | Which group of similar soil tests does this lab result sit with? | What liveweight, in kilograms, do these two tape measurements imply? |
| Kind of model | Supervised regression | Unsupervised clustering | Supervised regression |
| Algorithm | One-hot encoding, median imputer, random forest | Standard scaler, KMeans, 4 clusters | Linear regression on two centimetre measurements |
| Rows the final fit saw | 33,412 eligible district-season-years | 257 soil samples | 517 cattle rows (516 unique animal IDs) |
| Geography / population | 33 Indian states and union territories, 645 district names, rice, wheat and maize, 1997–2015 | Bareilly district, Uttar Pradesh | Indian cattle in Wasatkar et al.; breed, age and sex are not in the workbook |
| Output | One non-negative number, tonnes per hectare | Cluster id 0, 1, 2 or 3, plus a distance flag | One non-negative number, kilograms, plus an out-of-range flag |
| What it is not | A forecast of one farmer’s field, and not a trend line into 2030 | A fertility grade, a soil texture, or a fertilizer dose | A certified scale reading, a calf/goat/buffalo model, or an animal-health diagnosis |

---

## Part A — District crop yield

### A1. The question the model answers

Indian crop statistics are often published as production and area for a district, a crop and a season. Dividing production by area gives a yield. This model predicts that district yield.

The target column is `yield_tonnes_per_hectare`. The name says tonnes per hectare. That interpretation is correct only if the source production and area units really are tonnes and hectares. The delivered notes say those units must be confirmed against the source documentation before the number is treated as an official statistic. Inside AgriAssist the card still labels the number “tonnes per hectare”, and the agent is expected to say it is a district figure.

The model covers three crops only:

| Stored name | Crop | Rows in the history file |
|---|---|---|
| `RICE` | Rice | 15,082 |
| `MAIZE` | Maize | 13,787 |
| `WHEAT` | Wheat | 7,878 |

Total history rows: 36,747. States: 33. District name strings: 645. Years present: 1997 through 2015.

Seasons, and how often they appear:

| Season | Rows |
|---|---|
| Kharif | 14,037 |
| Rabi | 11,032 |
| Summer | 5,772 |
| Autumn | 3,021 |
| Winter | 2,466 |
| Whole year | 419 |

A district does not have every crop in every season. Bokaro in Jharkhand, for example, has wheat only in rabi, maize and rice in autumn, and rice also in winter. The Tools page only offers pairs that exist in the file for the chosen district. The model will also reject a pair that was never recorded, rather than invent a history.

### A2. What “eligible” means

A prediction for year Y, for one state, district, crop and season, is allowed to see only rows of that same series with `Crop_Year` strictly less than Y. The current year’s yield is the answer, not an input. Using it would be leakage: the model would be shown the number it is supposed to predict.

Each series therefore has a first year that cannot be a training row, because there is no earlier record. There are 3,335 such opening rows (36,747 − 33,412). The 33,412 rows that have at least one earlier year are the eligible rows. The final delivered forest was fit on all of them. The evaluation forest was fit on the eligible rows from before 2015 only.

### A3. The nine inputs

The pipeline’s feature names, in order, are:

1. `State_Name`
2. `District_Name`
3. `Crop`
4. `Season`
5. `Crop_Year`
6. `previous_yield`
7. `historical_mean_3`
8. `years_since_previous`
9. `history_count`

The first four are categories. The last five are numbers.

For a request, the service looks up the series and sorts it by year. Let the earlier yields be y1, y2, …, yk in time order, and let the last of those years be T.

| Feature | Definition |
|---|---|
| `previous_yield` | yk, the most recent yield before the requested year |
| `historical_mean_3` | The mean of the last three of those yields, or of all of them if fewer than three exist |
| `years_since_previous` | Requested year minus T |
| `history_count` | k, how many earlier records exist |
| `Crop_Year` | The year being asked about |

Worked example, already checked against the file. Maize, autumn, Anugul, Odisha, asked for 2015. The earlier yields end:

| Year | Yield, t/ha |
|---|---|
| 2010 | 0.893 |
| 2011 | 0.873 |
| 2012 | 0.966 |
| 2013 | 1.018 |
| 2014 | 0.991 |

So `previous_yield` is 0.991, `historical_mean_3` is the mean of 2012–2014 which is 0.992, `years_since_previous` is 1, and `history_count` is 13. The same 0.992 is exactly the baseline prediction stored on the held-out sheet for that row. The baseline used in the evaluation is this three-year mean, not a naive global average.

A second checked example. Rice, kharif, Kiphire, Nagaland. Recorded yields:

| Year | Yield, t/ha |
|---|---|
| 2008 | 1.972 |
| 2009 | 1.261 |
| 2010 | 1.880 |
| 2011 | 1.861 |
| 2012 | 1.939 |
| 2013 | 1.970 |
| 2014 | 2.044 |

Asked for 2016, the service reports previous year 2014, previous yield 2.044, three-year mean 1.984, gap of 2 years, 7 earlier records, and a forest prediction of 1.95 t/ha.

Names are matched after trimming and ignoring case, so “jharkhand”, “Jharkhand” and “JHARKHAND” are the same state. “Whole year” and “WHOLE YEAR” are the same season.

### A4. How the categories become numbers

The preprocessor is a column transformer.

- Categories go through a one-hot encoder. It was fit with 33 state strings, 639 district strings, 3 crops and 6 seasons. `handle_unknown` is `ignore`: a category the encoder never saw becomes a row of zeros rather than an error. The service still refuses unknown states and districts before that point, because a district with no history cannot build `previous_yield`.
- Numbers go through a median imputer. At inference every numeric feature is always present, so the imputer does not fill anything. It is there because that is how the pipeline was fit.

The forest then sees a wide numeric vector: five real numbers plus one column per category level it learned. That is why the regressor’s `n_features_in_` is large (on the order of 680 columns) even though a person only chooses a place, a crop, a season and a year.

### A5. The forest

`RandomForestRegressor` from scikit-learn 1.6.1, the exact version named in `evaluation_metrics.json`.

| Setting | Value |
|---|---|
| Trees | 80 |
| Max depth | unlimited |
| Features considered at each split | 70% of the columns (`max_features=0.7`) |
| Minimum samples to split | 2 |
| Minimum samples in a leaf | 3 |
| Bootstrap | yes |
| Random state | 42 |

Each tree is grown on a bootstrap sample of the eligible rows. A prediction is the average of the 80 tree predictions. The service clips a negative average to zero, because a yield below zero is not a harvest. The saved trees do not generally produce negatives on ordinary inputs.

### A6. What the trees actually use

Impurity-based importance on the fitted forest, largest first:

| Share | Feature |
|---|---|
| 0.624 | `historical_mean_3` |
| 0.224 | `previous_yield` |
| 0.030 | `Crop_Year` |
| 0.020 | `history_count` |
| 0.014 | the Andhra Pradesh state indicator |
| 0.007 | the maize indicator |
| 0.006 | `years_since_previous` |
| about 0.006 each | Tamil Nadu, Punjab, Bihar state indicators |
| 0.005 | the rabi indicator |
| 0.004 | the rice indicator |

About 85% of the split importance sits on the two features that are just the recent harvests. The year itself is about 3%. The gap since the last record is under 1%. Place and crop matter, but as small adjustments around “what did this series yield lately?”

That is the right way to read every number the tool shows. The forest is a smoothed, slightly adjusted version of the recent district record. It is not a crop-growth simulator.

### A7. How it was scored

The evaluation year is 2015, the last year in the file. Training for that test used the 33,257 eligible rows from years before 2015. The test has 155 rows: the 2015 district-crop-season records that also had an earlier year.

Two predictors were scored on those 155 rows, in tonnes per hectare:

| Predictor | MAE | RMSE |
|---|---|---|
| Baseline: mean of the last three earlier yields | 0.674 | 1.020 |
| Random forest trained only on years before 2015 | 0.675 | 0.998 |

MAE is the average absolute error. RMSE is the square root of the average squared error, so a few large misses hurt it more.

Read those two lines together. On the average absolute error the forest does not beat “repeat the recent three-year mean.” The difference is 0.001 t/ha, in the baseline’s favour. On RMSE the forest is better by about 0.022 t/ha, which means it makes fewer very large mistakes, or smaller ones, even though a typical error is the same size. A typical miss is about two-thirds of a tonne per hectare. The median yield in the whole history file is 1.87 t/ha and the 95th percentile is 4.12, so an error of 0.67 is a large fraction of a normal district yield. The model is useful as a structured way to read the recent record and to refuse series that have no record. It is not a precise forecast of next year’s harvest.

After that test, the delivered file was refit on all 33,412 eligible rows, including 2015. A request for 2015 therefore goes through a forest that has seen 2015. The checked Anugul maize autumn case shows the difference: the held-out forest predicted 1.002, the actual yield was 1.161, and the delivered forest predicts 1.081. The delivered number is a bit closer because that row was inside the final fit. A request for 2016 or later is not inside the fit. Its inputs are still only harvests from 2015 and before.

### A8. Asking for a year after 2015

The history file stops in 2015. The service does not refuse 2020 or 2050. The Tools page slider runs from 1998 to 2050 and starts at 2016, which is the first year that can be built entirely from earlier records.

What changes when the year moves from 2016 to 2030, for a series whose last record is 2014:

- `previous_yield` stays the 2014 yield.
- `historical_mean_3` stays the mean of the last three records. Those two features are 85% of the forest’s importance, and they do not move.
- `Crop_Year` becomes 2030. Every tree split is a threshold. A year above the highest year the tree saw during training falls on the same side of every year-split as that highest year. The forest does not draw a rising or falling line past 2015.
- `years_since_previous` becomes 16. In the eligible rows, the gap is 1 year in 94.7% of cases. The 95th percentile gap is 2 years. The largest gap in the file is 14 years. A 16-year gap is outside the gaps the trees were grown on, and that feature is only 0.6% of the importance anyway.

So a 2030 number will look like a forecast and will mostly repeat the pattern of the last known harvests, with a small and poorly supported nudge from the year and the gap. AgriAssist is allowed to show it. The honest sentence next to it is that the harvest file ends in 2015 and later years reuse those last records.

### A9. Odd rows in the history

The yield column is not uniformly clean. The median is 1.87 t/ha and the 95th percentile is 4.12. Eight rows are above 20, and seven of those are above 50. The three largest are Maharashtra maize, autumn, 1997: Nashik 1,494, Jalgaon 1,327, Pune 1,143. Those cannot be real tonnes per hectare. They are almost certainly unit or entry errors in the source table. They remain in `yield_history.csv`. A tree can isolate a freak row in its own leaf because the minimum leaf size is 3, so one monster value does not set the prediction for a normal district, but it does pull the column mean (2.26) well above the median (1.87). The evaluation MAE and RMSE were computed with whatever 2015 rows were in the test sheet, not after deleting these 1997 outliers.

### A10. What the service returns

`POST /predict` with `state`, `district`, `crop`, `season`, `year`.

The JSON the app stores and shows:

- `prediction` — tonnes per hectare, four decimal places in the payload, two on the card
- `units` — “tonnes per hectare”
- `label` — for example “Rice · Kharif · Kiphire, Nagaland”
- `previous_year`, `previous_yield`
- `historical_mean_3`
- `years_since_previous`
- `history_count`
- `note` — district estimate from earlier recorded yields, not a single farm

Errors are sentences, not a fake number. “No Wheat Autumn history for Bokaro, Jharkhand.” “Need a record from before 2008. The earliest year on file for this district, crop and season is 2008.”

`GET /catalog` lists the 33 states, each district, and the crop–season pairs that district recorded, plus `year_min` 1998 and `year_max` 2016. The form’s upper slider value of 2050 is applied by AgriAssist when it builds the tool, not by the catalog. The catalog’s 2016 is “one year past the file.”

### A11. How AgriAssist uses it

The Tools page card is Crop Yield. State and district are menus. Crop and season are chips, and they appear only after a district is chosen, and only for pairs that district recorded. Changing the state clears the district, the crop and the season.

The agent tool is `predict_crop_yield(state, district, crop, season, year)`. It is for “how much rice, wheat or maize in this district.” It is not for “what should I grow?” That question is answered from the farm profile, the weather and web search.

A finished run is stored with the inputs and the result. “Ask what this means” opens a chat with a short card, not a dump of the JSON. The agent is told the number is a district estimate. A yield, a price and a weather figure stay in the chat summary. They are not promoted into long-term memory unless the person asks, or the same standing fact shows up in a second conversation.

---

## Part B — Soil profile clusters

### B1. The question the model answers

A soil test comes back as six numbers. The model’s job is to say which handful of previously seen tests this one most resembles, and to show the typical numbers of that handful.

It does not name a soil type. It does not say “fertile” or “poor” as an official grade. It does not compute a fertilizer dose. The delivered notes are explicit: clusters are descriptive groups. Cluster numbers are arbitrary. Comparing a result with the group medians is the interpretation. The distance flag is a heuristic for “this test looks unlike the samples the groups were built from,” not a probability.

### B2. Where the samples come from

Dataset name: AgriNet, a soil-fertility table published for deep-learning fertilizer work on rice.

- DOI: 10.17632/c7tr9j78td.1
- URL: https://data.mendeley.com/datasets/c7tr9j78td/1
- Contributor: Atul Singh Atul
- License: CC BY 4.0
- Place: Bareilly district, Uttar Pradesh, India
- Rows received: 257
- Rows used in the final model: 257, all of them

The table is small and it is one district. A held-out slice of the same 257 rows is not a test on another state. The notes say exactly that: the held-out rows do not constitute independent geographic validation, and the set cannot establish performance for every Indian farm. AgriAssist repeats a shorter form of that limit on the result card: a descriptive group from Bareilly, not a fertility grade and not a fertilizer dose.

### B3. The six measurements

They must be in these units. A different lab convention (EC in dS/m is numerically the same as millimhos/cm; EC in µS/cm is a thousand times larger) will throw the point into the wrong region of the space.

| Name | Unit | Role |
|---|---|---|
| pH | unitless | acidity or alkalinity |
| EC | millimhos/cm | electrical conductivity, a stand-in for soluble salts |
| OC | percent | organic carbon |
| N | kg/ha | available nitrogen |
| P | kg/ha | available phosphorus |
| K | kg/ha | available potassium |

The pipeline column order is pH, EC, OC, N, P, K. The service accepts those names and also `ph`, `ec`, `oc`, `n`, `p`, `k`, and the words nitrogen, phosphorus, potassium.

### B4. Why the numbers are scaled first

The six columns do not share a scale. A difference of 1 in pH is a completely different soil. A difference of 1 in nitrogen (kg/ha) is noise. KMeans uses Euclidean distance, so without scaling the potassium column, which spans tens of kg/ha, would dominate pH, which on this dataset barely moves.

`StandardScaler` subtracts the training mean and divides by the training standard deviation. Both were fit on the 257 rows:

| Feature | Mean | Standard deviation |
|---|---|---|
| pH | 7.096 | 0.196 |
| EC | 0.140 | 0.044 |
| OC | 0.243 | 0.071 |
| N | 114.3 | 32.0 |
| P | 10.62 | 5.65 |
| K | 139.4 | 52.8 |

The pH standard deviation is only 0.20. These samples sit in a narrow band around neutral. A pH of 5.5 is many of this dataset’s standard deviations away from the cloud, even though 5.5 is a perfectly real pH in other parts of India. That is the geographic limit showing up in the arithmetic: “unusual” often means “not like Bareilly,” which is the correct warning, not a statement that the lab made a mistake.

After scaling, each axis has mean 0 and standard deviation 1 on the training rows, and Euclidean distance treats a one-standard-deviation move in phosphorus as comparable to a one-standard-deviation move in pH.

### B5. Why four clusters

`cluster_comparison.csv` records a search over the number of groups. Silhouette is higher when points sit close to their own centre and far from the neighbouring centres. Stability ARI is 1.0 for every candidate on this file, so repeated fits agreed with each other. The smallest and largest groups are also listed.

| Clusters | Train silhouette | Smallest group | Largest group |
|---|---|---|---|
| 2 | 0.514 | 89 | 116 |
| 3 | 0.568 | 29 | 116 |
| 4 | 0.634 | 29 | 76 |
| 5 | 0.605 | 27 | 76 |

Four is the peak of that train silhouette. Five is worse than four, so the extra split was not buying a cleaner separation. The delivered model uses four.

A separate held-out silhouette, computed on 52 rows after a fit on the other 205, is 0.556. That is lower than the 0.634 on the training search, which is the usual direction: a score computed on the same rows that chose the groups is optimistic. 0.556 is still a moderate separation, not a set of four tight islands. Overlapping groups are expected. The card therefore shows medians and a distance, not a claim of certainty.

The final KMeans, the one in the joblib file, was fit on all 257 rows:

| Setting | Value |
|---|---|
| Algorithm | Lloyd |
| Initialisations | 20 (`n_init`) |
| Maximum iterations | 300 |
| Random state | 42 |
| Inertia | 186.91 |

Inertia is the sum of squared distances from each scaled sample to its centre. It is the quantity KMeans minimises. It is not a score a farmer reads.

### B6. The four groups

Counts and medians from `cluster_profiles.csv`. The centres below are in scaled units, so +1 means one training standard deviation above the dataset mean. Medians are in the original units. Medians and means are not the same; the profile file publishes medians, which is the right summary when a few samples are extreme.

**Cluster 0 — 99 samples, the largest group.**

| | pH | EC | OC % | N | P | K |
|---|---|---|---|---|---|---|
| Median | 7.21 | 0.12 | 0.22 | 105 | 4.51 | 125 |
| Centre, in standard deviations | +0.53 | −0.36 | −0.32 | −0.29 | −1.09 | −0.40 |

Near-neutral, slightly on the alkaline side of this dataset, low salts, modest organic carbon, and phosphorus about one standard deviation below the dataset mean. Phosphorus is the feature that most separates this group. The plain sentence used in the product: “Near-neutral pH, low salinity, modest organic carbon, and very low phosphorus.”

**Cluster 1 — 68 samples.**

| | pH | EC | OC % | N | P | K |
|---|---|---|---|---|---|---|
| Median | 6.91 | 0.14 | 0.30 | 142.5 | 15.12 | 167 |
| Centre, in standard deviations | −0.96 | −0.18 | +0.78 | +0.87 | +0.93 | +0.35 |

Slightly more acidic than the dataset mean, with higher organic carbon, nitrogen and phosphorus. “Slightly acidic, with higher nitrogen and phosphorus than the other groups.”

**Cluster 2 — 30 samples, the smallest group.**

| | pH | EC | OC % | N | P | K |
|---|---|---|---|---|---|---|
| Median | 6.81 | 0.25 | 0.37 | 167 | 9.18 | 257 |
| Centre, in standard deviations | −1.46 | +2.49 | +1.79 | +1.65 | −0.28 | +2.24 |

This is the group that is actually far from the middle of the cloud: lower pH, electrical conductivity about two and a half standard deviations up, and potassium about two standard deviations up, with the highest organic carbon and nitrogen. “Lower pH, higher salinity, and the highest organic carbon, nitrogen and potassium.”

**Cluster 3 — 60 samples.**

| | pH | EC | OC % | N | P | K |
|---|---|---|---|---|---|---|
| Median | 7.26 | 0.12 | 0.16 | 71.5 | 15.02 | 92.5 |
| Centre, in standard deviations | +0.95 | −0.45 | −1.26 | −1.32 | +0.89 | −0.86 |

The alkaline side of this dataset, with the lowest organic carbon, nitrogen and potassium, and phosphorus up with cluster 1. “Slightly alkaline, with the lowest organic carbon, nitrogen and potassium, and higher phosphorus.”

Cluster ids are the ids KMeans produced. They are not ordered from “best soil” to “worst soil.” Cluster 2 is not “worse” than cluster 0 because its number is higher. It is a different pattern: more salts, more potassium, more organic carbon.

A check that the published medians land in their own groups: predicting each median vector returns cluster 0, 1, 2 and 3 respectively, with distances 0.168, 0.280, 0.041 and 0.205, all well under the warning threshold. The Tools page default (pH 7.2, EC 0.12, OC 0.22, N 105, P 4.5, K 125) is essentially the cluster 0 median and returns cluster 0 at distance 0.159.

### B7. How a new test is assigned

1. Arrange the six numbers in the column order pH, EC, OC, N, P, K.
2. Scale them with the saved mean and standard deviation. A missing number is an error. The service does not impute a nutrient the person did not measure.
3. Compute Euclidean distance, in that scaled space, from the point to each of the four centres.
4. The cluster is the nearest centre. That is what `KMeans.predict` does, and it is what the pipeline returns.
5. The reported distance is that smallest distance, rounded to three decimals.

There is no class probability. A point halfway between cluster 0 and cluster 3 is simply given to whichever centre is nearer. The distance tells the reader whether “nearer” still means “close.”

### B8. The unusual-sample flag

`distance_warning_threshold` in the metadata is 1.260. The description stored with it: the 95th percentile of nearest-centre distances on the final training data. It is a heuristic. It is not a calibrated confidence and not a probability.

If the new point’s distance to its nearest centre is greater than 1.260, about one in twenty training points were at least that far from their own centre, and this point is at least that far. The card then adds: “This sample sits farther from every group than most of the training rows.”

A deliberately extreme test, pH 4, EC 2.5, OC 1.5, N 400, P 80, K 500, is assigned to cluster 2 (the high-EC, high-K group is the nearest of the four) at distance 57.5, and the flag is on. Nearest-of-four does not mean the point looks like a Bareilly sample. The flag is the part that says so.

Because pH on this dataset has a standard deviation of 0.20, even a moderate pH change is a long step in scaled space. A test from a genuinely acidic soil will often be flagged. That is the model telling the truth about its training geography.

### B9. What the service returns

`POST /predict` with the six numbers.

- `cluster` and `label` (“Cluster 0”)
- `summary` — one of the four sentences in B6
- `sample_count` — 99, 68, 30 or 60
- `distance` and `distance_threshold`
- `unusual` — true when distance exceeds 1.260
- `inputs` — the six numbers as received
- `group_medians` — the six medians of the assigned group
- `units`
- `note` — Bareilly, descriptive group, not a fertility grade, not a fertilizer dose

The card draws each measurement with its unit and the group median underneath, so a person can see “my phosphorus is 4.5, this group’s median is 4.51” without reading the cluster id as a score.

### B10. How AgriAssist uses it

The Tools page card is Soil Profile. Six sliders: pH from 3 to 10, EC from 0 to 3 millimhos/cm, organic carbon from 0 to 3 percent, nitrogen 0 to 400 kg/ha, phosphorus 0 to 80 kg/ha, potassium 0 to 500 kg/ha. The defaults are the cluster 0 medians, so the first run is a known, ordinary Bareilly-like test rather than an empty form.

The agent tool is `describe_soil_profile(ph, ec, oc, n, p, k)`. It is for a soil test the person already has. The agent is instructed not to convert the cluster into a fertilizer recommendation. If they ask what to apply, the answer has to come from agronomy and from the actual numbers, with the cluster only as a description of similar samples, and with the Bareilly limit said out loud.

Runs are stored like the other trained-model tools. “Ask what this means” sends the cluster, the summary and the medians into the chat as a short card.

A soil cluster from one test is a result of this conversation. It belongs in the chat summary. It is not copied into long-term memory unless the person asks to keep a standing fact (“my vegetable plot’s soil test is always around pH 7.2 with very low phosphorus”) or that fact shows up again in a later chat.

---

## Part C — Cattle liveweight

### C1. The question the model answers

A herder can tape a cow around the chest (heart girth) and along the body (body length) and ask what that animal would weigh. The model answers with a **liveweight in kilograms**. It is a linear fit of those two centimetres onto recorded scale weights. It is not a scale. It is not a body-condition score. It is not a diagnosis of illness.

The delivered notes are explicit: experimental course-project model, not a certified weighing method; the workbook does not identify breed, age or sex; it has not been validated on independent farms; do not assume it works for calves, goats or buffaloes; predictions outside the training measurement ranges are unreliable; the same test split was used for model selection and evaluation; do not treat the prediction as an exact weight.

### C2. Where the rows come from

Dataset title stored in `evaluation_metrics.json`: “Morphometric Measurements and Body Weight Data of Indian Cattle Breeds for Machine Learning-Based Weight Prediction.”

- Authors: Wasatkar et al.
- Host: Mendeley Data
- DOI: 10.17632/vhv6fph7w7.1
- URL: https://data.mendeley.com/datasets/vhv6fph7w7/1
- License: CC BY 4.0

Rows used in the final fit: **517**. Unique animal IDs: **516**. One animal therefore appears twice. The split is by animal ID, not by row, so those two rows cannot sit one in train and one in test.

### C3. The two inputs and the target

The pipeline’s feature names, in order:

1. `HeartGirth` — heart girth, assumed centimetres. The notes say: confirm the exact measurement definition and the unit with the source workbook.
2. `BLBodylengthcm` — body length, in centimetres.

The target column is `ActualBodyWeight`, assumed kilograms, again “confirm with source.”

AgriAssist’s form and agent tool use the farmer-facing names `heart_girth` and `body_length`. The service maps those, and several aliases, onto the pipeline names:

| Alias the service accepts | Pipeline column |
|---|---|
| `heartgirth`, `heart_girth`, `girth`, `hg`, `HeartGirth` | `HeartGirth` |
| `blbodylengthcm`, `body_length`, `bodylength`, `length`, `bl`, `BLBodylengthcm` | `BLBodylengthcm` |

Spaces become underscores, case is ignored. A missing name is an error, not an imputed centimetre. A non-positive measurement is refused. There is no third feature: no breed, no age, no sex, no height at withers, no BCS.

### C4. How the rows were split

`GroupShuffleSplit` by animal ID, `random_state=42`.

| Split | Rows |
|---|---|
| Train, for the comparison that selected the model | 412 |
| Held-out test | 105 |
| Final delivered fit | all 517 |

Grouping by animal ID is the leakage control. A random row split would have let the one repeated animal, and any animal-specific idiosyncrasy, leak from train into test.

The 105-row test sheet (`test_predictions.csv`) is the same sheet that was used **both** to compare Linear Regression against Random Forest **and** to report the published MAE, RMSE and R². That is a real limit: the selection set and the evaluation set are the same 105 animals. The metrics are honest for that split; they are not a second, untouched confirmation set.

On those 105 rows, recorded weight runs from 407 kg to 802 kg, mean 592.8 kg. Heart girth on the test sheet runs 179–225 cm, body length 177–240 cm. Those test extremes sit inside the full-file ranges below.

### C5. Why linear regression, not the forest

Two models were scored on the same 105 animals:

| Model | MAE (kg) | RMSE (kg) | R² |
|---|---|---|---|
| Linear Regression | 32.846 | 40.977 | 0.740 |
| Random Forest | 35.281 | 44.128 | 0.699 |

Linear regression is better on every published number. A typical miss is about 33 kg on animals that weigh around 590 kg, roughly 5–6% of the mean. RMSE is larger than MAE because a few animals are missed by 80–116 kg (the test-sheet maximum absolute error is 116.1 kg). The first test row is a working example of a large miss: heart girth 188 cm, body length 197 cm, recorded 407 kg, held-out linear prediction 496.97 kg, error 90 kg. The line is a good average description of the cloud; it is not a scale for every animal.

Random forest did not win. With only two features, both almost collinear with size, a linear plane is the right inductive bias. Trees would have to invent a non-linearity that this file does not support.

### C6. The delivered equation

The saved file is a scikit-learn 1.6.1 pipeline with a single step:

```
Pipeline(steps=[('model', LinearRegression())])
```

There is no scaler. The two centimetre columns go straight into the plane. After the 105-row comparison, that plane was **refit on all 517 clean rows**. The coefficients in the joblib file are therefore not identical to the coefficients that produced the held-out CSV.

Loaded from `cattle_weight_pipeline.joblib`:

| Term | Coefficient |
|---|---|
| `HeartGirth` (cm) | 6.369060437473909 |
| `BLBodylengthcm` (cm) | 0.9779800481781072 |
| Intercept | −896.3485387466278 |

So the delivered prediction, in kilograms, is:

```
kg = 6.369060437473909 × heart_girth_cm
   + 0.9779800481781072 × body_length_cm
   − 896.3485387466278
```

Heart girth dominates. Ten extra centimetres of girth add about 64 kg. Ten extra centimetres of length add about 10 kg. That matches the farming rule of thumb that chest girth carries most of a Shaeffer’s-formula-style estimate; this fit is empirical on this file, not Shaeffer’s formula copied from a textbook.

If a tree or a rounding error ever produced a negative kilogram value, the service clips it to 0. Ordinary in-range tapes do not go negative: the intercept is large and negative, but girth in the training range already more than cancels it.

Because the delivered file was refit on all 517 rows, a tape pair that appears in `test_predictions.csv` will not reproduce that CSV’s “Linear Regression prediction” column exactly. The 188 / 197 pair is the checked example:

| | kg |
|---|---|
| Recorded scale weight | 407 |
| Held-out linear prediction (on the 412-row fit) | 496.97 |
| Delivered joblib (refit on 517) | **493.7** |

Mean absolute difference between delivered predictions and the held-out CSV column, on those 105 rows, is about 1.3 kg (maximum about 4.5 kg). Smoke tests must assert **493.7**, not 496.97.

### C7. Training ranges, and the unusual flag

From `evaluation_metrics.json`:

| Quantity | Minimum | Maximum |
|---|---|---|
| Heart girth | 171 cm | 233 cm |
| Body length | 177 cm | 246 cm |
| Recorded liveweight | 379 kg | 824 kg |

A prediction is flagged `unusual` when **any** of these is true:

- heart girth is outside 171–233 cm,
- body length is outside 177–246 cm,
- the predicted kilogram value is outside 379–824 kg.

The service then prefixes the standing note with the training range, so the agent and the Tools card can say the tapes sit outside the animals this line was fit on. The kilogram number is still returned. It is not blanked. Blanking it would hide the fact that the plane continues as a plane; the honest behaviour is to show the number and the flag together.

Checked points:

| Heart girth | Body length | Delivered kg | Unusual? | Why |
|---|---|---|---|---|
| 188 | 197 | 493.7 | no | Inside every range |
| 190 | 200 | (Tools-page default; in range) | no | Defaults on the form |
| 202 | 211 | 596.6 | no | Near the test-set mean |
| 171 | 177 | 365.9 | yes | Predicted weight falls below 379 |
| 233 | 246 | 828.2 | yes | Predicted weight falls above 824 |
| 140 | 150 | 142.0 | yes | Both tapes and the weight are outside |

The 171 / 177 edge is the interesting one: both tapes are at the **minimum of the training measurements**, but the plane already predicts 366 kg, under the lightest recorded animal (379 kg). The flag is doing its job. The line is not a wall at the convex hull of the data.

### C8. What the service returns

`POST /cattle/predict` with JSON. Path on the unified service: `http://127.0.0.1:8100/cattle/predict`.

```
{
  "mode": "live",
  "prediction": 493.7,
  "units": "kg",
  "label": "Cattle liveweight",
  "heart_girth": 188.0,
  "body_length": 197.0,
  "unusual": false,
  "outside": [],
  "ranges": {
    "heart_girth": [171.0, 233.0],
    "body_length": [177.0, 246.0],
    "weight": [379.0, 824.0]
  },
  "note": "Estimate from heart girth and body length, in kilograms. Not a scale reading. Not for calves, goats or buffaloes."
}
```

`prediction` is one decimal place. `outside` lists which of `heart_girth`, `body_length`, `weight` sat outside range. Errors are sentences: “Missing body_length”, “heart_girth must be greater than 0”, “heart_girth must be a number”. HTTP 400, never a fake kilogram.

`GET /cattle/health` reports Linear Regression, the two feature names, and kilograms.

### C9. How AgriAssist uses it

The Tools page card is **Cattle liveweight**, beside district yield and soil, under the flagship pasture-biomass panel. Two number fields: heart girth and body length, centimetres, min 100, max 300, step 0.5, defaults 190 and 200. Help text: tape around the chest just behind the front legs; shoulder to pin bone as recorded in the training set.

The result card shows the kilogram value large, the two tapes underneath, and a gold note when `unusual` is true. The run summary in history is “N kg”.

The agent tool is `predict_cattle_weight(heart_girth, body_length)`. The system prompt says: tape estimates in kilograms, not a scale; not for calves, goats or buffaloes; a sick animal is answered in words with a veterinarian; there is no livestock-health model.

The default liveweight in the **grazing calculator** remains 400 kg. A cattle-tool result can be used as `avg_liveweight_kg` when the person has just taped an animal and then asks how long the paddock will last, but the agent must still say that 400 kg is the calculator default when they have not taped anything.

A taped weight belongs in the chat summary. It is not promoted into long-term memory unless the person asks to remember a standing fact (“this cow is the 490 kg animal we always tape in winter”) or that fact appears in a second conversation.

### C10. What this model is not allowed to become

- Not a scale. MAE 33 kg is the published typical miss.
- Not a calf, goat, buffalo, sheep or poultry model. Those animals are on the farm profile; they are not inputs to this plane.
- Not an animal-health model. Fever, appetite, lameness stay in prose plus a vet.
- Not Shaeffer’s formula copied from a textbook, even though the two measurements are the same kind of tapes. The numbers above are this file’s least-squares plane.
- Not a breed-adjusted table. Breed is not a column.

---

## Part D — How the three tabular models differ, and how they meet


They answer different questions and must not be substituted for each other.

| | Yield | Soil | Cattle |
|---|---|---|---|
| Input the person knows | A place, a crop, a season, a year | Six lab numbers | Two tape measurements, cm |
| Uses the farm’s GPS? | No. It uses the district name. | No. It does not know where the sample was taken, except that the groups were learned in Bareilly. | No. |
| Uses weather? | No. | No. | No. |
| Supervised target | Yes, recorded yield | No target. Groups only. | Yes, recorded liveweight |
| Can be wrong in a quiet way | Yes. A typical error is about 0.67 t/ha, and a year after 2015 mostly echoes the last harvests. | Yes. A point between two groups is labelled as one of them. A non-Bareilly soil can be labelled and flagged. | Yes. A typical error is about 33 kg, and a calf or a buffalo is outside the population. |
| Safe sentence | “District estimate from harvests recorded before this year, not one farm.” | “A group of similar Bareilly samples, not a fertilizer dose.” | “Tape estimate in kilograms, not a scale, not for calves, goats or buffaloes.” |

A sensible conversation can use all three, in order, without mixing their meanings. A farmer in Kiphire asks what rice yielded: the yield tool, kharif, 2016, 1.95 t/ha, from a 2014 record of 2.04. They then paste a soil test: the soil tool says which Bareilly group it resembles. They tape a cow at 188 cm girth and 197 cm length: the cattle tool says 493.7 kg. The agent may talk about what low phosphorus means in general agronomy, and about how a 490 kg animal eats more than the grazing calculator’s 400 kg default. It may not say “cluster 0 means apply this many kilos of DAP,” it may not say “the district model predicts your two-acre field will harvest 1.95 t/ha,” and it may not say “put this cow on the lorry as 493.7 kg.”

The pasture-biomass model remains a fourth, separate measurement: grams of dry matter on a photographed quadrat. It does not feed the yield forest, the soil clusters, or the cattle plane, and none of those feed it. The only designed meeting point is the grazing calculator, which can take biomass grams from the pasture model and, optionally, a taped liveweight from the cattle model.

---

## Part E — Files and services

Yield artifacts, in `AgriAssist/ML Models/crop_yield_model/`:

- `crop_yield_pipeline.joblib` — the fitted preprocessor and forest
- `yield_history.csv` — the table inference is allowed to read
- `evaluation_metrics.json` — the 2015 scores and the row counts
- `test_predictions.csv` — the held-out year’s baseline, forest prediction, and actual yield
- `README.txt`

Soil artifacts, in `AgriAssist/ML Models/soil_profile_model/`:

- `soil_profile_pipeline.joblib` — scaler and KMeans
- `cluster_profiles.csv` — counts and medians
- `cluster_comparison.csv` — the silhouette search over 2 to 5 clusters
- `model_metadata.json` — feature order, units, threshold, source, license
- `README.txt`

Cattle artifacts, in `AgriAssist/ML Models/cattle_weight_model/`:

- `cattle_weight_pipeline.joblib` — `Pipeline([('model', LinearRegression())])`, scikit-learn 1.6.1
- `evaluation_metrics.json` — ranges, split, both models’ test scores, source DOI
- `test_predictions.csv` — 105 held-out animals, both models’ predictions, absolute error of the selected model
- `README.txt`

Services:

All three tabular models, and pasture biomass, run in **one** process: `AgriAssist/ml-service` on port 8100.

| Path | Role |
|---|---|
| `GET /health` | Every model, including biomass |
| `GET /yield/health` · `GET /yield/catalog` · `POST /yield/predict` | District yield |
| `GET /soil/health` · `POST /soil/predict` | Soil groups |
| `GET /cattle/health` · `POST /cattle/predict` | Cattle liveweight |
| `GET /targets` · `POST /targets/{slug}/predict` | Pasture biomass |

They pin scikit-learn to 1.6.1 because that is the version that fit the joblib files. AgriAssist’s API holds `ML_API_URL=http://127.0.0.1:8100` and posts JSON to `/yield/predict`, `/soil/predict` and `/cattle/predict`. Optional `YIELD_API_URL`, `SOIL_API_URL` and `CATTLE_API_URL` override one prefix. The browser never loads the joblib files.

---

## Part F — Figures worth redrawing

1. **Yield feature path.** Place, crop, season, year → keep only earlier years of that series → previous yield, three-year mean, gap, count → one-hot plus those numbers → 80-tree forest → tonnes per hectare.
2. **Importance.** One bar chart: three-year mean 62%, previous yield 22%, everything else under 4% each. This is the slide that stops a “forecast to 2050” claim.
3. **2015 score.** Baseline MAE 0.674 and RMSE 1.020 beside forest MAE 0.675 and RMSE 0.998, on 155 districts. Say the forest does not win on MAE.
4. **Soil pipeline.** Six raw numbers → subtract mean, divide by standard deviation → distances to four centres → nearest centre, and a flag if that distance exceeds 1.26.
5. **Four group portraits.** A small table per cluster: count, six medians, one sentence. Do not sort them into good and bad.
6. **The two limits on one slide.** Yield: district, 1997–2015, rice wheat maize, later years reuse the last harvests. Soil: 257 samples, Bareilly only, descriptive groups, not a dose.
7. **Cattle plane.** A 2-d scatter of heart girth against recorded kg, with the fitted line `kg = 6.369 × girth + 0.978 × length − 896.35` drawn through it. Annotate MAE 32.8 kg, and that the same 105 animals were used to pick linear regression over the forest.
8. **The 188 / 197 worked example.** Recorded 407 kg, held-out line 497 kg, delivered refit 493.7 kg. This is the slide that stops “the model is a scale.”
9. **The three tabular limits together.** Yield: not one farm. Soil: not a dose. Cattle: not a scale, not a calf.
