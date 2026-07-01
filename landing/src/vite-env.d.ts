/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Latest published release tag (e.g. "v0.2.0"), baked at build time by
   * .github/workflows/deploy-landing.yml. Empty/undefined in local dev builds,
   * where the version chip falls back to the translated "pre-alpha" status.
   */
  readonly VITE_LATEST_TAG?: string;
}
