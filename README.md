# gestArtes API

Backend REST API do projeto gestArtes, desenvolvido para a Escola Entartes.

## Stack

- Node.js + Express
- Prisma ORM com SQL Server
- dotenv, cors, express-session, helmet
- morgan (logs HTTP no console)
- winston (logs estruturados para ficheiro)
- express-rate-limit (rate limiting básico)
- swagger-jsdoc + swagger-ui-express (estrutura OpenAPI)

## Estrutura

- src/app.js - Express entry point
- src/routes/ - route files
- src/controllers/ - request handlers
- src/services/ - business logic
- src/middlewares/ - validation, rate limit, error handling
- src/models/ - database query functions
- src/utils/ - helpers (logger)
- src/config/ - prisma e swagger

## Configuração

1. Instalar dependências:

```bash
npm install
```

2. Copiar .env.example para .env e preencher valores.

Variáveis de segurança relevantes:

- `CORS_ORIGINS`: lista separada por vírgula com origins permitidas (fallback para `CLIENT_URL`).
- `CORS_ALLOW_NO_ORIGIN`: permite requests sem Origin (ex.: curl/Postman).
- Em produção, é obrigatório configurar pelo menos uma origin em `CORS_ORIGINS` ou `CLIENT_URL`.

3. Executar em desenvolvimento:

```bash
npm run dev
```

## Endpoints base de fundação

```bash
npm start
```
API disponível em `http://localhost:3001`

## Notas

- Rotas de domínio (auth, student, etc.) ficam para a próxima fase.
- O middleware global de erro devolve `{ error: err.message }` com status 500 por defeito.

## Database Performance Scripts

Este projeto usa duas vias para otimização de base de dados:

- Índices simples e compostos: definidos em `prisma/schema.prisma` com `@@index` e aplicados por migrações Prisma.
- Full-text indexes e stored procedures: definidos em scripts SQL versionados em `prisma/sql/`.

### Aplicar índices Prisma

```bash
npm run prisma:generate
npm run prisma:migrate:dev
```

Em ambiente de deploy:

```bash
npm run prisma:migrate:deploy
```

### Scripts SQL externos

- `prisma/sql/20260411_fulltext_marketplace_inventory.sql`
- `prisma/sql/20260411_stored_procedures_performance.sql`

Executar os scripts no SQL Server após a migração Prisma (por exemplo, via SQL Server Management Studio ou pipeline de DB).

### Critério de aceite desta entrega

- Checklist de indexação coberta.
- Migração Prisma sem erros.
- Scripts SQL de full-text e stored procedures executados sem erros.
