'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMarketStore, useDrawingStore, useUIStore, SignalLevelDrawing } from '@/stores';

export function useAlertMonitor() {
  const { tickers } = useMarketStore();
  const { drawings, updateDrawing } = useDrawingStore();
  const { addAlert } = useUIStore();
  
  const lastCheckedPrices = useRef<Map<string, number>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Preload alert sound
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
  }, []);

  const playAlertSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const signalLevels = drawings.filter((d): d is SignalLevelDrawing => d.type === 'signal_level' && !d.triggered);
    if (signalLevels.length === 0) return;

    for (const level of signalLevels) {
      const ticker = tickers.get(`${level.exchange}:${level.symbol}`);
      if (!ticker) continue;

      const currentPrice = ticker.lastPrice;
      const lastPrice = lastCheckedPrices.current.get(`${level.exchange}:${level.symbol}`) || currentPrice;
      
      // Check for price crossing
      const crossedUp = lastPrice <= level.price && currentPrice >= level.price;
      const crossedDown = lastPrice >= level.price && currentPrice <= level.price;

      if (crossedUp || crossedDown) {
        // Trigger alert
        updateDrawing(level.id, { triggered: true } as any);
        
        const alertData = {
          id: `alert-${Date.now()}`,
          symbol: level.symbol,
          type: 'PRICE_SIGNAL',
          condition: crossedUp ? 'CROSSED_UP' : 'CROSSED_DOWN',
          value: level.price,
          enabled: true,
          createdAt: Date.now(),
          read: false,
          message: `${level.symbol} reached signal level ${level.price}`,
          title: 'Signal Triggered'
        };

        addAlert(alertData as any);
        playAlertSound();

        // Browser notification if permitted
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`Signal Triggered: ${level.symbol}`, {
            body: `${level.symbol} hit ${level.price} on ${level.exchange}`,
            icon: '/favicon.ico'
          });
        }
      }

      lastCheckedPrices.current.set(`${level.exchange}:${level.symbol}`, currentPrice);
    }
  }, [tickers, drawings, addAlert, updateDrawing, playAlertSound]);

  // Request notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);
}
