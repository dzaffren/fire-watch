-- WRI's Global Peatlands map, cut to the concessions' reach, in pieces of at most 256 vertices
-- (D62, D69). load-peat fills it.
CREATE TABLE peat (
    id bigserial PRIMARY KEY,
    map_version text NOT NULL,
    geom geometry(Polygon, 4326) NOT NULL
);
CREATE INDEX peat_geom ON peat USING gist (geom);

-- The API's read-only login (infra/neon-reader.sql), when this database has one.
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'firewatch_reader') THEN
        GRANT SELECT ON peat TO firewatch_reader;
    END IF;
END
$$;
