/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CORS_ALLOW_NO_ORIGIN = process.env.CORS_ALLOW_NO_ORIGIN || 'true';
process.env.CSRF_ALLOW_NO_ORIGIN = process.env.CSRF_ALLOW_NO_ORIGIN || 'false';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'sqlserver://localhost;database=gestArtes_test;user=test;password=test;encrypt=true;trustServerCertificate=true;';
const app = require('../../src/app');

const {
  injectCspNonceInSwaggerHtml,
} = require('../../src/config/swagger');
const { initSocket } = require('../../src/socket');

let server;
let baseUrl;
let io;

test.before(async () => {
  server = http.createServer(app);
  io = initSocket(server);

  await new Promise((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (io) {
    io.close();
  }

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

function socketHandshakePath() {
  const timestamp = Date.now();
  return `/socket.io/?EIO=4&transport=polling&t=${timestamp}`;
}

test('health endpoint exposes security headers and allows the configured origin', async () => {
  const response = await request('/health', {
    headers: {
      Origin: 'http://localhost:5173',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(response.headers.get('x-powered-by'), null);
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

test('student profile endpoint requires authentication', async () => {
  const response = await request('/student/profile');

  assert.equal(response.status, 401);

  const body = await response.json();
  assert.equal(body.error, 'Not authenticated');
});

test('student profile write attempts still require authentication', async () => {
  const putResponse = await request('/student/profile', {
    method: 'PUT',
    headers: {
      Origin: 'http://localhost:5173',
    },
  });
  const patchResponse = await request('/student/profile', {
    method: 'PATCH',
    headers: {
      Origin: 'http://localhost:5173',
    },
  });

  assert.equal(putResponse.status, 401);
  assert.equal(patchResponse.status, 401);
});

test('csrf protection blocks state-changing requests from untrusted origins', async () => {
  const blockedResponse = await request('/auth/logout', {
    method: 'POST',
    headers: {
      Origin: 'http://evil.example',
    },
  });

  assert.equal(blockedResponse.status, 403);

  const blockedBody = await blockedResponse.json();
  assert.equal(blockedBody.error, 'Invalid request origin');
});

test('csrf protection allows state-changing requests from configured origins', async () => {
  const allowedResponse = await request('/auth/logout', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5173',
    },
  });

  assert.equal(allowedResponse.status, 204);
});

test('socket handshake allows configured origin in CORS headers', async () => {
  const response = await request(socketHandshakePath(), {
    headers: {
      Origin: 'http://localhost:5173',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('socket handshake omits CORS allow-origin for unlisted origin', async () => {
  const response = await request(socketHandshakePath(), {
    headers: {
      Origin: 'http://evil.example',
    },
  });

  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
