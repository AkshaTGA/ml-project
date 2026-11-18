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
        "id": "yield",
        "name": "Crop Yield",
        "description": "Estimates district yield for rice, wheat or maize from earlier recorded harvests. "
                       "Not a prediction for one farm.",
        "input_type": "json",
        "fields": [
            {"name": "state", "label": "State", "type": "select", "widget": "menu", "required": True,
             "default": "", "options": []},
            {"name": "district", "label": "District", "type": "select", "widget": "menu", "required": True,
             "depends_on": "state", "default": "", "options": [],
             "help": "Districts that have a recorded harvest for rice, wheat or maize."},
            {"name": "crop", "label": "Crop", "type": "select", "required": True, "default": "RICE",
             "options": [
                 {"value": "RICE", "label": "Rice"},
                 {"value": "WHEAT", "label": "Wheat"},
                 {"value": "MAIZE", "label": "Maize"},
             ]},
            {"name": "season", "label": "Season", "type": "select", "required": True, "default": "KHARIF",
             "options": [
                 {"value": "KHARIF", "label": "Kharif"},
                 {"value": "RABI", "label": "Rabi"},
                 {"value": "AUTUMN", "label": "Autumn"},
                 {"value": "SUMMER", "label": "Summer"},
                 {"value": "WINTER", "label": "Winter"},
                 {"value": "WHOLE YEAR", "label": "Whole year"},
             ]},
            {"name": "year", "label": "Year", "type": "number", "required": True, "min": 1998, "max": 2050,
             "default": 2016,
             "help": "Uses only harvests recorded before this year for the same district, crop and season."},
        ],
    },
    {
        "id": "soil",
        "name": "Soil Profile",
        "description": "Groups a soil test with similar samples from Bareilly, Uttar Pradesh. "
                       "A descriptive cluster, not a fertility grade or a fertilizer dose.",
        "input_type": "json",
        "fields": [
            {"name": "ph", "label": "pH", "type": "number", "min": 3, "max": 10, "step": 0.1, "default": 7.2},
            {"name": "ec", "label": "EC", "type": "number", "unit": "millimhos/cm", "min": 0, "max": 3, "step": 0.01, "default": 0.12},
            {"name": "oc", "label": "Organic carbon", "type": "number", "unit": "%", "min": 0, "max": 3, "step": 0.01, "default": 0.22},
            {"name": "n", "label": "Nitrogen (N)", "type": "number", "unit": "kg/ha", "min": 0, "max": 400, "default": 105},
            {"name": "p", "label": "Phosphorus (P)", "type": "number", "unit": "kg/ha", "min": 0, "max": 80, "step": 0.1, "default": 4.5},
            {"name": "k", "label": "Potassium (K)", "type": "number", "unit": "kg/ha", "min": 0, "max": 500, "default": 125},
        ],
    },
]

MODELS_BY_ID = {m["id"]: m for m in MODELS}
