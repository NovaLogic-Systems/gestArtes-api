# gestArtes API

Backend REST API do projeto gestArtes, desenvolvido para a Escola Entartes.

## Stack

- Node.js + Express
- Prisma ORM com SQL Server
- dotenv, cors, express-session
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

3. Executar em desenvolvimento:

```bash
npm run dev
```

## Endpoints base de fundação

- GET /health
- GET /docs
- GET /docs.json

## Notas

- Rotas de domínio (auth, student, etc.) ficam para a próxima fase.
- O middleware global de erro devolve `{ error: err.message }` com status 500 por defeito.
