"""Enumerations for the Spanish legal domain."""

from __future__ import annotations

from enum import StrEnum


class LawRank(StrEnum):
    """Hierarchical rank of a legal norm.

    Values match the raw ``rank`` field in legalize-es YAML frontmatter.
    The full set was audited against the live corpus (#549) so real ranks
    stop bucketing into ``OTRO`` — that gap broke the Explorer rank filter
    and rank-based analytics for ~5k laws (resolución, decreto-ley,
    acuerdo internacional, leyes forales, …). ``OTRO`` stays the genuine
    catch-all for values not yet present in the corpus.
    """

    LEY = "ley"
    LEY_ORGANICA = "ley_organica"
    LEY_FORAL = "ley_foral"
    REAL_DECRETO = "real_decreto"
    REAL_DECRETO_LEY = "real_decreto_ley"
    REAL_DECRETO_LEGISLATIVO = "real_decreto_legislativo"
    DECRETO = "decreto"
    DECRETO_LEY = "decreto_ley"
    DECRETO_LEGISLATIVO = "decreto_legislativo"
    DECRETO_LEY_FORAL = "decreto_ley_foral"
    DECRETO_FORAL_LEGISLATIVO = "decreto_foral_legislativo"
    ORDEN = "orden"
    RESOLUCION = "resolucion"
    CIRCULAR = "circular"
    INSTRUCCION = "instruccion"
    ACUERDO = "acuerdo"
    ACUERDO_INTERNACIONAL = "acuerdo_internacional"
    REGLAMENTO = "reglamento"
    CONSTITUCION = "constitucion"
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


class ReferenceKind(StrEnum):
    """How one law relates to another via a cross-reference (#144).

    Heuristically inferred from the textual context immediately preceding
    the citation. ``CITES`` is the fallback when no stronger marker shows
    up — the vast majority of references in the corpus are plain cites.
    """

    CITES = "cites"
    MODIFIES = "modifies"
    REPEALS = "repeals"
    DEVELOPS = "develops"


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
