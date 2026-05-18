# Building Management App

A residential building management platform (MERN + TypeScript). See `ARCHITECTURE.md` for the full spec.

## Quickstart

```bash
# 1. Install
npm install

# 2. Start Mongo + Mailhog
docker compose up -d

# 3. Configure env
cp .env.example server/.env

# 4. Seed first admin + building
npm --workspace server run seed

# 5. Run dev
npm run dev
```

- API:    http://localhost:4000
- Client: http://localhost:5173
- Mailhog UI: http://localhost:8025

## Layout

```
client/    React + Vite + TS
server/    Express + Mongoose + TS
shared/    Types/enums shared across client and server
```

## Scripts

- `npm run dev`        — both server and client in parallel
- `npm run build`      — production build
- `npm run lint`       — lint both workspaces
- `npm test`           — server tests

## Roles

- **admin**     — manages building (expenses, payments, polls, users, docs)
- **owner**     — head-of-unit; can invite renter/dependent into own unit
- **renter**    — tenant; visibility scoped to own unit + building-wide
- **dependent** — read-mostly; family member of owner

See `ARCHITECTURE.md` §2 for the full permission matrix.
