# gestArtes API

Backend REST API do projeto gestArtes, desenvolvido para a Escola Entartes.

## Stack

- **Node.js** + **Express**
- **SQL Server** via `mssql`
- **dotenv**, **cors**, **nodemon**

## Requisitos

- **Node.js** compatível com [package.json](package.json) (`^20.19.0 || >=22.12.0`)
- **npm** instalado
- **SQL Server** acessível (local ou remoto)

## Estrutura

- [src/app.js](src/app.js) - ponto de entrada da API e inicialização do servidor
- [src/config/db.js](src/config/db.js) - ligação à base de dados
- [src/controllers/](src/controllers/) - controladores da aplicação
- [src/models/](src/models/) - queries e acesso aos dados
- [src/routes/](src/routes/) - definição e registo de rotas
- [src/middlewares/](src/middlewares/) - middlewares de validação e tratamento de erros
- [.env.example](.env.example) - exemplo de configuração local
- [package.json](package.json) - scripts e dependências

## Configuração

1. Instalar dependências:

```bash
npm install
```

> Se estiveres no PowerShell e o `npm` for bloqueado por policy local, usa `npm.cmd`.

1. Copiar [.env.example](.env.example) para um ficheiro `.env` local e preencher os valores do ambiente:

```env
PORT=3001
DB_SERVER=localhost
DB_DATABASE=gestArtes
DB_USER=gestArtes_user
DB_PASSWORD=a_tua_password
INTERNAL_API_TOKEN=token_interno_notificacoes
```

> O ficheiro `.env` é local e não deve ser versionado.

1. Criar a base de dados `gestArtes` no SQL Server e confirmar que os dados de ligação estão alinhados com [src/config/db.js](src/config/db.js).

## Arranque

```bash
npm run dev
```

Ou, se preferires arrancar diretamente sem `nodemon`:

```bash
npm start
```

API disponível em `http://localhost:3001`

## Organização

O projeto está preparado para crescer em camadas:

- `src/app.js` centraliza a inicialização do Express.
- `src/routes/` expõe os endpoints da API.
- `src/controllers/` concentra a lógica de negócio.
- `src/models/` concentra o acesso à base de dados.
