"""LexFlow entry point — starts the FastAPI development server."""

import uvicorn


def main() -> None:
    uvicorn.run(
        "lexflow.api.app:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )


if __name__ == "__main__":
    main()
