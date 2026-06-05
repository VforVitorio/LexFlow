# Distribución como app de escritorio (Fase 6)

> **Estado (2026-06-05): parcial.** Lo shippeado y lo bloqueado:
>
> | Pieza | Estado |
> |---|---|
> | `packaging/backend.spec` PyInstaller (23.7 MB single-file Windows local) + matrix CI ubuntu/macos/windows | ✅ #367 |
> | Landing downloads section con OS detection (`navigator.userAgent`) | ✅ #368 |
> | Single-process serving (FastAPI sirve API + SPA en un proceso) | ✅ Sprint 1 (#66) |
> | Tauri 2 wrapper + PyInstaller sidecar | ⏸️ #125 — necesita Rust toolchain + pipeline Tauri |
> | Code signing Windows (Azure Trusted Signing) + macOS (Apple Developer) | ⏸️ #127 — necesita certs |
> | Auto-update con Tauri Updater | ⏸️ #128 — necesita release server |
>
> El resto del documento es el plan técnico; las cuatro piezas bloqueadas están bloqueadas en infraestructura externa, no en decisión de diseño.

---

Cómo empaquetar LexFlow para que un usuario sin Python, sin terminal y sin saber qué es `npm` pueda descargar un instalador, hacer doble clic, y tener la app abierta en 30 segundos.

---

## TL;DR — Decisión técnica

**Tauri 2 + PyInstaller sidecar.** Investigamos 4 opciones (PyInstaller-only, Tauri+sidecar, Electron+sidecar, BeeWare/Briefcase). Tauri gana por bundle size pequeño, auto-update built-in, y el stack frontend ya casado con React + Vite.

| Opción | Bundle | Auto-update | Veredicto |
|--------|--------|-------------|-----------|
| PyInstaller-only + browser tab | 60-120 MB sin LLM SDKs, +100 MB con | Roll your own | Se siente como un server, no como app |
| **Tauri 2 + PyInstaller sidecar** | **50-70 MB** | **Plugin oficial** | **Elegido** |
| Electron + Python sidecar | 150-250 MB | Mature (electron-updater) | 3-5× más grande que Tauri |
| BeeWare / Briefcase | Pequeño | Custom | React-hostile (orientado a Toga) |

---

## Arquitectura de empaquetado

```
┌─────────────────────────────────────────┐
│  LexFlow.exe (Tauri shell, Rust)        │
│  ┌─────────────────────────────────┐    │
│  │ System WebView (WebView2/WKWeb) │    │
│  │   loads frontend/dist/index.html│    │
│  └────────────┬────────────────────┘    │
│               │ HTTP localhost:port     │
│               ▼                         │
│  ┌─────────────────────────────────┐    │
│  │ Python sidecar (PyInstaller'd)  │    │
│  │   FastAPI + Pydantic + NetworkX │    │
│  │   + chat providers + FastMCP    │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

- **Tauri shell** (Rust, ~8-12 MB compilado): registra el sidecar en `tauri.conf.json` con `externalBin`, lo arranca al abrir la app y lo cierra al salir.
- **Sidecar Python** (PyInstaller, ~35-40 MB en Windows): `main.py` arrancado con `uvicorn` en un puerto libre. Tauri descubre el puerto via stdout del subproceso.
- **Frontend** (Vite build, ~350 KB JS + 32 KB CSS gzipped): copiado a `tauri/dist/` durante el build. Tauri lo sirve embedido en el binario.

Total estimado del installer: **50-70 MB** antes de bundlear LLM SDKs (`openai`, `anthropic`, `google-genai`). Si los incluimos todos, podría subir a 100-130 MB. Mitigation: lazy-import desde Python para no incluir lo que no se use.

---

## Por qué Tauri y no Electron

- **Bundle 3-5× menor.** Electron empaqueta Chromium en cada app (~150 MB solo Chromium). Tauri usa el WebView del sistema operativo (WebView2 en Win 10/11 preinstalado, WKWebView en macOS, WebKitGTK en Linux).
- **Memoria en runtime ~3× menor.** Electron carga Chromium completo en cada ventana; Tauri reusa el WebView del SO.
- **Auto-update built-in.** Plugin oficial [Tauri Updater](https://v2.tauri.app/plugin/updater/) firma un `update.json` con keypair. No hace falta montar Squirrel ni similar.
- **Mejor seguridad por defecto.** API IPC explícita (allow-list de comandos Rust expuestos al JS), CSP estricto.
- **Coste:** aprender Rust mínimo (sidecar pattern no requiere escribir lógica de negocio en Rust, solo wiring), comunidad más pequeña que Electron.

---

## Por qué no PyInstaller solo

Empaquetar todo con PyInstaller y abrir `http://127.0.0.1:8000` en el navegador por defecto funciona, pero:

- **Se siente como un server**, no como una app. No hay icono en la barra de tareas, no hay tray icon, no hay ventana nativa con menú propio.
- **Sin auto-update built-in.** [PyUpdater](https://github.com/Digital-Sapphire/PyUpdater) está sin mantenimiento desde 2022. Rolling our own update mechanism cuesta tiempo y es error-prone.
- **First-launch lento.** Single-file PyInstaller desempaqueta a `/tmp` en cada arranque. 1-3 s extras cada vez.
- **Posible bloqueo de antivirus.** Single-file PyInstaller es heurística común de malware en Windows. SmartScreen y Defender pueden bloquearlo si no está firmado.

Lo mantenemos como **modo "headless / dev"** — `uv run python main.py` sigue funcionando para devs. Pero no es la distribución por defecto.

---

## Code signing

Crítico para que Windows SmartScreen y macOS Gatekeeper no bloqueen la app.

### Windows

**Opción A (recomendada): Azure Trusted Signing.** ~$10/mes, sin hardware token (HSM en la nube). Tauri lo soporta directamente con `signCommand` en `tauri.conf.json`. [Docs](https://v2.tauri.app/distribute/sign/windows/).

**Opción B:** Certificate EV de DigiCert o Sectigo. ~$400/año + USB token (HSM físico). Bypass instantáneo de SmartScreen. Caro pero produce el "verified publisher" visible.

**Opción C:** sin firmar. SmartScreen lo bloquea hasta que ganas reputación (basado en número de descargas). Aceptable para alpha/beta, no para release.

### macOS

**Apple Developer Program ($99/año) es obligatorio.** Necesitamos:

- **Developer ID Application** cert — firma del .app
- **Developer ID Installer** cert — firma del .dmg
- Notarización Apple — submission al servicio de Apple Notary para escaneo

Sin esto, Gatekeeper marca la app como "cannot be opened because Apple cannot check it for malicious software" y el usuario tiene que ir a System Preferences → Security & Privacy a habilitarla. Inaceptable para usuario no técnico.

### Linux

Sin code signing como concept. El usuario descarga el `.AppImage`, le da permisos de ejecución y lo abre. Para `.deb`/`.rpm` podemos firmar con GPG el repo APT/YUM si llegamos a hostear uno.

---

## Auto-update

[Tauri Updater plugin v2](https://v2.tauri.app/plugin/updater/):

1. Generamos un keypair con `tauri signer generate -w ~/.tauri/lexflow.key`
2. La pública va dentro del bundle (`tauri.conf.json` → `updater.pubkey`)
3. La privada vive en GitHub Secrets para firmar el `update.json` en cada release
4. En cada release-please draft que tagea una nueva versión:
   - GitHub Actions build los binarios firmados (Win/Mac/Linux)
   - Sube a la GitHub Release los artefactos + un `latest.json` con metadata
   - El plugin Tauri Updater apunta a `https://github.com/VforVitorio/LexFlow/releases/latest/download/latest.json`
5. La app, al arrancar, polea `latest.json`. Si hay versión nueva, muestra un toast "Hay una nueva versión disponible (X.Y.Z). [Actualizar] [Recordar más tarde]"
6. Al pulsar Actualizar: descarga el delta, valida firma, reinicia con la nueva versión

Política sugerida: pole una vez al día, no en cada launch. Toast no-blocking. Skippable.

---

## Bundling del corpus `legalize-es`

Decisión: **se bundlea con la app**, no se descarga al primer arranque. Razones:

- El submódulo `legalize-es` actual son ~hundreds of MB shallow, decenas de MB de Markdown final (sin git history)
- Distribuir con la app garantiza funcionamiento offline desde minuto 1
- La actualización del corpus se hace via `POST /api/v1/sync/run` (#86) que mete los Markdown nuevos en `<userdata>/legalize-es-update/` y los prioriza sobre los bundled

Coste: el installer crece +20-30 MB. Aceptable.

---

## CI/CD para releases

Stack:

- [release-please](https://github.com/googleapis/release-please-action) ya configurado (#40 cerrado). Genera draft releases por conventional commits.
- En el job de release, build matrix con 3 platforms:
  - `windows-latest` → `LexFlow_<version>_x64-setup.exe` (NSIS instaler)
  - `macos-latest` (Apple Silicon) → `LexFlow_<version>_aarch64.dmg`
  - `macos-13` (Intel) → `LexFlow_<version>_x64.dmg`
  - `ubuntu-22.04` → `LexFlow_<version>_amd64.AppImage` + `.deb`
- Cada platform corre:
  1. `uv build` + `pyinstaller backend.spec` → sidecar binary
  2. `cd frontend && npm ci && npm run build` → frontend assets
  3. `cargo tauri build` → final installer + signing
  4. Adjunta artefactos a la GitHub Release

Code signing certs viven en GitHub Secrets:
- `WINDOWS_CERT_AZURE_*` (Trusted Signing creds)
- `APPLE_CERTIFICATE_BASE64`, `APPLE_CERT_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific) para notarización
- `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` para firmar `update.json`

---

## Landing page de descargas

Página web pública (puede vivir en GitHub Pages o Vercel) con:

- Detección de OS del visitante (`navigator.userAgent`) → CTA "Descargar para Windows / macOS / Linux"
- Versión actual + changelog corto
- Fallback a la GitHub Releases page para usuarios técnicos
- Footer con link al código en GitHub

Sub-tarea opcional dentro de Fase 6.

---

## Cuándo empezamos

Pre-requisitos antes de arrancar Fase 6:

- Fase 5B cerrada (frontend conectado al backend real) — empaquetar mock data no tiene sentido
- Decisión final sobre LLM SDKs incluidos (`openai`, `anthropic`, `google-genai` — ¿bundlear todos o lazy-pull?)
- Cuenta de Apple Developer registrada ($99/año)
- Azure Trusted Signing dado de alta (~$10/mes)

Estimación: 3-5 días de trabajo concentrado una vez Fase 5B esté listo.

---

## Fuentes

- [Tauri sidecar (v2)](https://v2.tauri.app/develop/sidecar/)
- [Tauri Updater plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri Windows code signing](https://v2.tauri.app/distribute/sign/windows/)
- [dieharders/example-tauri-v2-python-server-sidecar](https://github.com/dieharders/example-tauri-v2-python-server-sidecar)
- [AlanSynn/vue-tauri-fastapi-sidecar-template](https://github.com/AlanSynn/vue-tauri-fastapi-sidecar-template)
- [guilhermeprokisch/tauri-fastapi-react-app](https://github.com/guilhermeprokisch/tauri-fastapi-react-app)
- [aiechoes — Production-Ready Desktop LLM Apps (Feb 2026)](https://aiechoes.substack.com/p/building-production-ready-desktop)
- [PyInstaller 6.20 docs](https://pyinstaller.org/en/stable/usage.html)
- [Nuitka vs PyInstaller](https://krrt7.dev/en/blog/nuitka-vs-pyinstaller)
- [Electron auto-update](https://www.electron.build/auto-update)
