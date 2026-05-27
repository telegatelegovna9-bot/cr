#!/bin/bash

# Crypto Screener Pro - Startup Script

set -e

echo "🚀 Starting Crypto Screener Pro..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ is required. Current version: $(node -v)"
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from env.example..."
    cp env.example .env
    echo "📝 Please edit .env with your configuration"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build packages
echo "🔨 Building packages..."
npm run build

# Run database migrations
echo "🗄️  Running database migrations..."
npm run db:migrate 2>/dev/null || echo "⚠️  Migrations skipped (database may not be ready)"

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start development:"
echo "  npm run dev"
echo ""
echo "To start production:"
echo "  npm run start"
echo ""
echo "📚 API Documentation: http://localhost:3001/docs"
echo "🌐 Web Interface: http://localhost:3000"
