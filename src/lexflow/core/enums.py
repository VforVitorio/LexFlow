"""Enumerations for the Spanish legal domain."""

from __future__ import annotations

from enum import StrEnum


class LawRank(StrEnum):
    """Hierarchical rank of a legal norm.

    Values match the raw ``rank`` field in legalize-es YAML frontmatter.
    """

    LEY = "ley"
    LEY_ORGANICA = "ley_organica"
    REAL_DECRETO = "real_decreto"
    REAL_DECRETO_LEY = "real_decreto_ley"
    REAL_DECRETO_LEGISLATIVO = "real_decreto_legislativo"
    DECRETO_LEGISLATIVO = "decreto_legislativo"
    ORDEN = "orden"
    OTRO = "otro"


class LawStatus(StrEnum):
    """Current enforcement status of a legal norm."""

    IN_FORCE = "in_force"
    REPEALED = "repealed"
    PARTIALLY_REPEALED = "partially_repealed"
    PENDING = "pending"


class ConsolidationStatus(StrEnum):
    """Consolidation state from the BOE."""

    FINALIZADO = "Finalizado"
    EN_CURSO = "En curso"
    UNKNOWN = "unknown"


class Scope(StrEnum):
    """Territorial scope of a legal norm."""

    ESTATAL = "Estatal"
    AUTONOMICO = "Autonómico"
    LOCAL = "Local"


class Jurisdiction(StrEnum):
    """Jurisdiction codes for Spanish autonomous communities.

    ``ES`` is the national (state) level; the rest are autonomous
    communities plus the autonomous cities of Ceuta and Melilla.
    """

    ES = "es"
    ES_AN = "es-an"
    ES_AR = "es-ar"
    ES_AS = "es-as"
    ES_CB = "es-cb"
    ES_CE = "es-ce"
    ES_CL = "es-cl"
    ES_CM = "es-cm"
    ES_CN = "es-cn"
    ES_CT = "es-ct"
    ES_EX = "es-ex"
    ES_GA = "es-ga"
    ES_IB = "es-ib"
    ES_MC = "es-mc"
    ES_MD = "es-md"
    ES_ML = "es-ml"
    ES_NC = "es-nc"
    ES_PV = "es-pv"
    ES_RI = "es-ri"
    ES_VC = "es-vc"
