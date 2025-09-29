import { createServer } from "node:http";

import { WebSocket, WebSocketServer } from "ws";

import { app } from "./app";
import { config } from "./config";
import { connectDatabase, disconnectDatabase } from "./db";
import { engine, initializeMatchingEngine } from "./matching";
import { logger } from "./logger";

const port = config.port;

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket: WebSocket) => {
  logger.info("WebSocket client connected");

  const unsubscribe = engine.subscribe((event) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  });

  socket.send(
    JSON.stringify({
      type: "engine:hello",
      payload: { symbols: engine.getSymbols() },
      timestamp: Date.now(),
    }),
  );

  engine.getSymbols().forEach((symbol) => {
    const snapshot = engine.getSnapshot(symbol);
    if (snapshot) {
      socket.send(
        JSON.stringify({
          type: "book:snapshot",
          payload: { snapshot },
          timestamp: Date.now(),
        }),
      );
    }
  });

  socket.on("close", () => {
    unsubscribe();
    logger.info("WebSocket client disconnected");
  });
});

const shutdown = async () => {
  logger.info("Shutting down server");
  wss.clients.forEach((client) => client.terminate());
  wss.close();
  server.close();
  await disconnectDatabase();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const bootstrap = async () => {
  try {
    await connectDatabase();
    await initializeMatchingEngine();
    server.listen(port, () => {
      logger.info({ port }, "HTTP server listening");
    });
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
};

void bootstrap();
