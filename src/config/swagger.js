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

function setupSwagger(app) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

module.exports = {
  setupSwagger,
  swaggerSpec,
};
