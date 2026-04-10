"""Domain-specific exceptions for LexFlow."""

from __future__ import annotations


class LexFlowError(Exception):
    """Base exception for all LexFlow errors."""


class ParserError(LexFlowError):
    """Raised when a law file cannot be parsed."""

    def __init__(self, file_path: str, reason: str) -> None:
        self.file_path = file_path
        self.reason = reason
        super().__init__(f"Failed to parse '{file_path}': {reason}")


class LawNotFoundError(LexFlowError):
    """Raised when a requested law identifier does not exist."""

    def __init__(self, law_id: str) -> None:
        self.law_id = law_id
        super().__init__(f"Law not found: '{law_id}'")


class ArticleNotFoundError(LexFlowError):
    """Raised when an article number does not exist within a law."""

    def __init__(self, law_id: str, article_number: str) -> None:
        self.law_id = law_id
        self.article_number = article_number
        super().__init__(f"Article '{article_number}' not found in law '{law_id}'")


class DataPathError(LexFlowError):
    """Raised when the data directory is missing or misconfigured."""

    def __init__(self, path: str) -> None:
        self.path = path
        super().__init__(f"Data directory not found or inaccessible: '{path}'")
