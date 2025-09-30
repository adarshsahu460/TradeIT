import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: 'tradeit_' });

export const httpRequestDuration = new Histogram({
  name: 'tradeit_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

export const httpRequestCounter = new Counter({
  name: 'tradeit_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

export const orderProcessingDuration = new Histogram({
  name: 'tradeit_order_processing_duration_seconds',
  help: 'Time from order command receipt to outbox enqueue',
  labelNames: ['symbol', 'result'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
});

export const outboxPendingGauge = new Gauge({
  name: 'tradeit_outbox_pending_events',
  help: 'Number of events waiting to be published',
});

export const outboxPublishDuration = new Histogram({
  name: 'tradeit_outbox_publish_batch_duration_seconds',
  help: 'Time to publish one outbox batch',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
});

export const kafkaConsumerLagGauge = new Gauge({
  name: 'tradeit_kafka_consumer_lag',
  help: 'Approximate consumer lag for matcher/gateway (placeholder)',
  labelNames: ['consumer'],
});

registry.registerMetric(httpRequestDuration);
registry.registerMetric(httpRequestCounter);
registry.registerMetric(orderProcessingDuration);
registry.registerMetric(outboxPendingGauge);
registry.registerMetric(outboxPublishDuration);
registry.registerMetric(kafkaConsumerLagGauge);
