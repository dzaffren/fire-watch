CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE concessions (
    id text PRIMARY KEY,
    province text NOT NULL,
    area_ha integer NOT NULL,
    map_version text NOT NULL,
    boundary geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX concessions_boundary_geography ON concessions USING gist ((boundary::geography));

ALTER TABLE hotspots
    ADD COLUMN fingerprint_version smallint NOT NULL DEFAULT 1,
    ADD COLUMN map_version text;
CREATE INDEX hotspots_acquired_at ON hotspots (acquired_at);

CREATE TABLE hotspot_concessions (
    hotspot_id bigint NOT NULL REFERENCES hotspots (id) ON DELETE CASCADE,
    concession_id text NOT NULL REFERENCES concessions (id),
    inside boolean NOT NULL,
    edge_m integer NOT NULL CHECK (edge_m >= 0),
    PRIMARY KEY (hotspot_id, concession_id)
);
CREATE INDEX hotspot_concessions_concession_id ON hotspot_concessions (concession_id);

CREATE TABLE recorder_runs (
    id bigserial PRIMARY KEY,
    started_at timestamptz NOT NULL,
    finished_at timestamptz NOT NULL,
    kept integer NOT NULL,
    sealed integer NOT NULL,
    unsealed integer NOT NULL,
    error text
);

-- The API's read-only login (infra/neon-reader.sql), when this database has one.
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'firewatch_reader') THEN
        GRANT SELECT ON concessions, hotspot_concessions, recorder_runs TO firewatch_reader;
    END IF;
END
$$;
