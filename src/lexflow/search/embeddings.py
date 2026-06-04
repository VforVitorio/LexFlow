"""Embedding interface + a dependency-free default (#42).

The default ``HashEmbedder`` is deterministic, fast, and needs no
model download. It's good enough to:

  * exercise the surrounding plumbing (index build, cosine query,
    REST endpoint serialisation),
  * give the SPA a real ranked-result wire shape to build against,
  * keep the test suite hermetic with no network or model files.

When a follow-up wires the real ``SentenceTransformerEmbedder``,
swap it in via DI on the singleton in
:mod:`lexflow.search.semantic_index`. The ABC contract is what the
rest of the package depends on — text-to-vector + dimension — so the
swap is local.

--- WHERE TO CHANGE IF X CHANGES ---
* Real embedder backend             → add a new ``Embedder`` subclass
                                       (sentence-transformers, OpenAI,
                                       Cohere, …).
* Different default dimension       → :data:`DEFAULT_DIMENSION`.
* Multilingual normalisation        → wrap text inside the embedder's
                                       :meth:`embed_one` before
                                       hashing/encoding.
"""

from __future__ import annotations

import hashlib
import math
from abc import ABC, abstractmethod
from collections.abc import Iterable

# Most production sentence-transformer models use 384, 512 or 768
# dimensions. 384 is the sweet spot: small enough to keep the in-memory
# index lean (~3 MB for 12 K articles) while big enough to discriminate
# even on a hash-based fake.
DEFAULT_DIMENSION = 384


class Embedder(ABC):
    """Encode strings into dense vectors.

    Implementations must be deterministic: the same input always yields
    the same vector. This invariant is what lets us persist the index
    to disk (a future #42 follow-up) and trust it across restarts.
    """

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Vector size every output carries."""

    @abstractmethod
    def embed_one(self, text: str) -> list[float]:
        """Encode a single string."""

    def embed_many(self, texts: Iterable[str]) -> list[list[float]]:
        """Encode a batch. Default = naïve loop; subclasses can vectorise.

        Real backends override this with their batched API call (a
        single HTTP request, a tensor evaluation) which is typically
        10-100x faster than the loop.
        """
        return [self.embed_one(text) for text in texts]


class HashEmbedder(Embedder):
    """Deterministic, dependency-free embedder (default in #42).

    Algorithm:
      1. Lowercase + ASCII-fold the input.
      2. SHA-256 it, expanded across multiple hash rounds until we
         have ``dimension * 4`` bytes.
      3. Read every 4 bytes as a little-endian int32, normalise to
         ``[-1, 1]``, scale to unit length.

    NOT semantic — "tax" and "impuesto" don't end up close in this
    space. The point is the SHAPE: same dim, same wire format, same
    cosine-similarity arithmetic as a real model. Swap the backend
    when a real one lands; the rest of the search stack doesn't move.
    """

    def __init__(self, dimension: int = DEFAULT_DIMENSION) -> None:
        if dimension <= 0:
            raise ValueError("dimension must be positive")
        self._dim = dimension

    @property
    def dimension(self) -> int:
        return self._dim

    def embed_one(self, text: str) -> list[float]:
        normalised = text.strip().lower()
        return _hash_to_unit_vector(normalised, self._dim)


def _hash_to_unit_vector(text: str, dimension: int) -> list[float]:
    """Deterministic hash → unit-length float vector."""
    raw = _hash_to_bytes(text, n_bytes=dimension * 4)
    floats: list[float] = []
    for i in range(dimension):
        # Treat 4 bytes as an unsigned int, centre at 0, scale to ~[-1, 1].
        chunk = raw[i * 4 : (i + 1) * 4]
        value = int.from_bytes(chunk, "little", signed=False)
        floats.append((value / 0xFFFFFFFF) * 2.0 - 1.0)
    norm = math.sqrt(sum(v * v for v in floats))
    if norm == 0:
        # Theoretically impossible (we'd need every byte = 0x80000000).
        # Return a stable non-zero vector so the caller can still
        # cosine-compare it without dividing by zero.
        return [1.0 / math.sqrt(dimension)] * dimension
    return [v / norm for v in floats]


def _hash_to_bytes(text: str, *, n_bytes: int) -> bytes:
    """Expand SHA-256 to ``n_bytes`` via counter-mode hashing."""
    out = bytearray()
    counter = 0
    seed = text.encode("utf-8")
    while len(out) < n_bytes:
        h = hashlib.sha256()
        h.update(seed)
        h.update(counter.to_bytes(4, "little"))
        out.extend(h.digest())
        counter += 1
    return bytes(out[:n_bytes])
