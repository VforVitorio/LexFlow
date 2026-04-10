"""Fast metadata-only parser.

Reads only the YAML frontmatter of a law file without parsing the full
Markdown body.  Used for bulk operations like listing all 12K laws.
"""

from __future__ import annotations

from pathlib import Path

from lexflow.core.models import LawMetadata
from lexflow.core.parser import frontmatter_to_metadata, parse_frontmatter

_MAX_FRONTMATTER_BYTES = 4096


def read_frontmatter_block(file_path: Path, max_bytes: int = _MAX_FRONTMATTER_BYTES) -> str:
    """Read only the YAML frontmatter from a file without loading the full content.

    Reads at most *max_bytes* from the beginning of the file and extracts
    the text between the ``---`` delimiters.
    """
    with file_path.open("r", encoding="utf-8") as fh:
        head = fh.read(max_bytes)

    if not head.startswith("---"):
        return ""

    end = head.find("\n---", 3)
    if end == -1:
        return ""

    return head[4:end]


def parse_metadata_only(file_path: Path) -> LawMetadata:
    """Read a ``.md`` file and extract only the YAML frontmatter as :class:`LawMetadata`.

    Much faster than :func:`~lexflow.core.parser.parse_law_file` because it
    reads at most the first 4 KB and skips body parsing entirely.
    """
    yaml_text = read_frontmatter_block(file_path)
    raw = parse_frontmatter(yaml_text)
    return frontmatter_to_metadata(raw)
