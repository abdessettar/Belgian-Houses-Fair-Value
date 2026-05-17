"""Export the BigQuery view to data/listings_raw.parquet."""

import os
from pathlib import Path

from google.cloud import bigquery


def _required_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f"{name} is required (see .env.example)")
    return v


PROJECT = _required_env("IMMOWEB_GCP_PROJECT")
DATASET = _required_env("IMMOWEB_BQ_DATASET")
TABLE_NAME = _required_env("IMMOWEB_BQ_TABLE")
TABLE = f"{PROJECT}.{DATASET}.{TABLE_NAME}"
OUT = Path(__file__).resolve().parents[1] / "data" / "listings_raw.parquet"


def main() -> None:
    client = bigquery.Client(project=PROJECT)
    # use_query_cache=False + REST (not Storage API): both cache stale view
    # schemas and silently drop columns added after the cache was populated.
    job_config = bigquery.QueryJobConfig(use_query_cache=False)
    df = client.query(f"SELECT * FROM `{TABLE}`", job_config=job_config).to_dataframe(
        create_bqstorage_client=False
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT, index=False, compression="zstd")
    print(f"Wrote {len(df):,} rows to {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
