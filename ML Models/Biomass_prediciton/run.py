import os
import torch
import joblib
import xgboost as xgb
import pandas as pd
import numpy as np

from PIL import Image
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms

# ============================================================
# CONFIG
# ============================================================

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

IMG_ROOT = "/kaggle/input/csiro-biomass/"
TRAIN_CSV = "/kaggle/input/csiro-biomass/train.csv"
TEST_CSV  = "/kaggle/input/csiro-biomass/test.csv"

BATCH_SIZE = 32

class ResNetBackbone(nn.Module):
    def __init__(self):
        super().__init__()
        self.model = models.resnet50(pretrained=True)
        self.model.fc = nn.Identity()  # remove classifier

    def forward(self, x):
        return self.model(x)


# ============================================================
# CNN BACKBONE (EMBEDDING MODEL)
# ============================================================

cnn_model = torch.load(
    "/kaggle/input/embedding/pytorch/default/1/backbone_full.pt",
    map_location=DEVICE,
    weights_only=False
)
cnn_model.eval()

# ============================================================
# IMAGE TRANSFORMS
# ============================================================

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

# ============================================================
# DATASET
# ============================================================

class ImgDataset(Dataset):
    def __init__(self, df):
        self.df = df.reset_index(drop=True)

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        img = Image.open(
            os.path.join(IMG_ROOT, self.df.loc[idx, "image_path"])
        ).convert("RGB")
        return transform(img)

# ============================================================
# CNN EMBEDDING EXTRACTION
# ============================================================

def extract_embeddings(df):
    loader = DataLoader(
        ImgDataset(df),
        batch_size=BATCH_SIZE,
        shuffle=False
    )

    feats = []
    with torch.no_grad():
        for x in loader:
            x = x.to(DEVICE)
            feats.append(cnn_model(x).cpu().numpy())

    return np.vstack(feats)   # [N, 2048]

# ============================================================
# GREEN FEATURE EXTRACTION
# ============================================================

def compute_green_features(img_path):
    img = np.array(Image.open(img_path).convert("RGB")).astype(np.float32)

    R = img[..., 0]
    G = img[..., 1]
    B = img[..., 2]

    # ExG
    exg = 2 * G - R - B
    exg_mean = exg.mean()
    exg_std = exg.std()
    exg_top10 = exg[exg >= np.percentile(exg, 90)].mean()

    # GNDVI proxy
    eps = 1e-6
    gndvi = (G - R) / (G + R + eps)
    gndvi_mean = gndvi.mean()

    return np.array(
        [exg_mean, exg_std, exg_top10, gndvi_mean],
        dtype=np.float32
    )

def extract_green_features(df):
    feats = []
    for p in df["image_path"]:
        feats.append(
            compute_green_features(os.path.join(IMG_ROOT, p))
        )
    return np.vstack(feats)   # [N, 4]

# ============================================================
# ===================== TRAINING =============================
# ============================================================

train_df = pd.read_csv(TRAIN_CSV)

print("🔍 Extracting CNN embeddings...")
train_img_emb = extract_embeddings(train_df)

print("🌿 Extracting green features...")
train_green = extract_green_features(train_df)

# Final feature vector
X_full = np.hstack([train_img_emb, train_green])  # [N, 2052]

# Train separate model per target_name
target_groups = train_df["target_name"].unique()
joblib.dump(target_groups.tolist(), "target_groups2.pkl")

for g in target_groups:
    idx = train_df["target_name"] == g

    X = X_full[idx]
    y = train_df.loc[idx, "target"].values

    model = xgb.XGBRegressor(
        n_estimators=600,
        max_depth=8,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        objective="reg:squarederror",
        n_jobs=-1
    )

    model.fit(X, y)
    model.save_model(f"xgb_{g}.json")

print("✅ XGBoost training completed")

# ============================================================
# ===================== INFERENCE =============================
# ============================================================

# Load trained models
target_groups = joblib.load("target_groups2.pkl")

xgb_models = {}
for g in target_groups:
    base_g = g[::-1].replace("_", "", 1)[::-1]
    m = xgb.XGBRegressor()
    m.load_model(f"/kaggle/input/xgboost-with-color/scikitlearn/default/1/xgb_{base_g}.json")
    xgb_models[g] = m

def extract_features_single(img_path):
    img = Image.open(img_path).convert("RGB")
    x = transform(img).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        cnn_emb = cnn_model(x).cpu().numpy()

    green_feat = compute_green_features(img_path).reshape(1, -1)

    return np.hstack([cnn_emb, green_feat])

test_df = pd.read_csv(TEST_CSV)
preds = []

for _, row in test_df.iterrows():
    feat = extract_features_single(
        os.path.join(IMG_ROOT, row["image_path"])
    )

    model = xgb_models[row["target_name"]]
    preds.append(model.predict(feat)[0])

submission = pd.DataFrame({
    "sample_id": test_df["sample_id"],
    "target": preds
})

submission.to_csv("submission.csv", index=False)
print("📤 submission.csv generated successfully")
