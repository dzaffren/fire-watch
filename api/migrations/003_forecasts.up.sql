-- One spread forecast per fire, concession and pass, sealed as fingerprint version 3 (D49).
CREATE TABLE forecasts (
    id bigserial PRIMARY KEY,
    record_id bytea NOT NULL UNIQUE CHECK (octet_length(record_id) = 32),
    concession_id text NOT NULL REFERENCES concessions (id),
    fire_key bytea NOT NULL CHECK (octet_length(fire_key) = 32),
    after_pass_at timestamptz NOT NULL,
    made_at timestamptz NOT NULL,
    until_at timestamptz NOT NULL,
    -- Null: not forecast to be seen inside by until_at, and no points.
    inside_by_at timestamptz,
    from_lat_e5 integer,
    from_lon_e5 integer,
    crossing_lat_e5 integer,
    crossing_lon_e5 integer,
    rule_version smallint NOT NULL,
    tx_hash bytea,
    sealed_at timestamptz,
    outcome text NOT NULL DEFAULT 'waiting'
        CHECK (outcome IN ('waiting', 'seen_inside', 'not_seen_inside', 'joined', 'seen_before_seal')),
    outcome_at timestamptz,
    -- By the database's clock, as hotspots.created_at is: a fire key that moves to a
    -- detection stored after this is the same fire, not a join.
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (concession_id, fire_key, after_pass_at)
);

-- The API's read-only login (infra/neon-reader.sql), when this database has one.
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'firewatch_reader') THEN
        GRANT SELECT ON forecasts TO firewatch_reader;
    END IF;
END
$$;
