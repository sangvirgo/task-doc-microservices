# EC2 image deployment

The EC2 host runs the Compose stack from this directory. Runtime secrets stay in
`/home/ubuntu/c17-deploy/.env` and are never copied to GitHub.

Required one-time host setup:

```bash
mkdir -p ~/c17-deploy/infra/postgres
chmod 700 ~/c17-deploy
```

The deployment workflow copies `docker-compose.yml`, this script, and the
PostgreSQL initialization script into that directory. It logs in to GHCR, pulls
the immutable commit-tagged images, and starts the stack without building on EC2.
