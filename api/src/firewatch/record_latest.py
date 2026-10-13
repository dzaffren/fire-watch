"""record-latest: store the latest FIRMS hotspot, then seal its fingerprint on chain.

The row is stored before the chain is touched, so a failed or timed-out seal leaves a row
with no tx_hash that the next run seals.
"""

import os
import secrets
import sys

from firewatch import firms
from firewatch.chain import Chain
from firewatch.db import connect
from firewatch.fingerprint import fingerprint, record_fields

INSERT = """
INSERT INTO hotspots (record_id, source, lat_e5, lon_e5, acquired_at, frp_e2, confidence)
VALUES (%(record_id)s, %(source)s, %(lat_e5)s, %(lon_e5)s, %(acquired_at)s, %(frp_e2)s,
        %(confidence)s)
ON CONFLICT (source, lat_e5, lon_e5, acquired_at) DO NOTHING
"""
SELECT = """
SELECT * FROM hotspots
WHERE source = %(source)s AND lat_e5 = %(lat_e5)s AND lon_e5 = %(lon_e5)s
  AND acquired_at = %(acquired_at)s
"""


def main() -> int:
    hotspot = firms.fetch_latest(
        os.environ.get("FIRMS_BASE_URL", "https://firms.modaps.eosdis.nasa.gov"),
        os.environ["FIRMS_MAP_KEY"],
    )
    if hotspot is None:
        print("No hotspots in the last 5 days")
        return 0

    with connect() as conn:
        values = {**vars(hotspot), "record_id": secrets.token_bytes(32)}
        conn.execute(INSERT, values)
        conn.commit()
        row = conn.execute(SELECT, values).fetchone()
        if row["tx_hash"] is not None:
            print("Already recorded")
            return 0

        record_id = bytes(row["record_id"])
        try:
            chain = Chain(
                os.environ["RPC_URL"],
                os.environ["CONTRACT_ADDRESS"],
                os.environ["RECORDER_PRIVATE_KEY"],
            )
            sealed_at = chain.sealed(record_id)
            if sealed_at is None:
                tx_hash, sealed_at = chain.seal(record_id, fingerprint(**record_fields(row)))
            else:
                tx_hash = chain.seal_tx_hash(record_id)
        except Exception as e:
            print(f"Stored 0x{record_id.hex()} but could not seal it: {e}", file=sys.stderr)
            return 1

        conn.execute(
            "UPDATE hotspots SET tx_hash = %s, sealed_at = %s WHERE id = %s",
            (tx_hash, sealed_at, row["id"]),
        )
    print(f"Sealed 0x{record_id.hex()} in 0x{tx_hash.hex()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
