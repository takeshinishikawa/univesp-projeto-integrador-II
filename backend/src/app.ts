import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { getEnv } from './config/env';
import { swaggerSpec } from './config/swagger';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { routes } from './routes';

export function criarApp(): Express {
  const app = express();
  app.set('trust proxy', getEnv().TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(cors({ origin: getEnv().CORS_ORIGIN.split(',') }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  // Cabeçalhos de segurança só na API: a CSP padrão do helmet quebraria a página do Swagger.
  app.use('/api', helmet(), routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
