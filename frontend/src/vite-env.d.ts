/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_USE_MOCK: string;
  readonly VITE_DEFAULT_MODEL: string;
  readonly VITE_MOCK_APP_UPDATE: string;
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface LexflowDevApi {
  simulateAppUpdate?: (scenario: 'available' | 'error-download' | 'error-install') => Promise<void>;
}

interface Window {
  __lexflowDev?: LexflowDevApi;
}
