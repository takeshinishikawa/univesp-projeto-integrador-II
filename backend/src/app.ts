import cors from 'cors';
import express, { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { getEnv } from './config/env';
import { swaggerSpec } from './config/swagger';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { routes } from './routes';

export function criarApp(): Express {
  const app = express();

  app.use(cors({ origin: getEnv().CORS_ORIGIN.split(',') }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
