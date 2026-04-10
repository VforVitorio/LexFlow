# Guía de contribución a LexFlow

Gracias por tu interés en contribuir a LexFlow. Esta guía describe cómo participar en el proyecto de forma efectiva.

---

## Antes de empezar

1. Lee el [README](README.md) para entender qué es LexFlow.
2. Revisa el [ROADMAP](ROADMAP.md) para ver en qué fase está el proyecto.
3. Lee el [Código de conducta](CODE_OF_CONDUCT.md).
4. Busca en los [issues abiertos](https://github.com/VforVitorio/LexFlow/issues) para ver si alguien ya está trabajando en lo que quieres hacer.

---

## Flujo de trabajo

LexFlow usa un flujo de ramas basado en `dev` como rama de integración y `main` como rama estable.

### Ramas

| Rama | Propósito |
|------|-----------|
| `main` | Rama protegida. Solo recibe PRs desde `dev`. Siempre estable. |
| `dev` | Rama de integración. Aquí se mergean todas las features y fixes. |
| `feat/nombre` | Ramas de feature. Se crean desde `dev`. |
| `fix/nombre` | Ramas de bugfix. Se crean desde `dev`. |
| `docs/nombre` | Ramas de documentación. Se crean desde `dev`. |

### Proceso paso a paso

1. **Busca o crea un issue** describiendo lo que quieres hacer.
2. **Crea una rama** desde `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feat/mi-feature
   ```
3. **Desarrolla** en tu rama. Haz commits claros y frecuentes.
4. **Añade tests** para cualquier funcionalidad nueva.
5. **Verifica** que todo pasa:
   ```bash
   uv run pytest
   uv run ruff check .
   uv run ruff format --check .
   uv run mypy src/
   ```
6. **Push** tu rama:
   ```bash
   git push origin feat/mi-feature
   ```
7. **Abre un Pull Request** hacia `dev` (nunca directamente a `main`).
8. **Espera review** y responde a los comentarios.
9. **Merge** — se hace sin squash para mantener el historial completo.
10. **Borra la rama** después del merge.

---

## Convenciones de código

### Estilo

- **Formatter:** Ruff (configurado en pyproject.toml)
- **Linter:** Ruff
- **Type checker:** mypy en modo strict
- **Longitud de línea:** 120 caracteres

### Commits

Usa mensajes de commit descriptivos en **inglés** y en imperativo:

```
Add markdown parser for law titles
Fix version diff endpoint returning empty response
Update NetworkX graph builder to handle circular references
```

Formato recomendado:
```
<tipo>: <descripción corta>

<cuerpo opcional con más contexto>
```

Tipos: `Add`, `Fix`, `Update`, `Remove`, `Refactor`, `Test`, `Docs`, `CI`.

### Nombres

- **Archivos y módulos:** snake_case (`law_parser.py`)
- **Clases:** PascalCase (`LawArticle`)
- **Funciones y variables:** snake_case (`parse_law_title`)
- **Constantes:** UPPER_SNAKE_CASE (`MAX_SEARCH_RESULTS`)

### Tests

- Ubicación: carpeta `tests/` con estructura espejo de `src/`
- Framework: pytest
- Naming: `test_<módulo>.py` con funciones `test_<qué_se_prueba>`
- Los tests de integración deben funcionar contra datos reales (sin mocks de base de datos)

---

## Configuración del entorno de desarrollo

```bash
# Clonar
git clone https://github.com/VforVitorio/LexFlow.git
cd LexFlow

# Instalar todas las dependencias (incluidas dev)
uv sync --all-extras

# Instalar pre-commit hooks
uv run pre-commit install

# Verificar que todo funciona
uv run pytest
uv run ruff check .
uv run mypy src/
```

---

## Reportar bugs

Usa la [plantilla de bug report](https://github.com/VforVitorio/LexFlow/issues/new?template=bug_report.yml) e incluye:

- Qué esperabas que pasara
- Qué pasó realmente
- Pasos para reproducir
- Versión de Python y sistema operativo

---

## Proponer features

Usa la [plantilla de feature request](https://github.com/VforVitorio/LexFlow/issues/new?template=feature_request.yml) e incluye:

- Problema que resuelve
- Solución propuesta
- Alternativas consideradas

---

## Primera contribución

Si es tu primera vez contribuyendo, busca issues etiquetados con:

- `good first issue` — tareas sencillas para empezar
- `help wanted` — tareas donde se necesita ayuda

No dudes en preguntar en el issue si algo no está claro. Preferimos una pregunta a un PR que va en la dirección equivocada.

---

## Licencia

Al contribuir a LexFlow, aceptas que tus contribuciones se distribuirán bajo la [licencia Apache 2.0](LICENSE).
