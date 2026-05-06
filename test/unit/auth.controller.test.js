/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// ---------------------------------------------------------------------------
// Estado falso partilhado
// ---------------------------------------------------------------------------

const mockState = {
  userByEmail: null,
  userById: null,
  bcryptResult: true,
  sessionSaveError: null,
  sessionRegenerateError: null,
  sessionDestroyError: null,
  loggedMessages: [],
};

// ---------------------------------------------------------------------------
// Dependências falsas
// ---------------------------------------------------------------------------

const fakePrisma = {
  user: {
    findUnique: async ({ where }) => {
      if (where?.Email !== undefined) return mockState.userByEmail;
      if (where?.UserID !== undefined) return mockState.userById;
      return null;
    },
  },
};

const fakeBcrypt = {
  compare: async () => mockState.bcryptResult,
};

const fakeLogger = {
  log: (entry) => mockState.loggedMessages.push(entry),
  info: (msg, meta) => mockState.loggedMessages.push({ msg, ...meta }),
};

// ---------------------------------------------------------------------------
// Substituição de módulos
// ---------------------------------------------------------------------------

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') return fakePrisma;
  if (request === 'bcrypt') return fakeBcrypt;
  if (request === '../utils/logger') return fakeLogger;
  return originalLoad.call(this, request, parent, isMain);
};

let authController;
try {
  authController = require('../../src/controllers/auth.controller');
} finally {
  Module._load = originalLoad;
}

// ---------------------------------------------------------------------------
// Funções auxiliares
// ---------------------------------------------------------------------------

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    cookies: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
    send() { return this; },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie() { return this; },
  };
}

function buildUser(overrides = {}) {
  return {
    UserID: 1,
    AuthUID: 'ST-0001',
    FirstName: 'Ana',
    LastName: 'Silva',
    Email: 'ana@test.com',
    PasswordHash: 'hashed',
    IsActive: true,
    DeletedAt: null,
    UserRole: [
      { Role: { RoleName: 'student' } },
    ],
    ...overrides,
  };
}

function buildApp(overrides = {}) {
  const store = new Map();
  store.set('refreshCookieName', 'gestartes.refresh_token');
  store.set('refreshCookieOptions', { httpOnly: true, sameSite: 'strict', path: '/' });
  Object.entries(overrides).forEach(([k, v]) => store.set(k, v));
  return { get: (key) => store.get(key) };
}

function resetState() {
  mockState.userByEmail = null;
  mockState.userById = null;
  mockState.bcryptResult = true;
  mockState.loggedMessages = [];
}

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

/**
 * GRUPO DE TESTES: login()
 * ═════════════════════════════════════════════════════════════════════════
 * 
 * CONTEXTO GERAL:
 *   O endpoint login() é crítico para autenticação. Precisa validar:
 *   1. Credenciais corretas (email + password)
 *   2. Estados de utilizador (existência, ativo/inativo)
 *   3. Segurança (resistência a força bruta, logs de auditoria)
 *   4. Geração de tokens JWT (access + refresh)
 * 
 * PADRÃO DE RESPOSTA:
 *   Sucesso: HTTP 200 com { user, role, accessToken, tokenType, refresh cookie }
 *   Falha: HTTP 401 com { error: 'Invalid credentials' } (sem detalhar razão)
 * 
 * A resposta 401 é deliberadamente vaga (não diz se email existe ou password\n *   está errada) para não permitir enumeração de utilizadores.
 */

test('login: returns 401 when user does not exist', async () => {
  resetState();
  mockState.userByEmail = null;

  const req = {
    body: { email: 'nope@test.com', password: 'secret' },
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'test-agent',
  };
  const res = createResponse();
  let nextError = null;
  await authController.login(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Invalid credentials' });
});

/**
 * TEST: login() retorna 401 para utilizador inativo
 * 
 * O QUE: Um utilizador que existe mas está marcado como inativo
 * (IsActive = false) não consegue fazer login.
 * 
 * COMO: Tenta fazer login com credenciais corretas mas user.IsActive=false.
 * Valida que a resposta é 401 (sem indicar se é por user inativo ou credenciais).
 * 
 * POR QUE: Utilizadores inativos (removidos, suspensos, licenças expiradas)
 * não devem ter acesso. A resposta 401 genérica não detalha se é por\n * inatividade ou credenciais falsas (evita enumeração).
 * 
 * ASSERTIONS:
 *   - statusCode 401: Não autorizado
 *   - error 'Invalid credentials': Mensagem genérica (não diz \"user inativo\")
 */
test('login: returns 401 when user is inactive', async () => {
  resetState();
  mockState.userByEmail = buildUser({ IsActive: false });

  const req = {
    body: { email: 'ana@test.com', password: 'secret' },
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'test-agent',
  };
  const res = createResponse();
  let nextError = null;
  await authController.login(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Invalid credentials' });
});

/**
 * TEST: login() retorna 401 para password incorreta
 * 
 * O QUE: Um utilizador existe e está ativo, mas a password fornecida\n * está errada. O endpoint deve rejeitar.
 * 
 * COMO: Mock bcrypt para retornar false (password não coincide).
 * Tenta login com password errada. Valida 401.
 * 
 * POR QUE: Password incorreta = não autorizado. Isto é fundamental para\n * segurança. Se aceitássemos passwords erradas, toda a autenticação ruiria.
 * 
 * ASSERTIONS:
 *   - statusCode 401: Rejeição de acesso\n *   - error: Mensagem genérica (não diferencia user não existe vs password errada)
 */
test('login: returns 401 when password is wrong', async () => {
  resetState();
  mockState.userByEmail = buildUser();
  mockState.bcryptResult = false;

  const req = {
    body: { email: 'ana@test.com', password: 'wrong' },
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'test-agent',
  };
  const res = createResponse();
  let nextError = null;
  await authController.login(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Invalid credentials' });
});

/**
 * TEST: login() sucede com credenciais válidas e retorna user+role+token\n * 
 * O QUE: Teste do caminho feliz. Utilizador existe, está ativo, password\n * correta. Deve retornar HTTP 200 com user, role, accessToken, e refresh cookie.
 * 
 * COMO:\n *   1. Mock user existe e password correta\n *   2. Faz login\n *   3. Valida resposta: user object com userId/email, role, accessToken JWT,\n *      tipo de token \"Bearer\", e refresh cookie httpOnly\n * 
 * POR QUE: Este é o cenário principal. Se falhar, toda a autenticação fica\n * comprometida. A presença de accessToken e refresh cookie é crítica para\n * manter a sessão ativa.\n * 
 * ASSERTIONS:\n *   - statusCode null (implícito): Sem chamada a res.status(), sinal de sucesso
 *   - user object: Contém userId, email\n *   - role: Um dos papéis válidos ['student', 'teacher', 'admin']\n *   - accessToken: String JWT para requests subsequentes\n *   - tokenType 'Bearer': Padrão HTTP Authorization header\n *   - cookies.length 1: Exatamente um cookie (refresh token)\n *   - cookie name 'gestartes.refresh_token': Nome correto\n */
test('login: succeeds and returns user + role', async () => {
  resetState();
  const user = buildUser();
  mockState.userByEmail = user;
  mockState.bcryptResult = true;

  const req = {
    body: { email: 'ana@test.com', password: 'correct' },
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'test-agent',
  };
  const res = createResponse();
  let nextError = null;
  await authController.login(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null);
  assert.equal(res.statusCode, null, 'should not call res.status()');
  assert.ok(res.payload?.user, 'should return user object');
  assert.equal(res.payload.user.userId, 1);
  assert.equal(res.payload.user.email, 'ana@test.com');
  assert.ok(['student', 'teacher', 'admin'].includes(res.payload.role));
  assert.equal(typeof res.payload.accessToken, 'string');
  assert.equal(res.payload.tokenType, 'Bearer');
  assert.equal(res.cookies.length, 1);
  assert.equal(res.cookies[0].name, 'gestartes.refresh_token');
});

/**
 * TEST: login() regista auditoria de sucesso
 *
 * O QUE: Após login bem-sucedido, o sistema regista um evento de segurança
 * com success=true, IP, user agent, etc. para auditoria.
 * 
 * COMO: Faz login com credenciais corretas, procura log com success=true.
 * 
 * POR QUE: Auditoria de segurança é mandatória. Admin precisa saber:
 *   - Quem entrou (UserID)
 *   - Quando (timestamp)
 *   - De onde (IP)
 *   - Com que dispositivo (user agent)
 * Isto permite detetar acessos suspeitos ou compromisso de contas.
 * 
 * ASSERTIONS:
 *   - Existe entry com success=true: Sucesso foi registado
 */
test('login: logs a security success entry on success', async () => {
  resetState();
  mockState.userByEmail = buildUser();
  mockState.bcryptResult = true;

  const req = {
    body: { email: 'ana@test.com', password: 'correct' },
    app: buildApp(),
    ip: '10.0.0.1',
    headers: {},
    get: () => 'ua',
  };
  await authController.login(req, createResponse(), () => {});

  const successLog = mockState.loggedMessages.find((m) => m.success === true);
  assert.ok(successLog, 'expected a success audit log entry');
});

/**
 * TEST: login() regista auditoria de falha em password errada
 *
 * O QUE: Após tentativa falhada de login (password errada), o sistema
 * regista um evento de segurança com success=false para deteção de força bruta.
 * 
 * COMO: Tenta login com password errada, procura log com success=false.
 * 
 * POR QUE: Tentativas falhadas de login são sinais de possível ataque.\n * Ao registar todas as falhas (IP, timestamp, user agent), podemos:
 *   - Detetar força bruta (múltiplas tentativas do mesmo IP)\n *   - Detetar account takeover (tentativas suspeitas de acesso)
 *   - Aplicar mitigação (rate limiting, alertas)\n * 
 * ASSERTIONS:
 *   - Existe entry com success=false: Falha foi registada
 */
test('login: logs a security failure entry on bad password', async () => {
  resetState();
  mockState.userByEmail = buildUser();
  mockState.bcryptResult = false;

  const req = {
    body: { email: 'ana@test.com', password: 'bad' },
    app: buildApp(),
    ip: '10.0.0.1',
    headers: {},
    get: () => 'ua',
  };
  await authController.login(req, createResponse(), () => {});

  const failLog = mockState.loggedMessages.find((m) => m.success === false);
  assert.ok(failLog, 'expected a failure audit log entry');
});

// ---------------------------------------------------------------------------
// me
// ---------------------------------------------------------------------------

/**
 * GRUPO DE TESTES: me()
 * ═════════════════════════════════════════════════════════════════════════
 * 
 * CONTEXTO GERAL:
 *   O endpoint me() retorna dados do utilizador autenticado (a partir do JWT).
 *   Serve para:
 *   - Validar que JWT ainda é válido\n *   - Buscar dados atualizados do utilizador (nome, email, papel)
 *   - Verificar se utilizador foi removido/desativado desde login
 * 
 * PADRÃO DE RESPOSTA:
 *   Sucesso: HTTP 200 com { user: { userId, email, firstName, ... } }
 *   Falha (sem auth): HTTP 401 com { error: 'Not authenticated' }
 *   Falha (user removido/inativo): HTTP 401 com { error: '...' }
 * 
 * Nota: A validação de token JWT é feita por auth.middleware antes\n * de chegar a este controller. Aqui só validamos estado do utilizador na BD.
 */

test('me: returns 401 when request has no authenticated user', async () => {
test('me: returns 401 when request has no authenticated user', async () => {
  resetState();

  const req = {};
  const res = createResponse();
  await authController.me(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Not authenticated' });
  });

  /**
   * TEST: me() valida que utilizador ainda existe na BD
   * 
   * O QUE: Se um utilizador tinha JWT válido mas foi apagado (soft-delete),
   * me() deve retornar 401 (token inválido porque utilizador foi removido).
   * 
   * COMO: Mock não retorna user (userById = null), tenta chamar me()
   * com auth context válido.
   * 
   * POR QUE: Soft-delete de utilizadores é imediato. Se não invalidarmos\n * a sessão/JWT, utilizador removido ainda conseguia fazer operações.\n * Este teste garante que sessions morrem quando o utilizador é removido.
   * 
   * ASSERTIONS:
   *   - statusCode 401: Utilizador não encontrado na BD
   */

  test('me: returns 401 when authenticated user no longer exists in DB', async () => {
test('me: returns 401 when authenticated user no longer exists in DB', async () => {
  resetState();
  mockState.userById = null;

  const req = {
    auth: {
      userId: 99,
      role: 'student',
    },
  };
  const res = createResponse();
  await authController.me(req, res, () => {});

  assert.equal(res.statusCode, 401);
});

/**
 * TEST: me() valida que utilizador está ativo
 * 
 * O QUE: Se utilizador foi desativado (IsActive = false), JWT ainda\n * é válido mas me() deve retornar 401 para impedir acesso a dados.
 * 
 * COMO: Mock user inativo, tenta chamar me().
 * 
 * POR QUE: Utilizadores podem ser suspensos, ter licenças expiradas, etc.\n * Não queremos que tenham acesso a dados/operações enquanto inativos.
 * 
 * ASSERTIONS:
 *   - statusCode 401: Utilizador inativo, acesso negado
 */

test('me: returns 401 when authenticated user is inactive', async () => {
  resetState();
  mockState.userById = buildUser({ IsActive: false });

  const req = {
    auth: {
      userId: 1,
      role: 'student',
    },
  };
  const res = createResponse();
  await authController.me(req, res, () => {});

  assert.equal(res.statusCode, 401);
});

/**
 * TEST: me() retorna utilizador serializado quando auth é válido
 * 
 * O QUE: Teste do caminho feliz. Utilizador existe, está ativo,\n * JWT válido. Deve retornar HTTP 200 com user serializado.
 * 
 * COMO: Mock user ativo, chama me() com auth context válido.
 * 
 * POR QUE: Isto permite frontend validar sessão e atualizar dados do\n * utilizador (por exemplo, depois de logout de outra aba).
 * 
 * ASSERTIONS:
 *   - user object: Contém userId, email
 */

test('me: returns serialized user when auth context is valid', async () => {
  resetState();
  mockState.userById = buildUser({ IsActive: false });

  const req = {
    auth: {
      userId: 1,
      role: 'student',
    },
  };
  const res = createResponse();
  await authController.me(req, res, () => {});

  assert.equal(res.statusCode, 401);
});

test('me: returns serialized user when auth context is valid', async () => {
  resetState();
  const user = buildUser();
  mockState.userById = user;

  const req = {
    auth: {
      userId: 1,
      role: 'student',
    },
  };
  const res = createResponse();
  await authController.me(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, null);
  assert.ok(res.payload?.user);
  assert.equal(res.payload.user.userId, 1);
  assert.equal(res.payload.user.email, 'ana@test.com');
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

/**
 * GRUPO DE TESTES: logout()
 * ═════════════════════════════════════════════════════════════════════════
 * 
 * CONTEXTO GERAL:
 *   O endpoint logout() encerra a sessão do utilizador. Neste sistema,\n *   logout significa:\n *   1. Invalidar refresh token (Cookie httpOnly)\n *   2. Registar evento de auditoria (logout time, IP, etc.)\n * 
 * PADRÃO DE RESPOSTA:
 *   Sempre HTTP 204 No Content (sem corpo), independentemente do estado
 *   (mesmo se utilizador não estava autenticado).\n *   Isto é por design: logout é idempotente (não falha mesmo se já está out).
 */

test('logout: returns 204 without session dependency', () => {
test('logout: returns 204 without session dependency', () => {
  const req = {};
  const res = createResponse();
  authController.logout(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, 204);
});

test('logout: returns 204 with request metadata present', () => {
  const req = {
    auth: {
      userId: 1,
      role: 'student',
    },
    app: buildApp(),
    ip: '127.0.0.1',
    headers: {},
    get: () => 'ua',
  };
  const res = createResponse();

  authController.logout(req, res, (err) => { assert.fail(`unexpected next: ${err}`); });

  assert.equal(res.statusCode, 204);
});
