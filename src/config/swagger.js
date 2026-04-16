const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const port = Number(process.env.PORT) || 3001;
const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${port}`;

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'gestArtes API',
      version: '1.0.0',
      description: 'OpenAPI base structure for the backend.',
    },
    servers: [{ url: apiBaseUrl }],
    tags: [
      { name: 'Auth', description: 'Authentication routes' },
      { name: 'Student', description: 'Student routes' },
    ],
  },
  apis: [],
});

const swaggerHiddenSvgCss = '.swagger-hidden-svg { position: absolute; width: 0; height: 0; }';

function injectCspNonceInSwaggerHtml(html, nonce) {
  if (!nonce) {
    return html;
  }

  return html
    .replace(
      /<svg([^>]*?)\sstyle="position:absolute;width:0;height:0"/,
      '<svg$1 class="swagger-hidden-svg"'
    )
    .replace(/<script(?![^>]*\snonce=)/g, `<script nonce="${nonce}"`)
    .replace(/<style(?![^>]*\snonce=)/g, `<style nonce="${nonce}"`);
}

function setupSwagger(app) {
  const docsHandler = (req, res) => {
    const html = swaggerUi.generateHTML(swaggerSpec, {
      customCss: swaggerHiddenSvgCss,
    });
    const htmlWithNonce = injectCspNonceInSwaggerHtml(
      html,
      res.locals.cspNonce
    );

    res.type('html');
    res.send(htmlWithNonce);
  };

  app.use((req, res, next) => {
    if (req.path === '/docs') {
      return res.redirect(308, '/docs/');
    }

    return next();
  });

  app.use('/docs', swaggerUi.serve);
  app.get('/docs/', docsHandler);

  app.get('/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

module.exports = {
  setupSwagger,
  swaggerSpec,
};
