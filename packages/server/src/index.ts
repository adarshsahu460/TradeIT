import { createServer } from "node:http";

import { WebSocket, WebSocketServer } from "ws";

import { app } from "./app";
import { engine } from "./matching";
import { logger } from "./logger";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);

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

server.listen(port, () => {
  logger.info({ port }, "HTTP server listening");
});
