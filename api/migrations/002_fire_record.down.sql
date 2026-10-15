DROP TABLE recorder_runs;
DROP TABLE hotspot_concessions;
DROP TABLE concessions;
DROP INDEX hotspots_acquired_at;
ALTER TABLE hotspots DROP COLUMN map_version, DROP COLUMN fingerprint_version;
DROP EXTENSION postgis;
