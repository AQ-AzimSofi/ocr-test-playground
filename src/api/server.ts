#!/usr/bin/env node

import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { drawingsRoutes } from './routes/drawings.js';
import { resultsRoutes } from './routes/results.js';
import { testRunsRoutes } from './routes/test-runs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Register CORS to allow frontend access
await fastify.register(cors, {
  origin: ['http://localhost:5173', 'http://localhost:3000'], // Vite default port + backup
  credentials: true,
});

// Serve static files (drawing images)
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../../test-drawings'),
  prefix: '/static/drawings/',
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register route modules
await fastify.register(drawingsRoutes, { prefix: '/api/drawings' });
await fastify.register(resultsRoutes, { prefix: '/api/results' });
await fastify.register(testRunsRoutes, { prefix: '/api/test-runs' });

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.API_PORT || '3001', 10);
    const host = process.env.API_HOST || '0.0.0.0';

    await fastify.listen({ port, host });

    console.log('');
    console.log('OCR Visualization API Server');
    console.log('================================');
    console.log(`Server listening on: http://localhost:${port}`);
    console.log(`Static files: http://localhost:${port}/static/drawings/`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log('');
    console.log('API Endpoints:');
    console.log(`  GET  /api/drawings              - List all drawings`);
    console.log(`  GET  /api/drawings/:id          - Get drawing by ID`);
    console.log(
      `  GET  /api/drawings/:id/results  - Get all OCR results for drawing`
    );
    console.log(
      `  GET  /api/results/:id           - Get specific result with bounding boxes`
    );
    console.log(`  GET  /api/test-runs             - List all test runs`);
    console.log(
      `  GET  /api/test-runs/:id         - Get test run with comparison data`
    );
    console.log('');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
