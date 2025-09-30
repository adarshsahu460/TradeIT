import { config } from '../config.js';
import p from 'node:process';

// Simple diagnostic dump for environment resolution
console.log('Effective config snapshot');
console.log(JSON.stringify({
  kafkaBrokers: config.kafkaBrokers,
  serviceName: config.serviceName,
  isTestEnvironment: config.isTestEnvironment,
  redisUrl: config.redisUrl,
  databaseUrlPresent: !!config.databaseUrl,
  nodeEnv: p.env.NODE_ENV,
}, null, 2));
