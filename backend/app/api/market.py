from fastapi import APIRouter, HTTPException, Query
import yfinance as yf
import pandas as pd
import time
import threading
from statistics import median

router = APIRouter(prefix="/api/market", tags=["market"])

CACHE = {}
LAST_GOOD = {}
QUOTE_LAST_GOOD = {}
YF_LOCK = threading.Lock()


def cache_seconds_for_timeframe(timeframe: str) -> int:
    return {
        "10m": 5,
        "15m": 5,
        "1h": 15,
        "4h": 30,
        "1d": 60,
    }.get(timeframe, 15)


# =========================================================
# CACHE
# =========================================================

def cache_get(key):
    item = CACHE.get(key)
    if not item:
        return None
    ttl = item.get("ttl", 30)
    if time.time() - item["time"] > ttl:
        CACHE.pop(key, None)
        return None
    return item["data"]


def cache_set(key, data, ttl=30):
    CACHE[key] = {
        "time": time.time(),
        "ttl": ttl,
        "data": data,
    }


def safe_yahoo_download(ticker: str, period: str, interval: str, attempts: int = 3):
    """Yahoo/yfinance geçici hatalarında kısa aralıklarla tekrar dener.
    Aynı anda çok sayıda yfinance isteği açılmasını da engeller.
    """
    last_error = None

    for attempt in range(attempts):
        try:
            with YF_LOCK:
                df = yf.download(
                    ticker,
                    period=period,
                    interval=interval,
                    auto_adjust=False,
                    progress=False,
                    threads=False,
                )

            if df is not None and not df.empty:
                return df
        except Exception as exc:
            last_error = exc

        if attempt < attempts - 1:
            time.sleep(0.7 * (attempt + 1))

    if last_error is not None:
        raise last_error

    return pd.DataFrame()


def safe_yahoo_batch_download(tickers: list[str], period: str = "1d", interval: str = "5m", attempts: int = 2):
    """Birden fazla sembolü tek Yahoo çağrısında indirir.
    Sol listedeki 50 hisse için 50 ayrı istek açılmasını önler.
    """
    if not tickers:
        return pd.DataFrame()

    last_error = None
    joined = " ".join(tickers)

    for attempt in range(attempts):
        try:
            with YF_LOCK:
                df = yf.download(
                    joined,
                    period=period,
                    interval=interval,
                    group_by="ticker",
                    auto_adjust=False,
                    progress=False,
                    threads=False,
                )
            if df is not None and not df.empty:
                return df
        except Exception as exc:
            last_error = exc

        if attempt < attempts - 1:
            time.sleep(0.8)

    if last_error is not None:
        raise last_error
    return pd.DataFrame()


def extract_batch_last_price(df: pd.DataFrame, ticker: str):
    """yfinance çoklu indirme sonucundan tek sembolün son kapanışını güvenli çıkarır."""
    if df is None or df.empty:
        return None, None

    try:
        sub = None
        if isinstance(df.columns, pd.MultiIndex):
            level0 = set(map(str, df.columns.get_level_values(0)))
            level1 = set(map(str, df.columns.get_level_values(1)))

            if ticker in level0:
                sub = df[ticker]
            elif ticker in level1:
                sub = df.xs(ticker, axis=1, level=1)
        else:
            sub = df

        if sub is None or sub.empty or "Close" not in sub.columns:
            return None, None

        close = sub["Close"].dropna()
        if close.empty:
            return None, None

        value = close.iloc[-1]
        if hasattr(value, "iloc"):
            value = value.iloc[-1]
        idx = close.index[-1]
        return round(float(value), 4), int(idx.timestamp())
    except Exception:
        return None, None


def extract_batch_quote(df: pd.DataFrame, ticker: str):
    """Son fiyat + gün içi yaklaşık yüzde değişim + zaman bilgisini çıkarır."""
    if df is None or df.empty:
        return None, None, None

    try:
        sub = None
        if isinstance(df.columns, pd.MultiIndex):
            level0 = set(map(str, df.columns.get_level_values(0)))
            level1 = set(map(str, df.columns.get_level_values(1)))
            if ticker in level0:
                sub = df[ticker]
            elif ticker in level1:
                sub = df.xs(ticker, axis=1, level=1)
        else:
            sub = df

        if sub is None or sub.empty or "Close" not in sub.columns:
            return None, None, None

        close = sub["Close"].dropna()
        if close.empty:
            return None, None, None

        last_value = close.iloc[-1]
        if hasattr(last_value, "iloc"):
            last_value = last_value.iloc[-1]

        first_value = None
        if "Open" in sub.columns:
            opens = sub["Open"].dropna()
            if not opens.empty:
                first_value = opens.iloc[0]
                if hasattr(first_value, "iloc"):
                    first_value = first_value.iloc[0]

        price = float(last_value)
        change_pct = None
        if first_value is not None and float(first_value) != 0:
            change_pct = ((price - float(first_value)) / float(first_value)) * 100

        idx = close.index[-1]
        return round(price, 4), (round(change_pct, 3) if change_pct is not None else None), int(idx.timestamp())
    except Exception:
        return None, None, None


# =========================================================
# VERİ AYARLARI
# =========================================================

def get_period_interval(timeframe: str, extended: bool = False):

    if timeframe == "10m":
        # Yahoo 10 dakikalık veri vermediği için 5 dakikalık veriyi
        # 10 dakikalık mumlara kendimiz birleştiriyoruz.
        return ("60d", "5m") if extended else ("30d", "5m")

    if timeframe == "15m":
        return ("60d", "15m") if extended else ("30d", "15m")

    if timeframe == "1h":
        return ("2y", "1h") if extended else ("90d", "1h")

    if timeframe == "4h":
        # 4 saatlik mumları 1 saatlik veriden kendimiz oluşturacağız.
        return ("2y", "1h") if extended else ("90d", "1h")

    if timeframe == "1d":
        return ("10y", "1d") if extended else ("2y", "1d")

    raise ValueError("Geçersiz zaman dilimi")


MIN_BACKTEST_SAMPLES = 20




# =========================================================
# 10 DAKİKALIK MUM
# =========================================================

def resample_10m(df: pd.DataFrame):
    """
    5 dakikalık veriyi saat duvarına hizalı 10 dakikalık mumlara çevirir.
    Böylece BIST seansında 10:00-10:10, 10:10-10:20 ... blokları oluşur.
    """
    df = df.copy().sort_index()
    result = []

    for _, daily in df.groupby(df.index.date):
        daily = daily.sort_index()
        if daily.empty:
            continue

        # Saat/dakika bazlı gerçek 10 dakikalık blok.
        bucket = daily.index.floor("10min")
        daily = daily.copy()
        daily["_bucket"] = bucket

        for bucket_time, group in daily.groupby("_bucket"):
            if group.empty:
                continue
            result.append({
                "Date": bucket_time,
                "Open": float(group["Open"].iloc[0]),
                "High": float(group["High"].max()),
                "Low": float(group["Low"].min()),
                "Close": float(group["Close"].iloc[-1]),
                "Volume": float(group["Volume"].sum()),
            })

    if not result:
        return pd.DataFrame()

    return pd.DataFrame(result).set_index("Date").sort_index()


# =========================================================
# 4 SAATLİK MUM
# =========================================================

def resample_4h(df: pd.DataFrame):
    """
    Mumları gece 00:00'a göre değil,
    her işlem günündeki ilk 1 saatlik mumdan başlayarak
    4'erli gruplar halinde birleştirir.
    """

    df = df.copy()
    df = df.sort_index()

    result = []

    # Her işlem gününü ayrı değerlendir.
    for _, daily in df.groupby(df.index.date):

        daily = daily.sort_index()

        if daily.empty:
            continue

        # 1 saatlik mumları 4'erli gruplara ayır.
        group_ids = [
            i // 4
            for i in range(len(daily))
        ]

        daily = daily.copy()
        daily["_group"] = group_ids

        for _, group in daily.groupby("_group"):

            if group.empty:
                continue

            result.append(
                {
                    "Date": group.index[0],
                    "Open": float(group["Open"].iloc[0]),
                    "High": float(group["High"].max()),
                    "Low": float(group["Low"].min()),
                    "Close": float(group["Close"].iloc[-1]),
                    "Volume": float(group["Volume"].sum()),
                }
            )

    if not result:
        return pd.DataFrame()

    output = pd.DataFrame(result)
    output = output.set_index("Date")

    return output


# =========================================================
# DATAFRAME -> CANDLE
# =========================================================

def dataframe_to_candles(df: pd.DataFrame, limit: int):

    candles = []

    df = df.tail(limit)

    for index, row in df.iterrows():

        try:
            timestamp = int(index.timestamp())
        except Exception:
            continue

        candles.append(
            {
                "time": timestamp,

                "open": round(
                    float(row["Open"]),
                    4,
                ),

                "high": round(
                    float(row["High"]),
                    4,
                ),

                "low": round(
                    float(row["Low"]),
                    4,
                ),

                "close": round(
                    float(row["Close"]),
                    4,
                ),

                "volume": (
                    int(row["Volume"])
                    if not pd.isna(row["Volume"])
                    else 0
                ),
            }
        )

    return candles


# =========================================================
# MUM MATEMATİĞİ
# =========================================================

def candle_info(c):

    o = float(c["open"])
    h = float(c["high"])
    l = float(c["low"])
    cl = float(c["close"])

    total_range = max(
        h - l,
        0.0000001,
    )

    body = abs(
        cl - o
    )

    upper_wick = (
        h - max(o, cl)
    )

    lower_wick = (
        min(o, cl) - l
    )

    body_top = max(
        o,
        cl,
    )

    body_bottom = min(
        o,
        cl,
    )

    return {
        "open": o,
        "high": h,
        "low": l,
        "close": cl,

        "body": body,
        "range": total_range,

        "upper": upper_wick,
        "lower": lower_wick,

        "body_top": body_top,
        "body_bottom": body_bottom,

        "body_ratio": (
            body / total_range
        ),

        "upper_ratio": (
            upper_wick / total_range
        ),

        "lower_ratio": (
            lower_wick / total_range
        ),

        "bullish": (
            cl > o
        ),

        "bearish": (
            cl < o
        ),
    }


# =========================================================
# TREND
# =========================================================

def trend_before(
    candles,
    index,
    lookback=5,
):

    if index < lookback:
        return "neutral"

    recent = candles[
        index - lookback:index
    ]

    closes = [
        c["close"]
        for c in recent
    ]

    first = closes[0]
    last = closes[-1]

    if first <= 0:
        return "neutral"

    change_pct = (
        (last - first)
        / first
    ) * 100

    rising = 0
    falling = 0

    for i in range(
        1,
        len(closes),
    ):

        if closes[i] > closes[i - 1]:
            rising += 1

        elif closes[i] < closes[i - 1]:
            falling += 1

    # Daha net trend şartı.
    if (
        falling >= 3
        and change_pct <= -0.5
    ):
        return "down"

    if (
        rising >= 3
        and change_pct >= 0.5
    ):
        return "up"

    return "neutral"


# =========================================================
# YARDIMCILAR
# =========================================================

DOJI_BODY_RATIO_MAX = 0.10
EPSILON = 1e-9


def clamp(value, minimum=0.0, maximum=1.0):
    return max(minimum, min(maximum, value))


def strong_body(candle, minimum=0.50):
    return candle["body_ratio"] >= minimum


def midpoint(candle):
    return (candle["open"] + candle["close"]) / 2


def recent_median_range(candles, index, lookback=12):
    start = max(0, index - lookback)
    values = [
        candle_info(c)["range"]
        for c in candles[start:index]
        if candle_info(c)["range"] > EPSILON
    ]
    return median(values) if values else None


def meaningful_range(candles, index, current):
    """Aşırı küçük / veri gürültüsü niteliğindeki mumları süzer.

    Sadece mum verisi kullanılır; RSI/EMA gibi indikatör eklenmez.
    """
    med = recent_median_range(candles, index)
    if med is None or med <= EPSILON:
        return current["range"] > EPSILON
    return current["range"] >= med * 0.35


def range_significance(candles, index, current):
    med = recent_median_range(candles, index)
    if med is None or med <= EPSILON:
        return 1.0
    return clamp(current["range"] / med, 0.0, 1.5) / 1.5


def quality_label(score):
    if score >= 85:
        return "Çok Yüksek"
    if score >= 75:
        return "Yüksek"
    if score >= 65:
        return "Orta"
    return "Düşük"


def pattern_result(name, direction, score, reasons):
    score = int(round(clamp(float(score), 0.0, 100.0)))
    return {
        "name": name,
        "direction": direction,
        "quality_score": score,
        "quality_label": quality_label(score),
        "reasons": reasons,
    }


# =========================================================
# FORMASYON MOTORU V2
# =========================================================

def detect_patterns_at(candles, index):
    """Saf mum geometrisi + önceki mumların fiyat bağlamıyla formasyon tespiti.

    V2 hedefleri:
    - Kapanmış mum kontrolü scan_all_patterns içinde zorunludur.
    - Doji eşiği %10 gövde/aralık oranıdır.
    - Aşırı küçük/gürültü mumları elenir.
    - Dönüş formasyonlarında önceki trend zorunlu tutulur.
    - Aynı geometrinin bağlama göre farklı adlandırılması korunur.
    - Her tespitte 0-100 kalite puanı ve kısa gerekçe döner.
    """
    found = []
    current = candle_info(candles[index])
    previous = candle_info(candles[index - 1]) if index >= 1 else None
    third = candle_info(candles[index - 2]) if index >= 2 else None
    prior_trend = trend_before(candles, index, 5)

    if not meaningful_range(candles, index, current):
        return found

    significance = range_significance(candles, index, current)

    # -----------------------------------------------------
    # DOJI AİLESİ
    # -----------------------------------------------------
    is_doji = current["body_ratio"] <= DOJI_BODY_RATIO_MAX
    if is_doji:
        tiny_body_bonus = (1.0 - (current["body_ratio"] / DOJI_BODY_RATIO_MAX)) * 20
        common_score = 60 + tiny_body_bonus + significance * 10

        if current["lower_ratio"] >= 0.60 and current["upper_ratio"] <= 0.12:
            direction = "bullish" if prior_trend == "down" else "neutral"
            score = common_score + 8 + (7 if prior_trend == "down" else 0)
            found.append(pattern_result(
                "Dragonfly Doji",
                direction,
                score,
                ["Gövde çok küçük", "Alt fitil belirgin uzun", "Üst fitil kısa"]
                + (["Öncesinde düşüş eğilimi"] if prior_trend == "down" else []),
            ))

        elif current["upper_ratio"] >= 0.60 and current["lower_ratio"] <= 0.12:
            direction = "bearish" if prior_trend == "up" else "neutral"
            score = common_score + 8 + (7 if prior_trend == "up" else 0)
            found.append(pattern_result(
                "Gravestone Doji",
                direction,
                score,
                ["Gövde çok küçük", "Üst fitil belirgin uzun", "Alt fitil kısa"]
                + (["Öncesinde yükseliş eğilimi"] if prior_trend == "up" else []),
            ))

        elif current["upper_ratio"] >= 0.28 and current["lower_ratio"] >= 0.28:
            score = common_score + 7
            found.append(pattern_result(
                "Long-Legged Doji",
                "neutral",
                score,
                ["Gövde çok küçük", "Üst ve alt fitiller belirgin"],
            ))

        else:
            found.append(pattern_result(
                "Doji",
                "neutral",
                common_score,
                ["Açılış ve kapanış birbirine çok yakın"],
            ))

    # -----------------------------------------------------
    # HAMMER / HANGING MAN
    # Doji ile çakışmaması için gövde %10'dan büyük olmalı.
    # -----------------------------------------------------
    hammer_shape = (
        current["body_ratio"] > DOJI_BODY_RATIO_MAX
        and current["body_ratio"] <= 0.35
        and current["lower"] >= max(current["body"] * 2.0, EPSILON)
        and current["lower_ratio"] >= 0.55
        and current["upper_ratio"] <= 0.12
        and current["body_top"] >= current["low"] + current["range"] * 0.68
    )

    if hammer_shape and prior_trend in {"down", "up"}:
        shape_score = 58 + clamp(current["lower_ratio"] / 0.75, 0, 1) * 15 + significance * 7
        if prior_trend == "down":
            found.append(pattern_result(
                "Hammer", "bullish", shape_score + 15,
                ["Uzun alt fitil", "Küçük üst fitil", "Gövde mumun üst bölümünde", "Öncesinde düşüş eğilimi"],
            ))
        else:
            found.append(pattern_result(
                "Hanging Man", "bearish", shape_score + 15,
                ["Uzun alt fitil", "Küçük üst fitil", "Gövde mumun üst bölümünde", "Öncesinde yükseliş eğilimi"],
            ))

    # -----------------------------------------------------
    # INVERTED HAMMER / SHOOTING STAR
    # -----------------------------------------------------
    inverted_shape = (
        current["body_ratio"] > DOJI_BODY_RATIO_MAX
        and current["body_ratio"] <= 0.35
        and current["upper"] >= max(current["body"] * 2.0, EPSILON)
        and current["upper_ratio"] >= 0.55
        and current["lower_ratio"] <= 0.12
        and current["body_bottom"] <= current["low"] + current["range"] * 0.32
    )

    if inverted_shape and prior_trend in {"down", "up"}:
        shape_score = 58 + clamp(current["upper_ratio"] / 0.75, 0, 1) * 15 + significance * 7
        if prior_trend == "down":
            found.append(pattern_result(
                "Inverted Hammer", "bullish", shape_score + 15,
                ["Uzun üst fitil", "Küçük alt fitil", "Gövde mumun alt bölümünde", "Öncesinde düşüş eğilimi"],
            ))
        else:
            found.append(pattern_result(
                "Shooting Star", "bearish", shape_score + 15,
                ["Uzun üst fitil", "Küçük alt fitil", "Gövde mumun alt bölümünde", "Öncesinde yükseliş eğilimi"],
            ))

    # -----------------------------------------------------
    # ENGULFING
    # -----------------------------------------------------
    if previous:
        prev_body_ok = previous["body_ratio"] >= 0.20
        current_body_ok = current["body_ratio"] >= 0.35
        engulfs = (
            current["body_bottom"] <= previous["body_bottom"]
            and current["body_top"] >= previous["body_top"]
            and current["body"] >= previous["body"] * 1.05
        )

        if prior_trend == "down" and previous["bearish"] and current["bullish"] and prev_body_ok and current_body_ok and engulfs:
            size_ratio = current["body"] / max(previous["body"], EPSILON)
            score = 68 + clamp((size_ratio - 1.05) / 0.95, 0, 1) * 12 + significance * 5 + 15
            found.append(pattern_result(
                "Bullish Engulfing", "bullish", score,
                ["Yeşil gövde önceki kırmızı gövdeyi tamamen yutuyor", "Yeni gövde en az %5 daha büyük", "Öncesinde düşüş eğilimi"],
            ))

        if prior_trend == "up" and previous["bullish"] and current["bearish"] and prev_body_ok and current_body_ok and engulfs:
            size_ratio = current["body"] / max(previous["body"], EPSILON)
            score = 68 + clamp((size_ratio - 1.05) / 0.95, 0, 1) * 12 + significance * 5 + 15
            found.append(pattern_result(
                "Bearish Engulfing", "bearish", score,
                ["Kırmızı gövde önceki yeşil gövdeyi tamamen yutuyor", "Yeni gövde en az %5 daha büyük", "Öncesinde yükseliş eğilimi"],
            ))

    # -----------------------------------------------------
    # MORNING / EVENING STAR
    # BIST'te gap zorunlu tutulmaz; üç mum geometrisi esas alınır.
    # -----------------------------------------------------
    if third and previous and index >= 2:
        trend_before_three = trend_before(candles, index - 2, 5)
        middle_small = (
            previous["body"] <= third["body"] * 0.45
            and previous["body_ratio"] <= 0.35
        )

        morning_star = (
            trend_before_three == "down"
            and third["bearish"] and strong_body(third, 0.50)
            and middle_small
            and current["bullish"] and strong_body(current, 0.45)
            and current["close"] > midpoint(third)
        )
        if morning_star:
            penetration = (current["close"] - midpoint(third)) / max(third["body"] / 2, EPSILON)
            score = 76 + clamp(penetration, 0, 1) * 9 + significance * 5 + 10
            found.append(pattern_result(
                "Morning Star", "bullish", score,
                ["Güçlü kırmızı ilk mum", "Küçük gövdeli orta mum", "Güçlü yeşil üçüncü mum", "İlk gövdenin orta noktasının üzerinde kapanış", "Öncesinde düşüş eğilimi"],
            ))

        evening_star = (
            trend_before_three == "up"
            and third["bullish"] and strong_body(third, 0.50)
            and middle_small
            and current["bearish"] and strong_body(current, 0.45)
            and current["close"] < midpoint(third)
        )
        if evening_star:
            penetration = (midpoint(third) - current["close"]) / max(third["body"] / 2, EPSILON)
            score = 76 + clamp(penetration, 0, 1) * 9 + significance * 5 + 10
            found.append(pattern_result(
                "Evening Star", "bearish", score,
                ["Güçlü yeşil ilk mum", "Küçük gövdeli orta mum", "Güçlü kırmızı üçüncü mum", "İlk gövdenin orta noktasının altında kapanış", "Öncesinde yükseliş eğilimi"],
            ))

    # -----------------------------------------------------
    # THREE WHITE SOLDIERS / THREE BLACK CROWS
    # -----------------------------------------------------
    if third and previous and index >= 2:
        trend_before_three = trend_before(candles, index - 2, 5)

        three_white = (
            trend_before_three in {"down", "neutral"}
            and third["bullish"] and previous["bullish"] and current["bullish"]
            and strong_body(third, 0.50) and strong_body(previous, 0.50) and strong_body(current, 0.50)
            and previous["close"] > third["close"] and current["close"] > previous["close"]
            and third["body_bottom"] <= previous["open"] <= third["body_top"]
            and previous["body_bottom"] <= current["open"] <= previous["body_top"]
            and third["upper_ratio"] <= 0.22 and previous["upper_ratio"] <= 0.22 and current["upper_ratio"] <= 0.22
            and previous["body"] >= third["body"] * 0.50
            and current["body"] >= previous["body"] * 0.50
        )
        if three_white:
            found.append(pattern_result(
                "Three White Soldiers", "bullish", 88 + significance * 8,
                ["Ardışık üç güçlü yeşil mum", "Kapanışlar sürekli yükseliyor", "Açılışlar önceki gövde içinde", "Üst fitiller sınırlı"],
            ))

        three_black = (
            trend_before_three in {"up", "neutral"}
            and third["bearish"] and previous["bearish"] and current["bearish"]
            and strong_body(third, 0.50) and strong_body(previous, 0.50) and strong_body(current, 0.50)
            and previous["close"] < third["close"] and current["close"] < previous["close"]
            and third["body_bottom"] <= previous["open"] <= third["body_top"]
            and previous["body_bottom"] <= current["open"] <= previous["body_top"]
            and third["lower_ratio"] <= 0.22 and previous["lower_ratio"] <= 0.22 and current["lower_ratio"] <= 0.22
            and previous["body"] >= third["body"] * 0.50
            and current["body"] >= previous["body"] * 0.50
        )
        if three_black:
            found.append(pattern_result(
                "Three Black Crows", "bearish", 88 + significance * 8,
                ["Ardışık üç güçlü kırmızı mum", "Kapanışlar sürekli düşüyor", "Açılışlar önceki gövde içinde", "Alt fitiller sınırlı"],
            ))

    return found


# =========================================================
# KAPANMIŞ MUM KONTROLÜ
# =========================================================

def timeframe_seconds(
    timeframe,
):

    return {
        "10m": 10 * 60,
        "15m": 15 * 60,
        "1h": 60 * 60,
        "4h": 4 * 60 * 60,
        "1d": 24 * 60 * 60,
    }[timeframe]


def candle_is_closed(
    candle,
    timeframe,
):

    interval = timeframe_seconds(
        timeframe
    )

    now = int(
        time.time()
    )

    # Küçük güvenlik payı.
    return (
        candle["time"]
        + interval
        <= now - 30
    )


# =========================================================
# TÜM FORMASYONLARI TARA
# =========================================================

def scan_all_patterns(
    candles,
    timeframe,
):

    results = []

    for i in range(
        len(candles)
    ):

        # Kapanmamış mum asla formasyon sayılmaz.
        if not candle_is_closed(
            candles[i],
            timeframe,
        ):
            continue

        detected = (
            detect_patterns_at(
                candles,
                i,
            )
        )

        for pattern in detected:

            results.append(
                {
                    "name": pattern["name"],

                    "direction": pattern[
                        "direction"
                    ],

                    "time": candles[i][
                        "time"
                    ],

                    "price": candles[i][
                        "close"
                    ],

                    "open": candles[i][
                        "open"
                    ],

                    "high": candles[i][
                        "high"
                    ],

                    "low": candles[i][
                        "low"
                    ],

                    "close": candles[i][
                        "close"
                    ],

                    "quality_score": pattern.get(
                        "quality_score"
                    ),

                    "quality_label": pattern.get(
                        "quality_label"
                    ),

                    "reasons": pattern.get(
                        "reasons",
                        [],
                    ),
                }
            )

    return results




# =========================================================
# FORMASYON BAĞLAMI
# =========================================================

def context_threshold_pct(timeframe: str):
    """Zaman dilimine göre önceki hareket için minimum yüzde eşik."""
    return {
        "10m": 0.50,
        "15m": 0.60,
        "1h": 1.00,
        "4h": 1.50,
        "1d": 3.00,
    }.get(timeframe, 1.00)


def evaluate_pattern_context(candles, index, direction, timeframe, lookback=8):
    """
    Formasyonun gerçekten uygun bir önceki trendin sonunda oluşup oluşmadığını
    daha sıkı bir bağlam filtresiyle kontrol eder.

    Yükseliş dönüşü için: önceki bölüm belirgin düşüş olmalı.
    Düşüş dönüşü için: önceki bölüm belirgin yükseliş olmalı.
    """
    if direction not in {"bullish", "bearish"} or index < lookback:
        return {
            "valid": False,
            "trend": "neutral",
            "change_pct": 0.0,
            "same_direction_steps": 0,
            "lookback": lookback,
        }

    prior = candles[index - lookback:index]
    closes = [float(c["close"]) for c in prior]

    if not closes or closes[0] <= 0:
        return {
            "valid": False,
            "trend": "neutral",
            "change_pct": 0.0,
            "same_direction_steps": 0,
            "lookback": lookback,
        }

    change_pct = ((closes[-1] - closes[0]) / closes[0]) * 100
    rising = 0
    falling = 0

    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            rising += 1
        elif closes[i] < closes[i - 1]:
            falling += 1

    threshold = context_threshold_pct(timeframe)
    required_steps = 4

    if direction == "bullish":
        valid = change_pct <= -threshold and falling >= required_steps
        trend = "down" if valid else "neutral"
        same_steps = falling
    else:
        valid = change_pct >= threshold and rising >= required_steps
        trend = "up" if valid else "neutral"
        same_steps = rising

    return {
        "valid": valid,
        "trend": trend,
        "change_pct": round(change_pct, 3),
        "same_direction_steps": same_steps,
        "lookback": lookback,
        "threshold_pct": threshold,
    }


# =========================================================
# FORMASYON BACKTEST
# =========================================================

def calculate_backtest(candles, patterns, timeframe, event_since=None):
    """
    Her formasyon için sonraki 1, 2 ve 3 kapanmış mumdaki yön başarısını ölçer.
    Ortalama yönsel hareketin yanında MFE/MAE hesaplar:
    - MFE: formasyon yönünde görülen en iyi ara hareket.
    - MAE: formasyon yönünün tersine görülen en kötü ara hareket.
    Ayrıca daha sıkı önceki-trend koşulunu geçen örnekleri ayrı olarak
    "bağlamlı" istatistiklerde hesaplar.
    """

    time_to_index = {
        candle["time"]: i
        for i, candle in enumerate(candles)
    }

    horizons = [1, 2, 3]
    grouped = {}

    for pattern in patterns:
        if event_since is not None and int(pattern.get("time", 0)) < int(event_since):
            continue

        name = pattern["name"]
        direction = pattern["direction"]
        event_index = time_to_index.get(pattern["time"])

        if event_index is None:
            continue

        if name not in grouped:
            grouped[name] = {
                "name": name,
                "direction": direction,
                "horizons": {
                    str(h): {
                        "samples": 0,
                        "wins": 0,
                        "success_rate": None,
                        "avg_directional_return_pct": None,
                        "median_directional_return_pct": None,
                        "avg_absolute_move_pct": None,
                        "median_absolute_move_pct": None,
                        "avg_mfe_pct": None,
                        "avg_mae_pct": None,
                        "context_samples": 0,
                        "context_wins": 0,
                        "context_success_rate": None,
                        "context_avg_directional_return_pct": None,
                    }
                    for h in horizons
                },
            }

        base_close = float(pattern["close"])
        if base_close <= 0:
            continue

        context = evaluate_pattern_context(
            candles,
            event_index,
            direction,
            timeframe,
        )
        context_valid = bool(context["valid"])

        for horizon in horizons:
            target_index = event_index + horizon
            if target_index >= len(candles):
                continue

            target = candles[target_index]
            if not candle_is_closed(target, timeframe):
                continue

            future_close = float(target["close"])
            raw_return_pct = ((future_close - base_close) / base_close) * 100

            # Formasyondan sonraki horizon boyunca görülen uç fiyatlar.
            future_window = candles[event_index + 1:target_index + 1]
            window_high = max(float(c["high"]) for c in future_window)
            window_low = min(float(c["low"]) for c in future_window)

            mfe_pct = None
            mae_pct = None

            if direction == "bullish":
                # Giriş/formasyon kapanışından yukarı en iyi hareket.
                mfe_pct = max(0.0, ((window_high - base_close) / base_close) * 100)
                # Aşağı ters hareket. Negatif tutulur.
                mae_pct = min(0.0, ((window_low - base_close) / base_close) * 100)

            elif direction == "bearish":
                # Düşüş yönünde en iyi hareket pozitif MFE olarak tutulur.
                mfe_pct = max(0.0, ((base_close - window_low) / base_close) * 100)
                # Yukarı ters hareket negatif MAE olarak tutulur.
                mae_pct = min(0.0, ((base_close - window_high) / base_close) * 100)

            item = grouped[name]["horizons"][str(horizon)]
            item["samples"] += 1

            directional_return = None
            won = False

            if direction == "bullish":
                directional_return = raw_return_pct
                won = raw_return_pct > 0
            elif direction == "bearish":
                directional_return = -raw_return_pct
                won = raw_return_pct < 0

            if won:
                item["wins"] += 1

            if "_dir_returns" not in item:
                item["_dir_returns"] = []
                item["_abs_moves"] = []
                item["_mfe_values"] = []
                item["_mae_values"] = []
                item["_context_dir_returns"] = []

            if directional_return is not None:
                item["_dir_returns"].append(directional_return)

            item["_abs_moves"].append(abs(raw_return_pct))

            if mfe_pct is not None:
                item["_mfe_values"].append(mfe_pct)

            if mae_pct is not None:
                item["_mae_values"].append(mae_pct)

            if context_valid and direction in {"bullish", "bearish"}:
                item["context_samples"] += 1
                if won:
                    item["context_wins"] += 1
                if directional_return is not None:
                    item["_context_dir_returns"].append(directional_return)

    results = []

    for data in grouped.values():
        for horizon in horizons:
            item = data["horizons"][str(horizon)]
            samples = item["samples"]
            context_samples = item["context_samples"]

            dir_returns = item.pop("_dir_returns", [])
            abs_moves = item.pop("_abs_moves", [])
            mfe_values = item.pop("_mfe_values", [])
            mae_values = item.pop("_mae_values", [])
            context_dir_returns = item.pop("_context_dir_returns", [])

            if samples > 0 and data["direction"] in {"bullish", "bearish"}:
                item["success_rate"] = round((item["wins"] / samples) * 100, 1)

            if context_samples > 0 and data["direction"] in {"bullish", "bearish"}:
                item["context_success_rate"] = round(
                    (item["context_wins"] / context_samples) * 100,
                    1,
                )

            item["is_reliable"] = (
                samples >= MIN_BACKTEST_SAMPLES
                if data["direction"] in {"bullish", "bearish"}
                else False
            )
            item["context_is_reliable"] = (
                context_samples >= MIN_BACKTEST_SAMPLES
                if data["direction"] in {"bullish", "bearish"}
                else False
            )

            if dir_returns:
                item["avg_directional_return_pct"] = round(
                    sum(dir_returns) / len(dir_returns),
                    3,
                )
                item["median_directional_return_pct"] = round(
                    float(median(dir_returns)),
                    3,
                )

            if context_dir_returns:
                item["context_avg_directional_return_pct"] = round(
                    sum(context_dir_returns) / len(context_dir_returns),
                    3,
                )

            if abs_moves:
                item["avg_absolute_move_pct"] = round(
                    sum(abs_moves) / len(abs_moves),
                    3,
                )
                item["median_absolute_move_pct"] = round(
                    float(median(abs_moves)),
                    3,
                )

            if mfe_values:
                item["avg_mfe_pct"] = round(
                    sum(mfe_values) / len(mfe_values),
                    3,
                )

            if mae_values:
                item["avg_mae_pct"] = round(
                    sum(mae_values) / len(mae_values),
                    3,
                )

        total_samples = max(
            data["horizons"][str(h)]["samples"]
            for h in horizons
        )
        context_total_samples = max(
            data["horizons"][str(h)]["context_samples"]
            for h in horizons
        )

        data["total_samples"] = total_samples
        data["context_total_samples"] = context_total_samples
        results.append(data)

    results.sort(
        key=lambda x: x["total_samples"],
        reverse=True,
    )

    return {
        "horizons": horizons,
        "minimum_samples": MIN_BACKTEST_SAMPLES,
        "candle_count": len(candles),
        "context": {
            "enabled": True,
            "lookback": 8,
            "threshold_pct": context_threshold_pct(timeframe),
            "minimum_direction_steps": 4,
            "description": (
                "Yükseliş formasyonunda önce belirgin düşüş; "
                "düşüş formasyonunda önce belirgin yükseliş aranır."
            ),
        },
        "definitions": {
            "bullish_success": "Gelecek kapanış formasyon kapanışından yüksek",
            "bearish_success": "Gelecek kapanış formasyon kapanışından düşük",
            "neutral_success": "Nötr formasyonlarda yön başarı oranı hesaplanmaz",
        },
        "patterns": results,
    }


def _historical_signal_strength(backtest_result, latest_patterns):
    """
    Son kapanmış mumdaki yönlü formasyonları yalnızca geçmiş istatistikleriyle
    sınıflandırır. Küçük örneklem ve tek ufuk yanılgısını azaltmak için
    örnek sayısı + ufuk tutarlılığı + MFE/MAE dengesi birlikte kontrol edilir.
    Bu bir al/sat tavsiyesi değildir; tarama sıralaması içindir.
    """
    directional = [
        p for p in (latest_patterns or [])
        if p.get("direction") in {"bullish", "bearish"}
    ]

    empty_label = "neutral" if latest_patterns else "none"
    if not directional:
        return {
            "label": empty_label,
            "score": 0.0,
            "pattern_name": latest_patterns[-1]["name"] if latest_patterns else None,
            "direction": latest_patterns[-1].get("direction", "neutral") if latest_patterns else None,
            "horizon": None,
            "success_rate": None,
            "samples": 0,
            "avg_directional_return_pct": None,
            "avg_mfe_pct": None,
            "avg_mae_pct": None,
            "reliable_horizons": 0,
            "positive_horizons": 0,
            "validation_reason": "Yönsüz formasyon; yön başarı puanı üretilmez." if latest_patterns else "Yeni formasyon yok.",
        }

    stats_by_name = {
        row.get("name"): row
        for row in (backtest_result or {}).get("patterns", [])
    }
    minimum = max(int((backtest_result or {}).get("minimum_samples", MIN_BACKTEST_SAMPLES)), 20)
    strong_minimum = max(minimum, 25)

    candidates = []
    for pattern in directional:
        row = stats_by_name.get(pattern.get("name"))
        if not row:
            continue

        # Aynı formasyonun +1/+2/+3 mum sonuçlarının birlikte tutarlı olup
        # olmadığını ölç. Tek bir ufuktaki şanslı sonucun "Güçlü" olmasını önler.
        horizon_checks = []
        for h in (1, 2, 3):
            hm = row.get("horizons", {}).get(str(h), {})
            hs = int(hm.get("samples") or 0)
            hr = hm.get("success_rate")
            har = hm.get("avg_directional_return_pct")
            reliable = hs >= minimum and hr is not None
            positive = reliable and float(hr) >= 55.0 and float(har or 0.0) > 0.0
            horizon_checks.append({"horizon": h, "reliable": reliable, "positive": positive})

        reliable_horizons = sum(1 for x in horizon_checks if x["reliable"])
        positive_horizons = sum(1 for x in horizon_checks if x["positive"])

        for horizon in (1, 2, 3):
            metric = row.get("horizons", {}).get(str(horizon), {})
            rate = metric.get("success_rate")
            samples = int(metric.get("samples") or 0)
            avg_ret = metric.get("avg_directional_return_pct")
            mfe = metric.get("avg_mfe_pct")
            mae = metric.get("avg_mae_pct")
            if rate is None:
                continue

            rate_value = float(rate)
            avg_ret_value = float(avg_ret or 0.0)
            mfe_value = float(mfe or 0.0)
            mae_abs = abs(float(mae or 0.0))

            # 20 örnek yalnızca güvenilirlik eşiği; puanın tam örneklem kredisi
            # alması için daha fazla gözlem gerekir.
            sample_confidence = min(samples / max(minimum * 3, 1), 1.0)
            consistency = positive_horizons / 3.0
            risk_quality = 0.5
            if mfe_value > 0 or mae_abs > 0:
                risk_quality = mfe_value / max(mfe_value + mae_abs, 1e-9)

            # Geçmiş veriyi özetleyen 0-100 arası sıralama puanı.
            # Başarı oranı tek başına baskın olmasın diye örneklem ve tutarlılık
            # toplam puanın önemli bölümünü oluşturur.
            score = (
                rate_value * 0.45
                + sample_confidence * 18.0
                + consistency * 15.0
                + max(min(avg_ret_value / 1.5, 1.0), -1.0) * 12.0
                + risk_quality * 10.0
            )

            # Minimum örneklem altındaki sonuçları puanla ama belirgin ceza uygula.
            if samples < minimum:
                score *= max(samples / max(minimum, 1), 0.25)

            score = round(max(0.0, min(score, 100.0)), 1)

            if samples < minimum:
                label = "insufficient"
                reason = f"Örnek az: n={samples}, minimum {minimum}."
            elif (
                samples >= strong_minimum
                and rate_value >= 60.0
                and avg_ret_value > 0.0
                and mfe_value > mae_abs
                and positive_horizons >= 2
            ):
                label = "strong"
                reason = (
                    f"Güçlü: n={samples}, başarı %{rate_value:.1f}; "
                    f"3 ufuktan {positive_horizons} tanesi pozitif ve MFE/MAE dengesi olumlu."
                )
            elif (
                rate_value >= 55.0
                and avg_ret_value >= 0.0
                and positive_horizons >= 2
            ):
                label = "medium"
                reason = (
                    f"Orta: n={samples}, başarı %{rate_value:.1f}; "
                    f"3 ufuktan {positive_horizons} tanesi pozitif."
                )
            else:
                label = "weak"
                reason = (
                    f"Zayıf: n={samples}, başarı %{rate_value:.1f}; "
                    f"ufuk tutarlılığı {positive_horizons}/3."
                )

            candidates.append({
                "label": label,
                "score": score,
                "pattern_name": pattern.get("name"),
                "direction": pattern.get("direction"),
                "horizon": horizon,
                "success_rate": rate,
                "samples": samples,
                "avg_directional_return_pct": avg_ret,
                "avg_mfe_pct": mfe,
                "avg_mae_pct": mae,
                "reliable_horizons": reliable_horizons,
                "positive_horizons": positive_horizons,
                "validation_reason": reason,
            })

    if not candidates:
        p = directional[-1]
        return {
            "label": "insufficient",
            "score": 0.0,
            "pattern_name": p.get("name"),
            "direction": p.get("direction"),
            "horizon": None,
            "success_rate": None,
            "samples": 0,
            "avg_directional_return_pct": None,
            "avg_mfe_pct": None,
            "avg_mae_pct": None,
            "reliable_horizons": 0,
            "positive_horizons": 0,
            "validation_reason": "Bu formasyon için yeterli geçmiş istatistik yok.",
        }

    priority = {"strong": 4, "medium": 3, "weak": 2, "insufficient": 1}
    candidates.sort(
        key=lambda x: (
            priority.get(x["label"], 0),
            x.get("positive_horizons", 0),
            x["score"],
            x["samples"],
        ),
        reverse=True,
    )
    return candidates[0]


# =========================================================
# API
# =========================================================

@router.get("/quotes")
def get_quotes(symbols: str = Query(..., description="Virgülle ayrılmış semboller")):
    requested = []
    for raw in symbols.split(","):
        symbol = raw.strip().upper().replace(".IS", "")
        if symbol and symbol not in requested:
            requested.append(symbol)
    requested = requested[:50]

    if not requested:
        return {
            "source": "Yahoo Finance",
            "realtime_guaranteed": False,
            "items": [],
            "fetched_at": int(time.time()),
        }

    # Aynı Katılım 50 listesi için kısa süreli toplu cache.
    cache_key = "quotes:" + ",".join(requested)
    cached = cache_get(cache_key)
    if cached:
        return cached

    tickers = [f"{symbol}.IS" for symbol in requested]
    batch_df = pd.DataFrame()
    batch_error = False

    try:
        # 50 ayrı Yahoo çağrısı yerine tek toplu çağrı.
        batch_df = safe_yahoo_batch_download(tickers, period="1d", interval="5m", attempts=2)
    except Exception:
        batch_error = True

    rows = []
    for symbol, ticker in zip(requested, tickers):
        price, change_pct, asof = extract_batch_quote(batch_df, ticker)

        if price is not None:
            QUOTE_LAST_GOOD[symbol] = {
                "price": price,
                "change_pct": change_pct,
                "asof": asof,
                "time": time.time(),
            }
            rows.append({
                "symbol": symbol,
                "price": price,
                "change_pct": change_pct,
                "status": "fresh",
                "asof": asof,
            })
            continue

        stale = QUOTE_LAST_GOOD.get(symbol)
        rows.append({
            "symbol": symbol,
            "price": stale.get("price") if stale else None,
            "change_pct": stale.get("change_pct") if stale else None,
            "status": "stale" if stale else ("unavailable" if batch_error else "missing"),
            "asof": stale.get("asof") if stale else None,
        })

    result = {
        "source": "Yahoo Finance",
        "realtime_guaranteed": False,
        "items": rows,
        "fetched_at": int(time.time()),
    }

    # Sol listeyi 45 saniyeden sık Yahoo'ya sorma. Seçili grafik ayrı ve daha sık yenilenir.
    cache_set(cache_key, result, ttl=45)
    return result




# =========================================================
# V22.1 — PİYASA REJİMİ + HACİM TEYİDİ
# =========================================================

def _avg(values):
    values = [float(v) for v in values if v is not None]
    return (sum(values) / len(values)) if values else None


def analyze_market_context(candles, timeframe):
    """Son kapanmış mumlardan fiyat rejimi ve hacim teyidi üretir.

    Bu katman formasyon tespitini değiştirmez; yalnızca bağlam sağlar.
    RSI/EMA/MACD kullanılmaz. Hesaplar fiyat yolu, mum aralığı ve hacimden gelir.
    """
    closed = [
        c for c in candles
        if candle_is_closed(c, timeframe)
    ]

    if len(closed) < 8:
        return {
            "regime": {
                "key": "unknown",
                "label": "Yetersiz Veri",
                "confidence": 0,
                "direction": "neutral",
            },
            "volume": {
                "key": "unknown",
                "label": "Yetersiz Veri",
                "ratio": None,
                "current": None,
                "baseline": None,
                "supported": False,
            },
        }

    window = closed[-min(20, len(closed)):]
    closes = [float(c["close"]) for c in window]
    highs = [float(c["high"]) for c in window]
    lows = [float(c["low"]) for c in window]

    first_close = closes[0]
    last_close = closes[-1]

    path = sum(abs(closes[i] - closes[i - 1]) for i in range(1, len(closes)))
    net_move = last_close - first_close
    efficiency = abs(net_move) / max(path, EPSILON)

    ranges = [
        max(highs[i] - lows[i], 0.0)
        for i in range(len(window))
    ]
    avg_range = _avg(ranges) or 0.0
    move_in_ranges = abs(net_move) / max(avg_range, EPSILON)

    up_steps = sum(1 for i in range(1, len(closes)) if closes[i] > closes[i - 1])
    down_steps = sum(1 for i in range(1, len(closes)) if closes[i] < closes[i - 1])

    range_pct = [
        ((highs[i] - lows[i]) / max(closes[i], EPSILON)) * 100
        for i in range(len(window))
    ]
    long_volatility = _avg(range_pct) or 0.0
    short_volatility = _avg(range_pct[-min(6, len(range_pct)):]) or long_volatility
    volatility_ratio = short_volatility / max(long_volatility, EPSILON)

    # Önce sıra dışı volatiliteyi ayır; sonra yönlü/yatay rejimi değerlendir.
    if volatility_ratio >= 1.45 and short_volatility >= 0.25:
        regime_key = "high_volatility"
        regime_label = "Yüksek Volatilite"
        regime_direction = "neutral"
        confidence = min(100, round(60 + min((volatility_ratio - 1.45) * 55, 40)))
    elif net_move > 0 and move_in_ranges >= 1.8 and efficiency >= 0.30 and up_steps >= down_steps:
        regime_key = "uptrend"
        regime_label = "Yükseliş Trendi"
        regime_direction = "bullish"
        confidence = min(100, round(55 + efficiency * 30 + min(move_in_ranges, 4) * 4))
    elif net_move < 0 and move_in_ranges >= 1.8 and efficiency >= 0.30 and down_steps >= up_steps:
        regime_key = "downtrend"
        regime_label = "Düşüş Trendi"
        regime_direction = "bearish"
        confidence = min(100, round(55 + efficiency * 30 + min(move_in_ranges, 4) * 4))
    else:
        regime_key = "sideways"
        regime_label = "Yatay / Kararsız"
        regime_direction = "neutral"
        confidence = min(100, round(58 + (1 - min(efficiency, 1)) * 24))

    current_volume = float(closed[-1].get("volume") or 0.0)
    previous_volumes = [
        float(c.get("volume") or 0.0)
        for c in closed[-21:-1]
        if float(c.get("volume") or 0.0) > 0
    ]

    baseline_volume = median(previous_volumes) if previous_volumes else None
    volume_ratio = (
        current_volume / baseline_volume
        if baseline_volume and baseline_volume > 0
        else None
    )

    if volume_ratio is None:
        volume_key = "unknown"
        volume_label = "Hacim Verisi Yetersiz"
        volume_supported = False
    elif volume_ratio >= 1.50:
        volume_key = "strong"
        volume_label = "Güçlü Hacim"
        volume_supported = True
    elif volume_ratio >= 1.20:
        volume_key = "supported"
        volume_label = "Hacim Destekli"
        volume_supported = True
    elif volume_ratio >= 0.80:
        volume_key = "normal"
        volume_label = "Normal Hacim"
        volume_supported = False
    else:
        volume_key = "weak"
        volume_label = "Zayıf Hacim"
        volume_supported = False

    return {
        "regime": {
            "key": regime_key,
            "label": regime_label,
            "direction": regime_direction,
            "confidence": int(confidence),
            "net_move_pct": round(((last_close / max(first_close, EPSILON)) - 1) * 100, 3),
            "efficiency": round(efficiency, 3),
            "move_in_ranges": round(move_in_ranges, 2),
            "volatility_ratio": round(volatility_ratio, 2),
        },
        "volume": {
            "key": volume_key,
            "label": volume_label,
            "ratio": round(volume_ratio, 2) if volume_ratio is not None else None,
            "current": round(current_volume, 2),
            "baseline": round(float(baseline_volume), 2) if baseline_volume is not None else None,
            "supported": volume_supported,
        },
    }


def pattern_context_alignment(pattern, market_context):
    """Formasyon yönünün mevcut fiyat rejimiyle uyumunu açıklar."""
    direction = (pattern or {}).get("direction", "neutral")
    regime_direction = ((market_context or {}).get("regime") or {}).get("direction", "neutral")

    if direction == "neutral":
        return {
            "key": "neutral",
            "label": "Nötr Formasyon",
            "score": 0,
        }

    if regime_direction == "neutral":
        return {
            "key": "neutral_regime",
            "label": "Rejim Nötr",
            "score": 0,
        }

    if direction == regime_direction:
        return {
            "key": "aligned",
            "label": "Trend Uyumlu",
            "score": 1,
        }

    return {
        "key": "counter_trend",
        "label": "Trende Ters",
        "score": -1,
    }


# =========================================================
# KATILIM 50 TOPLU FORMASYON TARAMASI
# =========================================================

def _batch_symbol_frame(batch: pd.DataFrame, ticker: str):
    if batch is None or batch.empty:
        return pd.DataFrame()

    try:
        if isinstance(batch.columns, pd.MultiIndex):
            level0 = list(batch.columns.get_level_values(0))
            level1 = list(batch.columns.get_level_values(1))

            if ticker in level1:
                frame = batch.xs(ticker, axis=1, level=1, drop_level=True).copy()
            elif ticker in level0:
                frame = batch.xs(ticker, axis=1, level=0, drop_level=True).copy()
            else:
                return pd.DataFrame()
        else:
            frame = batch.copy()

        needed = ["Open", "High", "Low", "Close", "Volume"]
        if not all(col in frame.columns for col in needed):
            return pd.DataFrame()

        frame = frame[needed].dropna(subset=["Open", "High", "Low", "Close"])
        return frame.sort_index()
    except Exception:
        return pd.DataFrame()


def _scan_period_interval(timeframe: str):
    # Tarama için yalnızca yakın geçmiş gerekir; böylece 50 hisse daha hızlı taranır.
    if timeframe == "10m":
        return "5d", "5m"
    if timeframe == "15m":
        return "5d", "15m"
    if timeframe == "1h":
        return "1mo", "1h"
    if timeframe == "4h":
        return "3mo", "1h"
    if timeframe == "1d":
        return "6mo", "1d"
    raise ValueError("Geçersiz zaman dilimi")


@router.get("/scan")
def scan_symbols(
    symbols: str = Query(..., description="Virgülle ayrılmış en fazla 50 sembol"),
    timeframe: str = Query("15m"),
):
    if timeframe not in {"10m", "15m", "1h", "4h", "1d"}:
        raise HTTPException(status_code=400, detail="Geçersiz zaman dilimi")

    clean = []
    for raw in symbols.split(","):
        symbol = raw.strip().upper().replace(".IS", "")
        if symbol and symbol not in clean:
            clean.append(symbol)
        if len(clean) >= 50:
            break

    if not clean:
        raise HTTPException(status_code=400, detail="Sembol listesi boş")

    cache_key = f"scan:{timeframe}:{','.join(clean)}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    period, interval = _scan_period_interval(timeframe)
    tickers = [f"{symbol}.IS" for symbol in clean]

    try:
        batch = safe_yahoo_batch_download(tickers, period=period, interval=interval, attempts=2)
        items = []

        for symbol, ticker in zip(clean, tickers):
            frame = _batch_symbol_frame(batch, ticker)
            if frame.empty:
                items.append({
                    "symbol": symbol,
                    "status": "no_data",
                    "last_price": None,
                    "latest_patterns": [],
                    "recent_patterns": [],
                })
                continue

            if timeframe == "10m":
                frame = resample_10m(frame)
            elif timeframe == "4h":
                frame = resample_4h(frame)

            if frame.empty:
                continue

            candles = dataframe_to_candles(frame, min(len(frame), 240))
            found = scan_all_patterns(candles, timeframe)

            closed_times = [c["time"] for c in candles if candle_is_closed(c, timeframe)]
            last_closed = closed_times[-1] if closed_times else None
            latest = [p for p in found if last_closed is not None and p["time"] == last_closed]
            recent = found[-5:]
            last_price = float(candles[-1]["close"]) if candles else None

            local_backtest = calculate_backtest(candles, found, timeframe)
            signal_strength = _historical_signal_strength(local_backtest, latest)
            market_context = analyze_market_context(candles, timeframe)
            context_alignment = (
                pattern_context_alignment(latest[-1], market_context)
                if latest
                else None
            )

            items.append({
                "symbol": symbol,
                "status": "ok",
                "last_price": last_price,
                "latest_patterns": latest,
                "recent_patterns": recent,
                "pattern_count": len(found),
                "last_candle_time": candles[-1]["time"] if candles else None,
                "last_closed_time": last_closed,
                "signal_strength": signal_strength,
                "market_context": market_context,
                "context_alignment": context_alignment,
            })

        directional = {"bullish": 0, "bearish": 0, "neutral": 0}
        strength_counts = {
            "strong": 0,
            "medium": 0,
            "weak": 0,
            "insufficient": 0,
            "neutral": 0,
            "none": 0,
        }
        regime_counts = {
            "uptrend": 0,
            "downtrend": 0,
            "sideways": 0,
            "high_volatility": 0,
            "unknown": 0,
        }
        volume_counts = {
            "strong": 0,
            "supported": 0,
            "normal": 0,
            "weak": 0,
            "unknown": 0,
        }
        signal_count = 0
        for item in items:
            if item.get("latest_patterns"):
                signal_count += 1
                for pattern in item["latest_patterns"]:
                    d = pattern.get("direction", "neutral")
                    directional[d] = directional.get(d, 0) + 1
            strength_label = (item.get("signal_strength") or {}).get("label", "none")
            strength_counts[strength_label] = strength_counts.get(strength_label, 0) + 1

            context = item.get("market_context") or {}
            regime_key = (context.get("regime") or {}).get("key", "unknown")
            volume_key = (context.get("volume") or {}).get("key", "unknown")
            regime_counts[regime_key] = regime_counts.get(regime_key, 0) + 1
            volume_counts[volume_key] = volume_counts.get(volume_key, 0) + 1

        result = {
            "timeframe": timeframe,
            "source": "Yahoo Finance",
            "realtime_guaranteed": False,
            "symbols_requested": len(clean),
            "symbols_scanned": sum(1 for i in items if i.get("status") == "ok"),
            "symbols_with_signal": signal_count,
            "direction_counts": directional,
            "strength_counts": strength_counts,
            "regime_counts": regime_counts,
            "volume_counts": volume_counts,
            "items": items,
            "fetched_at": int(time.time()),
        }
        cache_set(cache_key, result, ttl=60)
        return result

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Tarama hatası: {exc}")


@router.get("/candles/{symbol}")
def get_candles(
    symbol: str,

    timeframe: str = Query(
        "1h"
    ),

    limit: int = Query(
        150,
        ge=20,
        le=1000,
    ),

    backtest: bool = Query(
        True
    ),

    stats_window: str = Query(
        "all"
    ),
):

    symbol = (
        symbol
        .upper()
        .replace(
            ".IS",
            "",
        )
    )

    if timeframe not in {
        "10m",
        "15m",
        "1h",
        "4h",
        "1d",
    }:

        raise HTTPException(
            status_code=400,
            detail="Geçersiz zaman dilimi",
        )

    if stats_window not in {"all", "3m", "6m", "1y"}:
        raise HTTPException(
            status_code=400,
            detail="Geçersiz istatistik dönemi",
        )

    cache_key = (
        f"{symbol}:"
        f"{timeframe}:"
        f"{limit}:"
        f"backtest={backtest}:"
        f"stats_window={stats_window}"
    )

    cached = cache_get(
        cache_key
    )

    if cached:
        return cached

    ticker = (
        f"{symbol}.IS"
    )

    try:

        period, interval = (
            get_period_interval(
                timeframe,
                extended=backtest,
            )
        )

        df = safe_yahoo_download(
            ticker,
            period,
            interval,
            attempts=3,
        )

        if (
            df is None
            or df.empty
        ):

            raise HTTPException(
                status_code=404,
                detail=(
                    f"{symbol} için "
                    "veri bulunamadı"
                ),
            )

        # MultiIndex düzelt.
        if isinstance(
            df.columns,
            pd.MultiIndex,
        ):

            df.columns = (
                df.columns
                .get_level_values(0)
            )

        required = [
            "Open",
            "High",
            "Low",
            "Close",
            "Volume",
        ]

        for column in required:

            if column not in df.columns:

                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Eksik veri sütunu: "
                        f"{column}"
                    ),
                )

        df = (
            df[required]
            .dropna(
                subset=[
                    "Open",
                    "High",
                    "Low",
                    "Close",
                ]
            )
            .sort_index()
        )

        # Yahoo 10 dakikalık interval sağlamadığı için 5 dakikalık
        # mumları BIST işlem günü içinde ikişerli birleştir.
        if timeframe == "10m":
            df = resample_10m(df)

        # BIST işlem gününe göre
        # 4 saatlik mum üret.
        if timeframe == "4h":

            df = resample_4h(
                df
            )

        # Backtest için mümkün olan daha uzun geçmişi koru.
        analysis_limit = len(df) if backtest else limit

        analysis_candles = (
            dataframe_to_candles(
                df,
                analysis_limit,
            )
        )

        if len(analysis_candles) < 10:

            raise HTTPException(
                status_code=404,
                detail=(
                    "Yeterli mum "
                    "verisi yok"
                ),
            )

        analysis_patterns = (
            scan_all_patterns(
                analysis_candles,
                timeframe,
            )
        )

        # Grafikte yalnızca kullanıcının istediği kadar mum göster.
        candles = analysis_candles[-limit:]
        visible_times = {c["time"] for c in candles}
        patterns = [
            p
            for p in analysis_patterns
            if p["time"] in visible_times
        ]

        # En son görünür formasyon(lar)
        latest_patterns = []

        if patterns:

            latest_time = max(
                p["time"]
                for p in patterns
            )

            latest_patterns = [
                p
                for p in patterns
                if p["time"]
                == latest_time
            ]

        # Paper trading için yalnızca EN SON KAPANMIŞ mumda oluşan
        # formasyonları ayrı döndürüyoruz. Böylece geçmişte oluşmuş
        # eski bir formasyonda yanlışlıkla yeni sanal işlem açılmaz.
        closed_candles = [
            c for c in candles
            if candle_is_closed(c, timeframe)
        ]
        last_closed_time = (
            closed_candles[-1]["time"]
            if closed_candles
            else None
        )
        current_patterns = [
            p for p in patterns
            if last_closed_time is not None
            and p["time"] == last_closed_time
        ]

        backtest_window_days = {
            "3m": 90,
            "6m": 180,
            "1y": 365,
        }.get(stats_window)

        backtest_event_since = None
        if backtest_window_days and analysis_candles:
            backtest_event_since = int(analysis_candles[-1]["time"]) - (backtest_window_days * 86400)

        backtest_result = (
            calculate_backtest(
                analysis_candles,
                analysis_patterns,
                timeframe,
                event_since=backtest_event_since,
            )
            if backtest
            else None
        )

        if backtest_result is not None and analysis_candles:
            available_from = int(analysis_candles[0]["time"])
            available_to = int(analysis_candles[-1]["time"])
            effective_from = max(available_from, backtest_event_since or available_from)
            backtest_result.update({
                "requested_window": stats_window,
                "requested_days": backtest_window_days,
                "available_from_time": available_from,
                "available_to_time": available_to,
                "effective_from_time": effective_from,
                "available_days": round(max(0, available_to - available_from) / 86400, 1),
                "effective_days": round(max(0, available_to - effective_from) / 86400, 1),
            })

        result = {
            "symbol": symbol,

            "ticker": ticker,

            "timeframe": timeframe,

            "source": "Yahoo Finance",
            "provider": "Yahoo Finance",
            "realtime_guaranteed": False,
            "data_status": "fresh",
            "fetched_at": int(time.time()),
            "last_candle_time": candles[-1]["time"],
            "cache_seconds": cache_seconds_for_timeframe(timeframe),

            "count":
                len(candles),

            "last_price":
                candles[-1]["close"],

            "latest_patterns":
                latest_patterns,

            "last_closed_time":
                last_closed_time,

            "current_patterns":
                current_patterns,

            "market_context":
                analyze_market_context(analysis_candles, timeframe),

            "current_pattern_context":
                (
                    pattern_context_alignment(
                        current_patterns[-1],
                        analyze_market_context(analysis_candles, timeframe),
                    )
                    if current_patterns
                    else None
                ),

            "patterns":
                patterns,

            "pattern_count":
                len(patterns),

            "backtest":
                backtest_result,

            "candles":
                candles,
        }

        ttl = cache_seconds_for_timeframe(timeframe)
        cache_set(cache_key, result, ttl=ttl)
        LAST_GOOD[(symbol, timeframe, backtest, stats_window)] = result
        return result

    except HTTPException as e:
        stale = LAST_GOOD.get((symbol, timeframe, backtest, stats_window))
        if stale:
            fallback = dict(stale)
            fallback["data_status"] = "stale"
            fallback["warning"] = "Veri sağlayıcı geçici olarak yanıt vermedi; son başarılı veri gösteriliyor."
            fallback["stale_reason"] = str(e.detail)
            fallback["served_at"] = int(time.time())
            return fallback
        raise

    except Exception as e:
        stale = LAST_GOOD.get((symbol, timeframe, backtest, stats_window))
        if stale:
            fallback = dict(stale)
            fallback["data_status"] = "stale"
            fallback["warning"] = "Canlı veri geçici olarak alınamadı; son başarılı veri gösteriliyor."
            fallback["stale_reason"] = str(e)
            fallback["served_at"] = int(time.time())
            return fallback

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )
