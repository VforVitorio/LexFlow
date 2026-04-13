#!/usr/bin/env python3
"""Build standalone LexFlow executables using PyInstaller."""

from __future__ import annotations

import platform
import subprocess
import sys
from pathlib import Path


def build() -> None:
    """Run PyInstaller with the lexflow.spec file."""
    spec_path = Path(__file__).parent / "lexflow.spec"
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--clean",
        "--noconfirm",
        str(spec_path),
    ]
    print(f"Building for {platform.system()} {platform.machine()}")
    subprocess.run(cmd, check=True)
    print("Build complete. Check dist/lexflow")


if __name__ == "__main__":
    build()
