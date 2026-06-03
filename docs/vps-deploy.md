# VPS Deploy

This project can run on a single VPS with three containers:

- `app`: combined Next.js + NestJS + internal nginx reverse proxy
- `postgres`
- `redis`

## First-time setup

1. Copy `.env.production.example` to `.env.production`
2. Set a strong `POSTGRES_PASSWORD`
3. Update `CORS_ORIGINS` to your server IP or domain
4. Start the stack:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## Access

- App: `http://<server-ip>/`
- API health: `http://<server-ip>/health`

## Notes

- Persistent data lives in Docker volumes `postgres_data` and `redis_data`
- Database reset on boot is disabled in production via `DB_RESET_ON_BOOT=false`
