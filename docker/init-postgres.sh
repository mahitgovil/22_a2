#!/bin/sh
# Runs once, the first time the postgres container starts with an empty volume.
set -e
for f in 01_schema_ddl 02_indexes 03_triggers_and_audit 04_stored_procedures 05_materialized_views 07_contract_lifecycle 08_api_analytics; do
  echo "Running sql/$f.sql"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "/sql/$f.sql"
done
