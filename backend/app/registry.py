"""Catalogue of ML models. The frontend builds its input forms from these definitions,
so adding a model here (plus its API URL in config) is enough to expose it in the UI."""

MODELS = [
    {
        "id": "biomass",
        "name": "Pasture Biomass Estimator",
        "description": "Estimates one dry-biomass measurement from a top-down pasture photo. "
                       "A shared ResNet-50 embeds the photo; you choose which of the five trained "
                       "XGBoost models to run. A Grad-CAM map shows which parts of the photo drove that embedding.",
        "input_type": "image",
        "fields": [
            {"name": "image", "label": "Pasture photo", "type": "image",
             "help": "Top-down photo of the pasture sample area."},
            {"name": "target", "label": "What to predict", "type": "select", "required": True, "wide": True,
             "default": "",
             "help": "Each choice is a separate model. They share one ResNet backbone.",
             "options": [
                 {"value": "Dry_Clover_g", "label": "Clover"},
                 {"value": "Dry_Dead_g", "label": "Dead material"},
                 {"value": "Dry_Green_g", "label": "Green vegetation"},
                 {"value": "Dry_Total_g", "label": "Total dry matter"},
                 {"value": "GDM_g", "label": "Green dry matter (GDM)"},
             ]},
        ],
    },
    {
        "id": "crop",
        "name": "Crop Recommender",
        "description": "Suggests suitable crops from soil nutrients and climate.",
        "input_type": "json",
        "fields": [
            {"name": "nitrogen", "label": "Nitrogen (N)", "type": "number", "unit": "kg/ha", "min": 0, "max": 300, "default": 80},
            {"name": "phosphorus", "label": "Phosphorus (P)", "type": "number", "unit": "kg/ha", "min": 0, "max": 300, "default": 45},
            {"name": "potassium", "label": "Potassium (K)", "type": "number", "unit": "kg/ha", "min": 0, "max": 300, "default": 40},
            {"name": "temperature", "label": "Temperature", "type": "number", "unit": "°C", "min": -10, "max": 55, "default": 25},
            {"name": "humidity", "label": "Humidity", "type": "number", "unit": "%", "min": 0, "max": 100, "default": 70},
            {"name": "ph", "label": "Soil pH", "type": "number", "min": 0, "max": 14, "step": 0.1, "default": 6.5},
            {"name": "rainfall", "label": "Rainfall", "type": "number", "unit": "mm", "min": 0, "max": 3000, "default": 120},
        ],
    },
    {
        "id": "livestock",
        "name": "Livestock Health Check",
        "description": "Triage of animal health from temperature, appetite and visible symptoms.",
        "input_type": "json",
        "fields": [
            {"name": "species", "label": "Animal", "type": "select", "default": "cattle",
             "options": ["cattle", "buffalo", "goat", "sheep"]},
            {"name": "body_temperature", "label": "Body temperature", "type": "number", "unit": "°C",
             "min": 30, "max": 45, "step": 0.1, "default": 38.6},
            {"name": "appetite", "label": "Appetite", "type": "select", "default": "normal",
             "options": ["normal", "reduced", "none"]},
            {"name": "symptoms", "label": "Symptoms", "type": "multiselect", "default": [],
             "options": ["coughing", "nasal_discharge", "fast_breathing", "diarrhea", "bloating",
                         "lameness", "salivation", "mouth_blisters", "skin_lesions", "reduced_milk",
                         "swollen_udder", "weight_loss"]},
        ],
    },
]

MODELS_BY_ID = {m["id"]: m for m in MODELS}
