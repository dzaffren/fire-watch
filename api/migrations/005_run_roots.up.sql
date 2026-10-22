-- One Merkle root per recorder run, sealed on FireRuns (D103). A root is stored with its
-- records' proofs before it is sent, and gets its run once sealed (D110).
CREATE TABLE roots (
    id bigserial PRIMARY KEY,
    root bytea NOT NULL UNIQUE CHECK (octet_length(root) = 32),
    -- FireRuns' number for it; null until sealed.
    run bigint UNIQUE,
    tx_hash bytea,
    sealed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Null for a record sealed on its own on FireRecords. A record in a root takes the root's
-- tx_hash and sealed_at once the root is sealed.
ALTER TABLE hotspots
    ADD COLUMN root_id bigint REFERENCES roots (id),
    ADD COLUMN proof bytea[],
    ADD CHECK ((root_id IS NULL) = (proof IS NULL));
ALTER TABLE forecasts
    ADD COLUMN root_id bigint REFERENCES roots (id),
    ADD COLUMN proof bytea[],
    ADD CHECK ((root_id IS NULL) = (proof IS NULL));

-- The API's read-only login (infra/neon-reader.sql), when this database has one.
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'firewatch_reader') THEN
        GRANT SELECT ON roots TO firewatch_reader;
    END IF;
END
$$;
