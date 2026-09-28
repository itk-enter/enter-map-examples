#!/usr/bin/env python3
"""Writes each feature's nearest neighbour of the same type into a snapshot.

The distance is between two features, so no widget template or computed
property can express it: both only ever see one feature. The demo therefore
carries it as three properties on the feature itself.

In production this belongs where the data comes from — Enter, or the
application reading it — not in a snapshot script.

    bin/nearest.py public/data/handicapparkering.geojson
"""

import json
import math
import sys

EARTH_RADIUS_M = 6371000


def centroid(geometry):
    """Point for a point, average of the ring coordinates for an area."""
    if geometry["type"] == "Point":
        return geometry["coordinates"][1], geometry["coordinates"][0]

    rings = geometry["coordinates"]
    if geometry["type"] == "MultiPolygon":
        rings = [ring for polygon in rings for ring in polygon]

    points = [point for ring in rings for point in ring]

    return (
        sum(point[1] for point in points) / len(points),
        sum(point[0] for point in points) / len(points),
    )


def distance_m(a, b):
    lat1, lon1 = a
    lat2, lon2 = b
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )

    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def label(properties):
    """What the place is called in the detail view."""
    if properties.get("navn"):
        return str(properties["navn"])

    parts = [properties.get("vejnavn"), properties.get("husnnr")]

    return " ".join(str(part) for part in parts if part) or "et sted uden adresse"


def enrich(path):
    with open(path, encoding="utf-8") as handle:
        collection = json.load(handle)

    features = collection.get("features", [])
    points = [centroid(feature["geometry"]) for feature in features]
    written = 0

    for index, feature in enumerate(features):
        properties = feature["properties"]
        nearest = None

        for other, point in enumerate(points):
            if other == index:
                continue

            metres = distance_m(points[index], point)

            if nearest is None or metres < nearest[0]:
                nearest = (metres, other)

        # A single feature in a snapshot has no neighbour; the template says
        # "ikke registreret" rather than inventing one.
        if nearest is None:
            properties.pop("nabo_afstand_m", None)
            properties.pop("nabo_prinx", None)
            properties.pop("nabo_adresse", None)
            continue

        metres, other = nearest
        neighbour = features[other]["properties"]

        properties["nabo_afstand_m"] = int(round(metres / 10.0) * 10)
        properties["nabo_prinx"] = neighbour.get("mi_prinx")
        properties["nabo_adresse"] = label(neighbour)
        written += 1

    with open(path, "w", encoding="utf-8") as handle:
        json.dump(collection, handle, ensure_ascii=False)
        handle.write("\n")

    print(f"{path}: nearest neighbour on {written} of {len(features)} features")


def main():
    if len(sys.argv) < 2:
        print(__doc__.strip(), file=sys.stderr)
        sys.exit(1)

    for path in sys.argv[1:]:
        enrich(path)


if __name__ == "__main__":
    main()
