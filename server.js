/**
 * Medieval Monopoly - Servidor Autoritativo
 * Node.js + Express + WebSockets
 * Preparado para deploy en Render
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const GameManager = require('./src/GameManager');
const MessageHandler = require('./src/MessageHandler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check para Render
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ game: 'Medieval Monopoly', version: '1.0.0' });
});

// Almacén global de partidas y jugadores
const gameManager = new GameManager();
const messageHandler = new MessageHandler(gameManager);

// Mapa de clientes conectados: socketId -> { ws, playerId, gameId }
const clients = new Map();

wss.on('connection', (ws) => {
  const socketId = uuidv4();
  clients.set(socketId, { ws, playerId: null, gameId: null });

  console.log(`[WS] Cliente conectado: ${socketId}`);

  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());
      messageHandler.handle(msg, socketId, clients, wss);
    } catch (e) {
      console.error('[WS] Error parseando mensaje:', e.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Mensaje inválido' }));
    }
  });

  ws.on('close', () => {
    const client = clients.get(socketId);
    if (client && client.gameId && client.playerId) {
      messageHandler.handleDisconnect(socketId, clients, wss);
    }
    clients.delete(socketId);
    console.log(`[WS] Cliente desconectado: ${socketId}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error en socket ${socketId}:`, err.message);
  });

  // Enviar confirmación de conexión
  ws.send(JSON.stringify({ type: 'connected', socketId }));
});

server.listen(PORT, () => {
  console.log(`[Server] Medieval Monopoly corriendo en puerto ${PORT}`);
});
