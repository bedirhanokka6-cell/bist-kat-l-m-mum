from pathlib import Path
import sqlite3
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/paper", tags=["paper-trading"])

DB_DIR = Path(__file__).resolve().parents[2] / "data"
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "paper_trading.db"


class PaperTradeModel(BaseModel):
    id: str
    symbol: str
    timeframe: str
    patternName: str
    direction: Literal["bullish", "bearish"]
    entryTime: int
    entryPrice: float
    targetPrice: float
    stopPrice: float
    targetPct: float
    stopPct: float
    horizon: int
    backtestRate: float
    samples: int
    status: Literal["open", "target", "stop", "timeout", "ambiguous"]
    exitTime: int | None = None
    exitPrice: float | None = None
    pnlPct: float | None = None
    quantity: float | None = None
    investedAmount: float | None = None
    pnlAmount: float | None = None


class PaperTradeSyncRequest(BaseModel):
    trades: list[PaperTradeModel]


def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_trades (
                id TEXT PRIMARY KEY,
                symbol TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                pattern_name TEXT NOT NULL,
                direction TEXT NOT NULL,
                entry_time INTEGER NOT NULL,
                entry_price REAL NOT NULL,
                target_price REAL NOT NULL,
                stop_price REAL NOT NULL,
                target_pct REAL NOT NULL,
                stop_pct REAL NOT NULL,
                horizon INTEGER NOT NULL,
                backtest_rate REAL NOT NULL,
                samples INTEGER NOT NULL,
                status TEXT NOT NULL,
                exit_time INTEGER,
                exit_price REAL,
                pnl_pct REAL,
                quantity REAL,
                invested_amount REAL,
                pnl_amount REAL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(paper_trades)").fetchall()}
        if "quantity" not in columns:
            conn.execute("ALTER TABLE paper_trades ADD COLUMN quantity REAL")
        if "invested_amount" not in columns:
            conn.execute("ALTER TABLE paper_trades ADD COLUMN invested_amount REAL")
        if "pnl_amount" not in columns:
            conn.execute("ALTER TABLE paper_trades ADD COLUMN pnl_amount REAL")

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_paper_trades_entry_time ON paper_trades(entry_time DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_paper_trades_status ON paper_trades(status)"
        )
        conn.commit()


init_db()


def row_to_trade(row: sqlite3.Row):
    return {
        "id": row["id"],
        "symbol": row["symbol"],
        "timeframe": row["timeframe"],
        "patternName": row["pattern_name"],
        "direction": row["direction"],
        "entryTime": row["entry_time"],
        "entryPrice": row["entry_price"],
        "targetPrice": row["target_price"],
        "stopPrice": row["stop_price"],
        "targetPct": row["target_pct"],
        "stopPct": row["stop_pct"],
        "horizon": row["horizon"],
        "backtestRate": row["backtest_rate"],
        "samples": row["samples"],
        "status": row["status"],
        "exitTime": row["exit_time"],
        "exitPrice": row["exit_price"],
        "pnlPct": row["pnl_pct"],
        "quantity": row["quantity"],
        "investedAmount": row["invested_amount"],
        "pnlAmount": row["pnl_amount"],
    }


@router.get("/trades")
def list_trades(limit: int = 200):
    safe_limit = max(1, min(int(limit), 1000))
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM paper_trades ORDER BY entry_time DESC LIMIT ?",
            (safe_limit,),
        ).fetchall()

    trades = [row_to_trade(row) for row in rows]
    completed = [t for t in trades if t["status"] != "open"]
    return {
        "status": "ok",
        "storage": "sqlite",
        "database": "paper_trading.db",
        "count": len(trades),
        "open": sum(1 for t in trades if t["status"] == "open"),
        "completed": len(completed),
        "trades": trades,
    }


@router.post("/trades/sync")
def sync_trades(payload: PaperTradeSyncRequest):
    trades = payload.trades[:1000]

    with get_connection() as conn:
        for trade in trades:
            t = trade.model_dump()
            conn.execute(
                """
                INSERT INTO paper_trades (
                    id, symbol, timeframe, pattern_name, direction,
                    entry_time, entry_price, target_price, stop_price,
                    target_pct, stop_pct, horizon, backtest_rate, samples,
                    status, exit_time, exit_price, pnl_pct, quantity, invested_amount, pnl_amount, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    symbol=excluded.symbol,
                    timeframe=excluded.timeframe,
                    pattern_name=excluded.pattern_name,
                    direction=excluded.direction,
                    entry_time=excluded.entry_time,
                    entry_price=excluded.entry_price,
                    target_price=excluded.target_price,
                    stop_price=excluded.stop_price,
                    target_pct=excluded.target_pct,
                    stop_pct=excluded.stop_pct,
                    horizon=excluded.horizon,
                    backtest_rate=excluded.backtest_rate,
                    samples=excluded.samples,
                    status=excluded.status,
                    exit_time=excluded.exit_time,
                    exit_price=excluded.exit_price,
                    pnl_pct=excluded.pnl_pct,
                    quantity=excluded.quantity,
                    invested_amount=excluded.invested_amount,
                    pnl_amount=excluded.pnl_amount,
                    updated_at=CURRENT_TIMESTAMP
                """,
                (
                    t["id"], t["symbol"], t["timeframe"], t["patternName"], t["direction"],
                    t["entryTime"], t["entryPrice"], t["targetPrice"], t["stopPrice"],
                    t["targetPct"], t["stopPct"], t["horizon"], t["backtestRate"], t["samples"],
                    t["status"], t.get("exitTime"), t.get("exitPrice"), t.get("pnlPct"),
                    t.get("quantity"), t.get("investedAmount"), t.get("pnlAmount"),
                ),
            )
        conn.commit()

    return {
        "status": "ok",
        "storage": "sqlite",
        "synced": len(trades),
    }
