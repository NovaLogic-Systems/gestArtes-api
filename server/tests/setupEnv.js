process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.CORS_ALLOW_NO_ORIGIN = 'true';
process.env.CSRF_ALLOW_NO_ORIGIN = 'true';
process.env.SESSION_SECRET = 'jest-test-secret';
process.env.DATABASE_URL =
  'sqlserver://localhost;database=gestArtes_test;user=test;password=test;encrypt=true;trustServerCertificate=true;';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '60000';
process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.ADMIN_DASHBOARD_RT_INTERVAL_MS = '600000';
process.env.TZ = 'UTC';
