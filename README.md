# gestArtes API

Backend REST API do projeto gestArtes, desenvolvido para a Escola Entartes.

## Stack

- **Node.js** + **Express**
- **Prisma ORM** com **SQL Server**
- **dotenv**, **cors**, **nodemon**

## Requisitos

- **Node.js** compatível com [package.json](package.json) (`^20.19.0 || >=22.12.0`)
- **npm** instalado
- **SQL Server** acessível (local ou remoto)

## Estrutura

- [src/app.js](src/app.js) - ponto de entrada da API e inicialização do servidor
- [src/config/prisma.js](src/config/prisma.js) - cliente Prisma partilhado
- [src/controllers/](src/controllers/) - controladores da aplicação
- [src/models/](src/models/) - acesso aos dados
- [src/routes/](src/routes/) - definição e registo de rotas
- [src/middlewares/](src/middlewares/) - middlewares de validação e tratamento de erros
- [prisma/schema.prisma](prisma/schema.prisma) - schema e modelos introspectados
- [prisma.config.ts](prisma.config.ts) - configuração Prisma 7
- [.env.example](.env.example) - exemplo de configuração local
- [package.json](package.json) - scripts e dependências

## Configuração

1. Instalar dependências:

```bash
npm install
```

> Se estiveres no PowerShell e o `npm` for bloqueado por policy local, usa `npm.cmd`.

1. Copiar [.env.example](.env.example) para `.env` e preencher:

```env
PORT=3001
DATABASE_URL="sqlserver://localhost:1433;database=gestArtes;user=gestArtes_user;password=a_tua_password;encrypt=true;trustServerCertificate=true;"
```

> O ficheiro `.env` é local e não deve ser versionado.

1. Validar o schema Prisma:

```bash
npx prisma validate
```

1. Se a base de dados já existe, importar modelos para o schema:

```bash
npx prisma db pull
```

1. Gerar o Prisma Client:

```bash
npx prisma generate
```

## Arranque

```bash
npm run dev
```

Ou, se preferires arrancar diretamente sem `nodemon`:

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
