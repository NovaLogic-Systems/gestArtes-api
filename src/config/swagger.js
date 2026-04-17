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
      { name: 'LostFound', description: 'Lost & Found routes' },
    ],
    components: {
      schemas: {
        LostFoundItem: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            foundDate: { type: 'string', format: 'date-time' },
            claimedStatus: { type: 'boolean' },
            photoUrl: { type: 'string', nullable: true },
          },
        },
        LostFoundAdminItem: {
          allOf: [
            { $ref: '#/components/schemas/LostFoundItem' },
            {
              type: 'object',
              properties: {
                isArchived: { type: 'boolean' },
                adminNotes: { type: 'string', nullable: true },
                archivedAt: { type: 'string', format: 'date-time', nullable: true },
                registeredByUserId: { type: 'integer' },
              },
            },
          ],
        },
        LostFoundAdminCreateRequest: {
          type: 'object',
          required: ['title', 'foundDate'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string', maxLength: 255, nullable: true },
            foundDate: { type: 'string', format: 'date-time' },
            claimedStatus: { type: 'boolean' },
            photoUrl: { type: 'string', maxLength: 255, nullable: true },
            adminNotes: { type: 'string', maxLength: 255, nullable: true },
          },
        },
        LostFoundAdminUpdateRequest: {
          type: 'object',
          minProperties: 1,
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string', maxLength: 255, nullable: true },
            foundDate: { type: 'string', format: 'date-time' },
            claimedStatus: { type: 'boolean' },
            photoUrl: { type: 'string', maxLength: 255, nullable: true },
            adminNotes: { type: 'string', maxLength: 255, nullable: true },
          },
          additionalProperties: false,
        },
        LostFoundAdminActionRequest: {
          type: 'object',
          properties: {
            adminNotes: { type: 'string', maxLength: 255, nullable: true },
          },
          additionalProperties: false,
        },
      },
    },
    paths: {
      '/lostfound': {
        get: {
          tags: ['LostFound'],
          summary: 'List public lost and found items',
          responses: {
            200: {
              description: 'List of active non-archived items',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/LostFoundItem' },
                  },
                },
              },
            },
          },
        },
      },
      '/lostfound/{id}': {
        get: {
          tags: ['LostFound'],
          summary: 'Get one public lost and found item',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: {
              description: 'Item found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LostFoundItem' },
                },
              },
            },
            404: {
              description: 'Item not found',
            },
          },
        },
      },
      '/admin/lostfound': {
        post: {
          tags: ['LostFound'],
          summary: 'Create lost and found item (admin)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LostFoundAdminCreateRequest' },
              },
            },
          },
          responses: {
            201: {
              description: 'Created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LostFoundAdminItem' },
                },
              },
            },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/admin/lostfound/{id}': {
        patch: {
          tags: ['LostFound'],
          summary: 'Update lost and found item (admin)',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LostFoundAdminUpdateRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LostFoundAdminItem' },
                },
              },
            },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Not found' },
          },
        },
        delete: {
          tags: ['LostFound'],
          summary: 'Delete lost and found item (admin)',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            204: { description: 'Deleted' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Not found' },
          },
        },
      },
      '/admin/lostfound/{id}/claim': {
        patch: {
          tags: ['LostFound'],
          summary: 'Mark lost and found item as claimed (admin)',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LostFoundAdminActionRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Claimed',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LostFoundAdminItem' },
                },
              },
            },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Not found' },
          },
        },
      },
      '/admin/lostfound/{id}/archive': {
        patch: {
          tags: ['LostFound'],
          summary: 'Archive lost and found item (admin)',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LostFoundAdminActionRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Archived',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LostFoundAdminItem' },
                },
              },
            },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Not found' },
          },
        },
      },
    },
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
