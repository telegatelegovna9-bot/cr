'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useDrawingStore, Drawing, DrawingType } from '@/stores';
import { Trash2 } from 'lucide-react';

interface DrawingLayerProps {
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  symbol: string;
  exchange: string;
}

export function DrawingLayer({ chart, series, symbol, exchange }: DrawingLayerProps) {
  const containerRef = useRef<SVGSVGElement>(null);
  const { drawings, selectedTool, addDrawing, removeDrawing, setSelectedTool } = useDrawingStore();
  
  const [activeDrawing, setActiveDrawing] = useState<{
    type: DrawingType | 'ruler';
    p1: { t: number; p: number; x: number; y: number };
    p2?: { t: number; p: number; x: number; y: number };
  } | null>(null);

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredDrawing, setHoveredDrawing] = useState<string | null>(null);

  // Sync with chart's coordinate system
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const handleVisibleRangeChange = () => forceUpdate({});
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
  }, [chart]);

  const getChartCoords = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Use chart internal coordinate system mapping
    const time = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);

    if (time === null || price === null) return null;

    const timestamp = typeof time === 'number' ? time : (new Date(time as string).getTime() / 1000);
    return { x, y, t: timestamp, p: price };
  }, [chart, series]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (selectedTool === 'cursor') return;
    
    const coords = getChartCoords(e);
    if (!coords) return;

    if (selectedTool === 'horizontal_line' || selectedTool === 'signal_level') {
      addDrawing({
        id: crypto.randomUUID(),
        type: selectedTool,
        symbol,
        exchange,
        price: coords.p,
        color: selectedTool === 'signal_level' ? '#f59e0b' : '#6366f1',
        visible: true,
        timestamp: Date.now(),
        ...(selectedTool === 'signal_level' ? { triggered: false } : {})
      } as any);
      setSelectedTool('cursor');
    } else if (selectedTool === 'trendline' || selectedTool === 'ruler') {
      setActiveDrawing({
        type: selectedTool,
        p1: coords
      });
    }
  }, [selectedTool, symbol, exchange, addDrawing, setSelectedTool, getChartCoords]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const coords = getChartCoords(e);
    if (!coords) return;
    setMousePos({ x: coords.x, y: coords.y });

    if (activeDrawing) {
      setActiveDrawing(prev => prev ? {
        ...prev,
        p2: coords
      } : null);
    }
  }, [activeDrawing, getChartCoords]);

  const handleMouseUp = useCallback(() => {
    if (!activeDrawing) return;

    if (activeDrawing.type === 'trendline' && activeDrawing.p2) {
      addDrawing({
        id: crypto.randomUUID(),
        type: 'trendline',
        symbol,
        exchange,
        color: '#8b5cf6',
        visible: true,
        timestamp: Date.now(),
        points: {
          t1: activeDrawing.p1.t,
          p1: activeDrawing.p1.p,
          t2: activeDrawing.p2.t,
          p2: activeDrawing.p2.p
        }
      });
      setSelectedTool('cursor');
    }

    setActiveDrawing(null);
  }, [activeDrawing, symbol, exchange, addDrawing, setSelectedTool]);

  const myDrawings = drawings.filter(d => d.symbol === symbol && d.exchange === exchange);

  const renderDrawings = () => {
    return myDrawings.map(d => {
      if (d.type === 'horizontal_line' || d.type === 'signal_level') {
        const y = series.priceToCoordinate(d.price);
        if (y === null) return null;
        const isHovered = hoveredDrawing === d.id;

        return (
          <g 
            key={d.id} 
            className="group pointer-events-auto cursor-pointer"
            onMouseEnter={() => setHoveredDrawing(d.id)}
            onMouseLeave={() => setHoveredDrawing(null)}
          >
            {/* Wider interaction area */}
            <line
              x1="0" y1={y} x2="100%" y2={y}
              stroke="transparent"
              strokeWidth="12"
            />
            <line
              x1="0" y1={y} x2="100%" y2={y}
              stroke={d.color}
              strokeWidth={isHovered ? 2 : (d.type === 'signal_level' ? 1.5 : 1)}
              strokeDasharray={d.type === 'signal_level' ? "4 2" : "0"}
              className="transition-all duration-200"
            />
            {isHovered && (
              <foreignObject x="10" y={y - 12} width="24" height="24">
                <button 
                  onClick={() => removeDrawing(d.id)}
                  className="w-6 h-6 flex items-center justify-center bg-negative/90 text-white rounded-md shadow-lg hover:bg-negative transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </foreignObject>
            )}
          </g>
        );
      }

      if (d.type === 'trendline') {
        const x1 = chart.timeScale().timeToCoordinate(d.points.t1 as Time);
        const y1 = series.priceToCoordinate(d.points.p1);
        const x2 = chart.timeScale().timeToCoordinate(d.points.t2 as Time);
        const y2 = series.priceToCoordinate(d.points.p2);

        if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
        const isHovered = hoveredDrawing === d.id;

        return (
          <g 
            key={d.id} 
            className="group pointer-events-auto cursor-pointer"
            onMouseEnter={() => setHoveredDrawing(d.id)}
            onMouseLeave={() => setHoveredDrawing(null)}
          >
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="transparent"
              strokeWidth="12"
            />
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={d.color}
              strokeWidth={isHovered ? 3 : 2}
              className="transition-all duration-200"
            />
            {isHovered && (
              <foreignObject x={(x1+x2)/2 - 12} y={(y1+y2)/2 - 12} width="24" height="24">
                <button 
                  onClick={() => removeDrawing(d.id)}
                  className="w-6 h-6 flex items-center justify-center bg-negative/90 text-white rounded-md shadow-lg hover:bg-negative transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </foreignObject>
            )}
          </g>
        );
      }
      return null;
    });
  };

  const renderActivePreview = () => {
    if (!activeDrawing || !activeDrawing.p2) return null;

    if (activeDrawing.type === 'trendline') {
      return (
        <line
          x1={activeDrawing.p1.x}
          y1={activeDrawing.p1.y}
          x2={activeDrawing.p2.x}
          y2={activeDrawing.p2.y}
          stroke="#8b5cf6"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
      );
    }

    if (activeDrawing.type === 'ruler') {
      const p1 = activeDrawing.p1;
      const p2 = activeDrawing.p2;
      const priceDiff = p2.p - p1.p;
      const pricePct = (priceDiff / p1.p) * 100;
      
      return (
        <g>
          <rect
            x={Math.min(p1.x, p2.x)}
            y={Math.min(p1.y, p2.y)}
            width={Math.abs(p2.x - p1.x)}
            height={Math.abs(p2.y - p1.y)}
            fill="rgba(99, 102, 241, 0.1)"
            stroke="rgba(99, 102, 241, 0.5)"
            strokeWidth="1"
          />
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#6366f1" strokeWidth="2" />
          <g transform={`translate(${(p1.x + p2.x) / 2}, ${(p1.y + p2.y) / 2})`}>
            <rect x="-40" y="-15" width="80" height="30" rx="4" fill="rgba(15, 23, 42, 0.9)" />
            <text textAnchor="middle" dy="0" fill="white" fontSize="10" fontWeight="bold">
              {pricePct > 0 ? '+' : ''}{pricePct.toFixed(2)}%
            </text>
            <text textAnchor="middle" dy="12" fill="rgba(255,255,255,0.6)" fontSize="9">
              {priceDiff.toFixed(2)}
            </text>
          </g>
        </g>
      );
    }

    return null;
  };

  return (
    <svg
      ref={containerRef}
      className="absolute inset-0 z-30 pointer-events-none select-none overflow-hidden"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ cursor: selectedTool === 'cursor' ? 'default' : 'crosshair' }}
    >
      <rect 
        width="100%" height="100%" 
        fill="transparent" 
        className={selectedTool !== 'cursor' ? 'pointer-events-auto' : ''} 
      />

      {renderDrawings()}
      {renderActivePreview()}

      {selectedTool !== 'cursor' && mousePos && (
        <g className="pointer-events-none opacity-50">
          <line x1={mousePos.x} y1="0" x2={mousePos.x} y2="100%" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 2" />
          <line x1="0" y1={mousePos.y} x2="100%" y2={mousePos.y} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 2" />
        </g>
      )}
    </svg>
  );
}
