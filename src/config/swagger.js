/**
 * @file src/config/swagger.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

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
      { name: 'StudioOccupancy', description: 'Studio occupancy monitoring and manual controls' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
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
        StudioDateInput: {
          type: 'string',
          description: 'Accepted formats: DD-MM-YYYY, DD-MM-YYYY HH:mm, or ISO-8601.',
          example: '25-04-2026 14:30',
        },
        StudioOccupancyCurrentUser: {
          type: 'object',
          nullable: true,
          properties: {
            userId: { type: 'integer', nullable: true },
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            fullName: { type: 'string', nullable: true },
            source: { type: 'string', enum: ['teacher', 'requester'], nullable: true },
          },
        },
        StudioOccupancyAlert: {
          type: 'object',
          properties: {
            type: { type: 'string', example: 'DOUBLE_BOOKING' },
            studioId: { type: 'integer' },
            studioName: { type: 'string' },
            conflictingSessionIds: {
              type: 'array',
              items: { type: 'integer' },
            },
            severity: { type: 'string', example: 'high' },
          },
        },
        StudioRealtimeItem: {
          type: 'object',
          properties: {
            studioId: { type: 'integer' },
            studioName: { type: 'string' },
            capacity: { type: 'integer' },
            status: {
              type: 'string',
              enum: ['available', 'occupied', 'blocked', 'double-booked', 'maintenance', 'unavailable'],
            },
            currentUser: { $ref: '#/components/schemas/StudioOccupancyCurrentUser' },
            occupiedUntil: { type: 'string', format: 'date-time', nullable: true },
            activeSessionId: { type: 'integer', nullable: true },
            activeSessionIds: {
              type: 'array',
              items: { type: 'integer' },
            },
            activeBlockId: { type: 'integer', nullable: true },
            activeOverrideId: { type: 'integer', nullable: true },
            activeOverrideStatus: { type: 'string', nullable: true },
          },
        },
        StudioOccupancyRealtimeResponse: {
          type: 'object',
          properties: {
            generatedAt: { type: 'string', format: 'date-time' },
            summary: {
              type: 'object',
              properties: {
                totalStudios: { type: 'integer' },
                occupiedStudios: { type: 'integer' },
                blockedStudios: { type: 'integer' },
                availableStudios: { type: 'integer' },
                occupancyRate: { type: 'number', format: 'float' },
                doubleBookingAlerts: { type: 'integer' },
              },
            },
            alerts: {
              type: 'array',
              items: { $ref: '#/components/schemas/StudioOccupancyAlert' },
            },
            studios: {
              type: 'array',
              items: { $ref: '#/components/schemas/StudioRealtimeItem' },
            },
          },
        },
        StudioForecastItem: {
          type: 'object',
          properties: {
            studioId: { type: 'integer' },
            studioName: { type: 'string' },
            capacity: { type: 'integer' },
            totalWindowMinutes: { type: 'integer' },
            scheduledMinutes: { type: 'integer' },
            blockedMinutes: { type: 'integer' },
            occupiedMinutes: { type: 'integer' },
            idleMinutes: { type: 'integer' },
            utilizationRate: { type: 'number', format: 'float' },
            occupancyRate: { type: 'number', format: 'float' },
            doubleBookingConflicts: { type: 'integer' },
            upcomingSessions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sessionId: { type: 'integer' },
                  startTime: { type: 'string', format: 'date-time' },
                  endTime: { type: 'string', format: 'date-time' },
                  currentUser: { $ref: '#/components/schemas/StudioOccupancyCurrentUser' },
                },
              },
            },
          },
        },
        StudioOccupancyForecastResponse: {
          type: 'object',
          properties: {
            generatedAt: { type: 'string', format: 'date-time' },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            summary: {
              type: 'object',
              properties: {
                totalStudios: { type: 'integer' },
                totalDoubleBookingConflicts: { type: 'integer' },
                averageUtilizationRate: { type: 'number', format: 'float' },
                averageOccupancyRate: { type: 'number', format: 'float' },
              },
            },
            studios: {
              type: 'array',
              items: { $ref: '#/components/schemas/StudioForecastItem' },
            },
          },
        },
        StudioBlockRequest: {
          type: 'object',
          required: ['studioId', 'startsAt', 'endsAt'],
          properties: {
            studioId: { type: 'integer', minimum: 1 },
            startsAt: { $ref: '#/components/schemas/StudioDateInput' },
            endsAt: { $ref: '#/components/schemas/StudioDateInput' },
            reason: { type: 'string', nullable: true, maxLength: 255 },
            blockType: { type: 'string', nullable: true, maxLength: 50, example: 'maintenance' },
          },
        },
        StudioManualStatusRequest: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['available', 'occupied', 'blocked', 'maintenance', 'unavailable'],
            },
            reason: { type: 'string', nullable: true, maxLength: 255 },
            startsAt: {
              allOf: [{ $ref: '#/components/schemas/StudioDateInput' }],
              nullable: true,
            },
            endsAt: {
              allOf: [{ $ref: '#/components/schemas/StudioDateInput' }],
              nullable: true,
            },
          },
        },
      },
    },
    paths: {
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login with email and password',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 1 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Authenticated successfully' },
            400: { description: 'Invalid credentials payload' },
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Refresh access token',
          responses: {
            200: { description: 'Token refreshed' },
            401: { description: 'Refresh token missing or invalid' },
          },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout current session',
          responses: {
            200: { description: 'Logged out' },
          },
        },
      },
      '/auth/logout-all': {
        post: {
          tags: ['Auth'],
          summary: 'Logout from all sessions',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Logged out from all sessions' },
            401: { description: 'Not authenticated' },
          },
        },
      },
      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current authenticated user',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Current user' },
            401: { description: 'Not authenticated' },
          },
        },
      },
      '/student/profile': {
        get: {
          tags: ['Student'],
          summary: 'Get student profile',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Student profile' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/student/dashboard': {
        get: {
          tags: ['Student'],
          summary: 'Get student dashboard',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Student dashboard' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/student/schedule/upcoming': {
        get: {
          tags: ['Student'],
          summary: 'Get upcoming student schedule',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Upcoming schedule' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/teacher/admissions/pending': {
        get: {
          tags: ['Teacher'],
          summary: 'List pending admissions for teacher',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Pending admissions' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/teacher/admissions/{joinRequestId}/approve': {
        patch: {
          tags: ['Teacher'],
          summary: 'Approve a join request',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'joinRequestId',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: { description: 'Join request approved' },
            400: { description: 'Invalid id' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Not found' },
          },
        },
      },
      '/teacher/admissions/{joinRequestId}/reject': {
        patch: {
          tags: ['Teacher'],
          summary: 'Reject a join request',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'joinRequestId',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: { description: 'Join request rejected' },
            400: { description: 'Invalid id' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Not found' },
          },
        },
      },
      '/teacher/sessions/pending': {
        get: {
          tags: ['Teacher'],
          summary: 'List pending sessions for teacher',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Pending sessions' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/teacher/sessions/{id}/confirm-completion': {
        patch: {
          tags: ['Teacher'],
          summary: 'Confirm session completion',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: { description: 'Completion confirmed' },
            400: { description: 'Invalid id' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Not found' },
          },
        },
      },
      '/teacher/sessions/{id}/no-show': {
        post: {
          tags: ['Teacher'],
          summary: 'Register a no-show',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: { description: 'No-show registered' },
            400: { description: 'Invalid id' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Not found' },
          },
        },
      },
      '/teacher/admission-requests': {
        get: {
          tags: ['Teacher'],
          summary: 'List admission requests visible to teacher',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Admission requests' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/teacher/dashboard': {
        get: {
          tags: ['Teacher'],
          summary: 'Get teacher dashboard',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Teacher dashboard' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/teacher/schedule/today': {
        get: {
          tags: ['Teacher'],
          summary: 'Get today schedule',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Today schedule' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/teacher/admission-requests/{joinRequestId}/review': {
        patch: {
          tags: ['Teacher'],
          summary: 'Review an admission request',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'joinRequestId',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: { description: 'Admission request reviewed' },
            400: { description: 'Invalid id' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Not found' },
          },
        },
      },
      '/teacher/availability': {
        get: {
          tags: ['Teacher'],
          summary: 'List teacher availability',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Availability list' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
        post: {
          tags: ['Teacher'],
          summary: 'Submit teacher availability',
          security: [{ bearerAuth: [] }],
          responses: {
            201: { description: 'Availability created' },
            400: { description: 'Invalid payload' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/teacher/availability/{availabilityId}': {
        patch: {
          tags: ['Teacher'],
          summary: 'Update teacher availability',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'availabilityId',
              required: true,
              schema: { type: 'integer' },
            },
          ],
          responses: {
            200: { description: 'Availability updated' },
            400: { description: 'Invalid payload or id' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Not found' },
          },
        },
      },
      '/teacher/availability/exceptions': {
        post: {
          tags: ['Teacher'],
          summary: 'Create teacher availability exception',
          security: [{ bearerAuth: [] }],
          responses: {
            201: { description: 'Exception created' },
            400: { description: 'Invalid payload' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/teacher/availability/exceptions/pending': {
        get: {
          tags: ['Teacher'],
          summary: 'List pending teacher availability exceptions',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Pending exceptions' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
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
        get: {
          tags: ['LostFound'],
          summary: 'List lost and found items for admin',
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'List of lost and found items including archived entries',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/LostFoundAdminItem' },
                  },
                },
              },
            },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
        post: {
          tags: ['LostFound'],
          summary: 'Create lost and found item (admin)',
          security: [{ bearerAuth: [] }],
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
        get: {
          tags: ['LostFound'],
          summary: 'Get one lost and found item for admin',
          security: [{ bearerAuth: [] }],
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
                  schema: { $ref: '#/components/schemas/LostFoundAdminItem' },
                },
              },
            },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Not found' },
          },
        },
        patch: {
          tags: ['LostFound'],
          summary: 'Update lost and found item (admin)',
          security: [{ bearerAuth: [] }],
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
          security: [{ bearerAuth: [] }],
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
          security: [{ bearerAuth: [] }],
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
          security: [{ bearerAuth: [] }],
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
      '/admin/studio-occupancy/real-time': {
        get: {
          tags: ['StudioOccupancy'],
          summary: 'Get real-time occupancy snapshot for all studios',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'query',
              name: 'at',
              required: false,
              description: 'Reference date/time. Accepted formats: DD-MM-YYYY, DD-MM-YYYY HH:mm, or ISO-8601. Defaults to server current time.',
              schema: { $ref: '#/components/schemas/StudioDateInput' },
            },
          ],
          responses: {
            200: {
              description: 'Real-time occupancy payload',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StudioOccupancyRealtimeResponse' },
                },
              },
            },
            400: { description: 'Invalid query parameters' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/admin/studio-occupancy/forecast': {
        get: {
          tags: ['StudioOccupancy'],
          summary: 'Get occupancy forecast analytics for a time window',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'query',
              name: 'from',
              required: false,
              description: 'Window start. Accepted formats: DD-MM-YYYY, DD-MM-YYYY HH:mm, or ISO-8601. Defaults to now.',
              schema: { $ref: '#/components/schemas/StudioDateInput' },
            },
            {
              in: 'query',
              name: 'to',
              required: false,
              description: 'Window end. Accepted formats: DD-MM-YYYY, DD-MM-YYYY HH:mm, or ISO-8601. Defaults to from + 7 days.',
              schema: { $ref: '#/components/schemas/StudioDateInput' },
            },
          ],
          responses: {
            200: {
              description: 'Forecast occupancy payload',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StudioOccupancyForecastResponse' },
                },
              },
            },
            400: { description: 'Invalid query parameters' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/admin/studio-occupancy/block': {
        post: {
          tags: ['StudioOccupancy'],
          summary: 'Create a temporary global studio block (ex: maintenance)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StudioBlockRequest' },
              },
            },
          },
          responses: {
            201: {
              description: 'Block created and conflict alerts evaluated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      block: { type: 'object' },
                      studio: {
                        type: 'object',
                        properties: {
                          StudioID: { type: 'integer' },
                          StudioName: { type: 'string' },
                        },
                      },
                      alerts: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/StudioOccupancyAlert' },
                      },
                    },
                  },
                },
              },
            },
            400: { description: 'Invalid payload' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Studio not found' },
          },
        },
      },
      '/admin/studio-occupancy/{studioId}/status': {
        patch: {
          tags: ['StudioOccupancy'],
          summary: 'Set manual occupancy status override for a studio',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: 'path',
              name: 'studioId',
              required: true,
              schema: { type: 'integer', minimum: 1 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StudioManualStatusRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Manual status applied',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      studio: {
                        type: 'object',
                        properties: {
                          StudioID: { type: 'integer' },
                          StudioName: { type: 'string' },
                        },
                      },
                      statusOverride: {
                        type: 'object',
                        nullable: true,
                      },
                      alerts: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/StudioOccupancyAlert' },
                      },
                    },
                  },
                },
              },
            },
            400: { description: 'Invalid payload or params' },
            401: { description: 'Not authenticated' },
            403: { description: 'Forbidden' },
            404: { description: 'Studio not found' },
          },
        },
      },
    },
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
      /<svg([^>]*?)\sstyle="position:absolute;width:0;height:0"/g,
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
  injectCspNonceInSwaggerHtml,
  setupSwagger,
  swaggerSpec,
};

