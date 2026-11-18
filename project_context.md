# AgriAssist — full project context

This document is the source of truth for describing the project. It has two halves that belong in one system.

1. **Pasture biomass model.** The model to describe is the one developed in `context.md`, and the **final architecture is the diagram in `image.jpeg`**. That diagram is the model. Earlier experiments in this document exist only to explain how that architecture was reached.
2. **AgriAssist, the agentic product.** A multilingual website for Indian farmers and herders. A person signs in, describes their farm once, and then talks to an agent by text, voice, or photo. The agent shows its work, uses tools (including the biomass model), and remembers the farm across chats.

The biomass model is the machine-learning core. AgriAssist is how a farmer actually uses that number: “how many days can this paddock feed my animals, and what should I do tomorrow?”

---

## 1. What the project is

**AgriAssist** is an agentic AI agronomist and veterinary helper for Indian farmers, herders, mixed farms, agribusinesses, and agriculture students.

A farmer does not want a model score. They want a decision: graze or rest the field, spray or wait, sell the crop or hold it, call a vet or watch the animal. AgriAssist keeps the farm’s facts (place, land, crops, animals, soil, irrigation, goals) and answers in the language the person just used. When the question needs a measurement, a price, or the weather, the agent calls a tool instead of guessing. When the question is about a pasture photo, it runs the biomass model in section 4 and then explains the result in farming terms.

The product is a web app that works in a phone browser. It is an ML course project whose two claims are:

- a pasture-biomass estimator built for the CSIRO biomass problem, with the final architecture in `image.jpeg`;
- an agent that puts that estimator, and the rest of a farm’s daily decisions, into one conversation that remembers the farm.

Public framing on the landing page: “The AI expert every farmer deserves.” The rotating word in the headline is farmer in several Indian languages (farmer, किसान, शेतकरी, ਕਿਸਾਨ, விவசாயி, రైతు, herder, ಕೃಷಿಕ, কৃষক). The three headline numbers are **22 languages by voice**, **12 agent tools**, and **farm memory that persists**.

---

## 2. The two problems, and why they are one project

### 2.1 Pasture biomass (CSIRO)

Farmers walk into a paddock and ask whether there is enough grass for the herd. Pasture biomass — the dry weight of feed on the ground — decides when animals can graze, when a field needs a rest, and whether the pasture stays productive next season.

Get the estimate wrong and the land is overgrazed, feed is wasted, or animals go short. Get it right and animal welfare, production, and soil health all improve.

The methods used today are each weak in a different way:

- **Clip and weigh** is accurate and slow. It cannot be done across a farm, let alone a region.
- **Plate meters and capacitance meters** are faster and unreliable when the pasture is uneven.
- **Remote sensing** covers a large area, still needs someone on the ground to check it, and cannot split the biomass into species or into green versus dead material.

The problem was raised by the **Commonwealth Scientific and Industrial Research Organisation (CSIRO)**, https://www.csiro.au. The task is to predict pasture biomass from images, ground-truth measurements, and public data. The data are professionally annotated Australian pastures across seasons, regions, and species mixes, with NDVI available as an extra signal.

Success is not only a better score. A usable estimate lets a farmer choose grazing, lets a researcher track pasture health, and pushes the industry toward systems that stay productive without exhausting the soil.

### 2.2 Advice that fits one Indian farm

The same person who needs a biomass number also needs, often in the same week:

- what to do for the crop they actually grow, on the land they actually have;
- whether a spotted leaf is a disease, a pest, or a deficiency, and whether to spray before the rain;
- whether a cow, buffalo, goat, or sheep needs a vet;
- today’s mandi price, and whether to sell;
- a weather window for sowing, irrigation, spraying, or harvest;
- a government scheme, a dose, or a cost in rupees, in the language they speak.

A generic chatbot fails this because it does not know the farm, it invents prices, and it answers in the wrong language. AgriAssist is the layer that holds the farm, calls the biomass model and the other tools, and answers in the person’s own words.

---

## 3. Biomass data, targets, and score

### 3.1 What is predicted

Every training row is one image paired with one named target. There are **five targets**, all in grams of dry matter for the photographed sample quadrat:

| Target | Meaning | Weight in the score |
|---|---|---|
| `Dry_Green_g` | Dry green vegetation other than clover | 0.1 |
| `Dry_Dead_g` | Dry dead material | 0.1 |
| `Dry_Clover_g` | Dry clover | 0.1 |
| `GDM_g` | Green dry matter: green vegetation plus clover | 0.2 |
| `Dry_Total_g` | All dry matter: green, clover, and dead | 0.5 |

`Dry_Total_g` dominates the score. `GDM_g` is the next most important. A model that is only good at clover and poor at the total is a weak model under this metric.

These five quantities are not independent in nature:

- green dry matter is the green fraction plus clover;
- total dry matter is green dry matter plus dead material.

A later experiment uses that identity. The **final architecture does not**. It trains five separate regressors so the two heavily weighted targets are learned directly rather than only added up afterwards.

### 3.2 How a submission is scored

The score is **one globally weighted coefficient of determination (R²)**, computed over all `(image, target)` pairs together.

It is not the average of five separate R² values. Each row is weighted by the target weight above, and a single weighted R² is computed on the combined, weighted rows. Because total dry matter has weight 0.5, half of the score is about getting `Dry_Total_g` right.

### 3.3 What an image looks like

The pasture photos used here are wide frames that contain **two views of the same sample side by side**. The two-stream experiments, and the final architecture, exist because of that geometry.

Given an image of height `H` and width `W`, the split used in the two-stream experiment is:

- left half: columns `0` to `H` (a square);
- right half: columns `W - H` to `W` (a square).

The final diagram labels these **Left half** and **Right half**. Both halves are the same pasture sample seen from two adjacent positions, not two different fields. Treating them as two inputs, with a shared network, lets the model see more of the sward than a single centre crop would.

### 3.4 Other columns that experiments used

The tables also carry, among other fields:

- `image_path`, `sample_id`, `target_name`, `target`;
- `Species` (15 classes in the training split used by the DINO experiment);
- `State` (4 classes in that same split — Australian state, not a model state);
- `Height_Ave_cm`, average pasture height in centimetres;
- `Pre_GSHH_NDVI`, a precomputed NDVI value.

Species, state, height, and NDVI were used as **auxiliary training signals** in the neural experiments. They are not inputs the farmer provides in AgriAssist, and they are not inputs of the final architecture. The final model takes only the photograph.

### 3.5 Units the farmer eventually sees

Model outputs are **grams of dry matter per sample quadrat**. The grazing calculator assumes the quadrat is **70 cm × 30 cm = 0.21 m²** unless told otherwise. Converting grams on that quadrat into kilograms of dry matter per hectare is:

```
kg DM per ha = grams_per_quadrat / quadrat_area_m2 × 10
```

The `× 10` is the g/m² → kg/ha conversion.

---

## 4. How the biomass model was developed

Three experiments were built. The third diagram in this section is not an experiment. It is the architecture the project uses.

### 4.1 Experiment A — one photo, ResNet-50 embedding, four green numbers, five XGBoost models

This was the first complete training and inference pipeline.

**Image tower.** A ResNet-50, ImageNet-pretrained, with the classification head removed (`fc = Identity`). The network is used as a frozen embedding function. Input: resize to 224×224, convert to a tensor, ImageNet normalise with mean `[0.485, 0.456, 0.406]` and standard deviation `[0.229, 0.224, 0.225]`. Output: a **2048-dimensional** vector. Embeddings are extracted in batches of 32, with gradients off.

**Green tower.** Computed on the original photo in RGB pixels on the 0–255 scale, not on the normalised tensor. For an image with channels R, G, B:

- Excess green: `ExG = 2G − R − B`
- `exg_mean`: mean of ExG
- `exg_std`: standard deviation of ExG
- `exg_top10`: mean of the ExG values at or above the 90th percentile
- GNDVI proxy: `gndvi = (G − R) / (G + R + 1e−6)`, then the mean of that map

That is a **4-dimensional** vector. These four numbers describe how green the frame is, how uneven that green is, how green the greenest tenth is, and a red/green vegetation index that does not need a near-infrared band.

**Joined vector.** `2048 + 4 = 2052` dimensions.

**Heads.** One `XGBRegressor` per `target_name`. Hyperparameters used for these models:

- 600 trees
- max depth 8
- learning rate 0.05
- subsample 0.85
- column subsample 0.85
- objective `reg:squarederror`
- all CPU cores

Each model is saved on its own (`xgb_<target>.json`). At inference, the row’s `target_name` selects which of the five models runs. The feature function for one photo is the same 2052-d concatenation.

This experiment established three things the final model keeps: a pretrained convolutional embedding, handcrafted green statistics beside that embedding, and a **separate tree model per target** so each target can weight the features differently.

What it does not do is use the two-half geometry of the photo. The whole frame is resized to one 224×224 square, so the left and right views are squashed together.

### 4.2 Experiment B — DINO ViT-S/16, target conditioning, green cross-attention, multi-task heads

The backbone was changed from ResNet-50 to a **DINO-pretrained ViT-S/16** (`vit_small_patch16_224` from `timm`, weights loaded from a DINO DeiT-Small/16 checkpoint, `strict=False`). The backbone is frozen. Patch size 16 on a 224 image gives a 14×14 grid, **196 patch tokens**, each of dimension **384**. The class token is dropped. A learned positional embedding of shape `(1, 196, 384)` is added, then a **4-layer Transformer encoder** with **6 heads** runs over the tokens.

**Green conditioning, different from experiment A.** On the image tensor (after `ToTensor`, so values are in 0–1):

- mean of G
- mean of ExG
- fraction of pixels where G > R

Those 3 numbers are projected to 384 dimensions and used as the **query** of a cross-attention block. The 196 patch tokens are the keys and values. The output is one 384-d image context vector. This is how “where is the vegetation?” is allowed to pull on the patch tokens instead of only being concatenated at the end.

**Target conditioning.** The five target names are an embedding table (`5 × 128`), projected to 384. The image context and the target vector are concatenated (**768-d**). So one network can be asked for clover or for total, and the question is part of the input. The id map is:

| id | target |
|---|---|
| 0 | Dry_Clover_g |
| 1 | Dry_Dead_g |
| 2 | Dry_Green_g |
| 3 | Dry_Total_g |
| 4 | GDM_g |

**Heads on the fused vector:**

- biomass: Linear 768→256, ReLU, Linear 256→1 (the value that is submitted)
- height: Linear 768→1 (predict `Height_Ave_cm`)
- auxiliary: Linear 768→1 (predict `Pre_GSHH_NDVI`)
- species: Linear 768→15
- state: Linear 768→4

**Loss, one weighted sum:**

| Head | Loss | Weight |
|---|---|---|
| biomass | MSE | 1.0 |
| height | MSE | 0.3 |
| NDVI auxiliary | MSE | 0.2 |
| species | cross-entropy | 0.1 |
| state | cross-entropy | 0.1 |

Optimiser AdamW, learning rate `1e-4`, batch size 8, image resize 224 with no ImageNet normalisation in this script. The run was planned for 150 epochs, checkpoint every 10 epochs.

**What the training log actually did.** Loss fell quickly, then became unstable:

| Epoch | Loss |
|---|---|
| 1 | 671.97 |
| 2 | 341.98 |
| 3 | 254.93 |
| 5 | 209.13 |
| 10 | 232.01 (checkpoint saved) |
| 17 | 197.79 |
| 18 | 192.83 |
| 20 | 308.71 (checkpoint saved) |
| 21 | 392.15 |
| 22 | 502.86 |
| 23 | 464.29 |
| 24 | 455.09 |

The biomass head, the height head, and the NDVI head share one fused vector and very different scales (grams versus centimetres versus an index around 0–1). A single MSE sum with a frozen backbone and a randomly initialised transformer on top did not stay stable. This experiment is why the final model goes back to separate XGBoost heads: each target gets its own loss, its own trees, and cannot drag the others off scale.

What is kept from this experiment is the idea that the **target identity matters**, and that green information should meet the image representation deliberately rather than as an afterthought. In the final model, “target identity” is implemented by five independent regressors instead of an embedding of the target name.

### 4.3 Experiment C — two-stream DINO, three direct targets, two derived targets, five-fold ensemble

This experiment takes the left/right split seriously and simplifies the head.

**Input.** The wide photo is split into the two squares described in section 3.3. Each half is resized to 224, ImageNet-normalised, and (in training) horizontally flipped with probability 0.5. Albumentations is the transform library. Batch size 8, 30 epochs, learning rate `1e-3`, 5 folds, seed 42.

**Backbone.** The same frozen DINO ViT-S/16, run **twice**, once per half, weights shared. The two 384-d pooled vectors are concatenated to **768-d**.

**What is learned directly.** Only the three components that are not sums of the others:

- `Dry_Clover_g`
- `Dry_Dead_g`
- `Dry_Green_g`

The biomass head is Linear 768→512, GELU, dropout 0.1, Linear 512→3.

**Auxiliary heads on the same 768-d vector:** state (cross-entropy), species (cross-entropy), height (L1). Weights: state 0.1, species 0.1, height 0.05. The biomass loss itself is unweighted MSE against the three-vector.

**Folds.** Stratified 5-fold on `State`. At inference the five fold models are averaged. Predictions are clipped at zero.

**Derived targets, after the average:**

```
GDM   = Dry_Green_g + Dry_Clover_g
Total = GDM + Dry_Dead_g
```

The submission is melted back to one row per `(image, target_name)` so it matches the five-target scoring format. Missing values are filled with 0 and clipped at 0.

This experiment contributed the **two-stream split** that the final diagram is built on. It also showed a clean way to respect the physical identities GDM = green + clover and Total = GDM + dead. The final model does not copy that derivation. Total carries half the score and GDM carries a fifth, and both can disagree with a naive sum when the three component models err in different directions. The final model therefore **learns all five targets**, including the two sums, as their own regressors.

### 4.4 Why the final model is the combination, not any one experiment

| Idea | Where it came from | What the final model does with it |
|---|---|---|
| Pretrained visual embedding, not pixels straight into a tree | Experiment A | Shared ResNet-50, 2048-d per half |
| Handcrafted green statistics next to the embedding | Experiment A | 12-d block, defined below |
| Separate model per target, squared error, no shared head that can blow up | Experiment A, and the failure mode of B | Five independent XGBoost regressors |
| The photo is two halves of one quadrat | Experiment C | Both halves encoded, embeddings concatenated |
| Do not squash the wide frame into one 224 square | Experiment C | Each half is resized on its own |
| Total and GDM are the targets the score cares about | The metric | They are predicted by their own models, not only added afterwards |

Experiment B’s target-name embedding and its multi-task neural head are **not** in the final diagram. They were tried. The training run diverged. The final model gets target-specificity from five trees instead.

---

## 5. Final biomass architecture (the figure in `image.jpeg`)

This is the model. Reproduce this diagram when the architecture is shown. Do not replace it with experiment A, B, or C.

### 5.1 Flow

```
Original pasture image
        │
        ├── Left half ──► ResNet-50 (shared pretrained backbone) ──► 2048-d left embedding
        │
        └── Right half ─► ResNet-50 (same weights) ────────────────► 2048-d right embedding
                                        │
                                        │   +
                                        ▼
              Handcrafted green vegetation features
              extracted on the left half, the right half,
              and the whole image                         ──► 12-d
                                        │
                                        ▼
                         Feature concatenation
                         2048 + 2048 + 12 = 4108-d
                                        │
                                        ▼
                    Five independent XGBoost regressors
                    ┌────────────────┬────────────────┐
                    │ Dry_Clover_g   │ Dry_Dead_g     │
                    │ Dry_Green_g    │ GDM_g          │
                    │ Dry_Total_g    │                │
                    └────────────────┴────────────────┘
```

### 5.2 The shared ResNet-50

- Architecture: ResNet-50.
- Initialisation: ImageNet pretrained.
- The classifier is removed. The vector used is the **2048-d pooled embedding** (the representation that used to feed the 1000-way layer).
- **One set of weights** encodes both halves. The figure labels each box “Shared pretrained backbone”.
- Each half is resized to 224×224 and ImageNet-normalised with mean `[0.485, 0.456, 0.406]` and standard deviation `[0.229, 0.224, 0.225]` before it enters the network. That is the preprocessing the ResNet was pretrained with.
- The two 2048-d vectors stay separate until the concatenation. They are not averaged. Left and right are different views, and the trees are allowed to use them differently.

### 5.3 The 12-d green block (“12-D proposed” on the figure)

The figure’s own caption is: extracted separately from the left and right halves, **plus global image statistics**.

The four statistics are the ones defined in experiment A, always computed on raw RGB pixels (0–255), never on the normalised network input:

1. `exg_mean` — mean of `ExG = 2G − R − B`
2. `exg_std` — standard deviation of ExG
3. `exg_top10` — mean of ExG over pixels at or above the 90th percentile of ExG
4. `gndvi_mean` — mean of `(G − R) / (G + R + 1e−6)`

They are computed three times:

| Region | Dimensions |
|---|---|
| Left half | 4 |
| Right half | 4 |
| Whole image (global) | 4 |
| **Total** | **12** |

So the 12-d vector is `[left 4 | right 4 | global 4]`.

Why all three regions exist:

- Left and right match the two embeddings, so a half that is greener can be tied to the embedding of that half.
- The global statistics see the seam and the overall sward, which neither half contains alone.
- ExG mean says how green. ExG standard deviation says whether the green is a uniform mat or a mix of plants and gaps. The top 10% says how strong the greenest material is, which matters for clover and live leaf versus a pale or dead background. The GNDVI proxy is a red-versus-green index that can be computed from an ordinary RGB photo.

### 5.4 The 4108-d vector

```
4108 = 2048 (left embedding) + 2048 (right embedding) + 12 (green features)
```

Order of concatenation is that order: left embedding, right embedding, green features. Every one of the five regressors receives this same vector. They do not share trees. A feature that matters for dead material is free to be ignored by the clover model.

### 5.5 The five regressors

Five independent XGBoost regressors, one per target, same target names and meanings as section 3.1:

1. `Dry_Clover_g`
2. `Dry_Dead_g`
3. `Dry_Green_g`
4. `GDM_g`
5. `Dry_Total_g`

Each is a squared-error gradient-boosted tree model of the same family as experiment A (separate `XGBRegressor` per target). They are fit on the 4108-d vector, not on the 2052-d vector. At inference, **one photo produces all five numbers**. The farmer does not run the photo five times, and the network does not run five times: the two ResNet passes happen once, the 12 green numbers are computed once, and then five already-trained tree models read the same 4108-d vector.

Outputs are in grams per quadrat. Negative predictions, if a tree produces them, are not physically meaningful; the two-stream experiment clipped at zero before building a submission, and the same non-negative reporting is the right way to show a gram value to a farmer.

### 5.6 What this architecture is deliberately not

- It is not a single 224×224 squash of the whole wide photo (experiment A).
- It is not a DINO transformer with a target-name embedding and a shared neural head (experiment B).
- It is not “predict three components and add them up” (experiment C), even though those identities remain the agronomic meaning of GDM and Total.
- Species, state, height, and NDVI are not inputs and not heads of this model. They were training auxiliaries in B and C only.

### 5.7 From grams to a grazing decision

The number the farmer can act on is not “48 g”. It is “this paddock can feed these animals for this many days if you leave a residual.”

That conversion is deterministic. It is not another learned model.

Inputs:

| Input | Meaning | Default |
|---|---|---|
| `total_biomass_g` | `Dry_Total_g`, or `GDM_g` if the question is only about green feed | from the model |
| `paddock_area_ha` | area of the paddock being grazed | from the farm profile, converted (1 acre = 0.405 ha) |
| `num_animals` | herd or flock size | from the profile |
| `avg_liveweight_kg` | average live weight | 400 |
| `quadrat_area_m2` | area the photo represents | 0.21 (70 cm × 30 cm) |
| `residual_kg_dm_per_ha` | dry matter left behind so the pasture can recover | 1000 |
| `intake_pct_liveweight` | daily dry-matter intake as a percent of live weight | 2.5 |
| `utilisation` | fraction of the available feed the animals actually eat | 0.7 |

Steps:

```
kg_dm_per_ha        = total_biomass_g / quadrat_area_m2 × 10
available_feed_kg   = max(kg_dm_per_ha − residual_kg_dm_per_ha, 0) × paddock_area_ha × utilisation
herd_daily_demand   = num_animals × avg_liveweight_kg × intake_pct_liveweight / 100
grazing_days        = available_feed_kg / herd_daily_demand     (0 if there is no herd)
```

The four numbers returned to the agent and the farmer are pasture kg DM/ha, available feed kg DM, the herd’s daily demand in kg DM, and grazing days. If available feed is zero, the paddock is already at or below the residual and should be rested, not grazed.

---

## 6. AgriAssist as a product

### 6.1 Who it is for

Onboarding asks which description fits:

| Stored role | What the person sees as the choice | Hint |
|---|---|---|
| `farmer` | Farmer | I grow crops |
| `herder` | Herder / dairy | I raise animals |
| `mixed` | Both | Crops and animals |
| `agribusiness` | Agri business | Inputs, trading, FPO |
| `student` | Student / researcher | Learning and research |

The rest of the product does not branch into five different apps. The role is part of the profile the agent reads, so a herder is not given a sowing plan as the first answer, and a student can still ask research-style questions.

### 6.2 A session, from the outside

1. **Landing.** The person sees the product, the language marquee, the six capabilities, and a looping demo of the agent working in Hindi on a wheat leaf (recalled memories → leaf doctor → weather → a spoken-style answer that names yellow rust, Thursday rain, and a morning spray).
2. **Sign in / sign up** with Clerk. The marketing line on the auth screen is: ask in your language, get advice that remembers your farm.
3. **Onboarding**, five steps, about a minute, skippable where a step does not apply. Until this is finished, the app routes the person back to onboarding. “Redo farm setup” in Settings runs the same flow again.
4. **Home.** Today’s date, a greeting with their name, local weather and a 7-day strip if a location exists, alerts, mandi prices for up to three of their crops, recent questions, and one-tap actions.
5. **Chat.** The main surface. Text, a photo, a voice typing mic on every field, or a full hands-free voice mode.
6. **Tools.** Three model tools that can be run without a conversation: pasture biomass, crop recommender, livestock health. Each keeps its own history. A run the agent starts from a chat photo also appears in that tool’s history, marked as from chat.
7. **My Farm / Settings.** Profile, memory, how the assistant should talk, language and voice.

The app shell is a phone-friendly sidebar: new question, home, ask the assistant, my farm, tools, settings, search over past questions, and the question list grouped into recent, this week, and earlier. A language control sits at the bottom of the sidebar.

### 6.3 Onboarding, field by field

Steps, in order: **Language → About you → Location → Your farm → Goals.**

**Language.** One of the 11 interface languages in section 11. Choosing it switches the interface immediately. The agent can still answer in a different language later if the person writes or speaks in one.

**About you.** Name (typed, kept exactly as typed). Role, one of the five above.

**Location.** A place search (village, town, or district) or “use my current location”. The chosen place is geocoded to latitude and longitude. Those coordinates are what weather, alerts, and “prices near me” use. The display string (“Kanadiya, Madhya Pradesh”) is stored as the person selected it, not translated later.

**Farm.**

- Land area as a number, and a unit: acre, bigha, or hectare.
- Crops, multi-select, plus a free-text “other crop”. The offered set is wheat, rice, maize, cotton, sugarcane, soybean, mustard, chickpea, onion, tomato, potato, banana, mango, vegetables, millets, groundnut, pasture/fodder, fruits. A crop the person types (for example “Bhindi”) is stored as they typed it.
- Animals, with a count: cows, buffaloes, goats, sheep, poultry.
- Irrigation, one of: rainfed, canal, borewell/tubewell, drip, sprinkler, pond/tank.
- Soil, one of: alluvial, black (cotton), red, laterite, sandy, clay, loamy, or don’t know.

**Goals.** Toggles plus a free-text box: increase yield, reduce input costs, better market prices, animal health, organic farming, save water, pest and disease control. The free text is the place for the real problem (“wheat yield dropped last year and the cows give less milk in summer”).

Nothing in onboarding is sent to the biomass model. It becomes the profile the agent reads on every later turn.

### 6.4 Home

- Greeting uses the saved name. The date line is the person’s locale.
- Ask box: type or dictate, then the message opens a chat.
- Four actions that open a chat already started:
  - **Crop advice** — “What should I do for my crops this week? Keep it short and practical.”
  - **Scan a leaf** — opens the composer ready for a photo.
  - **Weather** — “How is the weather on my farm this week, and what should I do in the field?”
  - **Mandi prices** — “What are today’s mandi prices for my crops? Should I sell now or wait?”
- **Weather panel.** If the profile has coordinates, Open-Meteo supplies current temperature, humidity, precipitation, wind, and a weather code, plus seven days of max/min temperature, precipitation sum, precipitation probability, and weather code. The panel shows today’s temperature, the condition, humidity, wind, rain, and a seven-column forecast. If there is no location, the panel asks the person to add one.
- **Alerts**, derived only from that forecast and the profile, not from an LLM:
  - Heavy rain: any of the next 3 days has at least 10 mm. “Postpone pesticide/fertiliser spraying and keep field drainage clear.”
  - Dry and warm: the next 2 days are under 20% chance of rain and today is above 30°C. “Good spraying window. Check soil moisture and plan irrigation.”
  - Heat: any day at or above 38°C. If the profile has animals, shade and extra water plus evening irrigation. If not, evening irrigation and mulch.
  - Frost: any night at or below 4°C. Evening light irrigation and smoke at night.
  - If none of these fire, the panel says the next few days are clear.
- **Mandi strip.** Up to the first three crops on the profile. For each, the latest Agmarknet prices, the average of available modal prices, and up to three markets. Tapping a row asks the agent whether to sell now or wait. Prices are rupees per quintal.
- **Farm card.** The first crop, or the first animal count, as the headline, with land, soil, irrigation, and stock underneath. Tapping asks “How is my {crop} doing, and what should I do next?”
- **Recent questions.** The latest chats.

### 6.5 Tools page

Three cards.

**Pasture biomass.** The person gives a top-down photo of the sample area. The photo is the wide, two-half frame the model expects. The model in section 5 runs once and returns all five gram values. The page keeps every run: thumbnail, the five numbers, when it was run, and whether the agent started it from a chat. A run can be deleted. The whole history of this tool can be cleared. **Ask what this means** opens a chat with a short question (“Explain this in simple words and tell me what I should do”) and a small card pointing at that run. The chat bubble shows the card, not a dump of JSON. The agent also receives the original photo so it can talk about what is in the frame.

**Crop recommender.** Soil and climate in, a ranked list of crops out. Inputs: nitrogen, phosphorus, and potassium in kg/ha, temperature in °C, humidity in %, soil pH, rainfall in mm. The result is a list of `{crop, confidence}`. On the agent side, missing climate numbers are filled from the weather tool rather than invented. History, delete, clear, and “ask what this means” work the same way.

**Livestock health.** A triage, not a diagnosis that replaces a vet. Inputs: species (cattle, buffalo, goat, sheep), rectal temperature in °C, appetite (normal, reduced, none), and any of these visible signs: coughing, nasal discharge, fast breathing, diarrhea, bloating, lameness, salivation, mouth blisters, skin lesions, reduced milk, swollen udder, weight loss. The result is a risk level (high, medium, low) and possible conditions with a match score. The agent is required to point serious cases to a veterinarian.

Runs started by the person on this page and runs started by the agent in chat share one history per tool. A chat run is badged “from chat” and can jump back to that message.

### 6.6 Settings

Four tabs.

**Farm profile.** Every onboarding field, editable. Known choices (role, unit, soil, irrigation, a crop from the offered list, an animal type) are shown in the interface language. The edit box always contains the stored value, so saving cannot overwrite a stored “Bhindi” or a stored place name with a translation. There is a “redo farm setup” path back through onboarding.

**Memory.** Explained in full in section 9. The screen shows the profile as the structured long-term record, the single long-term summary, notes that have been noticed once but are not yet long-term, and the short-term summaries of recent conversations. The person can search, edit, delete, and clear what the agent learned. Clearing learned memory does not delete the profile or the chats.

**Assistant style.** A free-text instruction box, 1500 characters, plus chips that insert a sentence:

- Keep answers short and to the point.
- Explain simply, like I’m new to farming.
- Use local units like bigha and quintal.
- Always suggest an organic option first.
- Reply in Hinglish (Hindi in English letters).
- Give approximate costs in rupees.
- Use step-by-step lists.

These sentences are **user content**. They are written into the instruction box in the current language and then stored as whatever is in the box. They are not a hidden mode flag.

The screen also explains the order of instructions, so the person knows what they can and cannot override:

1. AgriAssist’s safety rules and tool rules. Fixed.
2. The style instructions above.
3. The farm profile, memories, and recent chats.
4. The message they just sent.

Style changes tone, language, and format. It cannot turn off safety advice or stop the agent from using tools.

**Language and voice.** App language is the interface. Reply-and-voice language is the default for speech and for messages that have no language of their own (a photo with no caption, a bare number). If the person writes a clear language, the agent follows the message, not this default. Voice is covered in section 10. Two voice slots: the voice used in hands-free conversation, and the voice used when they tap the speaker on a written answer. Each can be previewed. Speakers are the Sarvam Bulbul set, men and women, including Shubh as the default.

There is also a control, stored on the device, for how much of the agent’s work to show. Off: a short status line, then the answer. On: memories, the plan sentence, tool arguments, timings, and the model’s reasoning trace.

---

## 7. System shape

```
Phone browser
  React 19 + Vite + Tailwind
  Clerk session
        │  HTTPS, Clerk JWT on every /api call
        ▼
  FastAPI
        │
        ├── LangGraph agent  ──►  LLM (tool decisions, the answer, vision)
        │         │
        │         ├── tools (section 8)
        │         ├── Postgres (Neon): profiles, threads, files, tool runs
        │         ├── LangGraph Postgres checkpointer: full chat messages
        │         └── LangGraph Postgres store + pgvector: memory summaries
        │
        ├── fast LLM: memory reflection, explicit “remember this”, leaf-diagnosis card
        ├── local embeddings (fastembed, multilingual MiniLM, 384-d)
        ├── Sarvam: speech to text, text to speech
        ├── biomass model of section 5
        ├── crop recommender and livestock triage
        ├── Open-Meteo weather and geocoding
        ├── data.gov.in Agmarknet mandi prices
        └── web search (Tavily if configured, otherwise DuckDuckGo)
```

The person’s id comes from the verified Clerk token. Tools receive that id from the server-side run config. The model cannot pass a different user id and read someone else’s farm, memory, or files.

A chat turn is a graph:

```
START → load_context → agent ⇄ tools → END
```

`load_context` loads the profile, the long-term summary, the last three other chat summaries, and this chat’s own summary. `agent` is the main LLM with the twelve tools bound. If the model calls tools, the tool node runs them (parallel calls run together) and control returns to the agent. The loop stops when the agent sends a final answer with no tool call. Recursion limit is 30, which is far above a normal turn of one to three tool rounds.

Memory reflection is **not** a node in this loop. It runs after the answer has already been streamed, so it never delays the reply. If the person closes the tab mid-answer, the run still finishes on the server and the answer and the reflection are saved.

The main LLM is the model that decides tools and writes the answer. It streams. The project is wired so this model can be xAI Grok (default `grok-4.7`), Google Gemini, NVIDIA NIM, or Meta Muse, chosen by which key is present or by an explicit provider setting. Temperature on the answering model is 0.3 where the provider uses temperature. A second, cheaper model (default `grok-4.20-non-reasoning`, temperature 0) does only background work: reflection, rewriting the long-term summary, and filling the structured leaf-diagnosis card. Vision is on: uploaded images are sent to the answering model as well as to any tool that needs them.

Embeddings never call an API. `fastembed` loads `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, 384 dimensions, on CPU. A query is on the order of 10 ms after the model is warm. Because the model is multilingual, a Hindi memory and an English question can match.

---

## 8. The twelve tools

The agent is instructed to use tools instead of guessing, and to call independent tools in parallel (weather and prices together, for example). It must not invent prices, schemes, doses it does not know, or measurements.

### 8.1 `predict_pasture_biomass`

When the person sends a photo of pasture or grass, or asks whether a paddock has enough feed.

The photo is the input of the architecture in section 5. The tool returns the five gram-per-quadrat values (`Dry_Clover_g`, `Dry_Dead_g`, `Dry_Green_g`, `GDM_g`, `Dry_Total_g`), the units, and the run id. The agent then explains them in words: how much is green, how much is clover, how much is dead, what the total means for grazing. If the farm has animals and an area, the next tool is the grazing calculator, using `Dry_Total_g` or, if the question is specifically about live feed, `GDM_g`.

The original photo is kept on the run. Later, “ask what this means” shows the agent the photo and a short brief, not the raw record.

### 8.2 `diagnose_plant_disease`

When the photo is a leaf, a plant, or a fruit, not a pasture sward.

This tool is a vision call to the fast model, constrained to a schema, not a separate trained classifier. The prompt tells that model it is a plant pathologist working in India, to be honest about uncertainty, and to say so with low confidence if the photo is unclear. Optional hints: the crop name, and notes the person already said.

The card contains:

- crop identified
- healthy or not
- most likely disease, pest, or deficiency (`None` if healthy)
- confidence from 0 to 1
- symptoms actually visible
- urgency: low, medium, high
- organic treatment steps
- chemical treatment as generic active ingredients and a typical dose, never a brand
- prevention
- other possibilities
- a fixed note that this is an AI reading and a severe case should be confirmed with the local KVK (Krishi Vigyan Kendra)

The answering model also sees the photo itself, so it can disagree with or qualify the card. The agent must not recommend a banned pesticide, and must send serious cases to a KVK or agriculture officer as well as giving the steps.

### 8.3 `recommend_crop`

When the person asks what to grow. Inputs are the seven soil and climate numbers in section 6.5. If the person has not given the climate, the agent calls `get_weather` and uses the farm’s real weather rather than a made-up temperature or rainfall. The result is a ranked list of crops with confidence. The profile’s soil, location, and existing crops are context for the written answer, not silent overrides of the numbers.

### 8.4 `assess_livestock_health`

When an animal is sick or the person describes signs. Inputs are the species, temperature, appetite, and symptom list in section 6.5. The result is a risk level and possible conditions with match scores. Serious illness is always paired with “see a veterinarian”. The tool does not prescribe prescription-only drugs as if it had examined the animal.

### 8.5 `estimate_grazing_days`

The formula in section 5.7. No learning. The agent supplies the biomass grams from tool 8.1 and the herd and area from the profile or the conversation. The answer should say the residual that was assumed, because “12 grazing days” is meaningless if the person does not know that 1000 kg DM/ha was left ungrazed.

### 8.6 `get_mandi_prices`

Latest wholesale APMC (mandi) prices for a commodity, optionally filtered by state and district. Unit is rupees per quintal: minimum, maximum, and modal.

Source order:

1. data.gov.in Agmarknet resource `9ef84268-d588-465a-a308-a864a43d0070`, up to 25 records, of which 12 are returned, if an API key is configured.
2. If that returns nothing or the call fails, a web search for “{commodity} mandi price today {place} per quintal”, and the answer must say the prices came from the web rather than from the live mandi feed.

Results are cached for 6 hours per (commodity, state, district). The agent cites the market, the date, and the modal price, and does not invent a price when both sources fail.

### 8.7 `get_weather`

Current conditions and a 7-day forecast: temperature, rain, humidity, wind. If the person names no place, the farm’s saved coordinates are used. Otherwise the place name is geocoded (Open-Meteo geocoding, first hit) and the forecast is fetched in the local timezone. Cached for 30 minutes on a 0.01-degree grid. The agent is told to call this before any advice that depends on weather: sowing, spraying, irrigation, harvest, grazing.

The dashboard uses the same weather function and the same alert rules, so the home screen and the chat do not disagree about tomorrow’s rain.

### 8.8 `web_search`

For schemes, pest outbreaks, news, and anything current or uncertain. Returns up to 5 results with title, URL, and snippet. Tavily if a key exists, otherwise DuckDuckGo. The agent must cite the URLs it actually uses. In the chat UI a bare URL is rendered as a source card (decoded title and host), and the model is told to prefer a `links` visual or a markdown link with a human title, never a raw address in a bullet.

### 8.9 `remember_fact`

Only when the person asks to remember something, or states a lasting preference or constraint that is not already in the profile or the long-term summary. One short third-person sentence. Refused, and kept only in the chat, when the text is about weather, prices, today’s symptoms, a photo result, or advice just given. The exact promotion rules are in section 9. The tool does not append a new bullet to a growing list. It asks for the single long-term summary to be rewritten with the new sentence folded in.

### 8.10 `recall_memories`

Looks up the long-term summary. The summary is already in the system prompt, so this tool is for a deliberate search when the agent thinks something lasting was stored and is not in the lines it was given.

### 8.11 `search_past_conversations`

Semantic search over earlier chats (“what did you tell me about the goat’s fever last week?”). Returns matching titles and summaries, up to 4, with a similarity score. It does not return the full old transcript unless the person opens that chat.

### 8.12 `update_farm_profile`

When the person says the farm itself changed: new crop, more land, a move, different soil, a new goal, a language preference. Fields it may write: name, location name, land area, land unit, crops, irrigation, soil, goals, language. Crops must be the full current list, comma-separated, because the field is replaced rather than appended. A new location name is geocoded so weather keeps working. Livestock counts are edited on the profile screen; this tool’s field list is the one above.

---

## 9. Memory

Memory is designed to behave like a person who knows a farmer, not like a log that stores every sentence.

### 9.1 Three tiers

| Tier | What it holds | Where | When it is written | When the agent sees it |
|---|---|---|---|---|
| Session | The full message list of this chat, including tool calls | LangGraph Postgres checkpointer, keyed by thread id | Every turn | The last 24 messages, trimmed so the slice starts on a user message and no tool result is orphaned. Older turns are represented by this chat’s summary. |
| Short-term | Title and 2–4 sentence summary of each chat: the problem, the numbers, the prices, the weather, the advice | `threads` table, and a vector copy under `("threads", user)` | After each answer, in the background | This chat’s summary, plus the 3 most recent *other* chats that have a non-empty summary |
| Long-term | **One** prose summary of what has proved lasting, at most about 120 words and at most 900 characters. Plus the structured farm profile, which is separate and is not copied into the summary. | Store namespace `("memories", user)`, key `summary`. Profile is the `profiles` row. | Only by promotion (below) or by the person editing it | On every turn, in the system prompt |

There is a fourth, invisible holding area: **candidates**, namespace `("candidates", user)`. The person can see these as “noticed once, not long-term yet”. They are not in the system prompt.

### 9.2 What is allowed to become long-term

A note is rejected if any of these is true:

- It is shorter than 12 characters after cleaning.
- It is ephemeral: it matches words like today, tomorrow, tonight, yesterday, this week, next week, right now, currently, weather, forecast, rain, temperature, mandi, price, rupee, quintal, biomass, quadrat, prediction, diagnosis, advised, recommended, “should spray”, “this morning”. Exception: it also states a durable marker such as always, never, prefers, every year, each season, breed, allergic, cannot. “Always sows wheat after the monsoon” can be lasting. “It will rain tomorrow” cannot.
- It only repeats the profile. Comparison is by significant tokens (stopwords removed, naive singulars). If every significant token of the note is already in the profile text, the note is dropped. The profile is the structured record; the summary must not restate “grows wheat in Kanadiya”.
- It is already covered by the current long-term summary, by the same token test.

### 9.3 How a note becomes long-term

Two doors.

**The person asks.** `remember_fact`, or an explicit “remember that…”. That request is enough proof. The note is folded into the summary immediately, unless it is ephemeral or already known. Candidates that match it are deleted so the same fact is not waiting and stored at once.

**The system notices it twice.** After each answer, reflection may propose up to **2** candidate sentences. A candidate is one short third-person English sentence that could still matter months later and is not already known. Usually the list is empty. Weather, prices, today’s problem, model results, and advice are forbidden in candidates even before the ephemeral filter runs.

A new candidate is stored with the thread id it came from. If a later chat produces a near-duplicate, the thread ids are unioned. Near-duplicate means embedding cosine at or above 0.82, or cosine at or above 0.74 **and** token overlap of at least half the shorter sentence. When the same note has been seen in **2 distinct threads**, it is promoted and the candidate is deleted. One long conversation repeating itself does not count as two threads.

**Promotion is a rewrite, not an append.** A fast LLM is asked to rewrite the whole long-term memory as one short summary, the way you would remember a farmer you know:

- at most 120 words, plain sentences, no bullets, no headings;
- standing truths only;
- drop weather, prices, one-off problems, advice, model results, and anything already in the profile;
- if the new note contradicts an older detail, keep the newer detail;
- if nothing lasting remains, return an empty summary.

The result is capped at 900 characters on a sentence boundary. The previous summary is replaced. There is never a growing list of facts.

On the next reflection, any legacy pile of old per-fact rows is folded into that one summary by the same rewrite and then deleted. The product does not show two memory designs at once.

### 9.4 What reflection does besides memory

Reflection’s structured output is:

- `candidates`: usually empty, rules above;
- `title`: 3–6 words, in the person’s language, for the whole conversation;
- `summary`: 2–4 sentences of **this** conversation, including the numbers and the advice (this is the short-term memory);
- `suggestions`: 3 short follow-up questions in the person’s language.

The transcript given to reflection is the latest messages, capped around 6000 characters. Tool outputs are replaced with “this tool ran; do not store its output as a fact”. Visual UI blocks are replaced with `[visual]` so a chart’s JSON is not memorised. The profile text and the current long-term summary are included with an instruction not to restate them.

If a candidate is promoted, the chat UI shows a “Remembered: …” toast. The person can undo it.

### 9.5 What the person can do to memory

- Read the summary, the one-time notes, and the chat summaries.
- Edit the summary text. Saving re-embeds it.
- Delete the summary or a candidate.
- Clear everything the agent learned (summary and all candidates). The profile and the chats stay.
- Search the list.

The agent cannot silently fill the long-term summary from a single chat. That constraint is the point of the design.

### 9.6 What is put in the prompt on a normal turn

In this order, after the fixed rules:

1. The person’s style instructions, if any, with the line that they never override safety or tool use.
2. Today’s date.
3. The profile as compact lines: name, role, location, land and unit, crops, livestock counts, irrigation, soil, goals, preferred language.
4. The long-term summary, introduced as what has proved lasting, with an instruction not to treat one chat as part of it.
5. Up to three recent other conversations, as “title: summary”.
6. The summary of the current conversation so far.

The embeddings are used for candidate matching, for search over past chats, and for the memory the person edits. The long-term summary itself is injected in full because there is only one of it.

---

## 10. Voice and language

### 10.1 What language an answer uses

The answering model is told:

- Reply in the language and script of the **latest** message. English stays English, Hindi stays Hindi, Hinglish stays Hinglish, and the same for Marathi, Tamil, Punjabi, and the others.
- Use the profile’s preferred language only when the message has no language: a photo alone, or a bare number.
- Be concrete and local: quantities per acre or bigha, timings, doses, step-by-step actions, costs in rupees.
- Prefer a short answer. Do not ask for anything already in the profile or the memory.

Interface language and answer language are different settings. The interface can be Hindi while a question typed in Marathi is answered in Marathi.

### 10.2 Interface languages

The app offers these 11, each with its own script, and the person can switch at any time from the sidebar or from Settings:

| Code | Language | Native name |
|---|---|---|
| `en-IN` | English | English |
| `hi-IN` | Hindi | हिन्दी |
| `mr-IN` | Marathi | मराठी |
| `pa-IN` | Punjabi | ਪੰਜਾਬੀ |
| `gu-IN` | Gujarati | ગુજરાતી |
| `bn-IN` | Bengali | বাংলা |
| `ta-IN` | Tamil | தமிழ் |
| `te-IN` | Telugu | తెలుగు |
| `kn-IN` | Kannada | ಕನ್ನಡ |
| `ml-IN` | Malayalam | മലയാളം |
| `od-IN` | Odia | ଓଡ଼ିଆ |

Labels, buttons, empty states, onboarding, settings, tool names, and the step list are translated. **Anything the person typed is never translated**: their name, a custom crop, a place string, goals they wrote, style instructions, and chat text. Known enumerated choices (farmer, acre, alluvial, wheat, cows) are shown translated and stored in the canonical English value so the profile the model reads stays stable.

### 10.3 Speech to text and text to speech

Sarvam AI. The key stays on the server. The browser posts audio to the API and receives audio back.

- **STT:** Saaras v3. 22 Indian languages plus English, code-mixed speech, automatic language detection. Every text field has a microphone for voice typing. The recognised text is inserted as the person said it. It is user content.
- **TTS:** Bulbul v3. 11 languages, the same set as the interface: Bengali, English, Gujarati, Hindi, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu.
- Language for speech is detected from script. Devanagari is Hindi unless the person’s preferred language is Marathi, in which case it stays Marathi. If no Indian script is present, speech uses English.
- Before speech, markdown is stripped: fences, images, link URLs (the link text is kept), tables, emphasis marks. A long answer is split on sentence boundaries (including danda `।` and double danda `॥`) into chunks of at most about 450 characters and synthesised in parallel.
- Hands-free **voice mode** is a loop: listen, let the agent run, start speaking at the first finished sentence rather than waiting for the whole answer. In voice mode the system prompt changes: 2–4 short spoken sentences, no tables, no markdown, no URLs, numbers written as words. The visual UI blocks are not used in that mode.
- Speaker names include Shubh (default), Aditya, Rahul, Rohan, Amit, Dev, Ratan, Kabir, Aayan, Ashutosh, Advait, Anand, Tarun, Sunny, Mani, Gokul, Vijay, Mohit, Rehan, Soham, Manan, Sumit, Varun, and the women’s voices Ishita, Priya, Ritu, Neha, Pooja, Simran, Kavya, Shreya, Roopa, Tanya, Shruti, Suhani, Kavitha, Rupali, and the rest of the Bulbul v3 set exposed in the picker. Unknown speaker names are dropped and the model default is used.

### 10.4 Two answer styles

**Simple (default).** Do not announce the plan, do not name tools, do not mention memory or reasoning. Call the tools, then answer. Short sentences, everyday words, a technical word explained when it cannot be avoided. Order: what to do today, then why, then the dose, timing, or cost.

**Detailed.** Before tools, one short sentence on what is about to be checked. The stream includes the reasoning trace and the tool arguments. The timeline shows those.

Both styles still use tools and still obey safety. The choice is a display and phrasing preference, stored on the device.

---

## 11. What a chat turn looks like

### 11.1 The stream

`POST /api/chat` returns server-sent events. The body is the thread id, the message text, uploaded file ids, up to 3 context references (a saved tool run or an earlier message), whether this turn is voice, and whether detailed steps are on.

Event order:

| Event | Meaning |
|---|---|
| `status` | “Looking at your farm” while context loads |
| `memory_recalled` | How many long-term summaries were loaded (0 or 1) and how many recent chats |
| `thinking` | Reasoning text, detailed mode only |
| `tool_start` | A tool call began. Detailed mode also sends the arguments. |
| `tool_end` | That tool finished, with its output, even if a parallel tool is still running |
| `token` | Streamed answer text |
| `message_ids` | Ids of the user bubble and the answer bubble, so the person can reply to either |
| `answer_done` | Timings: context, first token, total |
| `memory_saved` | A candidate was promoted. Optional. |
| `title` | The new 3–6 word title |
| `suggestions` | Three follow-up questions |
| `done` | Stream closed |
| `error` | Shown in the thread. A missing LLM key, more than 3 attachments of context, or a failed run. |

The client can cancel the in-flight run for that thread (the Stop button). Closing the laptop does not cancel the server task.

### 11.2 The timeline the person sees

While the agent works, a vertical timeline replaces a blank wait.

- A context step for reading the farm.
- One row per tool. The row **keeps that tool’s own icon** when it finishes, with a small check or a small cross. It does not turn into a generic spinner afterwards.
- The tool’s name on the first line, a short detail on the second (the crop, “your photo”, “N P K pH”, the animal and its temperature, the place, the search query).
- A live timer in tenths of a second.
- A failed step is visually quieter than a successful one: danger tint, not a second copy of the error in the answer.
- Thought steps, when detailed mode is on, use a different icon from tools.
- When a visual block is being streamed and is not yet valid, the timeline shows that a visual is being prepared rather than flashing broken JSON.
- When the answer is done, the timeline collapses to one line: “Worked for 6.2s · 2 tools · 1 memory”, and can be expanded again.

Simple-mode labels are everyday phrases (“Checking your grass…”, “Looking at the leaf…”, “Checking mandi prices…”) rather than function names.

Tool result cards render inside the timeline when the result has a known shape:

- biomass: the five gram values;
- crop: horizontal bars of confidence;
- livestock: a risk pill and condition bars;
- leaf: the disease or “looks healthy”, urgency, organic / chemical / prevention / other possibilities;
- mandi: a table of market, modal, min–max, date;
- weather and grazing: the structured numbers.

### 11.3 The answer itself

Markdown, plus optional visual blocks. Each visual is a fenced block whose first line is exactly ` ```ui ` and whose last line is ` ``` `. Inside is one JSON object, or an array of them. The renderer also accepts a block that arrived fenced as JSON when the object’s `type` is one of the known visuals, so a model slip does not show the person raw JSON. The instruction to the model is still to use `ui` only.

Rules given to the model: usually 1 or 2 visuals, never more than 3, each with a sentence of explanation, never the same information twice, labels in the person’s language, and only numbers that came from a tool, the profile, or standard agronomy. Greetings and one-line replies get no visual.

The blocks:

| Type | Use |
|---|---|
| `chart` | bar, line, area, pie, or donut. A 7-day rain chart is the typical case. |
| `stats` | 2–4 key numbers, optional tone and up/down trend. Modal price, rain this week. |
| `steps` | Ordered actions with a detail and an optional “when”. |
| `schedule` | Dated tasks, ISO dates, a tag such as Water or Spray. |
| `checklist` | The person can tick items. Ticks stay in the browser. |
| `compare` | 2–4 options. One may be marked best. Cost, pros, cons, metrics. |
| `callout` | One warning, danger, info, success, or tip. “Do not spray today.” |
| `tips` | Short tips with an emoji. |
| `calculator` | Sliders. Outputs are formulas over the input keys (`+ − * / ^`, round, ceil, floor, min, max). Defaults come from the profile, for example urea bags for a 2 acre field. The person can move the slider and the dose updates without another model call. |
| `gauge` | One reading against ranges. Soil pH is the example: acidic, ideal, alkaline. |
| `choices` | One clarifying question with tappable answers, placed last. Tapping sends that answer as the next message. |
| `links` | Sources with a human title and a URL. |

A single link inside a sentence can be ordinary markdown with a short title. A URL that has no title is shown as a source card, not as a wrapped raw address.

### 11.4 Photos and files

Uploads are stored per user (max 15 MB). Images are resized before they are sent to the LLM. In the user message the model sees a note `[Attached image '...', file_id=...]` and the image itself. Other documents have their text extracted and placed in a `<document>` block.

The bubble the person sees shows their text and their own attachments. Photos added only so the model can see a past tool run are **not** added as extra bubbles.

### 11.5 Replying, and pointing at an old result

Any bubble can be replied to. The reply is a reference plus an excerpt, not a copy of the whole message. The composer shows a small chip. Clicking a chip scrolls to that message, or opens the other chat, or opens the tool history row, and flashes the target.

“Ask what this means” on a tool run builds:

- a display chip: title, one-line preview, thumbnail;
- a short brief for the model: which check, the one-line result, when, the inputs, the numbers;
- the original photo, attached for the model only.

At most 3 such references per message. The brief is wrapped in `<attached_context>` and the model is told that block is not words the person typed. It must answer the short question, not paste the brief back.

### 11.6 Rewind, restore, branch, edit, regenerate

A **turn** is one user message plus everything the agent did to answer it.

- **Rewind** keeps the first N turns and drops the rest. The checkpoint id is returned so the rewind can be undone. The chat summary is cleared because it described turns that no longer exist; the next answer’s reflection writes a new one. The vector copy of that chat summary is deleted.
- **Restore** puts the conversation back exactly as it was at that checkpoint, including the previous summary if the client still has it.
- **Branch** starts a new chat containing the first N turns of this one. The new title is the parent title prefixed with a branch mark. The new thread records its parent id and the turn it branched at. The parent is unchanged.
- **Edit and resend** changes a user message and re-runs from there.
- **Regenerate** asks for a new answer to the same message.

The sidebar lists every chat the person owns, with search. They can rename and delete. Deleting a chat removes its summary from the vector store. It does not remove the long-term summary or the profile.

---

## 12. Data the product stores

### 12.1 `profiles` (one row per person)

`user_id`, `name`, `language` (default `en-IN`), `role`, `location_name`, `lat`, `lon`, `land_area`, `land_unit` (default acre), `crops` (text array), `livestock` (JSON object of animal → count), `irrigation`, `soil`, `goals`, `custom_instructions` (max 1500 characters), `voice_settings` (JSON), `onboarded_at`, `updated_at`.

Cached in process for 10 minutes, dropped on write. `describe(profile)` is the text form in the prompt. An empty profile is the sentence “No farm profile yet.”

### 12.2 `threads`

`id`, `user_id`, `title` (default “New chat”), `summary`, `parent_id`, `branched_at_turn`, `created_at`, `updated_at`. A new thread is titled from the first 60 characters of the first message until reflection replaces the title.

### 12.3 `files`

`id`, `user_id`, `name`, `content_type`, `kind`, `size`, `path`, `created_at`. Photos for biomass, leaf diagnosis, and chat live here.

### 12.4 `tool_runs`

`id`, `user_id`, `tool`, `title`, `summary`, `inputs` (JSON), `result` (JSON), `image_id`, `thread_id`, `message_id`, `created_at`.

Written when a biomass, crop, or livestock tool finishes, whether the person ran it on the Tools page or the agent ran it in chat. The three names the agent uses (`predict_pasture_biomass`, `recommend_crop`, `assess_livestock_health`) are stored against the same three tool ids as the page (`biomass`, `crop`, `livestock`), so there is one history per kind of check.

One-line summaries: “48.7 g per quadrat”, “wheat 62%”, “high risk”, “12 grazing days”, “₹3921 modal”, “31°C”.

### 12.5 Checkpointer and store

The checkpointer holds the LangGraph messages. The store holds:

- `("memories", user_id) / "summary"` — the long-term summary, embedded;
- `("candidates", user_id) / <id>` — unproven notes, with the list of thread ids that mentioned them;
- `("threads", user_id) / <thread_id>` — `"title: summary"` for semantic search over past chats.

Postgres needs the pgvector extension. The database is typically Neon. Tables are created on first start if they do not exist.

---

## 13. Safety, honesty, and tone

These rules are fixed. Style instructions cannot remove them.

- Serious animal illness, pesticide handling, or anything that touches human health: give the practical steps **and** tell the person to confirm with a local veterinarian, KVK, or agriculture officer.
- Never recommend a banned pesticide.
- Never invent a price, a scheme, a dose, or a measurement. If the tool failed, say so.
- Chemical suggestions from the leaf tool are generic active ingredients and a typical dose, not brands.
- Do not ask for a fact that is already in the profile, the long-term summary, or this chat.
- Do not store today’s weather, today’s price, a tool result, or the advice just given as a lasting fact.
- Personalise with local units (acre, bigha, quintal) and rupees.
- The product is warm and practical. It is not a general assistant that happens to know the word “farm”.

The composer shows a standing line: AgriAssist can be wrong; check important decisions with the local KVK or a vet.

---

## 14. End-to-end stories

These are the walks through the whole system. A presentation can use any of them as a single slide sequence.

### 14.1 “Is there enough grass?”

1. The herder opens AgriAssist. The profile already says: mixed farm, a location with coordinates, the land area, and the number of animals.
2. They photograph the quadrat. The frame is the wide two-half pasture image.
3. They either drop it on the Pasture biomass tool or send it in chat.
4. Left half and right half each go through the shared ResNet-50. Two 2048-d embeddings.
5. The twelve green statistics are computed on the left half, the right half, and the whole frame.
6. The 4108-d vector is read by five XGBoost models. The chat or the tool page shows clover, dead, green, GDM, and total, in grams per quadrat.
7. The run is saved with the photo.
8. The agent calls `estimate_grazing_days` with `Dry_Total_g`, the paddock area converted from the profile, and the herd size. It returns kg DM/ha, available feed after the 1000 kg/ha residual and 70% utilisation, daily herd demand at 2.5% of live weight, and a number of days.
9. The answer, in the herder’s language, leads with the action: graze for about N days, or rest the paddock. Then the reason. Then the residual that was assumed. A calculator block lets them move the animal count or the area and see the days change.
10. If they tap “ask what this means” later, the new chat receives a chip, the five numbers, and the photo. The bubble stays small.
11. Reflection writes a short-term summary of this conversation (“checked the north paddock, total about X g, about N grazing days”). It does **not** put the gram value into long-term memory. If the herder says “remember that I always leave this paddock to rest in April”, that sentence is eligible for the long-term summary.

### 14.2 “Yellow spots on my wheat”

1. Home, or chat. They type or speak the symptom and attach a leaf photo. The landing demo is this story in Hindi: yellow spots on wheat, memories of wheat and the farm, leaf doctor, weather, then an answer that names the disease, the rain day, and a morning spray window.
2. `diagnose_plant_disease` returns crop, disease, confidence, urgency, organic steps, chemical active ingredient and dose, prevention.
3. In parallel, `get_weather` for the farm. If heavy rain is inside three days, the answer leads with “do not spray today” as a warning callout, and moves the spray to the next dry morning.
4. The timeline shows the leaf step and the weather step with their own icons, then collapses.
5. Three follow-up chips appear: a dose for their exact area, an organic alternative, what to watch next week.
6. The disease and the weather stay in the chat summary. They do not become long-term memory unless the same standing fact shows up in a second conversation or the person asks for it to be remembered.

### 14.3 “Should I sell the onion?”

1. Home already shows the modal price if onion is one of the first three crops. Tapping it opens the question.
2. `get_mandi_prices` for onion, filtered toward their state and district when those are known.
3. The answer cites market, date, min, max, and modal, in rupees per quintal. A chart or a stat block compares markets. A source card carries the Agmarknet or web link.
4. The agent does not say “sell” from the price alone if the profile says the crop is still in the field and the weather tool says heavy rain on the harvest window. It calls weather as well.
5. The price is ephemeral. It is in the chat summary and not in the long-term summary.

### 14.4 A fact that earns its place

1. In chat one, the farmer mentions they never use synthetic pesticide on the vegetable plot. Reflection stores a candidate. The long-term summary does not change. The memory screen shows “noticed once”.
2. In a later chat they say the same thing about the vegetables. The candidate now has two thread ids. Promotion rewrites the single summary so that preference is part of the paragraph, without copying the whole conversation.
3. Next time they ask about a pest, the summary is already in the prompt, the style may also say “organic option first”, and the answer leads with the organic steps.

---

## 15. Stack, in one place

| Layer | Choice |
|---|---|
| Web UI | React 19, Vite, Tailwind, React Router. Landing, auth, onboarding, home, chat, tools, settings. |
| Auth | Clerk. JWT checked on the API. Authorised origins configured for the dev and deployed site. |
| API | FastAPI. Routers for chat (SSE), threads (list, rename, delete, rewind, restore, branch), files, models/tools, profile and memory, voice, dashboard, tool runs. |
| Agent | LangGraph. `load_context → agent ⇄ tools`. Postgres checkpointer. Postgres store. |
| Answering model | Tool-calling LLM with vision. Default family xAI Grok; Gemini, NVIDIA NIM, or Meta Muse can be selected. |
| Fast model | Structured reflection, summary rewrite, leaf-diagnosis card. |
| Biomass | Section 5. Shared ResNet-50, 12-d green features, 4108-d vector, five XGBoost regressors. |
| Embeddings | fastembed, paraphrase-multilingual-MiniLM-L12-v2, 384-d, local. |
| Database | Postgres with pgvector. |
| Voice | Sarvam Saaras v3 (listen), Bulbul v3 (speak). |
| Weather | Open-Meteo forecast and geocoding. |
| Prices | data.gov.in Agmarknet, web search as fallback. |
| Search | Tavily, or DuckDuckGo. |

The interface is built for a phone browser first: the sidebar, the composer, voice mode, and the tool page all work on a narrow screen. No separate mobile app is required.

---

## 16. Figures worth redrawing

1. **`image.jpeg` — the biomass model.** Left half and right half, shared ResNet-50, 2048-d and 2048-d, the 12-d green block, concatenation to 4108-d, five XGBoost boxes. This is the architecture slide. The file on disk is the original.
2. **The score.** One weighted R², weights 0.1 / 0.1 / 0.1 / 0.2 / 0.5, total in the largest slice. Not five averaged scores.
3. **The path.** Experiment A (2052-d, one frame) → experiment B (DINO, target embedding, unstable loss) → experiment C (two streams, three heads, derived sums) → the figure (two streams, ResNet-50, 12-d, five learned targets).
4. **The agent loop.** Person → load farm, summary, recent chats → LLM → tools in parallel → LLM → streamed answer → background reflection that almost never writes long-term memory.
5. **The three memories.** Session transcript, per-chat summary, one long-term paragraph plus the profile. Candidates sitting between chat and long-term, needing a second conversation or an explicit “remember this”.
6. **A turn on screen.** User bubble, timeline with tool icons, collapsed “worked for Ns”, answer with one chart or one calculator, three follow-up chips, optional “remembered” toast.
7. **Grams to days.** Quadrat grams → kg DM/ha → subtract residual → utilisation → divide by herd daily demand.

---

## 17. Names and terms to keep consistent

- **AgriAssist** — the product.
- **CSIRO** — the organisation behind the pasture-biomass problem.
- **Pasture biomass** — grams of dry matter on the photographed quadrat, five named targets.
- **GDM** — green dry matter, green vegetation plus clover. Not “total”.
- **Dry total** — green plus clover plus dead. The target with weight 0.5.
- **Quadrat** — the small sampled area in the photo, taken as 0.21 m² (70 cm × 30 cm) when converting to a paddock.
- **Residual** — dry matter deliberately left ungrazed, default 1000 kg DM/ha.
- **Shared backbone** — one ResNet-50, used for both halves.
- **12-d proposed green features** — the four ExG/GNDVI statistics on the left half, the right half, and the full image.
- **4108-d** — 2048 + 2048 + 12.
- **Long-term memory** — one summary, plus the farm profile. Not a list of facts.
- **Candidate** — a note that has been seen and is not yet long-term.
- **KVK** — Krishi Vigyan Kendra, the local confirmation point for serious crop advice.
- **Mandi** — the wholesale APMC market. Prices in rupees per quintal.
- **Modal price** — the most common traded price, the number the home screen and the agent quote first.
