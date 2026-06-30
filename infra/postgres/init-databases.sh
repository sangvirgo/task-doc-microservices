#!/bin/bash
# Creates one database per owning service (V3 §7). No service may query another's database, so the
# separation starts here rather than being a convention inside a single database.
set -euo pipefail

for db in \
  auth_db \
  user_role_db \
  task_db \
  document_db \
  document_security_db \
  permission_db \
  audit_db \
  notification_db \
  security_monitoring_db
do
  echo "creating database ${db}"
  psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-SQL
    CREATE DATABASE ${db};
SQL
done
