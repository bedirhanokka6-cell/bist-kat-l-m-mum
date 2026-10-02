import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.market import router as market_router
from app.api.paper import router as paper_router

app = FastAPI(
    title="BIST Candle AI",
    version="1.0.0",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market_router)
app.include_router(paper_router)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "project": "BIST Candle AI",
        "version": "1.0.0",
    }
