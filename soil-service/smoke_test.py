"""Check that each published group median is assigned to its own cluster."""
from app.engine import SoilEngine


def main() -> None:
    engine = SoilEngine()
    engine.load()
    for cluster, profile in engine.profiles.items():
        result = engine.predict(profile)
        print(
            f"cluster {cluster}: predicted {result['cluster']}, "
            f"distance {result['distance']}, unusual {result['unusual']}"
        )
        assert result["cluster"] == cluster
        assert result["distance"] < result["distance_threshold"]
    far = engine.predict({"pH": 4.0, "EC": 2.5, "OC": 1.5, "N": 400, "P": 80, "K": 500})
    print("far sample", far["cluster"], far["distance"], far["unusual"])
    print("soil engine ok")


if __name__ == "__main__":
    main()
