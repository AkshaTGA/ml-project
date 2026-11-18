AGRIASSIST SOIL PROFILE CLUSTERING MODEL

Purpose
-------
Groups soil samples with similar measurements. The clusters are
descriptive groups, not official soil classes or fertility grades.

Files
-----
soil_profile_pipeline.joblib : fitted StandardScaler and KMeans
cluster_profiles.csv         : final cluster counts and feature medians
cluster_comparison.csv       : training comparison for cluster counts
model_metadata.json          : features, units, diagnostics and source
README.txt                   : this documentation

Required inputs
---------------
pH : unitless
EC : millimhos/cm
OC : percent
N  : kg/ha
P  : kg/ha
K  : kg/ha

Use measurements with units and testing methods compatible with
the source dataset. Input columns must use these exact names.

Interpretation
--------------
The model assigns a cluster number. Compare it with the medians in
cluster_profiles.csv. Cluster numbers are arbitrary. The model does
not produce fertilizer doses, soil texture or a fertility diagnosis.

The distance threshold in model_metadata.json is a heuristic flag
for inputs that are less similar to training data. It is not a
probability or a calibrated confidence score.

Data and limitations
--------------------
Dataset: AgriNet, DOI 10.17632/c7tr9j78td.1
Source: https://data.mendeley.com/datasets/c7tr9j78td/1
Contributor: Atul Singh Atul
License: CC BY 4.0
Geographic scope: Bareilly district, Uttar Pradesh, India
Rows in supplied CSV: 257
Rows used for final model: 257
Clusters selected: 4
scikit-learn version: 1.6.1

The small regional dataset cannot establish performance for all
Indian farms. The held-out rows came from the same dataset and do
not constitute independent geographic validation.

Load joblib artifacts only from trusted sources. Use compatible
Python, scikit-learn, pandas, numpy and joblib versions.