# PrepVault

Offline-first emergency preparedness dashboard for property management, inventory tracking, community coordination, and smart home monitoring.

## Live Demo

**[prepvault-xi.vercel.app](https://prepvault-xi.vercel.app)**

## Features

- **Inventory Management** — Track supplies across 6 categories (Water, Food, Medical, Power, Security, Documents) with quantity, location, and expiry tracking
- **Property Dashboard** — Multi-property support with readiness scoring based on climate zone and household size
- **Weather & News** — Live weather alerts and preparedness-related news feed (OpenWeatherMap + GNews APIs)
- **Community** — Real-time chat, GPS location sharing, and supply trading with community members
- **Smart Home** — Integration with Tactacam cameras, EyezOn alarm systems, and Google Nest devices
- **Property Map** — Interactive pin-based map for marking caches, rally points, hazards, and routes
- **Cloud Sync** — Offline-first with automatic cloud synchronization via Supabase
- **Security** — PIN lock, AES-256 encryption references, and privacy-first design

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 |
| Backend | Vercel Serverless Functions |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| APIs | OpenWeatherMap, GNews, Tactacam, EyezOn, Google Nest |
| Hosting | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Local Development

```bash
git clone https://github.com/Templecrash/PrepVault.git
cd PrepVault
npm install
npm run dev
```

The app runs fully offline with sample data by default. No backend configuration required for local development.

### Backend Setup (Optional)

1. Create a [Supabase](https://supabase.com) project
2. Run `supabase-schema.sql` in the Supabase SQL editor
3. Copy `.env.example` to `.env.local` and fill in your keys:

```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENWEATHERMAP_API_KEY=your-key
GNEWS_API_KEY=your-key
```

### Deploy to Vercel

```bash
vercel --prod
```

Set environment variables in the Vercel dashboard under Project Settings > Environment Variables.

## Project Structure

```
src/
  PrepVault.jsx          # Main application (~5000 lines)
  supabase.js            # Supabase client with graceful fallback
  sync-engine.js         # Offline-first sync engine

api/
  _lib/                  # Shared utilities (auth, cache, supabase admin)
  weather/current.js     # OpenWeatherMap proxy
  news/feed.js           # GNews proxy
  smart-home/
    tactacam/            # Camera system integration
    eyezon/              # Alarm system integration
    nest/                # Google Nest OAuth + devices
```

## License

MIT
