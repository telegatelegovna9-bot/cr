# Crypto Screener Pro

Production-grade crypto screener platform with real-time market data, liquidity heatmap, pattern detection, and multi-exchange aggregation.

## Features

- 📊 **Real-time Market Data** - Live tickers from 9 exchanges
- 📈 **Chart Terminal** - TradingView-style candlestick charts
- 🔍 **Smart Screener** - Advanced filtering and sorting
- 🔥 **Liquidity Heatmap** - Order flow visualization
- 📐 **Pattern Detection** - Automatic chart pattern recognition
- 🔔 **Alert System** - Real-time notifications
- 📱 **Telegram Mini App** - Mobile-optimized interface
- 🔄 **Multi-Exchange** - Binance, Bybit, OKX, and more

## Tech Stack

### Frontend
- Next.js 15+ with React 19
- TypeScript strict mode
- TailwindCSS + shadcn/ui
- Zustand state management
- TanStack Query
- Lightweight Charts
- Socket.IO client

### Backend
- NestJS modular architecture
- PostgreSQL + Redis
- Socket.IO WebSocket
- BullMQ job queues

### Infrastructure
- Docker + Railway deployment
- GitHub Actions CI/CD
- Health checks + monitoring

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### Development

1. Clone the repository:
```bash
git clone https://github.com/yourusername/crypto-screener.git
cd crypto-screener
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment:
```bash
cp env.example .env
# Edit .env with your database and redis credentials
```

4. Start development servers:
```bash
npm run dev
```

5. Open http://localhost:3000

### Docker Development

```bash
docker-compose -f docker-compose.dev.yml up
```

## Railway Deployment

1. Connect your GitHub repository to Railway

2. Add PostgreSQL and Redis services

3. Set environment variables:
   - `DATABASE_URL` - From Railway PostgreSQL
   - `REDIS_URL` - From Railway Redis
   - `CORS_ORIGINS` - Your Railway domain
   - `NEXT_PUBLIC_API_URL` - Your API domain
   - `NEXT_PUBLIC_WS_URL` - Your API domain

4. Deploy!

## Project Structure

```
crypto-screener/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # NestJS backend
├── packages/
│   ├── shared/       # Shared types and utilities
│   └── exchange-connectors/  # Exchange integrations
├── Dockerfile
├── railway.json
└── docker-compose.dev.yml
```

## API Documentation

When running in development mode, Swagger docs are available at:
```
http://localhost:3001/docs
```

### Main Endpoints

- `GET /api/market/tickers` - Get all tickers
- `GET /api/market/tickers/top-gainers` - Top gaining coins
- `GET /api/market/tickers/top-losers` - Top losing coins
- `GET /api/market/candles/:symbol` - Get candle data
- `GET /api/market/orderbook/:symbol` - Get order book
- `POST /api/screener/scan` - Run screener
- `GET /api/alerts` - Get alerts
- `GET /api/patterns` - Get detected patterns

### WebSocket Events

Connect to `/market` namespace:

```javascript
const socket = io('http://localhost:3001/market');

// Subscribe to ticker updates
socket.emit('subscribe', { channel: 'ticker', symbol: 'BTC/USDT' });

// Listen for updates
socket.on('ticker', (data) => {
  console.log('Ticker update:', data);
});
```

## Supported Exchanges

| Exchange | WebSocket | REST | Status |
|----------|-----------|------|--------|
| Binance | ✅ | ✅ | Active |
| Bybit | ✅ | ✅ | Active |
| OKX | ✅ | ✅ | Active |
| KuCoin | - | ✅ | Active |
| Bitget | - | ✅ | Active |
| Gate.io | - | ✅ | Active |
| MEXC | - | ✅ | Active |
| Hyperliquid | - | ✅ | Active |
| Coinbase | - | ✅ | Active |

## License

MIT License

## Support

For support, email support@cryptoscreener.pro
