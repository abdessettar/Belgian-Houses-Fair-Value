"""Fetch the latest Immoweb snapshot from S3 to data/active_snapshot.parquet."""

from __future__ import annotations

import json
import os
import re
import unicodedata
from pathlib import Path
from typing import Any

import boto3
import pandas as pd


def _required_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f"{name} is required (see .env.example)")
    return v


BUCKET = _required_env("IMMOWEB_S3_BUCKET")
PREFIX = _required_env("IMMOWEB_S3_PREFIX")
OUT = Path(__file__).resolve().parents[1] / "data" / "active_snapshot.parquet"


def latest_snapshot_key(s3) -> str:
    paginator = s3.get_paginator("list_objects_v2")
    latest = None
    for page in paginator.paginate(Bucket=BUCKET, Prefix=PREFIX):
        for obj in page.get("Contents", []):
            if not obj["Key"].endswith(".json"):
                continue
            if latest is None or obj["LastModified"] > latest["LastModified"]:
                latest = obj
    if latest is None:
        raise RuntimeError(f"No snapshots found under s3://{BUCKET}/{PREFIX}")
    return latest["Key"]


def slugify_locality(name: str | None) -> str:
    # Match Immoweb URL slugs: lowercase, accent-stripped, non-alnum -> hyphen.
    if not name:
        return ""
    folded = "".join(
        c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c)
    )
    s = re.sub(r"[^a-zA-Z0-9]+", "-", folded).strip("-").lower()
    return s


def build_url(listing_id: int, subtype: str | None, locality: str | None, postal: str | None) -> str:
    loc = slugify_locality(locality) or "unknown"
    pc = postal or ""
    sub = (subtype or "HOUSE").upper()
    return f"https://www.immoweb.be/en/classified/{sub}/for-sale/{loc}/{pc}/{listing_id}"


def extract(value: dict[str, Any]) -> dict[str, Any]:
    prop = value.get("property", {}) or {}
    loc = prop.get("location", {}) or {}
    pub = value.get("publication", {}) or {}
    sale = ((value.get("transaction") or {}).get("sale") or {})
    price_wrap = value.get("price") or {}
    lid = int(value.get("id"))
    subtype = prop.get("subtype") or prop.get("type")
    postal = str(loc.get("postalCode") or "") or None

    # HOUSE_GROUP listings expose a price range; use the min so the dot is sortable.
    price = sale.get("price") or price_wrap.get("mainValue") or price_wrap.get("minRangeValue")

    return {
        "id": lid,
        "latitude": loc.get("latitude"),
        "longitude": loc.get("longitude"),
        "price": price,
        "subType": subtype,
        "bedroomCount": prop.get("bedroomCount"),
        "netHabitableSurface": prop.get("netHabitableSurface"),
        "postalCode": postal,
        "locality": loc.get("locality"),
        "url": build_url(lid, subtype, loc.get("locality"), postal),
        # creationDate is sometimes missing; lastModificationDate is always set.
        "publication_lastModificationDate": pub.get("lastModificationDate"),
    }


def main() -> None:
    s3 = boto3.client("s3")
    key = latest_snapshot_key(s3)
    print(f"Latest snapshot: s3://{BUCKET}/{key}")

    obj = s3.get_object(Bucket=BUCKET, Key=key)
    data = json.loads(obj["Body"].read())
    if not isinstance(data, dict):
        raise RuntimeError(f"Expected a dict of id→summary, got {type(data).__name__}")

    rows = [extract(v) for v in data.values() if isinstance(v, dict) and v.get("id") is not None]
    df = pd.DataFrame(rows)
    df["id"] = pd.to_numeric(df["id"], errors="coerce").astype("Int64")
    for c in ("latitude", "longitude", "price", "bedroomCount", "netHabitableSurface"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["publication_lastModificationDate"] = pd.to_datetime(
        df["publication_lastModificationDate"], errors="coerce", utc=True
    ).dt.tz_convert(None)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT, index=False, compression="zstd")
    print(f"Wrote {len(df):,} active listings to {OUT} ({OUT.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
