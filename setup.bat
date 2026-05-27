@echo off
REM Crypto Screener Pro - Startup Script for Windows

echo 🚀 Starting Crypto Screener Pro...

REM Check if .env exists
if not exist .env (
    echo ⚠️  No .env file found. Creating from env.example...
    copy env.example .env
    echo 📝 Please edit .env with your configuration
)

REM Install dependencies
echo 📦 Installing dependencies...
call npm install

REM Build packages
echo 🔨 Building packages...
call npm run build

echo.
echo ✅ Setup complete!
echo.
echo To start development:
echo   npm run dev
echo.
echo To start production:
echo   npm run start
echo.
echo 📚 API Documentation: http://localhost:3001/docs
echo 🌐 Web Interface: http://localhost:3000
