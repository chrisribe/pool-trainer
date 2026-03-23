# Pool Trainer — Admin & Operations

> For server/SSH/NPM setup see the central deploy guide: [pixagreat-web/docs/DEPLOY.md](https://github.com/chrisribe/pixagreat-web/blob/master/docs/DEPLOY.md)

## Environment Variables

| Variable | Description |
|---|---|
| `PIN` | Access PIN — empty string disables auth |
| `COOKIE_SECRET` | HMAC secret for signed auth cookie |
| `PUBLIC_URL` | Full public URL for QR codes (e.g. `https://pool-trainer.pixagreat.com`) |
| `NODE_ENV` | `production` on server |
| `PORT` | Default `3001` |

## First Deploy (server)

```bash
# STEP 1: SSH into server
ssh-agent bash
ssh-add ~/.ssh/id_hetzner
ssh -A root@5.78.154.18

# STEP 2: Clone repo
cd /opt/stacks
git clone git@github.com:chrisribe/pool-trainer.git
cd pool-trainer

# STEP 3: Set up environment
cp .env.example .env
nano .env
# Set PIN and COOKIE_SECRET

# STEP 4: Start containers
docker compose up -d
```

## Redeploy

> **Dockge note:** Stop/restart in Dockge does NOT rebuild images. You must SSH in and run `--build` to pick up code changes.

```bash
ssh -A root@5.78.154.18
cd /opt/stacks/pool-trainer
git pull
docker compose up -d --build
docker logs -f pool-trainer-server-1
```

Data is safe — drill JSON files are mounted as a volume, not baked into the image.
The only command that wipes data is `docker compose down -v` (`-v` deletes volumes).

## NPM Proxy Host

- **Domain:** `pool-trainer.pixagreat.com`
- **Forward Hostname:** `pool-trainer-server-1`
- **Forward Port:** `3001`
- **Websockets Support:** ON (required for Socket.IO)
- **SSL:** Let's Encrypt, force HTTPS

## Common Tasks

```bash
# View logs
docker logs pool-trainer-server-1 --tail 100 -f

# Open app shell
docker exec -it pool-trainer-server-1 sh

# Restart without rebuild
docker compose restart

# Full rebuild (after code changes)
docker compose up -d --build

# Local dev start
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Architecture

- **No database** — drills stored as JSON files in `drills/` (mounted volume)
- **Socket.IO** — relays commands between main app (projector) and remote (phone)
- **PIN auth** — HMAC-signed cookie, 30-day expiry, no sessions or DB needed
- **QR code** — generated server-side, uses `PUBLIC_URL` when set
