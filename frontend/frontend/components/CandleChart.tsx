"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  UTCTimestamp,
  createSeriesMarkers,
  CrosshairMode,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { API_BASE_URL } from "@/lib/api";

export type Pattern = {
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  time: number;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ConfidenceV2Snapshot = {
  version?: string;
  score: number;
  grade: "A+" | "A" | "B" | "C" | "D";
  label?: string;
  positives?: string[];
  warnings?: string[];
};

export type ShadowDecisionSnapshot = {
  eligible?: boolean;
  status: "accept" | "watch" | "reject" | "none";
  label?: string;
  reason?: string;
  score?: number;
  grade?: "A+" | "A" | "B" | "C" | "D";
};

export type SignalMetaSnapshot = {
  symbol: string;
  timeframe: string;
  confidenceV2: ConfidenceV2Snapshot | null;
  shadowV22: ShadowDecisionSnapshot | null;
  currentSignalStrength: unknown | null;
};

export type MarketSnapshot = {
  symbol: string;
  timeframe: string;
  lastPrice: number | null;
  lastClosedTime: number | null;
  lastCandleTime: number | null;
  fetchedAt: number | null;
  dataStatus: "fresh" | "stale" | "unavailable";
  source: string;
  currentPatterns: Pattern[];
  candles: Candle[];
};

type DataRange = "1d" | "2w" | "1mo" | "2mo";

type Props = {
  symbol: string;
  timeframe: string;
  dataRange: DataRange;
  onPatternsChange?: (symbol: string, patterns: Pattern[]) => void;
  onBacktestChange?: (symbol: string, backtest: unknown) => void;
  onMarketDataChange?: (snapshot: MarketSnapshot) => void;
  onSignalMetaChange?: (meta: SignalMetaSnapshot) => void;
};

function toIstanbulChartTime(timestamp: number): UTCTimestamp {
  return (timestamp + 3 * 60 * 60) as UTCTimestamp;
}

function fromIstanbulChartTime(timestamp: number): number {
  return timestamp - 3 * 60 * 60;
}

function styleOf(pattern: Pattern) {
  if (pattern.direction === "bullish") {
    return { position: "belowBar" as const, shape: "arrowUp" as const, color: "#22c55e" };
  }
  if (pattern.direction === "bearish") {
    return { position: "aboveBar" as const, shape: "arrowDown" as const, color: "#ef4444" };
  }
  return { position: "aboveBar" as const, shape: "circle" as const, color: "#f59e0b" };
}

function requestLimit(timeframe: string, dataRange: DataRange) {
  const limits: Record<DataRange, Record<string, number>> = {
    "1d": { "10m": 180, "15m": 120, "1h": 60, "4h": 30, "1d": 20 },
    "2w": { "10m": 900, "15m": 600, "1h": 250, "4h": 100, "1d": 40 },
    "1mo": { "10m": 1000, "15m": 1000, "1h": 500, "4h": 180, "1d": 60 },
    "2mo": { "10m": 1000, "15m": 1000, "1h": 900, "4h": 350, "1d": 100 },
  };
  return limits[dataRange]?.[timeframe] ?? 300;
}

function rangeSeconds(dataRange: DataRange) {
  if (dataRange === "2w") return 14 * 24 * 60 * 60;
  if (dataRange === "1mo") return 31 * 24 * 60 * 60;
  if (dataRange === "2mo") return 62 * 24 * 60 * 60;
  return null;
}

function istanbulDateKey(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function filterRowsByRange(rows: Candle[], dataRange: DataRange) {
  if (!rows.length) return [];
  const latestTime = rows[rows.length - 1].time;
  if (dataRange === "1d") {
    const latestTradingDay = istanbulDateKey(latestTime);
    return rows.filter((row) => istanbulDateKey(row.time) === latestTradingDay);
  }
  const seconds = rangeSeconds(dataRange);
  if (!seconds) return rows;
  return rows.filter((row) => row.time >= latestTime - seconds);
}

function shortName(name: string) {
  const names: Record<string, string> = {
    Hammer: "ÇEKİÇ",
    "Inverted Hammer": "TERS ÇEKİÇ",
    "Shooting Star": "KAYAN YILDIZ",
    "Hanging Man": "ASILAN ADAM",
    "Bullish Engulfing": "BOĞA YUTAN",
    "Bearish Engulfing": "AYI YUTAN",
    Doji: "DOJI",
    "Dragonfly Doji": "YUSUFÇUK",
    "Gravestone Doji": "MEZAR TAŞI",
    "Long-Legged Doji": "UZUN DOJI",
    "Morning Star": "SABAH YILDIZI",
    "Evening Star": "AKŞAM YILDIZI",
    "Three White Soldiers": "3 BEYAZ ASKER",
    "Three Black Crows": "3 SİYAH KARGA",
  };
  return names[name] ?? name;
}

function timeframeLabel(timeframe: string) {
  return ({ "10m": "10 dk", "15m": "15 dk", "1h": "1 saat", "4h": "4 saat", "1d": "1 gün" } as Record<string, string>)[timeframe] ?? timeframe;
}

function rangeLabel(range: DataRange) {
  return ({ "1d": "1 günlük", "2w": "2 haftalık", "1mo": "1 aylık", "2mo": "2 aylık" } as Record<DataRange, string>)[range];
}

function refreshMs(timeframe: string) {
  // 10/15 dakikalık mumlarda 5 saniyelik tam grafik yenilemesi gereksiz yük oluşturuyordu.
  if (timeframe === "10m" || timeframe === "15m") return 15000;
  if (timeframe === "1h") return 30000;
  return 60000;
}

export default function CandleChart({
  symbol,
  timeframe,
  dataRange,
  onPatternsChange,
  onBacktestChange,
  onMarketDataChange,
  onSignalMetaChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Veri alınıyor...");
  const [hoverCandle, setHoverCandle] = useState<Candle | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const controller = new AbortController();
    const container = containerRef.current;
    onPatternsChange?.(symbol, []);
    onBacktestChange?.(symbol, null);
    setHoverCandle(null);

    const chart = createChart(container, {
      width: container.clientWidth,
      height: window.innerWidth <= 700 ? 410 : window.innerWidth <= 1100 ? 500 : Math.max(580, window.innerHeight - 285),
      layout: {
        background: { type: ColorType.Solid, color: "#071727" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#172033" },
        horzLines: { color: "#172033" },
      },
      rightPriceScale: {
        borderColor: "#1d3955",
        autoScale: true,
        scaleMargins: {
          top: 0.06,
          bottom: 0.24,
        },
      },
      timeScale: {
        borderColor: "#1d3955",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 10,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      borderVisible: false,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.80, bottom: 0 },
      autoScale: true,
    });

    let markerApi: ISeriesMarkersPluginApi<Time> | null = null;
    let latestRows: Candle[] = [];
    let latestRowsByTime = new Map<number, Candle>();
    let hasFittedContent = false;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHoverCandle(null);
        return;
      }
      const unix = fromIstanbulChartTime(Number(param.time));
      setHoverCandle(latestRowsByTime.get(unix) ?? null);
    });

    async function loadMarketData() {
      try {
        setStatus(`${symbol} verisi alınıyor...`);
        const limit = requestLimit(timeframe, dataRange);
        const response = await fetch(
          `${API_BASE_URL}/api/market/candles/${symbol}?timeframe=${timeframe}&limit=${limit}&backtest=false`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (controller.signal.aborted || (data.symbol ?? symbol) !== symbol) return;

        const rows: Candle[] = data.candles ?? [];
        const patterns: Pattern[] = data.patterns ?? [];
        const visibleRows = filterRowsByRange(rows, dataRange);
        const visibleTimes = new Set(visibleRows.map((row) => row.time));
        const visiblePatterns = patterns.filter((pattern) => visibleTimes.has(pattern.time));
        latestRows = visibleRows;
        latestRowsByTime = new Map(visibleRows.map((row) => [row.time, row]));

        candleSeries.setData(visibleRows.map((c) => ({
          time: toIstanbulChartTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close,
        })));
        volumeSeries.setData(visibleRows.map((c) => ({
          time: toIstanbulChartTime(c.time), value: c.volume,
          color: c.close >= c.open ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
        })));

        const lastFive = new Set(visiblePatterns.slice(-5).map((p) => `${p.time}-${p.name}`));
        const markers: SeriesMarker<Time>[] = visiblePatterns.map((pattern) => {
          const style = styleOf(pattern);
          return {
            time: toIstanbulChartTime(pattern.time),
            position: style.position,
            shape: style.shape,
            color: style.color,
            text: lastFive.has(`${pattern.time}-${pattern.name}`) ? shortName(pattern.name) : "",
          };
        });
        if (markerApi) markerApi.setMarkers(markers);
        else markerApi = createSeriesMarkers(candleSeries, markers);

        onPatternsChange?.(symbol, visiblePatterns);
        onMarketDataChange?.({
          symbol,
          timeframe,
          lastPrice: typeof data.last_price === "number" ? data.last_price : null,
          lastClosedTime: typeof data.last_closed_time === "number" ? data.last_closed_time : null,
          lastCandleTime: typeof data.last_candle_time === "number" ? data.last_candle_time : null,
          fetchedAt: typeof data.fetched_at === "number" ? data.fetched_at : null,
          dataStatus: data.data_status === "stale" ? "stale" : "fresh",
          source: data.source ?? "Yahoo Finance",
          currentPatterns: Array.isArray(data.current_patterns) ? data.current_patterns : [],
          candles: rows,
        });

        const staleText = data.data_status === "stale" ? " • son başarılı veri" : "";
        setStatus(`${rangeLabel(dataRange)} veri • ${visibleRows.length} mum • ${visiblePatterns.length} formasyon${staleText}`);
        // İlk yüklemede görünür aralığı sığdır; her yenilemede tekrar fitContent
        // yapmak kullanıcının zoom/scroll konumunu bozuyor ve gereksiz çizim yaptırıyordu.
        if (!hasFittedContent) {
          chart.timeScale().fitContent();
          hasFittedContent = true;
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("Grafik verisi geçici olarak alınamadı:", error);
        onMarketDataChange?.({
          symbol,
          timeframe,
          lastPrice: latestRows.length ? latestRows[latestRows.length - 1].close : null,
          lastClosedTime: null,
          lastCandleTime: latestRows.length ? latestRows[latestRows.length - 1].time : null,
          fetchedAt: Math.floor(Date.now() / 1000),
          dataStatus: "unavailable",
          source: "Yahoo Finance",
          currentPatterns: [],
          candles: latestRows,
        });
        setStatus("Veri geçici olarak alınamadı • tekrar denenecek");
      }
    }

    async function loadBacktest() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/market/candles/${symbol}?timeframe=${timeframe}&limit=300&backtest=true`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted && (data.symbol ?? symbol) === symbol) {
          onBacktestChange?.(symbol, data.backtest ?? null);
          onSignalMetaChange?.({
            symbol,
            timeframe,
            confidenceV2: data.confidence_v2 ?? null,
            shadowV22: data.shadow_v22 ?? null,
            currentSignalStrength: data.current_signal_strength ?? null,
          });
        }
      } catch {
        // Backtest canlı grafiği bloke etmez.
      }
    }

    // Önce grafiği getir. Ağır backtest isteğini kısa süre erteleyerek
    // ilk görünür grafiğin Yahoo/Render kuyruğunda beklemesini önlüyoruz.
    loadMarketData();
    const initialBacktestTimer = window.setTimeout(loadBacktest, 1200);
    const marketTimer = window.setInterval(loadMarketData, refreshMs(timeframe));
    const backtestTimer = window.setInterval(loadBacktest, 15 * 60 * 1000);

    const resizeObserver = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }));
    resizeObserver.observe(container);

    return () => {
      controller.abort();
      window.clearTimeout(initialBacktestTimer);
      clearInterval(marketTimer);
      clearInterval(backtestTimer);
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [symbol, timeframe, dataRange, onPatternsChange, onBacktestChange, onMarketDataChange, onSignalMetaChange]);

  return (
    <div>
      <div className="chart-inline-head">
        <div className="chart-symbol-line">
          <span>{symbol} · {timeframeLabel(timeframe)} · BIST</span>
          <span className="market-live-dot" />
        </div>
        {hoverCandle && (
          <div className="ohlc-strip">
            <span>Saat <b>{new Date(hoverCandle.time * 1000).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })}</b></span>
            <span>A <b>{hoverCandle.open.toFixed(2)}</b></span>
            <span>Y <b>{hoverCandle.high.toFixed(2)}</b></span>
            <span>D <b>{hoverCandle.low.toFixed(2)}</b></span>
            <span>K <b>{hoverCandle.close.toFixed(2)}</b></span>
            <span>Hacim <b>{hoverCandle.volume.toLocaleString("tr-TR")}</b></span>
          </div>
        )}
      </div>
      <div className="chart-status-line">{status}</div>
      <div ref={containerRef} className="chart-canvas" style={{ width: "100%", minHeight: "max(410px, calc(100vh - 285px))" }} />
    </div>
  );
}
