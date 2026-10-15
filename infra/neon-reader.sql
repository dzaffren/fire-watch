-- The API's database login: read-only, the tables the API serves.
-- Run once as the Neon owner, after `migrate up`:
--   psql "$OWNER_DATABASE_URL" -v reader_password="<new password>" -f infra/neon-reader.sql
CREATE ROLE firewatch_reader LOGIN PASSWORD :'reader_password';
GRANT USAGE ON SCHEMA public TO firewatch_reader;
GRANT SELECT ON hotspots, concessions, hotspot_concessions, recorder_runs TO firewatch_reader;
