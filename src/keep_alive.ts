import express from 'express';
import { logger } from './utils/logger.js';

export function startKeepAlive() {
  const app = express();
  const port = process.env.PORT || 8080;

  app.get('/', (req, res) => {
    res.status(200).json({
      status: 'alive',
      bot: 'Plagg Bot - The Final Testament',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health', (req, res) => {
    res.status(204).send();
  });

  app.listen(port, '0.0.0.0', () => {
    logger.info(`🌐 Keep-alive server running on port ${port}`);
  });
}
