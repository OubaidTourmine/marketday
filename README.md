# Marketday

A small classifieds marketplace built with React and plain JavaScript. Browse secondhand items, publish a listing, and talk directly with a seller. Prices are in Moroccan dirhams (MAD).

## Features

- Create an account, sign in, and sign out. Sessions use HttpOnly cookies; passwords are salted and hashed with scrypt.
- Search listings and filter by category or city. Sort by newest or price.
- Create, edit, delete, and mark your own listings as sold.
- Save favorite listings to your account.
- Start a conversation about a listing and exchange messages with its seller. The inbox refreshes automatically while open.
- Responsive interface, keyboard-accessible dialogs, loading/error/empty states, and image fallbacks.

This is a classifieds app: buyers and sellers arrange payment and collection themselves. There is no integrated checkout, delivery, or payment processing. Photos use public HTTPS image URLs, rather than file uploads.

## Run with Docker

Install Docker Desktop (including Compose), then:

```sh
cp .env.example .env
docker compose up --build
```

Open **http://localhost:8080**. Change `FRONTEND_PORT` in `.env` if needed. Only the frontend is published, bound to localhost; APIs and database files stay inside Docker. SQLite data is retained in three Docker volumes across container restarts. `docker compose down` keeps the data; adding `-v` deletes it.

## Run without Docker

Requires Node.js **22.13 or newer** and npm. Only the React frontend needs npm dependencies; the backend uses Node's HTTP, crypto, and SQLite libraries.

```sh
npm --prefix front-end install
npm run dev
```

Open the Vite URL printed in the terminal (normally **http://localhost:5173**). The development launcher starts all four backend processes, proxies API requests through Vite, and stops its children on Ctrl+C. Ports 3001, 3002, 3003, and 8081 must be available. Development database files live in the ignored `data/` directory.

```sh
npm test
npm run build
```

The test suite runs the real gateway and service handlers against temporary SQLite databases, routing internal requests in memory. It checks signup/login/logout, password hashing, permissions, listing validation and CRUD, filters, favorites, message privacy, session revocation, and invalid requests. It does not verify browser rendering or the Docker network.

## Sample content

Local development and the example Docker setup enable `SEED_DEMO=true`. On an empty database this adds eight sample listings and a demo seller:

```text
Email:    demo@marketday.local
Password: MarketdayDemo2026!
```

You can also create your own account and listings. Sample photographs load from Unsplash; Google Fonts provides the optional web fonts. Images fall back to category placeholders if unavailable, and fonts fall back to system sans-serif.

Before exposing this app publicly, use fresh database volumes with `SEED_DEMO=false`, terminate HTTPS at a reverse proxy, and set `COOKIE_SECURE=true`. Changing the seed flag does not delete an already seeded demo account. Add email verification, password recovery, abuse reporting/moderation, and operational monitoring before a public launch. The current service-local rate limit is intended for a small instance.

## Structure

```text
front-end/          React interface, Vite build, nginx proxy
api-gateway/        Same-origin API routing and request size/origin checks
user-service/       Accounts, password hashes, expiring/revocable sessions
listing-service/    Listings, search, saved items, optional sample data
messaging-service/  Buyer/seller conversations and messages
shared/            HTTP, validation, authentication and SQLite helpers
scripts/           Local development launcher
tests/             Marketplace journey and permission tests
```

The original repository contained Docker scaffolding but no application sources. The implementation keeps its service boundaries and replaces the unused PostgreSQL/MongoDB scaffolding with one persistent SQLite database per data service, reducing local setup requirements. Internal services are intended to remain private behind the gateway.

## API

All responses are JSON. Mutating bodies use `Content-Type: application/json`. Authentication uses the `marketday_session` cookie.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Register with `name`, `email`, `password` |
| POST | `/api/auth/login` | Sign in with `email`, `password` |
| POST | `/api/auth/logout` | Revoke the current session |
| GET | `/api/auth/me` | Current account |
| GET | `/api/listings` | List/search (`q`, `category`, `city`, `sort`, `status`, `mine`, `saved`) |
| POST | `/api/listings` | Create a listing |
| GET / PATCH / DELETE | `/api/listings/:id` | Read, update, or delete a listing |
| GET | `/api/favorites` | Saved listing IDs |
| PUT / DELETE | `/api/listings/:id/favorite` | Save or unsave |
| GET / POST | `/api/conversations` | List conversations or start one with `listing_id` |
| GET / POST | `/api/conversations/:id/messages` | Read or send a message with `content` |

Listing writes accept `title`, `description`, `price` (MAD), `category`, `condition`, `city`, and optional `image`. Prices are stored and returned as integer centimes. Updates may include `status` (`available` or `sold`). Messages and conversation titles are preserved when a listing is deleted.
