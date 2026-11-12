import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, workers: 1,
  use: { ...base.use, baseURL: 'http://127.0.0.1:55440' },
  webServer: { command: 'node dist/src/main.js', url: 'http://127.0.0.1:55440', reuseExistingServer: false,
    env: { PORT: '55440', MOCK_MODE: 'false', DATABASE_URL: 'postgresql://sige_test@127.0.0.1:55439/sigeifce_disposable',
      DOTENV_CONFIG_PATH: '__sige_no_env__.missing',
      JWT_SECRET: 'isolated-browser-test-only-secret-32-characters', NODE_ENV: 'test' }, timeout: 30000 },
});
