"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CandleChart, { MarketSnapshot, Pattern } from "@/components/CandleChart";
import { API_BASE_URL } from "@/lib/api";

const KATILIM_50_MAY_SEP_2026 = [
  "ALKLC", "ALTNY", "ASELS", "BERA", "BIMAS", "BINHO", "BMSTL", "BSOKE", "CANTE", "CIMSA",
  "CVKMD", "CWENE", "DAPGM", "DOFRB", "EFOR", "EKGYO", "ENJSA", "EREGL", "EUPWR", "FORMT",
  "GENIL", "GESAN", "GLRMK", "GRSEL", "GRTHO", "GUBRF", "IHLAS", "IZFAS", "KARSN", "KATMR",
  "KCAER", "KRDMD", "KTLEV", "KZBGY", "MAGEN", "MAVI", "MPARK", "NETCD", "OBAMS", "PASEU",
  "PETKM", "QUAGR", "RALYH", "SARKY", "TKFEN", "TUKAS", "TUPRS", "TUREX", "USAK", "YEOTK",
];

const KATILIM_50_OCT_2026_APR_2027 = [
  "AHGAZ", "AKCNS", "AKFYE", "ALBRK", "ALTNY", "ARASE", "ASELS", "ATAKP", "AVPGY", "AYDEM",
  "BASGZ", "BERA", "BETAE", "BIMAS", "BINHO", "BUCIM", "CIMSA", "CVKMD", "CWENE", "EGGUB",
  "EGPRO", "EKGYO", "ENERY", "ENJSA", "EREGL", "GLRMK", "GRSEL", "GUBRF", "ISDMR", "KARSN",
  "KATMR", "KBORU", "KCAER", "KRDMD", "LMKDC", "MAVI", "MOPAS", "MPARK", "NETCD", "NTGAZ",
  "OBAMS", "PARSN", "PETKM", "POLHO", "SNGYO", "TCKRC", "TKFEN", "TUPRS", "TUREX", "VAKKO",
];

function activeKatılım50Universe() {
  const now = new Date();
  const switchDate = new Date(2026, 9, 1); // 1 Ekim 2026
  return now >= switchDate ? KATILIM_50_OCT_2026_APR_2027 : KATILIM_50_MAY_SEP_2026;
}

const STOCKS = activeKatılım50Universe();
const KATILIM_PERIOD = new Date() >= new Date(2026, 9, 1)
  ? "01.10.2026–30.04.2027"
  : "01.05.2026–30.09.2026";

const COMPANY_NAMES: Record<string, string> = {
  AHGAZ: "Ahlatcı Doğalgaz", AKCNS: "Akçansa", AKFYE: "Akfen Yenilenebilir Enerji", ALBRK: "Albaraka Türk",
  ALKLC: "Altınkılıç Gıda ve Süt", ALTNY: "Altınay Savunma", ARASE: "Doğu Aras Enerji", ASELS: "Aselsan",
  ATAKP: "Atakey Patates", AVPGY: "Avrupakent GYO", AYDEM: "Aydem Enerji", BASGZ: "Başkent Doğalgaz GMYO",
  BERA: "Bera Holding", BETAE: "Beta Enerji ve Teknoloji", BIMAS: "BİM Birleşik Mağazalar", BINHO: "1000 Yatırımlar Holding",
  BMSTL: "BMS Birleşik Metal", BSOKE: "Batısöke Çimento", BUCIM: "Bursa Çimento", CANTE: "Çan2 Termik",
  CIMSA: "Çimsa", CVKMD: "CVK Maden", CWENE: "CW Enerji", DAPGM: "DAP Gayrimenkul", DOFRB: "DOF Robotik",
  EFOR: "Efor Yatırım", EGGUB: "Ege Gübre", EGPRO: "Ege Profil", EKGYO: "Emlak Konut GYO", ENERY: "Enerya Enerji",
  ENJSA: "Enerjisa Enerji", EREGL: "Ereğli Demir ve Çelik", EUPWR: "Europower Enerji", FORMT: "Formet Metal",
  GENIL: "Gen İlaç", GESAN: "Girişim Elektrik", GLRMK: "Gülermak Ağır Sanayi", GRSEL: "Gür-Sel Turizm",
  GRTHO: "Grainturk Holding", GUBRF: "Gübre Fabrikaları", IHLAS: "İhlas Holding", ISDMR: "İskenderun Demir Çelik",
  IZFAS: "İzmir Fırça", KARSN: "Karsan Otomotiv", KATMR: "Katmerciler", KBORU: "Kuzey Boru", KCAER: "Kocaer Çelik",
  KRDMD: "Kardemir (D)", KTLEV: "Katılımevim", KZBGY: "Kızılbük GYO", LMKDC: "Limak Doğu Anadolu",
  MAGEN: "Margün Enerji", MAVI: "Mavi Giyim", MOPAS: "Mopaş Marketcilik", MPARK: "MLP Sağlık", NETCD: "Netcad Yazılım",
  NTGAZ: "Naturelgaz", OBAMS: "Oba Makarnacılık", PARSN: "Parsan", PASEU: "Pasifik Eurasia Lojistik", PETKM: "Petkim",
  POLHO: "Polisan Holding", QUAGR: "Qua Granite", RALYH: "Ral Yatırım Holding", SARKY: "Sarkuysan",
  SNGYO: "Sinpaş GYO", TCKRC: "Kıraç Galvaniz", TKFEN: "Tekfen Holding", TUKAS: "Tukaş", TUPRS: "Tüpraş",
  TUREX: "Tureks Turizm", USAK: "Uşak Seramik", VAKKO: "Vakko Tekstil", YEOTK: "YEO Teknoloji",
};

type PriceMap = Record<string, number | null>;
type ChangeMap = Record<string, number | null>;

type BacktestHorizon = {
  samples: number;
  wins: number;
  success_rate: number | null;
  avg_directional_return_pct: number | null;
  median_directional_return_pct?: number | null;
  avg_absolute_move_pct: number | null;
  median_absolute_move_pct?: number | null;
  avg_mfe_pct?: number | null;
  avg_mae_pct?: number | null;
  context_samples?: number;
  context_success_rate?: number | null;
  context_avg_directional_return_pct?: number | null;
};

type BacktestPattern = {
  name: string;
  direction: Pattern["direction"];
  total_samples: number;
  horizons: Record<"1" | "2" | "3", BacktestHorizon>;
};

type BacktestData = {
  minimum_samples?: number;
  candle_count?: number;
  requested_window?: "all" | "3m" | "6m" | "1y";
  requested_days?: number | null;
  available_from_time?: number;
  available_to_time?: number;
  effective_from_time?: number;
  available_days?: number;
  effective_days?: number;
  context?: { enabled?: boolean; lookback?: number; threshold_pct?: number; minimum_direction_steps?: number; description?: string };
  patterns: BacktestPattern[];
};

type PaperTradeStatus = "open" | "target" | "stop" | "timeout" | "ambiguous";

type PaperTrade = {
  id: string;
  symbol: string;
  timeframe: string;
  patternName: string;
  direction: "bullish" | "bearish";
  entryTime: number;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  targetPct: number;
  stopPct: number;
  horizon: number;
  backtestRate: number;
  samples: number;
  status: PaperTradeStatus;
  exitTime?: number;
  exitPrice?: number;
  pnlPct?: number;
  quantity?: number;
  investedAmount?: number;
  pnlAmount?: number;
  riskPct?: number;
  riskAmount?: number;
  signalScore?: number;
  signalGrade?: "A" | "B" | "C" | "D";
};

type NotificationEventType = "strong_signal" | "paper_open" | "paper_target" | "paper_stop" | "paper_close";

type NotificationEvent = {
  id: string;
  type: NotificationEventType;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  symbol?: string;
};

const PAPER_TRADES_KEY = "bist-candle-paper-trades-v1";
const PAPER_ENABLED_KEY = "bist-candle-paper-enabled-v1";
const NOTIFY_ENABLED_KEY = "bist-candle-notify-enabled-v1";
const NOTIFIED_IDS_KEY = "bist-candle-notified-ids-v1";
const FAVORITES_KEY = "bist-candle-favorites-v1";
const PAPER_BALANCE_KEY = "bist-candle-paper-balance-v2";
const PAPER_ALLOCATION_KEY = "bist-candle-paper-allocation-v2";
const PAPER_RISK_KEY = "bist-candle-paper-risk-v3";
const PAPER_MIN_SUCCESS_KEY = "bist-candle-paper-min-success-v3";
const PAPER_MIN_SAMPLES_KEY = "bist-candle-paper-min-samples-v3";
const NOTIFICATION_EVENTS_KEY = "bist-candle-notification-events-v2";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function paperStatusText(status: PaperTradeStatus) {
  if (status === "open") return "Açık";
  if (status === "target") return "Hedef";
  if (status === "stop") return "Stop";
  if (status === "ambiguous") return "Aynı mumda hedef/stop";
  return "Süre doldu";
}

function directionText(direction: Pattern["direction"]) {
  if (direction === "bullish") return "Yükseliş";
  if (direction === "bearish") return "Düşüş";
  return "Nötr";
}

function directionClass(direction: Pattern["direction"]) {
  if (direction === "bullish") return "bullish";
  if (direction === "bearish") return "bearish";
  return "neutral";
}

function strengthText(label?: SignalStrength["label"]) {
  if (label === "strong") return "Güçlü";
  if (label === "medium") return "Orta";
  if (label === "weak") return "Zayıf";
  if (label === "insufficient") return "Örnek Az";
  if (label === "neutral") return "Nötr";
  return "—";
}

function strengthClass(label?: SignalStrength["label"]) {
  return label ?? "none";
}

function patternTurkish(name: string) {
  const names: Record<string, string> = {
    Hammer: "Çekiç",
    "Inverted Hammer": "Ters Çekiç",
    "Shooting Star": "Kayan Yıldız",
    "Hanging Man": "Asılan Adam",
    "Bullish Engulfing": "Boğa Yutan",
    "Bearish Engulfing": "Ayı Yutan",
    Doji: "Doji",
    "Dragonfly Doji": "Yusufçuk Doji",
    "Gravestone Doji": "Mezar Taşı Doji",
    "Long-Legged Doji": "Uzun Bacaklı Doji",
    "Morning Star": "Sabah Yıldızı",
    "Evening Star": "Akşam Yıldızı",
    "Three White Soldiers": "Üç Beyaz Asker",
    "Three Black Crows": "Üç Siyah Karga",
  };
  return names[name] ?? name;
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function directionDescription(pattern: Pattern | null) {
  if (!pattern) return "Henüz formasyon tespit edilmedi.";
  if (pattern.direction === "bullish") return "Yükseliş yönlü bir mum formasyonu tespit edildi.";
  if (pattern.direction === "bearish") return "Düşüş yönlü bir mum formasyonu tespit edildi.";
  return "Kararsızlık / yön belirsizliği gösteren bir mum formasyonu tespit edildi.";
}

function timeframeLabel(timeframe: string) {
  const labels: Record<string, string> = {
    "10m": "10 dk",
    "15m": "15 dk",
    "1h": "1 saat",
    "4h": "4 saat",
    "1d": "1 gün",
  };
  return labels[timeframe] ?? timeframe;
}

type ActiveView = "market" | "scanner" | "watchlist" | "paper" | "notifications" | "stats";

type SignalStrength = {
  label: "strong" | "medium" | "weak" | "insufficient" | "neutral" | "none";
  score: number;
  pattern_name: string | null;
  direction: Pattern["direction"] | null;
  horizon: number | null;
  success_rate: number | null;
  samples: number;
  avg_directional_return_pct: number | null;
  avg_mfe_pct: number | null;
  avg_mae_pct: number | null;
  reliable_horizons?: number;
  positive_horizons?: number;
  validation_reason?: string;
};

type ScanItem = {
  symbol: string;
  status: string;
  last_price: number | null;
  latest_patterns: Pattern[];
  recent_patterns: Pattern[];
  pattern_count?: number;
  last_candle_time?: number | null;
  signal_strength?: SignalStrength;
};

type ScanData = {
  timeframe: string;
  source: string;
  symbols_requested: number;
  symbols_scanned: number;
  symbols_with_signal: number;
  direction_counts: Record<string, number>;
  strength_counts?: Record<string, number>;
  items: ScanItem[];
  fetched_at: number;
};

const ALL_PATTERN_NAMES = [
  "Doji",
  "Long-Legged Doji",
  "Dragonfly Doji",
  "Gravestone Doji",
  "Hammer",
  "Inverted Hammer",
  "Shooting Star",
  "Hanging Man",
  "Bullish Engulfing",
  "Bearish Engulfing",
  "Morning Star",
  "Evening Star",
  "Three White Soldiers",
  "Three Black Crows",
];

const AUTO_SCAN_INTERVAL_MS = 5 * 60 * 1000;


export default function Home() {
  const [selected, setSelected] = useState("EREGL");
  const [timeframe, setTimeframe] = useState("1h");
  const [dataRange, setDataRange] = useState<"1d" | "2w" | "1mo" | "2mo">("2w");
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<ActiveView>("market");
  const [scanTimeframe, setScanTimeframe] = useState("15m");
  const [scanDirectionFilter, setScanDirectionFilter] = useState<"all" | Pattern["direction"]>("all");
  const [scanStrengthFilter, setScanStrengthFilter] = useState<"all" | "strong" | "medium" | "weak" | "insufficient" | "neutral">("all");
  const [scanPatternFilter, setScanPatternFilter] = useState("all");
  const [scanMinSuccess, setScanMinSuccess] = useState(0);
  const [scanMinSamples, setScanMinSamples] = useState(0);
  const [scanSort, setScanSort] = useState<"strength" | "success" | "samples" | "newest" | "symbol">("strength");
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [nextScanAt, setNextScanAt] = useState<number | null>(null);
  const [scanCountdown, setScanCountdown] = useState("—");
  const [backendStatus, setBackendStatus] = useState("Kontrol ediliyor...");
  const [prices, setPrices] = useState<PriceMap>({});
  const [changes, setChanges] = useState<ChangeMap>({});
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [backtest, setBacktest] = useState<BacktestData | null>(null);
  const [statsBacktest, setStatsBacktest] = useState<BacktestData | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsWindow, setStatsWindow] = useState<"all" | "3m" | "6m" | "1y">("all");
  const [statsDirection, setStatsDirection] = useState<"all" | "bullish" | "bearish" | "neutral">("all");
  const [statsMinSamples, setStatsMinSamples] = useState(20);
  const [statsSort, setStatsSort] = useState<"score" | "success" | "samples" | "rr">("score");
  const [marketSnapshot, setMarketSnapshot] = useState<MarketSnapshot | null>(null);
  const [paperEnabled, setPaperEnabled] = useState(false);
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>([]);
  const [paperLoaded, setPaperLoaded] = useState(false);
  const [paperInitialBalance, setPaperInitialBalance] = useState(100000);
  const [paperAllocationPct, setPaperAllocationPct] = useState(10);
  const [paperRiskPct, setPaperRiskPct] = useState(1);
  const [paperMinSuccess, setPaperMinSuccess] = useState(58);
  const [paperMinSamples, setPaperMinSamples] = useState(25);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<"unsupported" | "default" | "granted" | "denied">("default");
  const [notificationEvents, setNotificationEvents] = useState<NotificationEvent[]>([]);
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>([]);
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const backendIssueActiveRef = useRef(false);
  const dataIssueActiveRef = useRef<string | null>(null);
  const scanRunningRef = useRef(false);
  const strongSignalBaselineRef = useRef<Set<string>>(new Set());
  const scanBaselineReadyRef = useRef(false);
  const paperStatusBaselineRef = useRef<Map<string, PaperTradeStatus>>(new Map());
  const paperStatusBaselineReadyRef = useRef(false);


  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NOTIFICATION_EVENTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setNotificationEvents(parsed.filter((item): item is NotificationEvent => !!item && typeof item.id === "string").slice(0, 300));
      }
    } catch {
      setNotificationEvents([]);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(NOTIFICATION_EVENTS_KEY, JSON.stringify(notificationEvents.slice(0, 300)));
    } catch {
      // Bildirim merkezi yazılamasa bile uygulama çalışmaya devam eder.
    }
  }, [notificationEvents]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFavoriteSymbols(parsed.filter((symbol): symbol is string => typeof symbol === "string" && STOCKS.includes(symbol)));
        }
      }
    } catch {
      setFavoriteSymbols([]);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteSymbols));
    } catch {
      // localStorage kapalı olsa bile uygulama çalışmaya devam eder.
    }
  }, [favoriteSymbols]);

  const toggleFavorite = useCallback((symbol: string) => {
    setFavoriteSymbols((current) => current.includes(symbol)
      ? current.filter((item) => item !== symbol)
      : [...current, symbol]);
  }, []);

  useEffect(() => {
    let active = true;

    async function checkBackend() {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!active) return;
        setBackendStatus(response.ok ? "Backend bağlı" : "Backend bağlantısı yok");
      } catch {
        if (active) setBackendStatus("Backend bağlantısı yok");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    checkBackend();
    const timer = window.setInterval(checkBackend, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadPaperTrading() {
      let localTrades: PaperTrade[] = [];

      try {
        const rawTrades = window.localStorage.getItem(PAPER_TRADES_KEY);
        const rawEnabled = window.localStorage.getItem(PAPER_ENABLED_KEY);
        const rawNotify = window.localStorage.getItem(NOTIFY_ENABLED_KEY);
        const rawNotifiedIds = window.localStorage.getItem(NOTIFIED_IDS_KEY);
        const rawBalance = window.localStorage.getItem(PAPER_BALANCE_KEY);
        const rawAllocation = window.localStorage.getItem(PAPER_ALLOCATION_KEY);
        const rawRisk = window.localStorage.getItem(PAPER_RISK_KEY);
        const rawMinSuccess = window.localStorage.getItem(PAPER_MIN_SUCCESS_KEY);
        const rawMinSamples = window.localStorage.getItem(PAPER_MIN_SAMPLES_KEY);

        if (rawTrades) localTrades = JSON.parse(rawTrades);
        if (rawBalance && Number.isFinite(Number(rawBalance))) setPaperInitialBalance(Math.max(1000, Number(rawBalance)));
        if (rawAllocation && Number.isFinite(Number(rawAllocation))) setPaperAllocationPct(clamp(Number(rawAllocation), 1, 100));
        if (rawRisk && Number.isFinite(Number(rawRisk))) setPaperRiskPct(clamp(Number(rawRisk), 0.1, 5));
        if (rawMinSuccess && Number.isFinite(Number(rawMinSuccess))) setPaperMinSuccess(clamp(Number(rawMinSuccess), 50, 90));
        if (rawMinSamples && Number.isFinite(Number(rawMinSamples))) setPaperMinSamples(clamp(Number(rawMinSamples), 10, 200));
        if (rawEnabled != null) setPaperEnabled(rawEnabled === "true");
        if (rawNotify != null) setNotifyEnabled(rawNotify === "true");
        if (rawNotifiedIds) notifiedIdsRef.current = new Set(JSON.parse(rawNotifiedIds));
        if (!("Notification" in window)) setNotificationStatus("unsupported");
        else setNotificationStatus(Notification.permission);
      } catch {
        localTrades = [];
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/paper/trades?limit=200`, {
          cache: "no-store",
        });

        if (response.ok) {
          const data = await response.json();
          const backendTrades: PaperTrade[] = Array.isArray(data.trades) ? data.trades : [];

          if (!active) return;

          if (backendTrades.length > 0) {
            setPaperTrades(backendTrades);
          } else if (localTrades.length > 0) {
            // Eski localStorage kayıtlarını ilk açılışta SQLite'a taşı.
            setPaperTrades(localTrades.slice(0, 200));
          }
        } else if (active) {
          setPaperTrades(localTrades.slice(0, 200));
        }
      } catch {
        if (active) setPaperTrades(localTrades.slice(0, 200));
      } finally {
        if (active) setPaperLoaded(true);
      }
    }

    loadPaperTrading();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!paperLoaded) return;

    const trades = paperTrades.slice(0, 200);

    // Tarayıcıda yedek tut; asıl kalıcı kayıt backend SQLite'tadır.
    try {
      window.localStorage.setItem(PAPER_TRADES_KEY, JSON.stringify(trades));
    } catch {
      // localStorage dolu/kapalı olsa bile SQLite kaydı devam eder.
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    fetch(`${API_BASE_URL}/api/paper/trades/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trades }),
      signal: controller.signal,
    }).catch(() => {
      // Backend geçici kapalıysa localStorage yedeği korunur.
    }).finally(() => {
      window.clearTimeout(timeout);
    });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [paperTrades, paperLoaded]);

  useEffect(() => {
    if (!paperLoaded) return;
    window.localStorage.setItem(PAPER_ENABLED_KEY, String(paperEnabled));
  }, [paperEnabled, paperLoaded]);

  useEffect(() => {
    if (!paperLoaded) return;
    try {
      window.localStorage.setItem(PAPER_BALANCE_KEY, String(paperInitialBalance));
      window.localStorage.setItem(PAPER_ALLOCATION_KEY, String(paperAllocationPct));
      window.localStorage.setItem(PAPER_RISK_KEY, String(paperRiskPct));
      window.localStorage.setItem(PAPER_MIN_SUCCESS_KEY, String(paperMinSuccess));
      window.localStorage.setItem(PAPER_MIN_SAMPLES_KEY, String(paperMinSamples));
    } catch {
      // Ayarlar yazılamazsa uygulama çalışmaya devam eder.
    }
  }, [paperInitialBalance, paperAllocationPct, paperRiskPct, paperMinSuccess, paperMinSamples, paperLoaded]);

  useEffect(() => {
    if (!paperLoaded) return;
    window.localStorage.setItem(NOTIFY_ENABLED_KEY, String(notifyEnabled));
  }, [notifyEnabled, paperLoaded]);

  const rememberNotification = useCallback((id: string) => {
    notifiedIdsRef.current.add(id);
    const ids = Array.from(notifiedIdsRef.current).slice(-300);
    notifiedIdsRef.current = new Set(ids);
    try {
      window.localStorage.setItem(NOTIFIED_IDS_KEY, JSON.stringify(ids));
    } catch {
      // Bildirim geçmişi yazılamazsa uygulama çalışmaya devam eder.
    }
  }, []);

  const sendBrowserNotification = useCallback((
    id: string,
    title: string,
    body: string,
    type: NotificationEventType = "strong_signal",
    symbol?: string,
  ) => {
    if (notifiedIdsRef.current.has(id)) return;

    // Önce uygulama içi geçmişe kaydet. Böylece tarayıcı bildirimi kapalı olsa bile olay kaybolmaz.
    setNotificationEvents((current) => [
      { id, type, title, body, createdAt: Date.now(), read: false, symbol },
      ...current.filter((item) => item.id !== id),
    ].slice(0, 300));
    rememberNotification(id);

    if (!notifyEnabled || notificationStatus !== "granted") return;
    try {
      new Notification(title, { body, tag: id });
    } catch {
      // Tarayıcı bildirim gösteremezse uygulama içi geçmiş korunur.
    }
  }, [notifyEnabled, notificationStatus, rememberNotification]);

  const toggleNotifications = useCallback(async () => {
    if (!("Notification" in window)) {
      setNotificationStatus("unsupported");
      return;
    }

    if (notifyEnabled) {
      setNotifyEnabled(false);
      return;
    }

    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    setNotificationStatus(permission);
    setNotifyEnabled(permission === "granted");
  }, [notifyEnabled]);


  // Backend bağlantısı kesildiğinde bir kez uyar; bağlantı gelince yeni kesinti için sıfırla.
  useEffect(() => {
    if (!notifyEnabled || notificationStatus !== "granted") return;

    if (backendStatus === "Backend bağlantısı yok") {
      if (!backendIssueActiveRef.current) {
        backendIssueActiveRef.current = true;
        try {
          new Notification("BIST Mum Sistemi • Bağlantı sorunu", {
            body: "Backend bağlantısı kesildi. Veriler geçici olarak güncellenemeyebilir.",
            tag: "backend-connection-issue",
          });
        } catch {}
      }
    } else if (backendStatus === "Backend bağlı") {
      backendIssueActiveRef.current = false;
    }
  }, [backendStatus, notifyEnabled, notificationStatus]);

  // Seçili grafikte son başarılı veri kullanılıyorsa kullanıcıyı aynı kesinti boyunca yalnızca bir kez uyar.
  useEffect(() => {
    if (!notifyEnabled || notificationStatus !== "granted" || !marketSnapshot) return;

    const issueKey = `${marketSnapshot.symbol}-${marketSnapshot.timeframe}-${marketSnapshot.dataStatus}`;
    if (marketSnapshot.dataStatus === "stale" || marketSnapshot.dataStatus === "unavailable") {
      if (dataIssueActiveRef.current !== issueKey) {
        dataIssueActiveRef.current = issueKey;
        try {
          new Notification(`${marketSnapshot.symbol} • Veri gecikiyor`, {
            body: marketSnapshot.dataStatus === "stale"
              ? "Canlı veri geçici olarak alınamadı; son başarılı veri gösteriliyor."
              : "Grafik verisi şu anda alınamıyor. Sistem yeniden deneyecek.",
            tag: `market-data-${marketSnapshot.symbol}-${marketSnapshot.timeframe}`,
          });
        } catch {}
      }
    } else {
      dataIssueActiveRef.current = null;
    }
  }, [marketSnapshot, notifyEnabled, notificationStatus]);

  useEffect(() => {
    let active = true;

    async function loadPrices() {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/market/quotes?symbols=${STOCKS.join(",")}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;

        const next: PriceMap = {};
        const nextChanges: ChangeMap = {};
        for (const item of data.items ?? []) {
          if (item?.symbol && typeof item.price === "number") {
            next[item.symbol] = item.price;
            nextChanges[item.symbol] = typeof item.change_pct === "number" ? item.change_pct : null;
          }
        }
        // Eksik/geçici hata alan sembollerde eski fiyatı silme.
        setPrices((current) => ({ ...current, ...next }));
        setChanges((current) => ({ ...current, ...nextChanges }));
      } catch {
        // Son başarılı fiyatları ekranda tut.
      } finally {
        window.clearTimeout(timeout);
      }
    }

    loadPrices();
    // 50 hisselik yan liste seçili grafikten daha yavaş yenilenir.
    const interval = window.setInterval(loadPrices, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setPatterns([]);
    setBacktest(null);
    setMarketSnapshot(null);
  }, [selected, timeframe, dataRange]);

  const handlePatternsChange = useCallback((symbol: string, value: Pattern[]) => {
    setPatterns((current) => symbol === selected ? value : current);
  }, [selected]);
  const handleBacktestChange = useCallback((symbol: string, value: unknown) => {
    if (symbol !== selected) return;
    setBacktest((value as BacktestData | null) ?? null);
  }, [selected]);

  const handleMarketDataChange = useCallback((snapshot: MarketSnapshot) => {
    if (snapshot.symbol !== selected) return;
    setMarketSnapshot(snapshot);
    // Seçili hissenin fiyatını canlı grafik verisinden besle; 50'li toplu listeyi bekleme.
    if (typeof snapshot.lastPrice === "number") {
      setPrices((current) => ({ ...current, [snapshot.symbol]: snapshot.lastPrice }));
    }
  }, [selected]);

  const handleSelectStock = useCallback((symbol: string) => {
    if (symbol === selected) return;
    setPatterns([]);
    setBacktest(null);
    setMarketSnapshot(null);
    setSelected(symbol);
  }, [selected]);

  useEffect(() => {
    if (!paperLoaded || !marketSnapshot || !backtest) return;

    setPaperTrades((currentTrades) => {
      let changed = false;
      const nextTrades = currentTrades.map((trade) => ({ ...trade }));

      // Önce açık sanal işlemleri yalnızca kapanmış mumlarla güncelle.
      for (const trade of nextTrades) {
        if (trade.status !== "open") continue;
        if (trade.symbol !== marketSnapshot.symbol || trade.timeframe !== marketSnapshot.timeframe) continue;

        const futureCandles = marketSnapshot.candles
          .filter((c) => c.time > trade.entryTime && (marketSnapshot.lastClosedTime == null || c.time <= marketSnapshot.lastClosedTime))
          .slice(0, trade.horizon);

        for (const candle of futureCandles) {
          const targetHit = trade.direction === "bullish"
            ? candle.high >= trade.targetPrice
            : candle.low <= trade.targetPrice;
          const stopHit = trade.direction === "bullish"
            ? candle.low <= trade.stopPrice
            : candle.high >= trade.stopPrice;

          if (targetHit && stopHit) {
            trade.status = "ambiguous";
            trade.exitTime = candle.time;
            trade.exitPrice = candle.close;
            trade.pnlPct = trade.direction === "bullish"
              ? ((candle.close - trade.entryPrice) / trade.entryPrice) * 100
              : ((trade.entryPrice - candle.close) / trade.entryPrice) * 100;
            trade.pnlAmount = (trade.investedAmount ?? 0) * (trade.pnlPct / 100);
            changed = true;
            break;
          }

          if (targetHit) {
            trade.status = "target";
            trade.exitTime = candle.time;
            trade.exitPrice = trade.targetPrice;
            trade.pnlPct = trade.targetPct;
            trade.pnlAmount = (trade.investedAmount ?? 0) * (trade.pnlPct / 100);
            changed = true;
            break;
          }

          if (stopHit) {
            trade.status = "stop";
            trade.exitTime = candle.time;
            trade.exitPrice = trade.stopPrice;
            trade.pnlPct = -trade.stopPct;
            trade.pnlAmount = (trade.investedAmount ?? 0) * (trade.pnlPct / 100);
            changed = true;
            break;
          }
        }

        if (trade.status === "open" && futureCandles.length >= trade.horizon) {
          const last = futureCandles[futureCandles.length - 1];
          const pnl = trade.direction === "bullish"
            ? ((last.close - trade.entryPrice) / trade.entryPrice) * 100
            : ((trade.entryPrice - last.close) / trade.entryPrice) * 100;
          trade.status = "timeout";
          trade.exitTime = last.time;
          trade.exitPrice = last.close;
          trade.pnlPct = pnl;
          trade.pnlAmount = (trade.investedAmount ?? 0) * (trade.pnlPct / 100);
          changed = true;
        }
      }

      if (paperEnabled) {
        const alreadyOpen = nextTrades.some(
          (trade) => trade.status === "open" && trade.symbol === marketSnapshot.symbol && trade.timeframe === marketSnapshot.timeframe
        );

        if (!alreadyOpen) {
          const candidates = marketSnapshot.currentPatterns.filter(
            (pattern): pattern is Pattern & { direction: "bullish" | "bearish" } =>
              pattern.direction === "bullish" || pattern.direction === "bearish"
          );

          for (const pattern of candidates) {
            const duplicate = nextTrades.some(
              (trade) => trade.symbol === marketSnapshot.symbol && trade.timeframe === marketSnapshot.timeframe && trade.entryTime === pattern.time && trade.patternName === pattern.name
            );
            if (duplicate) continue;

            const stats = backtest.patterns.find((item) => item.name === pattern.name);
            if (!stats) continue;

            const minimumSamples = Math.max(backtest.minimum_samples ?? 20, paperMinSamples);
            const horizonRows = (["1", "2", "3"] as const)
              .map((key) => ({ horizon: Number(key), metric: stats.horizons[key] }))
              .filter(({ metric }) => metric.samples >= minimumSamples && metric.success_rate != null);

            const positiveHorizons = horizonRows.filter(({ metric }) =>
              (metric.success_rate ?? 0) >= paperMinSuccess &&
              (metric.avg_directional_return_pct ?? 0) > 0
            ).length;

            const best = [...horizonRows]
              .filter(({ metric }) =>
                (metric.success_rate ?? 0) >= paperMinSuccess &&
                (metric.avg_directional_return_pct ?? 0) > 0
              )
              .sort((a, b) => (b.metric.success_rate ?? 0) - (a.metric.success_rate ?? 0))[0];

            if (!best || positiveHorizons < 2) continue;

            const mfe = Math.max(0, best.metric.avg_mfe_pct ?? 0);
            const maeAbs = Math.abs(best.metric.avg_mae_pct ?? 0);
            const rr = maeAbs > 0 ? mfe / maeAbs : 0;
            const sampleQuality = Math.min(1, best.metric.samples / 60);
            const successQuality = (best.metric.success_rate ?? 0) / 100;
            const consistencyQuality = positiveHorizons / 3;
            const rrQuality = Math.min(1, rr / 2);
            const signalScore = Math.round((successQuality * 50 + sampleQuality * 20 + consistencyQuality * 15 + rrQuality * 15) * 10) / 10;
            const signalGrade: "A" | "B" | "C" | "D" =
              signalScore >= 72 ? "A" : signalScore >= 62 ? "B" : signalScore >= 55 ? "C" : "D";
            if (signalScore < 55) continue;

            const targetPct = clamp(best.metric.avg_mfe_pct ?? 1.5, 0.6, 4);
            const stopPct = clamp(Math.abs(best.metric.avg_mae_pct ?? -1), 0.5, 3);
            const entry = pattern.close;
            const bullish = pattern.direction === "bullish";
            const realizedPnl = nextTrades
              .filter((trade) => trade.status !== "open")
              .reduce((sum, trade) => sum + (trade.pnlAmount ?? ((trade.investedAmount ?? 0) * ((trade.pnlPct ?? 0) / 100))), 0);
            const openExposure = nextTrades
              .filter((trade) => trade.status === "open")
              .reduce((sum, trade) => sum + (trade.investedAmount ?? 0), 0);
            const accountBalance = paperInitialBalance + realizedPnl;
            const availableCash = Math.max(0, accountBalance - openExposure);
            const maxPositionValue = Math.min(accountBalance * (paperAllocationPct / 100), availableCash);
            const riskBudget = Math.max(0, accountBalance * (paperRiskPct / 100));
            const riskPerShare = entry * (stopPct / 100);
            const riskBasedQty = riskPerShare > 0 ? Math.floor(riskBudget / riskPerShare) : 0;
            const exposureBasedQty = Math.floor(maxPositionValue / entry);
            const cashBasedQty = Math.floor(availableCash / entry);
            const quantity = Math.min(riskBasedQty, exposureBasedQty, cashBasedQty);
            const investedAmount = quantity * entry;
            const riskAmount = quantity * riskPerShare;
            if (quantity < 1 || investedAmount <= 0 || riskAmount <= 0) continue;

            nextTrades.unshift({
              id: `${marketSnapshot.symbol}-${marketSnapshot.timeframe}-${pattern.name}-${pattern.time}`,
              symbol: marketSnapshot.symbol,
              timeframe: marketSnapshot.timeframe,
              patternName: pattern.name,
              direction: pattern.direction,
              entryTime: pattern.time,
              entryPrice: entry,
              targetPrice: bullish ? entry * (1 + targetPct / 100) : entry * (1 - targetPct / 100),
              stopPrice: bullish ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100),
              targetPct,
              stopPct,
              horizon: best.horizon,
              backtestRate: best.metric.success_rate ?? 0,
              samples: best.metric.samples,
              status: "open",
              quantity,
              investedAmount,
              pnlAmount: 0,
              riskPct: paperRiskPct,
              riskAmount,
              signalScore,
              signalGrade,
            });
            changed = true;
            break;
          }
        }
      }

      return changed ? nextTrades.slice(0, 200) : currentTrades;
    });
  }, [marketSnapshot, backtest, paperEnabled, paperLoaded, paperInitialBalance, paperAllocationPct, paperRiskPct, paperMinSuccess, paperMinSamples]);

  useEffect(() => {
    if (!notifyEnabled || notificationStatus !== "granted" || !marketSnapshot || !backtest) return;

    const minimumSamples = Math.max(backtest.minimum_samples ?? 20, 20);
    for (const pattern of marketSnapshot.currentPatterns) {
      if (pattern.direction === "neutral") continue;
      const stats = backtest.patterns.find((item) => item.name === pattern.name);
      if (!stats) continue;
      const best = (["1", "2", "3"] as const)
        .map((key) => stats.horizons[key])
        .filter((metric) => metric.samples >= minimumSamples && (metric.success_rate ?? 0) >= 55 && (metric.avg_directional_return_pct ?? 0) > 0)
        .sort((a, b) => (b.success_rate ?? 0) - (a.success_rate ?? 0))[0];
      if (!best) continue;

      const id = `signal-${marketSnapshot.symbol}-${marketSnapshot.timeframe}-${pattern.name}-${pattern.time}`;
      sendBrowserNotification(
        id,
        `${marketSnapshot.symbol} • ${patternTurkish(pattern.name)}`,
        `${directionText(pattern.direction)} yönlü formasyon • geçmiş başarı %${(best.success_rate ?? 0).toFixed(1)} • n=${best.samples}`,
        "strong_signal",
        marketSnapshot.symbol,
      );
    }
  }, [marketSnapshot, backtest, notifyEnabled, notificationStatus, sendBrowserNotification]);

  useEffect(() => {
    if (!paperLoaded) return;

    // İlk yüklemede mevcut eski işlemleri bildirim olarak yağdırma; yalnızca durum tabanı oluştur.
    if (!paperStatusBaselineReadyRef.current) {
      paperStatusBaselineRef.current = new Map(paperTrades.map((trade) => [trade.id, trade.status]));
      paperStatusBaselineReadyRef.current = true;
      return;
    }

    const previous = paperStatusBaselineRef.current;
    const next = new Map<string, PaperTradeStatus>();

    for (const trade of paperTrades) {
      next.set(trade.id, trade.status);
      const before = previous.get(trade.id);

      if (before == null && trade.status === "open") {
        sendBrowserNotification(
          `paper-open:${trade.id}`,
          `${trade.symbol} • Sanal işlem açıldı`,
          `${patternTurkish(trade.patternName)} • giriş ₺${trade.entryPrice.toFixed(2)} • hedef ₺${trade.targetPrice.toFixed(2)} • stop ₺${trade.stopPrice.toFixed(2)}`,
          "paper_open",
          trade.symbol,
        );
        continue;
      }

      if (before === "open" && trade.status !== "open") {
        const pnlText = trade.pnlPct == null ? "" : ` • K/Z ${trade.pnlPct >= 0 ? "+" : ""}${trade.pnlPct.toFixed(2)}%`;
        if (trade.status === "target") {
          sendBrowserNotification(
            `paper-target:${trade.id}`,
            `${trade.symbol} • Hedefe ulaştı`,
            `${patternTurkish(trade.patternName)} sanal işlemi hedefte kapandı${pnlText}.`,
            "paper_target",
            trade.symbol,
          );
        } else if (trade.status === "stop") {
          sendBrowserNotification(
            `paper-stop:${trade.id}`,
            `${trade.symbol} • Stop oldu`,
            `${patternTurkish(trade.patternName)} sanal işlemi stop seviyesinde kapandı${pnlText}.`,
            "paper_stop",
            trade.symbol,
          );
        } else {
          sendBrowserNotification(
            `paper-close:${trade.status}:${trade.id}`,
            `${trade.symbol} • Sanal işlem kapandı`,
            `${patternTurkish(trade.patternName)} • ${paperStatusText(trade.status)}${pnlText}.`,
            "paper_close",
            trade.symbol,
          );
        }
      }
    }

    paperStatusBaselineRef.current = next;
  }, [paperTrades, paperLoaded, sendBrowserNotification]);

  useEffect(() => {
    if (activeView !== "stats") return;

    const controller = new AbortController();
    let active = true;

    async function loadStatsBacktest() {
      setStatsLoading(true);
      setStatsError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/market/candles/${selected}?timeframe=${timeframe}&limit=300&backtest=true&stats_window=${statsWindow}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!active) return;
        setStatsBacktest((data.backtest ?? null) as BacktestData | null);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setStatsError(error instanceof Error ? error.message : "İstatistik verisi alınamadı");
        setStatsBacktest(null);
      } finally {
        if (active) setStatsLoading(false);
      }
    }

    loadStatsBacktest();
    return () => {
      active = false;
      controller.abort();
    };
  }, [activeView, selected, timeframe, statsWindow]);

  const latestPattern = patterns.length ? patterns[patterns.length - 1] : null;
  const recentPatterns = [...patterns].reverse().slice(0, 4);
  const last30 = patterns.slice(-30);

  const filteredStocks = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return STOCKS;
    return STOCKS.filter((symbol) =>
      symbol.includes(q) || (COMPANY_NAMES[symbol] ?? "").toUpperCase().includes(q)
    );
  }, [query]);

  const signalCounts = useMemo(() => {
    return last30.reduce(
      (acc, item) => {
        if (item.direction === "bullish") acc.bullish += 1;
        else if (item.direction === "bearish") acc.bearish += 1;
        else acc.neutral += 1;
        return acc;
      },
      { bullish: 0, bearish: 0, neutral: 0 }
    );
  }, [last30]);

  const latestBacktest = latestPattern
    ? (backtest?.patterns ?? []).find((item) => item.name === latestPattern.name) ?? null
    : null;

  const latestReliable = latestBacktest
    ? (["1", "2", "3"] as const)
        .map((h) => ({ horizon: h, metric: latestBacktest.horizons[h] }))
        .filter(({ metric }) =>
          metric.success_rate != null && metric.samples >= (backtest?.minimum_samples ?? 20)
        )
        .sort((a, b) => (b.metric.success_rate ?? 0) - (a.metric.success_rate ?? 0))[0] ?? null
    : null;

  const possibleDirection = latestPattern
    ? latestPattern.direction === "neutral"
      ? "Belirsiz"
      : directionText(latestPattern.direction)
    : "—";

  const confidenceText = latestReliable?.metric.success_rate != null
    ? `%${latestReliable.metric.success_rate.toFixed(1)}`
    : "—";

  const activeStatsBacktest = statsBacktest ?? backtest;

  const statsRankedPatterns = useMemo(() => {
    const data = activeStatsBacktest;
    if (!data) return [] as Array<{
      row: BacktestPattern;
      bestHorizon: "1" | "2" | "3" | null;
      bestMetric: BacktestHorizon | null;
      reliableHorizons: number;
      consistency: number;
      rr: number | null;
      score: number;
      grade: "A" | "B" | "C" | "D";
    }>;

    const minimum = Math.max(statsMinSamples, data.minimum_samples ?? 20);
    const ranked = data.patterns.map((row) => {
      const horizons = (["1", "2", "3"] as const)
        .map((h) => ({ h, m: row.horizons?.[h] }))
        .filter(({ m }) => !!m && m.samples >= minimum && m.success_rate != null);
      const best = [...horizons].sort((a, b) => (b.m?.success_rate ?? 0) - (a.m?.success_rate ?? 0))[0] ?? null;
      const bestMetric = best?.m ?? null;
      const positive = horizons.filter(({ m }) => (m?.avg_directional_return_pct ?? 0) > 0).length;
      const consistency = horizons.length ? positive / horizons.length : 0;
      const mfe = bestMetric?.avg_mfe_pct ?? null;
      const maeAbs = bestMetric?.avg_mae_pct == null ? null : Math.abs(bestMetric.avg_mae_pct);
      const rr = mfe != null && maeAbs != null && maeAbs > 0 ? mfe / maeAbs : null;
      const sampleQuality = bestMetric ? Math.min(1, bestMetric.samples / 60) : 0;
      const success = (bestMetric?.success_rate ?? 0) / 100;
      const directional = Math.max(0, Math.min(1, (bestMetric?.avg_directional_return_pct ?? 0) / 2));
      const rrQuality = rr == null ? 0 : Math.min(1, rr / 2);
      const contextRate = bestMetric?.context_success_rate ?? null;
      const contextQuality = contextRate == null ? success : Math.max(0, Math.min(1, contextRate / 100));
      const score = Math.round((success * 45 + consistency * 15 + sampleQuality * 15 + directional * 10 + rrQuality * 10 + contextQuality * 5) * 10) / 10;
      const reliableHorizons = horizons.length;
      const grade: "A" | "B" | "C" | "D" = score >= 70 && reliableHorizons >= 2 ? "A" : score >= 58 && reliableHorizons >= 2 ? "B" : score >= 45 && reliableHorizons >= 1 ? "C" : "D";
      return { row, bestHorizon: best?.h ?? null, bestMetric, reliableHorizons, consistency, rr, score, grade };
    });

    return ranked
      .filter((item) => statsDirection === "all" || item.row.direction === statsDirection)
      .sort((a, b) => {
        if (statsSort === "success") return (b.bestMetric?.success_rate ?? -1) - (a.bestMetric?.success_rate ?? -1);
        if (statsSort === "samples") return (b.bestMetric?.samples ?? 0) - (a.bestMetric?.samples ?? 0);
        if (statsSort === "rr") return (b.rr ?? -1) - (a.rr ?? -1);
        return b.score - a.score;
      });
  }, [activeStatsBacktest, statsDirection, statsMinSamples, statsSort]);

  const statsSummary = useMemo(() => {
    const data = activeStatsBacktest;
    if (!data) return {
      reliableHorizons: 0,
      totalSamples: 0,
      highestRate: null as number | null,
      avgDirectional: null as number | null,
      topPattern: null as string | null,
      topScore: null as number | null,
      contextBest: null as number | null,
    };
    const minimum = Math.max(statsMinSamples, data.minimum_samples ?? 20);
    const reliableMetrics: BacktestHorizon[] = [];
    let totalSamples = 0;
    for (const pattern of data.patterns) {
      totalSamples += pattern.total_samples ?? 0;
      for (const h of ["1", "2", "3"] as const) {
        const metric = pattern.horizons?.[h];
        if (metric && metric.samples >= minimum && metric.success_rate != null) reliableMetrics.push(metric);
      }
    }
    const rates = reliableMetrics.map((m) => m.success_rate).filter((v): v is number => v != null);
    const directional = reliableMetrics.map((m) => m.avg_directional_return_pct).filter((v): v is number => v != null);
    const contextRates = reliableMetrics.map((m) => m.context_success_rate).filter((v): v is number => v != null);
    const top = statsRankedPatterns[0] ?? null;
    return {
      reliableHorizons: reliableMetrics.length,
      totalSamples,
      highestRate: rates.length ? Math.max(...rates) : null,
      avgDirectional: directional.length ? directional.reduce((a, b) => a + b, 0) / directional.length : null,
      topPattern: top?.row.name ?? null,
      topScore: top?.score ?? null,
      contextBest: contextRates.length ? Math.max(...contextRates) : null,
    };
  }, [activeStatsBacktest, statsMinSamples, statsRankedPatterns]);

  const selectedPaperTrades = paperTrades.filter((trade) => trade.symbol === selected);
  const openPaperTrade = selectedPaperTrades.find(
    (trade) => trade.status === "open" && trade.timeframe === timeframe
  ) ?? null;
  const recentPaperTrades = paperTrades.filter((trade) => trade.status !== "open").slice(0, 5);

  const runMarketScan = useCallback(async (manual = false) => {
    if (scanRunningRef.current) return;
    scanRunningRef.current = true;
    setScanLoading(true);
    setScanError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/market/scan?symbols=${encodeURIComponent(STOCKS.join(","))}&timeframe=${scanTimeframe}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `HTTP ${response.status}`);
      }

      const data: ScanData = await response.json();
      setScanData(data);
      const now = Date.now();
      setLastScanAt(now);
      setNextScanAt(now + AUTO_SCAN_INTERVAL_MS);

      const currentStrongIds = new Set<string>();
      for (const item of data.items ?? []) {
        if (item.signal_strength?.label !== "strong") continue;
        const latest = item.latest_patterns?.[item.latest_patterns.length - 1] ?? null;
        if (!latest || latest.direction === "neutral") continue;

        const signalId = `autoscan:${scanTimeframe}:${item.symbol}:${latest.time}:${latest.name}`;
        currentStrongIds.add(signalId);

        if (scanBaselineReadyRef.current && !strongSignalBaselineRef.current.has(signalId)) {
          const success = item.signal_strength?.success_rate;
          const samples = item.signal_strength?.samples ?? 0;
          const direction = directionText(latest.direction);
          sendBrowserNotification(
            signalId,
            `${item.symbol} • Güçlü ${patternTurkish(latest.name)}`,
            `${direction} yönlü yeni güçlü formasyon. Geçmiş başarı ${success == null ? "—" : `%${success.toFixed(1)}`} · n=${samples}.`,
            "strong_signal",
            item.symbol,
          );
        }
      }

      strongSignalBaselineRef.current = currentStrongIds;
      scanBaselineReadyRef.current = true;

      if (manual && notifyEnabled && notificationStatus === "granted") {
        const strongCount = data.strength_counts?.strong ?? 0;
        if (strongCount > 0) {
          sendBrowserNotification(
            `manual-scan:${scanTimeframe}:${data.fetched_at}`,
            "Katılım 50 taraması tamamlandı",
            `${strongCount} güçlü sinyal bulundu.`,
          );
        }
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Tarama başarısız");
    } finally {
      scanRunningRef.current = false;
      setScanLoading(false);
    }
  }, [scanTimeframe, sendBrowserNotification, notifyEnabled, notificationStatus]);

  useEffect(() => {
    scanBaselineReadyRef.current = false;
    strongSignalBaselineRef.current = new Set();
    runMarketScan(false);
  }, [scanTimeframe, runMarketScan]);

  useEffect(() => {
    if (!autoScanEnabled) {
      setNextScanAt(null);
      return;
    }

    if (!nextScanAt) setNextScanAt(Date.now() + AUTO_SCAN_INTERVAL_MS);
    const interval = window.setInterval(() => {
      runMarketScan(false);
    }, AUTO_SCAN_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [autoScanEnabled, runMarketScan]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!autoScanEnabled || !nextScanAt) {
        setScanCountdown("Kapalı");
        return;
      }
      const remaining = Math.max(0, nextScanAt - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setScanCountdown(`${minutes}:${String(seconds).padStart(2, "0")}`);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoScanEnabled, nextScanAt]);


  const scanRows = useMemo(() => {
    if (!scanData) return [];
    const priority: Record<string, number> = { strong: 6, medium: 5, weak: 4, insufficient: 3, neutral: 2, none: 1 };

    const filtered = scanData.items.filter((item) => {
      const latest = item.latest_patterns?.[item.latest_patterns.length - 1] ?? null;
      const strength = item.signal_strength?.label ?? (latest ? "neutral" : "none");
      const successRate = item.signal_strength?.success_rate ?? null;
      const samples = item.signal_strength?.samples ?? 0;

      if (scanDirectionFilter !== "all" && latest?.direction !== scanDirectionFilter) return false;
      if (scanStrengthFilter !== "all" && strength !== scanStrengthFilter) return false;
      if (scanPatternFilter !== "all" && latest?.name !== scanPatternFilter) return false;
      if (scanMinSuccess > 0 && (successRate == null || successRate < scanMinSuccess)) return false;
      if (scanMinSamples > 0 && samples < scanMinSamples) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (scanSort === "success") {
        const diff = (b.signal_strength?.success_rate ?? -1) - (a.signal_strength?.success_rate ?? -1);
        if (diff !== 0) return diff;
      } else if (scanSort === "samples") {
        const diff = (b.signal_strength?.samples ?? 0) - (a.signal_strength?.samples ?? 0);
        if (diff !== 0) return diff;
      } else if (scanSort === "newest") {
        const aTime = a.latest_patterns?.[a.latest_patterns.length - 1]?.time ?? 0;
        const bTime = b.latest_patterns?.[b.latest_patterns.length - 1]?.time ?? 0;
        if (bTime !== aTime) return bTime - aTime;
      } else if (scanSort === "symbol") {
        return a.symbol.localeCompare(b.symbol);
      } else {
        const aStrength = a.signal_strength?.label ?? (a.latest_patterns?.length ? "neutral" : "none");
        const bStrength = b.signal_strength?.label ?? (b.latest_patterns?.length ? "neutral" : "none");
        const byLabel = (priority[bStrength] ?? 0) - (priority[aStrength] ?? 0);
        if (byLabel !== 0) return byLabel;
        const byScore = (b.signal_strength?.score ?? 0) - (a.signal_strength?.score ?? 0);
        if (byScore !== 0) return byScore;
      }
      return a.symbol.localeCompare(b.symbol);
    });
  }, [scanData, scanDirectionFilter, scanStrengthFilter, scanPatternFilter, scanMinSuccess, scanMinSamples, scanSort]);

  const watchRows = useMemo(() => {
    return favoriteSymbols.map((symbol) => {
      const scanItem = scanData?.items.find((item) => item.symbol === symbol) ?? null;
      const latest = scanItem?.latest_patterns?.[scanItem.latest_patterns.length - 1] ?? null;
      return { symbol, scanItem, latest };
    });
  }, [favoriteSymbols, scanData]);

  const paperSummary = useMemo(() => {
    const openTrades = paperTrades.filter((trade) => trade.status === "open");
    const completedTrades = paperTrades.filter((trade) => trade.status !== "open");
    const pnlAmounts = completedTrades.map((trade) =>
      trade.pnlAmount ?? ((trade.investedAmount ?? 0) * ((trade.pnlPct ?? 0) / 100))
    );
    const wins = completedTrades.filter((trade) => (trade.pnlPct ?? 0) > 0).length;
    const losses = completedTrades.filter((trade) => (trade.pnlPct ?? 0) < 0).length;
    const realizedPnl = pnlAmounts.reduce((sum, value) => sum + value, 0);
    const grossProfit = pnlAmounts.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const grossLossAbs = Math.abs(pnlAmounts.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
    const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : grossProfit > 0 ? null : 0;
    const openExposure = openTrades.reduce((sum, trade) => sum + (trade.investedAmount ?? 0), 0);
    const openRisk = openTrades.reduce((sum, trade) => sum + (trade.riskAmount ?? ((trade.investedAmount ?? 0) * ((trade.stopPct ?? 0) / 100))), 0);
    const balance = paperInitialBalance + realizedPnl;
    const availableCash = Math.max(0, balance - openExposure);
    const returnPct = paperInitialBalance > 0 ? (realizedPnl / paperInitialBalance) * 100 : 0;
    const winRate = completedTrades.length ? (wins / completedTrades.length) * 100 : 0;
    const avgWin = wins ? grossProfit / wins : 0;
    const avgLoss = losses ? grossLossAbs / losses : 0;
    const expectancy = completedTrades.length ? realizedPnl / completedTrades.length : 0;

    const chronological = completedTrades
      .filter((trade) => trade.exitTime)
      .slice()
      .sort((a, b) => (a.exitTime ?? 0) - (b.exitTime ?? 0));
    let equity = paperInitialBalance;
    let peak = equity;
    let maxDrawdownPct = 0;
    for (const trade of chronological) {
      equity += trade.pnlAmount ?? ((trade.investedAmount ?? 0) * ((trade.pnlPct ?? 0) / 100));
      peak = Math.max(peak, equity);
      const drawdown = peak > 0 ? ((equity - peak) / peak) * 100 : 0;
      maxDrawdownPct = Math.min(maxDrawdownPct, drawdown);
    }

    return {
      open: openTrades.length,
      completed: completedTrades.length,
      wins,
      losses,
      realizedPnl,
      grossProfit,
      grossLossAbs,
      profitFactor,
      openExposure,
      openRisk,
      balance,
      availableCash,
      returnPct,
      winRate,
      avgWin,
      avgLoss,
      expectancy,
      maxDrawdownPct,
    };
  }, [paperTrades, paperInitialBalance]);

  const paperPerformance = useMemo(() => {
    const closed = paperTrades
      .filter((trade) => trade.status !== "open" && trade.exitTime)
      .slice()
      .sort((a, b) => (a.exitTime ?? 0) - (b.exitTime ?? 0));
    let equity = paperInitialBalance;
    const values = [equity];
    for (const trade of closed) {
      equity += trade.pnlAmount ?? ((trade.investedAmount ?? 0) * ((trade.pnlPct ?? 0) / 100));
      values.push(equity);
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, 1);
    const width = 600;
    const height = 120;
    const points = values.map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 16) - 8;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return { points, count: closed.length, equity, min, max };
  }, [paperTrades, paperInitialBalance]);

  const paperPatternPerformance = useMemo(() => {
    const groups = new Map<string, { name: string; trades: number; wins: number; pnl: number; grossProfit: number; grossLossAbs: number }>();
    for (const trade of paperTrades.filter((item) => item.status !== "open")) {
      const current = groups.get(trade.patternName) ?? { name: trade.patternName, trades: 0, wins: 0, pnl: 0, grossProfit: 0, grossLossAbs: 0 };
      const pnl = trade.pnlAmount ?? ((trade.investedAmount ?? 0) * ((trade.pnlPct ?? 0) / 100));
      current.trades += 1;
      current.pnl += pnl;
      if (pnl > 0) {
        current.wins += 1;
        current.grossProfit += pnl;
      } else if (pnl < 0) {
        current.grossLossAbs += Math.abs(pnl);
      }
      groups.set(trade.patternName, current);
    }
    return [...groups.values()]
      .map((row) => ({
        ...row,
        winRate: row.trades ? (row.wins / row.trades) * 100 : 0,
        profitFactor: row.grossLossAbs > 0 ? row.grossProfit / row.grossLossAbs : row.grossProfit > 0 ? null : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [paperTrades]);

  const unreadNotificationCount = notificationEvents.reduce((sum, item) => sum + (item.read ? 0 : 1), 0);
  const markAllNotificationsRead = useCallback(() => {
    setNotificationEvents((current) => current.map((item) => ({ ...item, read: true })));
  }, []);
  const clearNotificationHistory = useCallback(() => {
    setNotificationEvents([]);
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span className="candle c1" />
            <span className="candle c2" />
            <span className="candle c3" />
          </div>
          <div>
            <h1>BIST Mum Formasyon Sistemi</h1>
            <p>BIST Katılım 50 mum formasyonu tarama</p>
          </div>
        </div>

        <nav className="main-nav" aria-label="Ana menü">
          <button className={activeView === "market" ? "active" : ""} onClick={() => setActiveView("market")}>⌁ <span>Piyasa</span></button>
          <button className={activeView === "scanner" ? "active" : ""} onClick={() => setActiveView("scanner")}>◉ <span>Formasyon Taraması</span></button>
          <button className={activeView === "watchlist" ? "active" : ""} onClick={() => setActiveView("watchlist")}>▣ <span>Takip Listesi</span></button>
          <button className={activeView === "paper" ? "active" : ""} onClick={() => setActiveView("paper")}>₺ <span>Paper Trading</span></button>
          <button className={activeView === "stats" ? "active" : ""} onClick={() => setActiveView("stats")}>▥ <span>İstatistikler</span></button>
        </nav>

        <div className="top-actions">
          <span className={`status-pill ${backendStatus === "Backend bağlı" ? "online" : "offline"}`}>
            <i /> {backendStatus === "Backend bağlı" ? "Sistem aktif" : "Sistem bağlantısı yok"}
          </span>
          <button
            className={`notify-button ${notifyEnabled ? "active" : ""}`}
            onClick={toggleNotifications}
            title={notificationStatus === "denied" ? "Tarayıcı bildirim izni engellenmiş" : "Formasyon, paper trading ve veri bağlantısı bildirimleri"}
          >
            {notificationStatus === "denied" ? "Bildirim Engelli" : notifyEnabled ? "Bildirim Açık" : "Bildirim Kapalı"}
          </button>
          <button className={`notification-center-button ${activeView === "notifications" ? "active" : ""}`} onClick={() => { setActiveView("notifications"); markAllNotificationsRead(); }} title="Bildirim geçmişi">
            🔔{unreadNotificationCount > 0 ? <b>{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</b> : null}
          </button>
          <button className="icon-button" aria-label="Tema">☾</button>
          <button className="avatar-button" aria-label="Profil">B</button>
        </div>
      </header>

      <div className="dashboard-grid">
        <aside className="watchlist panel">
          <div className="watchlist-title">
            <strong>BIST Katılım 50</strong>
            <span>{KATILIM_PERIOD}</span>
          </div>
          <div className="search-box">
            <span>⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hisse ara..."
            />
          </div>

          <div className="stock-columns">
            <span>Sembol</span>
            <span>Fiyat</span>
            <span>Değişim</span>
          </div>

          <div className="stock-list">
            {filteredStocks.map((symbol) => (
              <button
                key={symbol}
                className={`stock-row ${selected === symbol ? "active" : ""}`}
                onClick={() => handleSelectStock(symbol)}
              >
                <span
                  className={`stock-star ${favoriteSymbols.includes(symbol) ? "active" : ""}`}
                  onClick={(event) => { event.stopPropagation(); toggleFavorite(symbol); }}
                  title={favoriteSymbols.includes(symbol) ? "Takip listesinden çıkar" : "Takip listesine ekle"}
                >{favoriteSymbols.includes(symbol) ? "★" : "☆"}</span>
                <span className="stock-symbol">{symbol}</span>
                <span className="stock-price">
                  {prices[symbol] == null ? "—" : `₺${prices[symbol]!.toFixed(2)}`}
                </span>
                <span className={`stock-change ${(changes[symbol] ?? 0) > 0 ? "positive" : (changes[symbol] ?? 0) < 0 ? "negative" : ""}`}>
                  {changes[symbol] == null ? "—" : `${changes[symbol]! >= 0 ? "+" : ""}${changes[symbol]!.toFixed(2)}%`}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {activeView === "market" ? (
          <>
        <section className="workspace panel">
          <div className="instrument-header">
            <div className="instrument-identity">
              <div className="ticker-avatar">{selected.slice(0, 1)}</div>
              <div>
                <div className="ticker-title-row">
                  <h2>{selected}</h2>
                  <button className={`favorite favorite-button ${favoriteSymbols.includes(selected) ? "active" : ""}`} onClick={() => toggleFavorite(selected)} title={favoriteSymbols.includes(selected) ? "Takip listesinden çıkar" : "Takip listesine ekle"}>{favoriteSymbols.includes(selected) ? "★" : "☆"}</button>
                </div>
                <p>{COMPANY_NAMES[selected] ?? selected}</p>
              </div>
            </div>

            <div className="instrument-price">
              <strong>{prices[selected] == null ? "—" : `₺${prices[selected]!.toFixed(2)}`}</strong>
              <em className={`${(changes[selected] ?? 0) >= 0 ? "positive" : "negative"}`}>
                {changes[selected] == null ? "—" : `${changes[selected]! >= 0 ? "+" : ""}${changes[selected]!.toFixed(2)}%`}
              </em>
              <span>{marketSnapshot?.dataStatus === "stale" ? "Son başarılı veri" : "Veri akışı aktif"}</span>
            </div>

            <div className="chart-controls">
              <div className="timeframes">
                {[
                  ["10 dk", "10m"],
                  ["15 dk", "15m"],
                  ["1 saat", "1h"],
                  ["4 saat", "4h"],
                  ["1 gün", "1d"],
                ].map(([label, value]) => (
                  <button
                    key={value}
                    className={timeframe === value ? "active" : ""}
                    onClick={() => setTimeframe(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="data-ranges" aria-label="Grafikte gösterilecek veri aralığı">
                <span>Veri</span>
                <button
                  className={dataRange === "1d" ? "active" : ""}
                  onClick={() => setDataRange("1d")}
                >
                  1 Gün
                </button>
                <button
                  className={dataRange === "2w" ? "active" : ""}
                  onClick={() => setDataRange("2w")}
                >
                  2 Hafta
                </button>
                <button
                  className={dataRange === "1mo" ? "active" : ""}
                  onClick={() => setDataRange("1mo")}
                >
                  1 Ay
                </button>
                <button
                  className={dataRange === "2mo" ? "active" : ""}
                  onClick={() => setDataRange("2mo")}
                >
                  2 Ay
                </button>
              </div>
            </div>
          </div>

          <div className="workspace-tabs">
            <button>⌂ <span>Genel Bakış</span></button>
            <button className="active">▥ <span>Mum Formasyonları</span></button>
            <button>▥ <span>Hacim</span></button>
            <button>⌁ <span>Teknik Göstergeler</span></button>
          </div>

          <div className="data-health-strip">
            <div>
              <span>Veri durumu</span>
              <strong className={marketSnapshot ? (marketSnapshot.dataStatus === "stale" ? "data-stale" : "data-fresh") : ""}>
                {!marketSnapshot ? "Bekleniyor" : marketSnapshot.dataStatus === "stale" ? "Gecikmeli" : "Aktif"}
              </strong>
            </div>
            <div>
              <span>Kaynak</span>
              <strong>{marketSnapshot?.source ?? "Yahoo Finance"}</strong>
            </div>
            <div>
              <span>Son veri</span>
              <strong>
                {marketSnapshot?.lastCandleTime
                  ? new Date(marketSnapshot.lastCandleTime * 1000).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </strong>
            </div>
            <div>
              <span>Yenileme</span>
              <strong>{timeframe === "10m" || timeframe === "15m" ? "5 sn" : timeframe === "1h" ? "15 sn" : "30 sn"}</strong>
            </div>
          </div>

          <div className="chart-card">
            <CandleChart
              key={`${selected}-${timeframe}-${dataRange}`}
              symbol={selected}
              timeframe={timeframe}
              dataRange={dataRange}
              onPatternsChange={handlePatternsChange}
              onBacktestChange={handleBacktestChange}
              onMarketDataChange={handleMarketDataChange}
            />
            <div className="chart-bottom-toolbar" aria-hidden="true">
              <div className="drawing-tools">
                <span>Çizim Araçları</span>
                <b>⌄</b>
                <i>＋</i><i>╱</i><i>⌁</i><i>◇</i><i>□</i><i>T</i>
              </div>
              <div className="chart-flags">
                <span className="checked">✓ Hacim</span>
                <span className="checked">✓ Izgara</span>
                <span className="checked">✓ Fiyat Çizgisi</span>
                <span>⛶</span>
              </div>
            </div>
          </div>
        </section>

        <aside className="insights" key={`insights-${selected}`}>
          <section className="insight-card panel">
            <div className="card-heading-row">
              <h3>Son Formasyon</h3>
              <span className="muted">{latestPattern ? formatDate(latestPattern.time) : "—"}</span>
            </div>

            {latestPattern ? (
              <>
                <div className="latest-pattern-row">
                  <span className={`pattern-dot ${directionClass(latestPattern.direction)}`} />
                  <strong>{patternTurkish(latestPattern.name)}</strong>
                </div>
                <span className={`direction-badge ${directionClass(latestPattern.direction)}`}>
                  {directionText(latestPattern.direction)}
                </span>
                <p className="pattern-description">{directionDescription(latestPattern)}</p>
                <div className="divider" />
                <div className="mini-stat-row">
                  <span>Olası Yön</span>
                  <strong>{possibleDirection}</strong>
                </div>
                <div className="mini-stat-row">
                  <span>Geçmiş başarı</span>
                  <strong>{confidenceText}</strong>
                </div>
              </>
            ) : (
              <p className="empty-text">Formasyon bekleniyor...</p>
            )}
          </section>

          <section className="insight-card panel">
            <div className="card-heading-row">
              <h3>Son Bulunan Formasyonlar</h3>
            </div>
            <div className="recent-list">
              {recentPatterns.length ? recentPatterns.map((pattern, index) => (
                <div className="recent-item" key={`${pattern.time}-${pattern.name}-${index}`}>
                  <span className="rank-bubble">{index + 1}</span>
                  <div className="recent-main">
                    <strong>{patternTurkish(pattern.name)}</strong>
                    <small>{formatDate(pattern.time)}</small>
                  </div>
                  <span className={`direction-badge compact ${directionClass(pattern.direction)}`}>
                    {directionText(pattern.direction)}
                  </span>
                </div>
              )) : <p className="empty-text">Henüz formasyon yok.</p>}
            </div>
          </section>

          <section className="insight-card panel signal-card">
            <div className="card-heading-row">
              <h3>Sinyal Özeti</h3>
              <span className="muted">Son {last30.length} formasyon</span>
            </div>
            <div className="signal-grid">
              <div className="signal-cell bullish">
                <span>↑</span>
                <small>Yükseliş</small>
                <strong>{signalCounts.bullish}</strong>
              </div>
              <div className="signal-cell bearish">
                <span>↓</span>
                <small>Düşüş</small>
                <strong>{signalCounts.bearish}</strong>
              </div>
              <div className="signal-cell neutral">
                <span>—</span>
                <small>Nötr</small>
                <strong>{signalCounts.neutral}</strong>
              </div>
              <div className="signal-cell success">
                <span>▥</span>
                <small>Başarı Oranı</small>
                <strong>{latestReliable?.metric.success_rate != null ? `%${Math.round(latestReliable.metric.success_rate)}` : "—"}</strong>
              </div>
            </div>
            <p className="signal-note">Geçmiş sonuçlar bilgi amaçlıdır; gelecekteki hareketi garanti etmez.</p>
          </section>

          <section className="insight-card panel paper-card">
            <div className="card-heading-row">
              <div>
                <h3>Paper Trading</h3>
                <span className="paper-subtitle">Gerçek emir göndermez • geçmiş SQLite ile saklanır</span>
              </div>
              <button
                className={`paper-toggle ${paperEnabled ? "active" : ""}`}
                onClick={() => setPaperEnabled((value) => !value)}
              >
                {paperEnabled ? "Otomatik Açık" : "Kapalı"}
              </button>
            </div>

            {openPaperTrade ? (
              <div className="paper-open">
                <div className="paper-open-title">
                  <span className={`pattern-dot ${directionClass(openPaperTrade.direction)}`} />
                  <strong>{patternTurkish(openPaperTrade.patternName)}</strong>
                  <span className="paper-live">SANAL AÇIK</span>
                </div>
                <div className="paper-levels">
                  <div><span>Giriş</span><strong>₺{openPaperTrade.entryPrice.toFixed(2)}</strong></div>
                  <div><span>Hedef</span><strong className="positive">₺{openPaperTrade.targetPrice.toFixed(2)}</strong></div>
                  <div><span>Stop</span><strong className="negative">₺{openPaperTrade.stopPrice.toFixed(2)}</strong></div>
                </div>
                <div className="paper-meta">
                  {timeframeLabel(openPaperTrade.timeframe)} · {openPaperTrade.horizon} mum · geçmiş %{openPaperTrade.backtestRate.toFixed(1)} · n={openPaperTrade.samples}<br/>
                  {openPaperTrade.quantity ? `${openPaperTrade.quantity} lot · ₺${(openPaperTrade.investedAmount ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}` : "Pozisyon boyutu eski kayıtta yok"}
                </div>
              </div>
            ) : (
              <p className="empty-text">
                {paperEnabled
                  ? "Son kapanmış mumda yeterli geçmiş veriye sahip yönlü formasyon bekleniyor."
                  : "Otomatik paper trading kapalı."}
              </p>
            )}

            <div className="paper-summary">
              <div className="paper-summary-item">
                <span>Açık</span>
                <strong>{paperSummary.open}</strong>
              </div>
              <div className="paper-summary-item">
                <span>Tamamlanan</span>
                <strong>{paperSummary.completed}</strong>
              </div>
              <div className="paper-summary-item win">
                <span>Kazandı</span>
                <strong>{paperSummary.wins}</strong>
              </div>
              <div className="paper-summary-item loss">
                <span>Kaybetti</span>
                <strong>{paperSummary.losses}</strong>
              </div>
              <div className="paper-summary-item return">
                <span>Getiri</span>
                <strong className={paperSummary.returnPct >= 0 ? "positive" : "negative"}>
                  {paperSummary.returnPct >= 0 ? "+" : ""}{paperSummary.returnPct.toFixed(2)}%
                </strong>
              </div>
            </div>

            {recentPaperTrades.length > 0 && (
              <div className="paper-history">
                <span className="paper-history-title">Son sanal işlemler</span>
                {recentPaperTrades.map((trade) => (
                  <div className="paper-history-row" key={trade.id}>
                    <div>
                      <strong>{trade.symbol} · {patternTurkish(trade.patternName)}</strong>
                      <small>{timeframeLabel(trade.timeframe)} · {paperStatusText(trade.status)}</small>
                    </div>
                    <strong className={(trade.pnlPct ?? 0) >= 0 ? "positive" : "negative"}>
                      {trade.pnlPct == null ? "—" : `${trade.pnlPct >= 0 ? "+" : ""}${trade.pnlPct.toFixed(2)}%`}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
          </>
        ) : activeView === "scanner" ? (
          <section className="wide-view panel scanner-view">
            <div className="wide-view-header">
              <div>
                <h2>Katılım 50 Formasyon Taraması</h2>
                <p>50 hisseyi toplu tarar; son kapanmış mumdaki formasyonları öne çıkarır.</p>
              </div>
              <div className="scanner-actions">
                <div className="scanner-controls">
                  {[
                    ["10 dk", "10m"], ["15 dk", "15m"], ["1 saat", "1h"], ["4 saat", "4h"], ["1 gün", "1d"],
                  ].map(([label, value]) => (
                    <button key={value} className={scanTimeframe === value ? "active" : ""} onClick={() => setScanTimeframe(value)}>{label}</button>
                  ))}
                </div>
                <div className="auto-scan-controls">
                  <button className={autoScanEnabled ? "auto-scan-toggle active" : "auto-scan-toggle"} onClick={() => setAutoScanEnabled((value) => !value)}>
                    {autoScanEnabled ? "● Otomatik 5 dk Açık" : "○ Otomatik Tarama Kapalı"}
                  </button>
                  <button className="scan-now-button" onClick={() => runMarketScan(true)} disabled={scanLoading}>
                    {scanLoading ? "Taranıyor…" : "Şimdi Tara"}
                  </button>
                </div>
              </div>
            </div>

            <div className="auto-scan-status">
              <span><b>Otomatik tarama:</b> {autoScanEnabled ? "5 dakikada bir" : "Kapalı"}</span>
              <span><b>Son tarama:</b> {lastScanAt ? new Date(lastScanAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span>
              <span><b>Sonraki:</b> {autoScanEnabled ? scanCountdown : "—"}</span>
              <span><b>Bildirim:</b> {notifyEnabled && notificationStatus === "granted" ? "Yeni güçlü sinyalde açık" : "Kapalı"}</span>
            </div>

            <div className="scanner-filter-bar">
              <label>
                <span>Yön</span>
                <select value={scanDirectionFilter} onChange={(e) => setScanDirectionFilter(e.target.value as "all" | Pattern["direction"])}>
                  <option value="all">Tümü</option>
                  <option value="bullish">Yükseliş</option>
                  <option value="bearish">Düşüş</option>
                  <option value="neutral">Nötr</option>
                </select>
              </label>
              <label>
                <span>Güç</span>
                <select value={scanStrengthFilter} onChange={(e) => setScanStrengthFilter(e.target.value as typeof scanStrengthFilter)}>
                  <option value="all">Tümü</option>
                  <option value="strong">Güçlü</option>
                  <option value="medium">Orta</option>
                  <option value="weak">Zayıf</option>
                  <option value="insufficient">Örnek Az</option>
                  <option value="neutral">Nötr</option>
                </select>
              </label>
              <label>
                <span>Formasyon</span>
                <select value={scanPatternFilter} onChange={(e) => setScanPatternFilter(e.target.value)}>
                  <option value="all">Tümü</option>
                  {ALL_PATTERN_NAMES.map((name) => <option key={name} value={name}>{patternTurkish(name)}</option>)}
                </select>
              </label>
              <label>
                <span>Min. başarı</span>
                <select value={scanMinSuccess} onChange={(e) => setScanMinSuccess(Number(e.target.value))}>
                  <option value={0}>Filtre yok</option>
                  <option value={50}>%50+</option>
                  <option value={55}>%55+</option>
                  <option value={60}>%60+</option>
                  <option value={65}>%65+</option>
                  <option value={70}>%70+</option>
                </select>
              </label>
              <label>
                <span>Min. örnek</span>
                <select value={scanMinSamples} onChange={(e) => setScanMinSamples(Number(e.target.value))}>
                  <option value={0}>Filtre yok</option>
                  <option value={10}>10+</option>
                  <option value={20}>20+</option>
                  <option value={25}>25+</option>
                  <option value={30}>30+</option>
                  <option value={50}>50+</option>
                </select>
              </label>
              <label>
                <span>Sırala</span>
                <select value={scanSort} onChange={(e) => setScanSort(e.target.value as typeof scanSort)}>
                  <option value="strength">Güç</option>
                  <option value="success">Başarı oranı</option>
                  <option value="samples">Örnek sayısı</option>
                  <option value="newest">En yeni</option>
                  <option value="symbol">Sembol</option>
                </select>
              </label>
              <button className="scan-filter-reset" onClick={() => {
                setScanDirectionFilter("all");
                setScanStrengthFilter("all");
                setScanPatternFilter("all");
                setScanMinSuccess(0);
                setScanMinSamples(0);
                setScanSort("strength");
              }}>Filtreleri Sıfırla</button>
              <div className="scan-filter-result"><span>Gösterilen</span><strong>{scanRows.length}</strong></div>
            </div>

            <div className="scan-summary-grid">
              <div><span>Taranan</span><strong>{scanData?.symbols_scanned ?? 0}/{STOCKS.length}</strong></div>
              <div><span>Formasyon çıkan</span><strong>{scanData?.symbols_with_signal ?? 0}</strong></div>
              <div className="strong"><span>Güçlü</span><strong>{scanData?.strength_counts?.strong ?? 0}</strong></div>
              <div className="medium"><span>Orta</span><strong>{scanData?.strength_counts?.medium ?? 0}</strong></div>
              <div className="bullish"><span>Yükseliş</span><strong>{scanData?.direction_counts?.bullish ?? 0}</strong></div>
              <div className="bearish"><span>Düşüş</span><strong>{scanData?.direction_counts?.bearish ?? 0}</strong></div>
              <div className="neutral"><span>Nötr</span><strong>{scanData?.direction_counts?.neutral ?? 0}</strong></div>
            </div>

            {scanLoading ? <div className="scan-loading">Katılım 50 taranıyor… İlk tarama biraz sürebilir.</div> : null}
            {scanError ? <div className="scan-error">Tarama hatası: {scanError}</div> : null}

            <div className="scan-table-wrap">
              <table className="scan-table">
                <thead>
                  <tr><th>Hisse</th><th>Fiyat</th><th>Son kapanmış mum</th><th>Yön</th><th>Geçmiş Güç</th><th>İstatistik</th><th>Son formasyonlar</th><th></th></tr>
                </thead>
                <tbody>
                  {scanRows.map((item) => {
                    const latest = item.latest_patterns?.[item.latest_patterns.length - 1] ?? null;
                    const recent = [...(item.recent_patterns ?? [])].reverse().slice(0, 3);
                    return (
                      <tr key={item.symbol} className={latest ? "has-signal" : ""}>
                        <td><strong>{item.symbol}</strong><small>{COMPANY_NAMES[item.symbol] ?? item.symbol}</small></td>
                        <td>{item.last_price == null ? "—" : `₺${item.last_price.toFixed(2)}`}</td>
                        <td>{latest ? <><strong>{patternTurkish(latest.name)}</strong><small>{formatDate(latest.time)}</small></> : <span className="muted">Yeni sinyal yok</span>}</td>
                        <td>{latest ? <span className={`direction-badge ${directionClass(latest.direction)}`}>{directionText(latest.direction)}</span> : "—"}</td>
                        <td>
                          <span className={`strength-badge ${strengthClass(item.signal_strength?.label)}`}>
                            {strengthText(item.signal_strength?.label)}
                          </span>
                          {item.signal_strength?.score ? <small>Geçmiş puan: {item.signal_strength.score.toFixed(1)}</small> : null}
                          {item.signal_strength?.validation_reason ? <small title={item.signal_strength.validation_reason}>Doğrulama: {item.signal_strength.validation_reason}</small> : null}
                        </td>
                        <td className="scan-metrics">
                          {item.signal_strength?.success_rate != null ? (
                            <>
                              <strong>%{item.signal_strength.success_rate.toFixed(1)}</strong>
                              <small>+{item.signal_strength.horizon} mum · n={item.signal_strength.samples}</small>
                              <small>Ort. {item.signal_strength.avg_directional_return_pct == null ? "—" : `${item.signal_strength.avg_directional_return_pct >= 0 ? "+" : ""}${item.signal_strength.avg_directional_return_pct.toFixed(2)}%`}</small>
                              <small>Ufuk tutarlılığı {item.signal_strength.positive_horizons ?? 0}/3</small>
                            </>
                          ) : <span className="muted">Yön istatistiği yok</span>}
                        </td>
                        <td className="scan-recent">{recent.length ? recent.map((p, i) => <span key={`${p.time}-${p.name}-${i}`}>{patternTurkish(p.name)}</span>) : "—"}</td>
                        <td><button className="open-symbol" onClick={() => { handleSelectStock(item.symbol); setActiveView("market"); }}>Grafiği Aç</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="scanner-note">V18 Tarama V2: yön, formasyon, geçmiş güç, minimum başarı ve minimum örnek filtreleri aynı tarama sonucu üzerinde uygulanır; yeni API isteği oluşturmaz. “Güç” sıralaması yalnızca geçmiş kapanmış mum istatistiklerini özetler ve yatırım tavsiyesi değildir. Formasyonlar yalnızca kapanmış mumda onaylanır; Yahoo Finance verisinin gerçek zaman garantisi yoktur.</p>
          </section>
        ) : activeView === "watchlist" ? (
          <section className="wide-view panel favorites-view">
            <div className="wide-view-header">
              <div>
                <h2>Takip Listesi</h2>
                <p>Yıldızladığın Katılım 50 hisselerini tek ekranda izle. Fiyat, değişim, son formasyon ve geçmiş sinyal gücü birlikte gösterilir.</p>
              </div>
              <div className="favorites-header-actions">
                <span className="favorites-count">{favoriteSymbols.length} hisse</span>
                <button className="open-symbol" onClick={() => setActiveView("market")}>Piyasaya Dön</button>
              </div>
            </div>

            {favoriteSymbols.length === 0 ? (
              <div className="favorites-empty">
                <strong>Takip listen henüz boş.</strong>
                <span>Sol taraftaki hisse listesinden ☆ simgesine basarak hisse ekleyebilirsin.</span>
                <button className="open-symbol" onClick={() => setActiveView("market")}>Hisse Seç</button>
              </div>
            ) : (
              <div className="scan-table-wrap favorites-table-wrap">
                <table className="scan-table favorites-table">
                  <thead>
                    <tr><th>Hisse</th><th>Fiyat</th><th>Değişim</th><th>Son Formasyon</th><th>Yön</th><th>Sinyal Gücü</th><th>Geçmiş İstatistik</th><th></th></tr>
                  </thead>
                  <tbody>
                    {watchRows.map(({ symbol, scanItem, latest }) => (
                      <tr key={symbol} className={latest ? "has-signal" : ""}>
                        <td>
                          <div className="favorite-symbol-cell">
                            <button className="watch-remove" onClick={() => toggleFavorite(symbol)} title="Takip listesinden çıkar">★</button>
                            <div><strong>{symbol}</strong><small>{COMPANY_NAMES[symbol] ?? symbol}</small></div>
                          </div>
                        </td>
                        <td>{prices[symbol] == null ? "—" : `₺${prices[symbol]!.toFixed(2)}`}</td>
                        <td><strong className={(changes[symbol] ?? 0) > 0 ? "positive" : (changes[symbol] ?? 0) < 0 ? "negative" : ""}>{changes[symbol] == null ? "—" : `${changes[symbol]! >= 0 ? "+" : ""}${changes[symbol]!.toFixed(2)}%`}</strong></td>
                        <td>{latest ? <><strong>{patternTurkish(latest.name)}</strong><small>{formatDate(latest.time)}</small></> : <span className="muted">Yeni sinyal yok</span>}</td>
                        <td>{latest ? <span className={`direction-badge ${directionClass(latest.direction)}`}>{directionText(latest.direction)}</span> : "—"}</td>
                        <td>
                          <span className={`strength-badge ${strengthClass(scanItem?.signal_strength?.label)}`}>{strengthText(scanItem?.signal_strength?.label)}</span>
                          {scanItem?.signal_strength?.score ? <small>Geçmiş puan: {scanItem.signal_strength.score.toFixed(1)}</small> : null}
                        </td>
                        <td className="scan-metrics">
                          {scanItem?.signal_strength?.success_rate != null ? (
                            <>
                              <strong>%{scanItem.signal_strength.success_rate.toFixed(1)}</strong>
                              <small>+{scanItem.signal_strength.horizon} mum · n={scanItem.signal_strength.samples}</small>
                              <small>Ort. {scanItem.signal_strength.avg_directional_return_pct == null ? "—" : `${scanItem.signal_strength.avg_directional_return_pct >= 0 ? "+" : ""}${scanItem.signal_strength.avg_directional_return_pct.toFixed(2)}%`}</small>
                            </>
                          ) : <span className="muted">Tarama verisi bekleniyor</span>}
                        </td>
                        <td><button className="open-symbol" onClick={() => { handleSelectStock(symbol); setActiveView("market"); }}>Grafiği Aç</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="scanner-note">Takip listesi bu tarayıcıda saklanır. Sol listedeki yıldızlara basarak ekleme/çıkarma yapabilirsin. Formasyon ve güç bilgileri 5 dakikalık Katılım 50 taramasından beslenir; henüz tarama tamamlanmadıysa ilgili alanlar beklemede görünür.</p>
          </section>
        ) : activeView === "paper" ? (
          <section className="wide-view panel paper-v2-view">
            <div className="wide-view-header">
              <div>
                <h2>Paper Trading V3</h2>
                <p>Gerçek emir göndermez. Risk bazlı lot hesabı, güvenilir sinyal filtresi, drawdown ve Profit Factor ile stratejiyi ölç.</p>
              </div>
              <div className="paper-v2-actions">
                <button className={`paper-toggle ${paperEnabled ? "active" : ""}`} onClick={() => setPaperEnabled((v) => !v)}>{paperEnabled ? "Otomatik Açık" : "Otomatik Kapalı"}</button>
                <button className="open-symbol" onClick={() => setActiveView("market")}>Piyasaya Dön</button>
              </div>
            </div>

            <div className="paper-v2-settings paper-v3-settings">
              <label><span>Başlangıç Bakiye</span><input type="number" min="1000" step="1000" value={paperInitialBalance} onChange={(e) => setPaperInitialBalance(Math.max(1000, Number(e.target.value) || 1000))}/></label>
              <label><span>Maks. Pozisyon</span><div className="paper-allocation-input"><input type="number" min="1" max="100" step="1" value={paperAllocationPct} onChange={(e) => setPaperAllocationPct(clamp(Number(e.target.value) || 1, 1, 100))}/><b>%</b></div></label>
              <label><span>İşlem Riski</span><div className="paper-allocation-input"><input type="number" min="0.1" max="5" step="0.1" value={paperRiskPct} onChange={(e) => setPaperRiskPct(clamp(Number(e.target.value) || 0.1, 0.1, 5))}/><b>%</b></div></label>
              <label><span>Min. Başarı</span><div className="paper-allocation-input"><input type="number" min="50" max="90" step="1" value={paperMinSuccess} onChange={(e) => setPaperMinSuccess(clamp(Number(e.target.value) || 50, 50, 90))}/><b>%</b></div></label>
              <label><span>Min. Örnek</span><input type="number" min="10" max="200" step="5" value={paperMinSamples} onChange={(e) => setPaperMinSamples(clamp(Number(e.target.value) || 10, 10, 200))}/></label>
              <div><span>Hesap Bakiye</span><strong>₺{paperSummary.balance.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</strong></div>
              <div><span>Kullanılabilir</span><strong>₺{paperSummary.availableCash.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</strong></div>
              <div><span>Açık Risk</span><strong>₺{paperSummary.openRisk.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</strong></div>
            </div>

            <div className="paper-v2-kpis paper-v3-kpis">
              <div><span>Gerçekleşen K/Z</span><strong className={paperSummary.realizedPnl >= 0 ? "positive" : "negative"}>{paperSummary.realizedPnl >= 0 ? "+" : ""}₺{paperSummary.realizedPnl.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</strong></div>
              <div><span>Toplam Getiri</span><strong className={paperSummary.returnPct >= 0 ? "positive" : "negative"}>{paperSummary.returnPct >= 0 ? "+" : ""}{paperSummary.returnPct.toFixed(2)}%</strong></div>
              <div><span>Kazanma Oranı</span><strong>{paperSummary.completed ? `%${paperSummary.winRate.toFixed(1)}` : "—"}</strong></div>
              <div><span>Profit Factor</span><strong>{paperSummary.profitFactor == null ? "∞" : paperSummary.completed ? paperSummary.profitFactor.toFixed(2) : "—"}</strong></div>
              <div><span>Maks. Drawdown</span><strong className={paperSummary.maxDrawdownPct < 0 ? "negative" : ""}>{paperSummary.completed ? `${paperSummary.maxDrawdownPct.toFixed(2)}%` : "—"}</strong></div>
              <div><span>Beklenti / İşlem</span><strong className={paperSummary.expectancy >= 0 ? "positive" : "negative"}>{paperSummary.completed ? `${paperSummary.expectancy >= 0 ? "+" : ""}₺${paperSummary.expectancy.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}` : "—"}</strong></div>
              <div><span>Açık İşlem</span><strong>{paperSummary.open}</strong></div>
              <div><span>Tamamlanan</span><strong>{paperSummary.completed}</strong></div>
            </div>

            <div className="paper-v2-grid">
              <article className="paper-v2-card performance-card">
                <div className="paper-v2-card-head"><div><h3>Performans</h3><span>Kapanan işlemler sonrası sanal hesap equity eğrisi</span></div><strong>{paperPerformance.count} işlem</strong></div>
                {paperPerformance.count ? (
                  <svg className="paper-performance-chart" viewBox="0 0 600 120" preserveAspectRatio="none" aria-label="Paper trading performans grafiği">
                    <line x1="0" y1="60" x2="600" y2="60" className="paper-zero-line"/>
                    <polyline points={paperPerformance.points} fill="none" className={paperPerformance.equity >= paperInitialBalance ? "paper-equity-line positive-line" : "paper-equity-line negative-line"}/>
                  </svg>
                ) : <div className="paper-v2-empty">Henüz kapanmış sanal işlem yok.</div>}
              </article>

              <article className="paper-v2-card">
                <div className="paper-v2-card-head"><div><h3>Açık Pozisyonlar</h3><span>Hedef / stop ve pozisyon büyüklüğü</span></div><strong>{paperSummary.open}</strong></div>
                <div className="paper-v2-list">
                  {paperTrades.filter((t) => t.status === "open").length ? paperTrades.filter((t) => t.status === "open").map((trade) => (
                    <div className="paper-v2-row" key={trade.id}>
                      <div><strong>{trade.symbol} · {patternTurkish(trade.patternName)}</strong><small>{directionText(trade.direction)} · {timeframeLabel(trade.timeframe)}</small></div>
                      <div><span>Giriş</span><strong>₺{trade.entryPrice.toFixed(2)}</strong></div>
                      <div><span>Lot</span><strong>{trade.quantity ?? "—"}</strong></div>
                      <div><span>Tutar</span><strong>{trade.investedAmount ? `₺${trade.investedAmount.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}` : "—"}</strong></div>
                      <div><span>Hedef</span><strong className="positive">₺{trade.targetPrice.toFixed(2)}</strong></div>
                      <div><span>Stop</span><strong className="negative">₺{trade.stopPrice.toFixed(2)}</strong></div>
                      <div><span>Risk</span><strong>{trade.riskAmount != null ? `₺${trade.riskAmount.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}` : "—"}</strong></div>
                      <div><span>Sinyal</span><strong>{trade.signalGrade ?? "—"}{trade.signalScore != null ? ` · ${trade.signalScore.toFixed(1)}` : ""}</strong></div>
                    </div>
                  )) : <div className="paper-v2-empty">Açık sanal pozisyon yok.</div>}
                </div>
              </article>
            </div>

            <article className="paper-v2-card paper-pattern-card">
              <div className="paper-v2-card-head"><div><h3>Formasyon Bazlı Performans</h3><span>Kapanan sanal işlemlerde hangi formasyon ne yaptı?</span></div><strong>{paperPatternPerformance.length} formasyon</strong></div>
              <div className="paper-v2-table-wrap">
                <table className="paper-v2-table">
                  <thead><tr><th>Formasyon</th><th>İşlem</th><th>Kazanma</th><th>Profit Factor</th><th>Net K/Z</th></tr></thead>
                  <tbody>
                    {paperPatternPerformance.length ? paperPatternPerformance.map((row) => (
                      <tr key={row.name}>
                        <td><strong>{patternTurkish(row.name)}</strong></td>
                        <td>{row.trades}</td>
                        <td>%{row.winRate.toFixed(1)}</td>
                        <td>{row.profitFactor == null ? "∞" : row.profitFactor.toFixed(2)}</td>
                        <td><strong className={row.pnl >= 0 ? "positive" : "negative"}>{row.pnl >= 0 ? "+" : ""}₺{row.pnl.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</strong></td>
                      </tr>
                    )) : <tr><td colSpan={5}><div className="paper-v2-empty">Formasyon performansı için kapanmış sanal işlem bekleniyor.</div></td></tr>}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="paper-v2-card history-card">
              <div className="paper-v2-card-head"><div><h3>İşlem Geçmişi</h3><span>En yeni işlemler üstte</span></div><strong>{paperTrades.length} kayıt</strong></div>
              <div className="paper-v2-table-wrap">
                <table className="paper-v2-table">
                  <thead><tr><th>Hisse</th><th>Formasyon</th><th>Sinyal</th><th>Yön</th><th>Giriş</th><th>Hedef</th><th>Stop</th><th>Lot</th><th>Risk</th><th>Durum</th><th>K/Z</th></tr></thead>
                  <tbody>
                    {paperTrades.length ? paperTrades.slice(0, 100).map((trade) => (
                      <tr key={trade.id}>
                        <td><strong>{trade.symbol}</strong><small>{timeframeLabel(trade.timeframe)}</small></td>
                        <td>{patternTurkish(trade.patternName)}<small>geçmiş %{trade.backtestRate.toFixed(1)} · n={trade.samples}</small></td>
                        <td>{trade.signalGrade ?? "—"}{trade.signalScore != null ? <small>{trade.signalScore.toFixed(1)} puan</small> : null}</td>
                        <td><span className={`direction-badge compact ${directionClass(trade.direction)}`}>{directionText(trade.direction)}</span></td>
                        <td>₺{trade.entryPrice.toFixed(2)}</td><td>₺{trade.targetPrice.toFixed(2)}</td><td>₺{trade.stopPrice.toFixed(2)}</td>
                        <td>{trade.quantity ?? "—"}</td><td>{trade.riskAmount != null ? `₺${trade.riskAmount.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}` : "—"}</td>
                        <td>{paperStatusText(trade.status)}</td>
                        <td><strong className={(trade.pnlPct ?? 0) >= 0 ? "positive" : "negative"}>{trade.pnlPct == null ? "—" : `${trade.pnlPct >= 0 ? "+" : ""}${trade.pnlPct.toFixed(2)}%`}{trade.pnlAmount != null ? <small>{trade.pnlAmount >= 0 ? "+" : ""}₺{trade.pnlAmount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}</small> : null}</strong></td>
                      </tr>
                    )) : <tr><td colSpan={11}><div className="paper-v2-empty">Henüz sanal işlem kaydı yok. Otomatik Paper Trading açıkken yeterli geçmiş veriye sahip yönlü formasyon beklenir.</div></td></tr>}
                  </tbody>
                </table>
              </div>
            </article>

            <p className="scanner-note">V20 Paper Trading V3 yalnızca simülasyondur; gerçek emir göndermez. Lot, stop mesafesi ve işlem başına risk bütçesine göre hesaplanır; maksimum pozisyon yüzdesi ayrıca sermaye kullanımını sınırlar. İşlem yalnız en az iki ufukta yeterli örnek, pozitif yönsel hareket ve seçilen minimum geçmiş başarı koşulu varsa açılır. Geçmiş sonuçlar gelecekteki getiriyi garanti etmez.</p>
          </section>
        ) : activeView === "notifications" ? (
          <section className="wide-view panel notifications-view">
            <div className="wide-view-header">
              <div>
                <h2>Bildirim Merkezi V2</h2>
                <p>Yeni güçlü sinyaller ve Paper Trading olayları tek geçmişte tutulur. Aynı olay ikinci kez bildirilmez.</p>
              </div>
              <div className="notification-history-actions">
                <span className="favorites-count">{notificationEvents.length} kayıt</span>
                <button className="open-symbol" onClick={markAllNotificationsRead}>Tümünü Okundu Yap</button>
                <button className="open-symbol danger-soft" onClick={clearNotificationHistory}>Geçmişi Temizle</button>
              </div>
            </div>

            <div className="notification-summary-grid">
              <div><span>Yeni Güçlü Sinyal</span><strong>{notificationEvents.filter((item) => item.type === "strong_signal").length}</strong></div>
              <div><span>Açılan Sanal İşlem</span><strong>{notificationEvents.filter((item) => item.type === "paper_open").length}</strong></div>
              <div><span>Hedef</span><strong className="positive">{notificationEvents.filter((item) => item.type === "paper_target").length}</strong></div>
              <div><span>Stop</span><strong className="negative">{notificationEvents.filter((item) => item.type === "paper_stop").length}</strong></div>
              <div><span>Diğer Kapanış</span><strong>{notificationEvents.filter((item) => item.type === "paper_close").length}</strong></div>
            </div>

            {notificationEvents.length === 0 ? (
              <div className="favorites-empty">
                <strong>Henüz bildirim geçmişi yok.</strong>
                <span>Yeni güçlü sinyal veya Paper Trading olayı oluştuğunda burada görünecek.</span>
              </div>
            ) : (
              <div className="notification-history-list">
                {notificationEvents.map((item) => (
                  <article key={item.id} className={`notification-history-row ${item.read ? "" : "unread"} ${item.type}`}>
                    <div className="notification-history-icon">{item.type === "strong_signal" ? "⚡" : item.type === "paper_open" ? "↗" : item.type === "paper_target" ? "✓" : item.type === "paper_stop" ? "!" : "•"}</div>
                    <div className="notification-history-copy">
                      <div><strong>{item.title}</strong>{item.symbol ? <span>{item.symbol}</span> : null}</div>
                      <p>{item.body}</p>
                    </div>
                    <time>{new Date(item.createdAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
                  </article>
                ))}
              </div>
            )}

            <p className="scanner-note">V14 Bildirim V2: otomatik Katılım 50 taramasında yeni Güçlü yönlü sinyal, sanal işlem açılışı, hedef, stop ve diğer kapanışlar kaydedilir. Tarayıcı bildirimi kapalı olsa bile uygulama içi geçmiş tutulur. Site tamamen kapalıyken arka planda bildirim için ileride sunucu scheduler/push altyapısı gerekir.</p>
          </section>
        ) : (
          <section className="wide-view panel stats-view stats-v3-view">
            <div className="wide-view-header stats-v2-header">
              <div>
                <h2>{selected} · Backtest / İstatistik V3</h2>
                <p>Formasyonları örnek sayısı, başarı, medyan hareket, MFE/MAE, bağlam başarısı ve ufuk tutarlılığıyla karşılaştırır.</p>
              </div>
              <div className="stats-v2-actions">
                <div className="stats-timeframes">
                  {[["10 dk", "10m"], ["15 dk", "15m"], ["1 saat", "1h"], ["4 saat", "4h"], ["1 gün", "1d"]].map(([label, value]) => (
                    <button key={value} className={timeframe === value ? "active" : ""} onClick={() => setTimeframe(value)}>{label}</button>
                  ))}
                </div>
                <button className="open-symbol" onClick={() => setActiveView("market")}>Grafiğe Dön</button>
              </div>
            </div>

            <div className="stats-v3-controls">
              <div className="stats-periods">
                <span>Geçmiş dönem</span>
                {[["Tümü", "all"], ["3 Ay", "3m"], ["6 Ay", "6m"], ["1 Yıl", "1y"]].map(([label, value]) => (
                  <button key={value} className={statsWindow === value ? "active" : ""} onClick={() => setStatsWindow(value as "all" | "3m" | "6m" | "1y")}>{label}</button>
                ))}
              </div>
              <label><span>Yön</span><select value={statsDirection} onChange={(e) => setStatsDirection(e.target.value as "all" | "bullish" | "bearish" | "neutral")}><option value="all">Tümü</option><option value="bullish">Yükseliş</option><option value="bearish">Düşüş</option><option value="neutral">Nötr</option></select></label>
              <label><span>Min. örnek</span><select value={statsMinSamples} onChange={(e) => setStatsMinSamples(Number(e.target.value))}><option value={10}>10</option><option value={20}>20</option><option value={30}>30</option><option value={50}>50</option></select></label>
              <label><span>Sırala</span><select value={statsSort} onChange={(e) => setStatsSort(e.target.value as "score" | "success" | "samples" | "rr")}><option value="score">İstatistik puanı</option><option value="success">Başarı oranı</option><option value="samples">Örnek sayısı</option><option value="rr">MFE / MAE</option></select></label>
            </div>

            <div className="stats-v3-coverage">
              <span>Kaynak kapsamı: <b>{activeStatsBacktest?.available_days == null ? "—" : `${activeStatsBacktest.available_days.toFixed(0)} gün`}</b></span>
              <span>Analiz edilen dönem: <b>{activeStatsBacktest?.effective_days == null ? "—" : `${activeStatsBacktest.effective_days.toFixed(0)} gün`}</b></span>
              {statsWindow !== "all" && activeStatsBacktest?.requested_days && (activeStatsBacktest.effective_days ?? 0) + 3 < activeStatsBacktest.requested_days ? <span className="coverage-warning">Veri sağlayıcısı seçilen dönemin tamamını sunmuyor.</span> : null}
            </div>

            <div className="stats-v2-summary stats-v3-summary">
              <div><span>Seçili hisse</span><strong>{selected}</strong><small>{timeframeLabel(timeframe)}</small></div>
              <div><span>Güvenilir ufuk</span><strong>{statsSummary.reliableHorizons}</strong><small>min. n={statsMinSamples}</small></div>
              <div><span>Toplam örnek</span><strong>{statsSummary.totalSamples}</strong><small>formasyon örnekleri</small></div>
              <div><span>En yüksek başarı</span><strong>{statsSummary.highestRate == null ? "—" : `%${statsSummary.highestRate.toFixed(1)}`}</strong><small>güvenilir ufuklar</small></div>
              <div><span>En iyi bağlam başarısı</span><strong>{statsSummary.contextBest == null ? "—" : `%${statsSummary.contextBest.toFixed(1)}`}</strong><small>önceki trend filtresi</small></div>
              <div><span>En yüksek puan</span><strong>{statsSummary.topScore == null ? "—" : statsSummary.topScore.toFixed(1)}</strong><small>{statsSummary.topPattern ? patternTurkish(statsSummary.topPattern) : "—"}</small></div>
            </div>

            {statsLoading ? <div className="scan-loading">{timeframeLabel(timeframe)} istatistikleri yükleniyor...</div> : null}
            {statsError ? <div className="scan-error">İstatistik verisi alınamadı: {statsError}</div> : null}

            {activeStatsBacktest ? (
              <>
                <div className="stats-ranking-wrap">
                  <div className="stats-ranking-title"><div><strong>Formasyon performans sıralaması</strong><span>Geçmiş verinin özeti; al/sat önerisi değildir.</span></div><b>{statsRankedPatterns.length} formasyon</b></div>
                  <div className="stats-ranking-table-wrap">
                    <table className="stats-ranking-table">
                      <thead><tr><th>#</th><th>Formasyon</th><th>Not</th><th>En iyi ufuk</th><th>Başarı</th><th>Örnek</th><th>Ort. / Medyan</th><th>MFE / MAE</th><th>Bağlam</th><th>Puan</th></tr></thead>
                      <tbody>
                        {statsRankedPatterns.map((item, index) => {
                          const m = item.bestMetric;
                          return <tr key={item.row.name}>
                            <td>{index + 1}</td>
                            <td><strong>{patternTurkish(item.row.name)}</strong><span className={`direction-badge compact ${directionClass(item.row.direction)}`}>{directionText(item.row.direction)}</span></td>
                            <td><span className={`stats-grade grade-${item.grade.toLowerCase()}`}>{item.grade}</span></td>
                            <td>{item.bestHorizon ? `+${item.bestHorizon} mum` : "—"}</td>
                            <td>{m?.success_rate == null ? "—" : `%${m.success_rate.toFixed(1)}`}</td>
                            <td>{m?.samples ?? 0}</td>
                            <td>{m?.avg_directional_return_pct == null ? "—" : `${m.avg_directional_return_pct >= 0 ? "+" : ""}${m.avg_directional_return_pct.toFixed(2)}%`} / {m?.median_directional_return_pct == null ? "—" : `${m.median_directional_return_pct >= 0 ? "+" : ""}${m.median_directional_return_pct.toFixed(2)}%`}</td>
                            <td>{m?.avg_mfe_pct == null ? "—" : `${m.avg_mfe_pct.toFixed(2)}%`} / {m?.avg_mae_pct == null ? "—" : `${m.avg_mae_pct.toFixed(2)}%`}{item.rr != null ? <small> R/R≈{item.rr.toFixed(2)}</small> : null}</td>
                            <td>{m?.context_success_rate == null ? "—" : `%${m.context_success_rate.toFixed(1)}`}<small>{m?.context_samples ? ` n=${m.context_samples}` : ""}</small></td>
                            <td><b>{item.score.toFixed(1)}</b></td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="analysis-grid stats-v2-grid">
                  {statsRankedPatterns.map(({ row, bestHorizon }) => {
                    const minimum = Math.max(statsMinSamples, activeStatsBacktest.minimum_samples ?? 20);
                    const horizonRows = (["1", "2", "3"] as const).map((h) => ({ h, m: row.horizons?.[h] }));
                    return (
                      <article className="analysis-card stats-v2-card" key={row.name}>
                        <div className="analysis-card-head"><div><strong>{patternTurkish(row.name)}</strong><span className={`direction-badge compact ${directionClass(row.direction)}`}>{directionText(row.direction)}</span>{bestHorizon ? <span className="best-horizon-badge">En iyi: +{bestHorizon} mum</span> : null}</div><small>Toplam n={row.total_samples ?? 0}</small></div>
                        <div className="horizon-grid stats-v2-horizons">
                          {horizonRows.map(({ h, m }) => {
                            const reliable = !!m && m.samples >= minimum && m.success_rate != null;
                            return <div key={h} className={reliable ? "reliable" : ""}>
                              <div className="horizon-title"><span>+{h} mum</span><b>{reliable ? "Güvenilir" : "Örnek az"}</b></div>
                              <strong>{m?.success_rate == null ? "—" : `%${m.success_rate.toFixed(1)}`}</strong>
                              <small>n={m?.samples ?? 0} · {m?.wins ?? 0} başarılı</small>
                              <small>Ort. yön {m?.avg_directional_return_pct == null ? "—" : `${m.avg_directional_return_pct >= 0 ? "+" : ""}${m.avg_directional_return_pct.toFixed(2)}%`}</small>
                              <small>Medyan yön {m?.median_directional_return_pct == null ? "—" : `${m.median_directional_return_pct >= 0 ? "+" : ""}${m.median_directional_return_pct.toFixed(2)}%`}</small>
                              <small>MFE {m?.avg_mfe_pct == null ? "—" : `${m.avg_mfe_pct.toFixed(2)}%`} · MAE {m?.avg_mae_pct == null ? "—" : `${m.avg_mae_pct.toFixed(2)}%`}</small>
                              <small>Bağlam {m?.context_success_rate == null ? "—" : `%${m.context_success_rate.toFixed(1)}`} · n={m?.context_samples ?? 0}</small>
                            </div>;
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : <div className="scan-loading">Backtest verisi henüz yüklenmedi.</div>}
            <p className="scanner-note stats-v2-note">V19 İstatistik V3: puan yalnızca geçmiş istatistikleri karşılaştırmak içindir. A/B/C/D notu; örnek sayısı, ufuk tutarlılığı, geçmiş başarı, ortalama hareket ve MFE/MAE dengesinin özetidir. Özellikle 10/15 dakikalık Yahoo geçmişi sınırlı olabilir; üstte gerçek veri kapsamı ayrıca gösterilir.</p>
          </section>
        )}
      </div>
    </main>
  );
}
