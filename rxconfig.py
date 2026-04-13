"""Reflex configuration for LexFlow frontend."""

import reflex as rx

config = rx.Config(
    app_name="lexflow_app",
    db_url="sqlite:///reflex.db",
    telemetry_enabled=False,
)
