from collections import defaultdict, deque
from threading import RLock

class CandleStore:
    def __init__(self, max_candles: int = 1000):
        self.max_candles = max_candles
        self._data = defaultdict(lambda: deque(maxlen=max_candles))
        self._lock = RLock()

    def get(self, symbol: str, timeframe: str, limit: int = 300):
        key = (symbol.upper(), timeframe)
        with self._lock:
            rows = list(self._data.get(key, []))
            return rows[-limit:]

    def seed(self, symbol: str, timeframe: str, candles: list[dict]):
        key = (symbol.upper(), timeframe)
        with self._lock:
            self._data[key].clear()
            for candle in candles[-self.max_candles:]:
                self._data[key].append(candle)

candle_store = CandleStore()
