# Accesibilidad (parte de Fase 8)

LexFlow apunta a **WCAG 2.1 nivel AA** desde el primer release público. Esto no es un nice-to-have — es un requisito para una app legal que puede usar gente con discapacidad visual, motora o cognitiva.

---

## Principios

1. **El teclado siempre funciona.** Todo lo que se puede hacer con ratón se puede hacer con teclado. Sin excepciones.
2. **El foco siempre se ve.** Nunca eliminamos `:focus-visible` por estética. La paleta tiene ring de 2 px en color con contraste ≥ 3:1.
3. **El significado no depende solo del color.** Cada estado (válido, error, warning) usa color + texto + icono. Daltónicos cubiertos.
4. **El movimiento es opt-in.** `prefers-reduced-motion` desactiva animaciones; estados sustituyen el movimiento por cambios estáticos.
5. **El texto crece.** Hasta 200% sin romper layout (auditado en Fase 5C polish).
6. **Los screen readers leen sentido.** Roles ARIA correctos, `aria-label` en interactivos sin texto, `aria-live` en regiones que cambian.
7. **Errores en lenguaje humano.** "No has podido enviar el mensaje porque no hay conexión" beats "ERR_NETWORK_FAILED".

---

## Checklist WCAG 2.1 AA aplicado a LexFlow

### Perceivable

- [ ] Contraste de texto ≥ 4.5:1; texto grande ≥ 3:1
- [ ] Contraste de componentes (botones, inputs, focus ring) ≥ 3:1
- [ ] No usar solo color para transmitir información (badges con icono + texto, no solo color)
- [ ] Texto escalable al 200% sin scroll horizontal ni overlap
- [ ] Imágenes/iconos decorativos con `aria-hidden="true"`; iconos informativos con `aria-label`
- [ ] El grafo: nodos tienen `aria-label` con el tipo + nombre (ej. `"Ley: LOPDGDD"`)
- [ ] Diff viewer: cambios marcados con icono + color + screen-reader-only text

### Operable

- [ ] Navegación por teclado completa (`Tab`, `Shift+Tab`, `Enter`, `Esc`, `Space`)
- [ ] Skip-link al `#main` (ya existe en `AppShell`)
- [ ] Trap focus en modales y dialogs (Radix lo hace por defecto en shadcn/ui)
- [ ] Sin contenido que destelle más de 3 veces por segundo
- [ ] `prefers-reduced-motion` respetado (ya en `index.css`)
- [ ] Hotkeys documentados (tabla en `frontend/README.md`); expuestos en Ajustes → Atajos
- [ ] Timeouts dan opción de extender / desactivar

### Understandable

- [ ] Idioma declarado en `<html lang="es">` (ya está)
- [ ] Labels en todos los inputs (no solo placeholders)
- [ ] Errores tienen mensaje en lenguaje humano + sugerencia de fix
- [ ] No hay cambios contextuales inesperados (cambiar select no envía formulario)

### Robust

- [ ] HTML semántico (`<button>` para botones, `<nav>` para nav, etc.)
- [ ] Roles ARIA solo cuando el HTML semántico no basta
- [ ] `aria-live="polite"` en regiones que se actualizan (chat, toasts)
- [ ] `aria-busy` mientras se carga
- [ ] Probado con NVDA (Windows), VoiceOver (macOS) y Orca (Linux)

---

## Auditoría automatizada en CI

Sub-issue: `[Feature]: CI job a11y con axe-core sobre el build de producción`

Stack:

- [`@axe-core/playwright`](https://www.npmjs.com/package/@axe-core/playwright) lanzado en cada PR contra el `frontend/dist/` servido por Vite preview
- Reglas: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`
- El job falla si introduce nuevas violations (baseline en `tests/a11y/baseline.json`)
- Reporte adjunto al PR como markdown summary

Frontend dev: añadir `@axe-core/react` en development para warnings en consola en tiempo real.

---

## Auditoría manual periódica

Cada release mayor:

- NVDA + Firefox (Windows): walk-through completo, anotar fricciones
- VoiceOver + Safari (macOS): mismo walk-through
- Orca + Firefox (Ubuntu): smoke test
- Test con teclado solo (sin ratón) en las 7 páginas — cualquier acción que no se pueda completar es bloqueante

---

## Adaptaciones específicas por feature

### Greeting flow

- Focus al input al abrir el modal
- `Enter` envía, `Esc` cancela
- `aria-describedby` del helper text "Se guarda solo en este equipo..."

### Tutorial sombreado (Reactour)

- Reactour v3 expone `aria-labelledby` configurable — lo apuntamos al título del paso
- `aria-describedby` al cuerpo
- `Esc` cierra el tour; `→` siguiente, `←` anterior
- Spotlight no impide `Tab` por el resto de la UI (configurable en Reactour)

### Wizard de modelos

- 3 pasos navegables con `Tab` puro
- Detección de hardware accesible: la "card" de resumen es `<div role="region" aria-label="Resumen de tu hardware">`
- Radios con label asociado, no clicables solo en el círculo
- Mensajes de progreso (descarga de modelo) en `aria-live="polite"`

### Grafo (Obsidian-style)

- El canvas WebGL no es accesible per se. Solución:
  - **Lista alternativa** accesible debajo del grafo (collapse): `<ul role="list">` con los nodos visibles + edges, navegable con teclado
  - Selección del grafo y de la lista están sincronizadas vía Zustand
  - Hotkey `Tab` desde el grafo lleva a la lista; desde la lista vuelve al grafo

### Chat

- Lista de mensajes `<ol aria-live="polite" aria-relevant="additions">`
- Mensajes en streaming: nuevo `<li>` por turno; updates internos no reanunciados (`aria-atomic="false"`)
- Botón "Detener generación" focuseable y visible mientras stream activo
- Citas (`CitationCard`): `<a href="..." aria-label="Ver Artículo X de Ley Y">`

### Diff viewer

- Cambios marcados con tres canales: color (verde/rojo) + icono (+/-) + texto SR-only (`"añadido"`, `"eliminado"`)
- `j` / `k` saltan entre cambios
- Hotkey `o` abre el original; `c` muestra "current"

---

## Tamaño de fuente y zoom

Ajustes → Apariencia → "Tamaño de texto": Small (14 px), Medium (16 px, default), Large (18 px), X-Large (20 px). Aplica un multiplicador a `--font-size-base` que cascadea por toda la UI.

Independiente del zoom del navegador, que sigue funcionando (Ctrl+/Ctrl-).

---

## Alto contraste

Ajustes → Apariencia → "Tema": Auto, Claro, Oscuro, **Alto contraste claro**, **Alto contraste oscuro**.

Los temas de alto contraste:
- Texto sobre fondo: ratio mínimo 7:1
- Bordes siempre visibles (no transparentes)
- Sombras eliminadas — bordes lo sustituyen
- Focus ring 3 px (vs 2 px estándar)

---

## Idiomas

LexFlow apunta a Español (default) e Inglés via #94 (i18n con `react-i18next`). La elección del idioma en Ajustes establece `<html lang>` y todos los textos. Los nombres oficiales de las leyes españolas siempre en español, traducciones del UI sí.

---

## Documentación accesible

- Todos los markdowns siguen markdown semántico (heading hierarchy, alt text en imágenes, listas como listas)
- Las imágenes informativas (no decorativas) llevan alt
- Los videos / GIFs de tutoriales (cuando los haya) llevan transcript

---

## Compromisos público-cara

Cuando llegue el primer release, README.md tendrá una sección de Accesibilidad enlazando a este documento + el VPAT (Voluntary Product Accessibility Template) si llegamos a uno formal.

---

## Recursos

- [WCAG 2.1 quick reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [axe-core rules reference](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [NVDA](https://www.nvaccess.org/download/)
- [VoiceOver — Apple](https://www.apple.com/accessibility/voiceover/)
- [Orca — GNOME](https://help.gnome.org/users/orca/)
- [Radix UI accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility)
