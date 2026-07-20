#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE auth_db;
    CREATE DATABASE user_role_db;
    CREATE DATABASE task_db;
    CREATE DATABASE document_db;
    CREATE DATABASE document_security_db;
    CREATE DATABASE permission_db;
    CREATE DATABASE audit_db;
    CREATE DATABASE notification_db;
    CREATE DATABASE security_monitoring_db;
EOSQL
