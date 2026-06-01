/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { withPatchedModules } = require('./helpers/moduleLoader');

const mockState = {
  existingUser: null,
  existingAuthUidUser: null,
  listedUsers: [],
  userById: {},
  roles: [
    { RoleID: 1, RoleName: 'Direção' },
    { RoleID: 2, RoleName: 'Professor' },
    { RoleID: 3, RoleName: 'Aluno' },
  ],
  userCreateData: null,
  userUpdateData: null,
  userRoleCreateData: null,
  userRoleCreateManyData: null,
  userRoleDeleteWhere: null,
  studentAccountCreateData: null,
  studentAccountUpdateData: null,
  postSessionValidations: [],
  finalizationResult: {
    sessionId: 901,
    financialEntryId: 777,
    finalPrice: 82.5,
  },
  finalizationArgs: null,
};

const fakeBcrypt = {
  hash: async (value) => `hashed:${value}`,
};

const fakePrisma = {
  $transaction: async (input) => {
    if (typeof input === 'function') {
      return input(fakePrisma);
    }
    if (Array.isArray(input)) {
      return Promise.all(input);
    }
    return input;
  },
  role: {
    findMany: async () => mockState.roles,
  },
  user: {
    count: async () => mockState.listedUsers.length,
    findUnique: async ({ where }) => {
      if (where?.Email) {
        return mockState.existingUser;
      }

      if (where?.AuthUID) {
        return mockState.existingAuthUidUser;
      }

      if (where?.UserID && mockState.userCreateData) {
        const linkedRole = mockState.roles.find((entry) => entry.RoleID === mockState.userRoleCreateData?.RoleID);

        return {
          UserID: where.UserID,
          FirstName: mockState.userCreateData.FirstName,
          LastName: mockState.userCreateData.LastName,
          Email: mockState.userCreateData.Email,
          PhoneNumber: mockState.userCreateData.PhoneNumber,
          AuthUID: mockState.userCreateData.AuthUID,
          CreatedAt: mockState.userCreateData.CreatedAt,
          IsActive: mockState.userCreateData.IsActive,
          DeletedAt: null,
          UserRole: linkedRole ? [{ Role: linkedRole }] : [],
          StudentAccount: mockState.studentAccountCreateData
            ? {
                BirthDate: mockState.studentAccountCreateData.BirthDate,
                GuardianName: mockState.studentAccountCreateData.GuardianName,
                GuardianPhone: mockState.studentAccountCreateData.GuardianPhone,
              }
            : null,
        };
      }

      if (where?.UserID && mockState.userById[where.UserID]) {
        const user = mockState.userById[where.UserID];
        return {
          ...user,
          UserRole: Array.isArray(user.UserRole) ? user.UserRole : [],
          StudentAccount: user.StudentAccount
            ? {
                ...user.StudentAccount,
              }
            : null,
        };
      }

      return null;
    },
    findMany: async () => mockState.listedUsers,
    create: async ({ data }) => {
      mockState.userCreateData = data;
      mockState.userById[501] = {
        UserID: 501,
        FirstName: data.FirstName,
        LastName: data.LastName,
        Email: data.Email,
        PhoneNumber: data.PhoneNumber,
        AuthUID: data.AuthUID,
        CreatedAt: data.CreatedAt,
        UpdatedAt: data.UpdatedAt,
        IsActive: data.IsActive,
        DeletedAt: null,
        UserRole: [],
        StudentAccount: null,
      };
      return {
        UserID: 501,
      };
    },
    update: async ({ where, data }) => {
      mockState.userUpdateData = { where, data };
      const current = mockState.userById[where.UserID] || { UserID: where.UserID };
      mockState.userById[where.UserID] = {
        ...current,
        FirstName: data.FirstName ?? current.FirstName,
        LastName: Object.prototype.hasOwnProperty.call(data, 'LastName') ? data.LastName : current.LastName,
        Email: data.Email ?? current.Email,
        PhoneNumber: Object.prototype.hasOwnProperty.call(data, 'PhoneNumber') ? data.PhoneNumber : current.PhoneNumber,
        AuthUID: data.AuthUID ?? current.AuthUID,
        IsActive: Object.prototype.hasOwnProperty.call(data, 'IsActive') ? data.IsActive : current.IsActive,
        UpdatedAt: data.UpdatedAt ?? current.UpdatedAt,
        DeletedAt: data.DeletedAt ?? current.DeletedAt,
      };
      return mockState.userById[where.UserID];
    },
  },
  userRole: {
    create: async ({ data }) => {
      mockState.userRoleCreateData = data;
      const linkedRole = mockState.roles.find((entry) => entry.RoleID === data.RoleID);
      const user = mockState.userById[data.UserID];
      if (user && linkedRole) {
        user.UserRole = [{ Role: linkedRole }];
      }
      return data;
    },
    deleteMany: async ({ where }) => {
      mockState.userRoleDeleteWhere = where;
      return { count: 1 };
    },
    createMany: async ({ data }) => {
      mockState.userRoleCreateManyData = data;
      const userId = data[0]?.UserID;
      const user = userId ? mockState.userById[userId] : null;
      if (user) {
        user.UserRole = data
          .map((entry) => mockState.roles.find((role) => role.RoleID === entry.RoleID))
          .filter(Boolean)
          .map((role) => ({ Role: role }));
      }
      return { count: data.length };
    },
  },
  studentAccount: {
    findFirst: async ({ orderBy } = {}) => {
      const studentAccounts = Object.values(mockState.userById)
        .map((user) => user?.StudentAccount)
        .filter(Boolean)
        .filter((account) => account.StudentAccountID != null);

      if (!studentAccounts.length) {
        return null;
      }

      const sorted = [...studentAccounts].sort((left, right) => {
        const leftId = Number(left.StudentAccountID);
        const rightId = Number(right.StudentAccountID);
        return (orderBy?.StudentAccountID === 'desc' ? rightId - leftId : leftId - rightId);
      });

      return {
        StudentAccountID: sorted[0].StudentAccountID,
      };
    },
    create: async ({ data }) => {
      mockState.studentAccountCreateData = data;
      const current = mockState.userById[data.UserID];
      if (current) {
        current.StudentAccount = {
          StudentAccountID: data.StudentAccountID,
          BirthDate: data.BirthDate,
          GuardianName: data.GuardianName,
          GuardianPhone: data.GuardianPhone,
        };
      }
      return data;
    },
    update: async ({ data }) => {
      mockState.studentAccountUpdateData = data;
      return data;
    },
  },
};

const fakeAdminService = {
  listPostSessionValidationQueue: async () => mockState.postSessionValidations,
  finalizeSessionValidation: async ({ sessionId, adminUserId }) => {
    mockState.finalizationArgs = { sessionId, adminUserId };
    return mockState.finalizationResult;
  },
  getStudioOccupancy: async () => ({ studios: [] }),
};

const {
  createUser,
  deleteUser,
  finalizeSessionValidation,
  getPostSessionValidations,
  listUsers,
  updateUser,
  updateUserRoles,
} = withPatchedModules(
  {
    bcrypt: fakeBcrypt,
    '../config/prisma': fakePrisma,
    '../services/admin.service': fakeAdminService,
    '../services/adminValidation.service': {
      listPostSessionValidations: async () => [],
      finalizeSessionValidation: async () => ({}),
    },
  },
  () => require('../../src/controllers/admin.controller')
);

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
    send() {
      return this;
    },
  };
}

function resetMockState() {
  mockState.existingUser = null;
  mockState.existingAuthUidUser = null;
  mockState.listedUsers = [];
  mockState.userById = {};
  mockState.userCreateData = null;
  mockState.userUpdateData = null;
  mockState.userRoleCreateData = null;
  mockState.userRoleCreateManyData = null;
  mockState.userRoleDeleteWhere = null;
  mockState.studentAccountCreateData = null;
  mockState.studentAccountUpdateData = null;
  mockState.postSessionValidations = [];
  mockState.finalizationResult = {
    sessionId: 901,
    financialEntryId: 777,
    finalPrice: 82.5,
  };
  mockState.finalizationArgs = null;
}

/**
 * TEST: Criação de utilizador Direction com mapeamento para admin
 * ─────────────────────────────────────────────────────────────
 * O QUE É TESTADO:
 *   Valida que ao criar um utilizador com função 'Direction' (papel de negócio),
 *   o sistema o mapeia corretamente para 'admin' (papel da API) e cria a atribuição
 *   de papel correspondente na base de dados.
 *
 * COMO FUNCIONA:
 *   1. Prepara um request com dados de um novo utilizador Direction
 *   2. Chama createUser() com esses dados
 *   3. Valida statusCode (201 Created), as mudanças no estado interno, e a resposta
 *
 * POR QUE É IMPORTANTE:
 *   O mapeamento correto de papéis é crítico para autorização e controlo de acesso.
 *   Garante que utilizadores Direction têm privilégios de admin sem regredir para
 *   aluno ou outro papel incorrecto.
 *
 * ASSERTIONS EXPLICADAS:
 *   - statusCode 201: Utilizador foi criado com sucesso (código HTTP 201 Created)
 *   - RoleID 1: A função 'Direction' é armazenada com RoleID 1 no banco de dados
 *   - studentAccountCreateData null: Direction nunca requer conta de aluno complementar
 *   - user.role 'admin': A resposta serializa Direction como 'admin' para consumidores da API
 */
test('createUser maps Direction to admin and creates a role assignment', async () => {
  resetMockState();

  const req = {
    body: {
      firstName: 'Ana',
      lastName: 'Silva',
      email: 'ana@example.com',
      phoneNumber: '999999999',
      password: 'Password1',
      role: 'Direction',
    },
  };
  const res = createResponse();

  await createUser(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 201);
  assert.equal(mockState.userRoleCreateData.RoleID, 1);
  assert.equal(mockState.studentAccountCreateData, null);
  assert.equal(res.payload.user.role, 'admin');
});

/**
 * TEST: Criação de utilizador estudante com número automático
 * ──────────────────────────────────────────────────────────────────────────
 * O QUE É TESTADO:
 *   Confirma que a criação de um aluno continua a funcionar quando o campo
 *   'studentNumber' não é enviado, gerando um número automático.
 *
 * COMO FUNCIONA:
 *   1. Tenta criar um utilizador 'student' sem studentNumber
 *   2. Valida que a resposta HTTP é 201 Created
 *   3. Valida que o perfil de aluno foi criado e que o número é gerado
 *
 * POR QUE É IMPORTANTE:
 *   O front-end atual não precisa de forçar o número de aluno no formulário,
 *   e o backend já garante um identificador válido quando ele não é enviado.
 *
 * ASSERTIONS EXPLICADAS:
 *   - statusCode 201: Utilizador foi criado com sucesso
 *   - studentNumber gerado: A resposta contém um número de aluno válido
 */
test('createUser creates a student user with an auto-generated student number', async () => {
  resetMockState();

  const req = {
    body: {
      firstName: 'Joao',
      email: 'joao@example.com',
      password: 'Password1',
      role: 'student',
      birthDate: '2006-05-10',
    },
  };
  const res = createResponse();

  await createUser(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 201);
  assert.equal(mockState.studentAccountCreateData.BirthDate instanceof Date, true);
  assert.equal(res.payload.user.role, 'student');
  assert.equal(typeof res.payload.user.studentNumber, 'string');
  assert.equal(res.payload.user.studentNumber.startsWith('ST-'), true);
});

/**
 * TEST: Validação obrigatória de data de nascimento para alunos
 * ─────────────────────────────────────────────────────────────
 * O QUE É TESTADO:
 *   Confirma que a criação de um aluno falha com erro 400 se o campo
 *   'birthDate' não for fornecido, mantendo dados de alunos sempre completos.
 *
 * COMO FUNCIONA:
 *   1. Tenta criar um utilizador 'student' SEM o campo birthDate
 *   2. Valida que a resposta é 400 Bad Request
 *   3. Valida que next() NÃO foi chamado (erro é tratado, não propaga)
 *
 * POR QUE É IMPORTANTE:
 *   Data de nascimento é usada para múltiplos fins críticos:
 *   - Verificar maioridade (consentimento parental, proteção de menores)
 *   - Rastrear alunos por cohort de idade (agregação estatística)
 *   - Cumprir requisitos de RGPD (saber idade de dados pessoais)
 *   Sem ela, não conseguimos diferenciar menores de maiores de idade.\n *
 * ASSERTIONS EXPLICADAS:
 *   - statusCode 400: Validação falhou, dado obrigatório em falta\n *   - error message: Mensagem descritiva do problema
 *   - nextCalled false: Erro é tratado no controlador, não passa para middleware\n */
test('createUser requires birth date when creating a student user', async () => {
  resetMockState();

  const req = {
    body: {
      firstName: 'Rita',
      email: 'rita@example.com',
      password: 'Password1',
      role: 'student',
    },
  };
  const res = createResponse();
  let nextCalled = false;

  await createUser(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { error: 'Birth date is required for student users' });
  assert.equal(nextCalled, false);
});

/**
 * TEST: Normalização de papéis armazenados para papéis da API
 * ──────────────────────────────────────────────────────────
 * O QUE É TESTADO:
 *   Valida que listUsers() converte papéis armazenados em português
 *   ('Direção', 'Professor', 'Aluno') para papéis normalizados da API
 *   ('admin', 'teacher', 'student'), mantendo labels originais em PT.
 *
 * COMO FUNCIONA:
 *   1. Define um utilizador no banco de dados com RoleName 'Direção'
 *   2. Chama listUsers() para recuperar a lista de utilizadores
 *   3. Valida que a resposta tem papel normalizado + label em português\n *
 * POR QUE É IMPORTANTE:
 *   O código utiliza papéis internos em inglês (req.auth.role = 'admin'),
 *   mas a base de dados armazena em português por razões históricas.
 *   A normalização na leitura garante que TODA a API fala em inglês\n *   ('admin'/'teacher'/'student') consistentemente. Isto evita bugs onde\n *   diferentes partes do código usam diferentes convenções.
 *
 * ASSERTIONS EXPLICADAS:
 *   - users[0].role 'admin': Papel foi normalizado para código (inglês)\n *   - users[0].roleLabel 'Direção': Label português mantido para UI/exibição
 *   - users.length 1: Retorna quantidade correta de registos
 */
test('listUsers normalizes stored business roles to app roles', async () => {
  resetMockState();

  mockState.listedUsers = [
    {
      UserID: 77,
      FirstName: 'Marta',
      LastName: 'Costa',
      Email: 'marta@example.com',
      PhoneNumber: '123',
      AuthUID: 'ST-0001',
      IsActive: true,
      CreatedAt: new Date('2026-04-23T10:00:00Z'),
      UserRole: [
        {
          Role: {
            RoleName: 'Direção',
          },
        },
      ],
      StudentAccount: {
        BirthDate: new Date('2008-01-01T00:00:00Z'),
        GuardianName: 'Mae',
        GuardianPhone: '999999999',
      },
    },
  ];

  const req = {};
  const res = createResponse();

  await listUsers(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, null);
  assert.equal(res.payload.users.length, 1);
  assert.equal(res.payload.users[0].role, 'admin');
  assert.equal(res.payload.users[0].roleLabel, 'Direção');
});

/**
 * TEST: Atualização de número de aluno para utilizadores estudante
 * ───────────────────────────────────────────────────────────────
 * O QUE É TESTADO:
 *   Valida que updateUser() consegue alterar o número de aluno de um
 *   utilizador existente, atualizando o identificador único (AuthUID).
 *
 * COMO FUNCIONA:
 *   1. Define um aluno existente no estado do banco de dados
 *   2. Envia request para atualizar seu studentNumber para 'ST-0999'
 *   3. Valida que AuthUID foi atualizado na base de dados E na resposta\n *
 * POR QUE É IMPORTANTE:
 *   Alunos podem trocar de turma, série, ou a escola pode corrigir números\n *   atribuídos incorretamente. O sistema precisa permitir estas correções
 *   mantendo registos históricos intactos (soft updates, nunca apagar dados).
 *   AuthUID é o identificador único para autenticação, por isso precisa\n *   ser sempre mantido sincronizado com o número de aluno.
 *
 * ASSERTIONS EXPLICADAS:
 *   - userUpdateData.data.AuthUID 'ST-0999': Banco de dados foi atualizado
 *   - res.payload.user.studentNumber 'ST-0999': Resposta reflete a mudança
 */
test('updateUser updates student number for student users', async () => {
  resetMockState();

  mockState.userById[44] = {
    UserID: 44,
    FirstName: 'Marta',
    LastName: 'Costa',
    Email: 'marta@example.com',
    PhoneNumber: '123',
    AuthUID: 'ST-0001',
    IsActive: true,
    DeletedAt: null,
    UserRole: [{ Role: { RoleName: 'Aluno' } }],
    StudentAccount: {
      BirthDate: new Date('2008-01-01T00:00:00Z'),
      GuardianName: 'Mae',
      GuardianPhone: '999999999',
    },
  };

  const req = {
    params: { id: '44' },
    body: {
      studentNumber: 'ST-0999',
    },
  };
  const res = createResponse();

  await updateUser(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, null);
  assert.equal(mockState.userUpdateData.data.AuthUID, 'ST-0999');
  assert.equal(res.payload.user.studentNumber, 'ST-0999');
});

/**
 * TEST: Substituição de papéis e criação de perfil de aluno quando necessário
 * ──────────────────────────────────────────────────────────────────────────
 * O QUE É TESTADO:
 *   Valida o cenário complexo onde um utilizador muda de papéis. Neste caso,
 *   um professor (sem perfil de aluno) é promovido para professor+aluno,
 *   requerendo a criação de uma conta de aluno complementar.
 *
 * COMO FUNCIONA:
 *   1. Define um professor existente (sem StudentAccount na BD)\n *   2. Envia request para mudar para roles ['student', 'teacher'] com dados de aluno
 *   3. Valida que:\n *      - Papéis antigos foram removidos via deleteMany()\n *      - Novos papéis foram criados em lote via createMany()\n *      - Perfil de aluno foi criado (StudentAccount)\n *      - Número de aluno foi sincronizado
 *
 * POR QUE É IMPORTANTE:
 *   Utilizadores multifuncionais (professor que também faz formação contínua)\n *   são comuns em escolas. O sistema precisa coordenar mudanças de papéis com\n *   criação de perfis secundários de forma ATÓMICA (tudo acontece ou nada).\n *   Isto evita estados inconsistentes (ex: aluno sem conta, ou conta órfã).
 *
 * ASSERTIONS EXPLICADAS:
 *   - userRoleDeleteWhere.UserID 55: Papéis antigos foram removidos para este utilizador
 *   - userRoleCreateManyData.length 2: Exatamente 2 novos papéis criados
 *   - studentAccountCreateData.UserID 55: Perfil de aluno criado para este utilizador
 *   - userUpdateData.data.AuthUID 'ST-0123': Número de aluno sincronizado (para autenticação)
 *   - user.roles.includes('student') true: Resposta reflete o novo papel de aluno
 */
test('updateUserRoles replaces role assignments and creates student profile when needed', async () => {
  resetMockState();

  mockState.userById[55] = {
    UserID: 55,
    FirstName: 'Tiago',
    LastName: 'Lopes',
    Email: 'tiago@example.com',
    PhoneNumber: null,
    AuthUID: 'local-uuid',
    IsActive: true,
    DeletedAt: null,
    UserRole: [{ Role: { RoleName: 'Professor' } }],
    StudentAccount: null,
  };

  const req = {
    params: { id: '55' },
    body: {
      roles: ['student', 'teacher'],
      studentNumber: 'ST-0123',
      birthDate: '2007-09-08',
      guardianName: 'Pai',
      guardianPhone: '911111111',
    },
  };
  const res = createResponse();

  await updateUserRoles(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, null);
  assert.deepEqual(mockState.userRoleDeleteWhere, { UserID: 55 });
  assert.equal(mockState.userRoleCreateManyData.length, 2);
  assert.equal(mockState.studentAccountCreateData.UserID, 55);
  assert.equal(mockState.userUpdateData.data.AuthUID, 'ST-0123');
  assert.equal(res.payload.user.roles.includes('student'), true);
});

/**
 * TEST: Eliminação reversível (soft-delete) de utilizadores
 * ────────────────────────────────────────────────────────
 * O QUE É TESTADO:
 *   Valida que deleteUser() NÃO remove dados da base de dados mas marca\n *   o utilizador como eliminado (DeletedAt != null) e desativa (IsActive=false).
 *
 * COMO FUNCIONA:
 *   1. Define um utilizador existente no estado\n *   2. Chama deleteUser() com o seu ID
 *   3. Valida que o registro foi marcado como eliminado (não apagado)\n *
 * POR QUE É IMPORTANTE:
 *   Soft-delete é essencial para integridade da aplicação:
 *   - AUDITORIA: Manter histórico completo de ações/relações do utilizador\n *   - INTEGRIDADE REFERENCIAL: Não orfanizar dados relacionados (sessões, pagamentos)
 *   - CONFORMIDADE: Manter registos financeiros/legais mesmo após remoção\n *   - RECOVERY: Permitir restauro acidental de dados em caso de erro
 *   Hard-delete quebraria todas estas garantias.\n *
 * ASSERTIONS EXPLICADAS:
 *   - statusCode 204: No Content (sucesso sem corpo de resposta)\n *   - DeletedAt != null: Timestamp de eliminação foi definido (marca a data/hora)
 *   - IsActive false: Utilizador é desativado para não aparecer em listagens
 */
test('deleteUser performs a soft delete', async () => {
  resetMockState();

  mockState.userById[90] = {
    UserID: 90,
    DeletedAt: null,
  };

  const req = {
    params: { id: '90' },
  };
  const res = createResponse();

  await deleteUser(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 204);
  assert.equal(Boolean(mockState.userUpdateData.data.DeletedAt), true);
  assert.equal(mockState.userUpdateData.data.IsActive, false);
});

/**
 * TEST: Recuperação da fila de validações pós-sessão
 * ────────────────────────────────────────────────
 * O QUE É TESTADO:
 *   Valida que o endpoint getPostSessionValidations() retorna a lista de\n *   sessões de coaching pendentes de validação (aguardando aprovação admin).
 *
 * COMO FUNCIONA:
 *   1. Define uma ou mais sessões na fila de validações do estado\n *   2. Chama getPostSessionValidations()\n *   3. Valida que a resposta contém exatamente a fila armazenada\n *
 * POR QUE É IMPORTANTE:
 *   A administração precisa de um painel com sessões aguardando validação.\n *   Este endpoint alimenta:\n *   - Dashboard com número de validações pendentes (KPI em tempo real)
 *   - Lista detalhada para aprovação/rejeição de cada sessão\n *   - Fluxo de trabalho de pós-sessão (validar aulas antes de processar pagamentos)\n *
 * ASSERTIONS EXPLICADAS:
 *   - res.payload exatamente { sessions: [...] }: Estrutura esperada (validação de contrato)\n *   - Contém sessionId, sessionReference, title: Campos necessários para exibição na UI
 */
test('getPostSessionValidations returns the validation queue payload', async () => {
  resetMockState();

  mockState.postSessionValidations = [
    {
      sessionId: 321,
      sessionReference: '#321',
      title: 'Coaching session',
    },
  ];

  const req = {};
  const res = createResponse();

  await getPostSessionValidations(req, res, (error) => {
    throw error;
  });

  assert.deepEqual(res.payload, { sessions: mockState.postSessionValidations });
});

/**
 * TEST: Finalização de validação de sessão de coaching
 * ──────────────────────────────────────────────────
 * O QUE É TESTADO:
 *   Valida que finalizeSessionValidation() consegue processar a validação\n *   de uma sessão de coaching, passando corretamente:\n *   - ID da sessão a validar\n *   - ID do admin que está a fazer a validação\n *
 * COMO FUNCIONA:
 *   1. Envia request para finalizar validação da sessão #321\n *   2. Identifica o admin autenticado (userId 44)\n *   3. Valida que sessionId e adminUserId foram passados ao serviço\n *   4. Valida que a resposta contém o resultado (IDs criados, preço final)
 *
 * POR QUE É IMPORTANTE:
 *   A finalização de validação é a operação crítica que:\n *   - Marca uma sessão como validada e completa\n *   - Cria um lançamento financeiro (para pagamento ao professor)\n *   - Recalcula preço final (se houve ajustes de duração, etc)\n *   - Notifica professor e alunos da conclusão\n *   Se dados forem passados incorretamente, a auditoria fica inconsistente\n *   e o fluxo de pagamentos quebra. Esta é uma operação crítica.\n *
 * ASSERTIONS EXPLICADAS:
 *   - finalizationArgs.sessionId 321: ID de sessão foi passado corretamente
 *   - finalizationArgs.adminUserId 44: ID do admin foi extraído do JWT e passado
 *   - res.payload: Contém resultado da operação (IDs criados, preço calculado)
 */
test('finalizeValidation validates the session id and forwards the admin user id', async () => {
  resetMockState();

  const req = {
    params: { id: '321' },
    auth: { userId: 44, role: 'admin' },
  };
  const res = createResponse();

  await finalizeSessionValidation(req, res, (error) => {
    throw error;
  });

  assert.equal(mockState.finalizationArgs.sessionId, 321);
  assert.equal(mockState.finalizationArgs.adminUserId, 44);
  assert.deepEqual(res.payload, {
    sessionId: 901,
    financialEntryId: 777,
    finalPrice: 82.5,
  });
});
