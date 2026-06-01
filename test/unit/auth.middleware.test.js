/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

/**
 * ═════════════════════════════════════════════════════════════════════════
 * TESTES: auth.middleware.js (Middleware de Autenticação e Autorização)
 * ═════════════════════════════════════════════════════════════════════════
 * 
 * O QUE ESTÁ A SER TESTADO:
 * ─────────────────────────
 *   Este ficheiro testa as funções de middleware que protegem endpoints:
 *   - requireRole(roles): Permite apenas utilizadores com papéis específicos
 *   - requirePermission(perm): Permite apenas utilizadores com permissão
 *   - requireAdminRole: Apenas administradores\n *   - getPermissionsForActor(actor): Mapeia papéis → permissões
 *   - requireAllPermissions(perms): Valida múltiplas permissões
 * 
 * FLUXO DE PROTEÇÃO:
 * ─────────────────\n *   Request HTTP com JWT\n *       ↓\n *   auth.middleware.buildRequestAuthContext() extrai {userId, role} do JWT\n *       ↓\n *   req.auth ← {userId, role, permissions}\n *       ↓\n *   Middleware de proteção (requireRole/requirePermission)\n *       ↓\n *   Se autorizado: next() → Controller\n *   Se não autorizado: res.status(401|403) → erro\n * 
 * PADRÃO DE TESTES:\n * ─────────────────\n *   Cada middleware testado com:\n *   1. Caso não-autenticado (sem req.auth) → 401 Unauthorized\n *   2. Caso autenticado mas sem permissão → 403 Forbidden\n *   3. Caso autorizado → next() chamado, sem erro\n *   4. Casos edge (papel null, permissões vazias, etc.)\n * 
 * RAZÃO CRÍTICA PARA TESTES:\n * ──────────────────────────\n *   Autorização é um pilar de segurança. Um bug aqui permite:\n *   - Alunos acederem a dados de professores\n *   - Utilizadores acederem a funcionalidades admin\n *   - Contorno de toda a proteção de dados\n *   Por isso, CADA middleware tem testes específicos.\n * \n * NOTA SOBRE PAPÉIS E PERMISSÕES:\n * ────────────────────────────────\n *   - PAPÉIS (role): 'admin', 'teacher', 'student' (valores naturais)\n *   - PERMISSÕES (perm): constantes como APP_PERMISSIONS.ADMIN_PORTAL_ACCESS\n *     (granularidade fina para controlo de features)\n *   - Mapeamento: role → permissões via getPermissionsForActor()\n * \n */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  APP_PERMISSIONS,
  getPermissionsForActor,
  requireAdminRole,
  requireAllPermissions,
  requirePermission,
  requireRole,
} = require('../../src/middlewares/auth.middleware');

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

function runMiddleware(middleware, auth) {
  const req = auth ? { auth } : {};
  const res = createResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  return { res, nextCalled };
}

function expectMiddlewareResult(result, statusCode, payload, nextCalled) {
  assert.equal(result.res.statusCode, statusCode);
  assert.deepEqual(result.res.payload, payload);
  assert.equal(result.nextCalled, nextCalled);
}

const roleCases = [
  {
    name: 'requireRole returns 401 when the request is not authenticated',
    middleware: () => requireRole(['STUDENT']),
    auth: null,
    statusCode: 401,
    payload: { error: 'Unauthorized' },
    nextCalled: false,
  },
  {
    name: 'requireRole returns 403 when authenticated role is missing',
    middleware: () => requireRole(['STUDENT']),
    auth: { userId: 44, role: null },
    statusCode: 403,
    payload: { error: 'Forbidden' },
    nextCalled: false,
  },
  {
    name: 'requireRole allows requests whose authenticated role is explicitly permitted',
    middleware: () => requireRole(['TEACHER', 'ADMIN']),
    auth: { userId: 55, role: 'teacher' },
    statusCode: null,
    payload: null,
    nextCalled: true,
  },
];

for (const testCase of roleCases) {
  test(testCase.name, () => {
    expectMiddlewareResult(runMiddleware(testCase.middleware(), testCase.auth), testCase.statusCode, testCase.payload, testCase.nextCalled);
  });
}

test('getPermissionsForActor maps functional management role names to admin permissions', () => {
  const permissions = getPermissionsForActor({
    userId: 123,
    role: 'Direction / Management',
  });

  assert.equal(permissions.includes(APP_PERMISSIONS.ADMIN_PORTAL_ACCESS), true);
  assert.equal(permissions.includes(APP_PERMISSIONS.TEACHER_PORTAL_ACCESS), false);
});

const permissionCases = [
  {
    name: 'requirePermission returns 401 when the request is not authenticated',
    middleware: () => requirePermission(APP_PERMISSIONS.MARKETPLACE_ACCESS),
    auth: null,
    statusCode: 401,
    payload: { error: 'Unauthorized' },
    nextCalled: false,
  },
  {
    name: 'requirePermission returns 403 when role permissions do not include the required permission',
    middleware: () => requirePermission(APP_PERMISSIONS.ADMIN_PORTAL_ACCESS),
    auth: { userId: 77, role: 'student' },
    statusCode: 403,
    payload: { error: 'Forbidden' },
    nextCalled: false,
  },
  {
    name: 'requirePermission allows requests when role has the expected permission',
    middleware: () => requirePermission(APP_PERMISSIONS.ADMIN_PORTAL_ACCESS),
    auth: { userId: 78, role: 'Direção' },
    statusCode: null,
    payload: null,
    nextCalled: true,
  },
];

for (const testCase of permissionCases) {
  test(testCase.name, () => {
    expectMiddlewareResult(runMiddleware(testCase.middleware(), testCase.auth), testCase.statusCode, testCase.payload, testCase.nextCalled);
  });
}

const allPermissionCases = [
  {
    name: 'requireAllPermissions returns 403 when at least one permission is missing',
    middleware: () => requireAllPermissions(
      APP_PERMISSIONS.AUTHENTICATED_ACCESS,
      APP_PERMISSIONS.ADMIN_PORTAL_ACCESS
    ),
    auth: { userId: 79, role: 'teacher' },
    statusCode: 403,
    payload: { error: 'Forbidden' },
    nextCalled: false,
  },
  {
    name: 'requireAllPermissions allows requests only when all permissions are present',
    middleware: () => requireAllPermissions(
      APP_PERMISSIONS.AUTHENTICATED_ACCESS,
      APP_PERMISSIONS.STUDENT_PORTAL_ACCESS,
      APP_PERMISSIONS.INVENTORY_ACCESS
    ),
    auth: { userId: 80, role: 'student' },
    statusCode: null,
    payload: null,
    nextCalled: true,
  },
];

for (const testCase of allPermissionCases) {
  test(testCase.name, () => {
    expectMiddlewareResult(runMiddleware(testCase.middleware(), testCase.auth), testCase.statusCode, testCase.payload, testCase.nextCalled);
  });
}

const adminRoleCases = [
  {
    name: 'requireAdminRole accepts functional management labels mapped to admin',
    auth: { userId: 81, role: 'Direction' },
    statusCode: null,
    payload: null,
    nextCalled: true,
  },
  {
    name: 'requireAdminRole rejects non-admin roles',
    auth: { userId: 82, role: 'teacher' },
    statusCode: 403,
    payload: { error: 'Forbidden' },
    nextCalled: false,
  },
];

for (const testCase of adminRoleCases) {
  test(testCase.name, () => {
    expectMiddlewareResult(runMiddleware(requireAdminRole, testCase.auth), testCase.statusCode, testCase.payload, testCase.nextCalled);
  });
}
