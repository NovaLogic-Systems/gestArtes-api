const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const Module = require('node:module');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CORS_ALLOW_NO_ORIGIN = process.env.CORS_ALLOW_NO_ORIGIN || 'true';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'sqlserver://localhost;database=gestArtes_test;user=test;password=test;encrypt=true;trustServerCertificate=true;';

class FakeMssqlStore {
  constructor() {}

  on() {
    return this;
  }

  get(_sessionId, callback) {
    if (callback) {
      callback(null, null);
    }
  }

  set(_sessionId, _session, callback) {
    if (callback) {
      callback(null);
    }
  }

  destroy(_sessionId, callback) {
    if (callback) {
      callback(null);
    }
  }

  touch(_sessionId, _session, callback) {
    if (callback) {
      callback(null);
    }
  }

  length(callback) {
    if (callback) {
      callback(null, 0);
    }
  }

  all(callback) {
    if (callback) {
      callback(null, []);
    }
  }

  clear(callback) {
    if (callback) {
      callback(null);
    }
  }
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'connect-mssql-v2') {
    return FakeMssqlStore;
  }

  return originalLoad.call(this, request, parent, isMain);
};

let app;

try {
  app = require('../../src/app');
} finally {
  Module._load = originalLoad;
}

const {
  injectCspNonceInSwaggerHtml,
} = require('../../src/config/swagger');

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (!server) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

test('health endpoint exposes security headers and allows the configured origin', async () => {
  const response = await request('/health', {
    headers: {
      Origin: 'http://localhost:5173',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');

  const csp = response.headers.get('content-security-policy');
  assert.ok(csp);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
});

test('health endpoint does not allow unlisted origins', async () => {
  const response = await request('/health', {
    headers: {
      Origin: 'http://evil.example',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('docs redirects to trailing slash and serves nonce-hardened HTML', async () => {
  const redirectResponse = await request('/docs', {
    redirect: 'manual',
  });

  assert.equal(redirectResponse.status, 308);
  assert.equal(redirectResponse.headers.get('location'), '/docs/');

  const docsResponse = await request('/docs/');
  assert.equal(docsResponse.status, 200);

  const csp = docsResponse.headers.get('content-security-policy');
  assert.ok(csp);
  assert.match(csp, /script-src[^;]*'nonce-[^']+'/);
  assert.match(csp, /style-src[^;]*'nonce-[^']+'/);
  assert.match(csp, /style-src-attr 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline/);

  const html = await docsResponse.text();
  assert.match(html, /class="swagger-hidden-svg"/);
  assert.doesNotMatch(html, /style="position:absolute;width:0;height:0"/);
  assert.match(html, /nonce="[^"]+"/);
});

test('swagger helper rewrites every hidden svg placeholder', () => {
  const html = [
    '<svg aria-hidden="true" style="position:absolute;width:0;height:0"></svg>',
    '<div><svg focusable="false" style="position:absolute;width:0;height:0"></svg></div>',
  ].join('');

  const rewritten = injectCspNonceInSwaggerHtml(html, 'nonce-123');

  assert.equal((rewritten.match(/class="swagger-hidden-svg"/g) || []).length, 2);
  assert.doesNotMatch(rewritten, /style="position:absolute;width:0;height:0"/);
});