CREATE TABLE hotspots (
    id bigserial PRIMARY KEY,
    record_id bytea NOT NULL UNIQUE CHECK (octet_length(record_id) = 32),
    source text NOT NULL,
    lat_e5 integer NOT NULL,
    lon_e5 integer NOT NULL,
    acquired_at timestamptz NOT NULL,
    frp_e2 integer NOT NULL,
    confidence text NOT NULL CHECK (confidence IN ('n', 'l', 'h')),
    tx_hash bytea,
    sealed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source, lat_e5, lon_e5, acquired_at)
);
