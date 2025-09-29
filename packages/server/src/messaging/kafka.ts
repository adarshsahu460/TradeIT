import { randomUUID } from "node:crypto";

import { Kafka, logLevel, type Consumer, type EachMessagePayload, type Producer } from "kafkajs";

import { config } from "../config.js";
import { logger } from "../logger.js";

let kafkaInstance: Kafka | null = null;
let producerInstance: Producer | null = null;

const getKafka = () => {
  if (!kafkaInstance) {
    kafkaInstance = new Kafka({
      brokers: config.kafkaBrokers,
      clientId: config.kafkaClientId,
      logLevel: logLevel.ERROR,
    });
  }
  return kafkaInstance;
};

export const getProducer = async () => {
  if (!producerInstance) {
    const kafka = getKafka();
    producerInstance = kafka.producer({
      allowAutoTopicCreation: true,
    });
    await producerInstance.connect();
    logger.info({ brokers: config.kafkaBrokers }, "Kafka producer connected");
  }
  return producerInstance;
};

export type MessageHandler = (payload: EachMessagePayload) => Promise<void> | void;

export const createConsumer = async (groupId?: string) => {
  const kafka = getKafka();
  const consumer: Consumer = kafka.consumer({
    groupId: groupId ?? `${config.kafkaClientId}-${randomUUID()}`,
    allowAutoTopicCreation: true,
  });
  await consumer.connect();
  logger.info({ groupId }, "Kafka consumer connected");
  return consumer;
};

export const disconnectKafka = async () => {
  if (producerInstance) {
    await producerInstance.disconnect();
    producerInstance = null;
  }
};
