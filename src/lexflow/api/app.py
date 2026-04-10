"""FastAPI application factory."""

from fastapi import FastAPI

from lexflow import __version__

app = FastAPI(
    title="LexFlow API",
    description="REST API for exploring, querying and analyzing Spanish legislation.",
    version=__version__,
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}
