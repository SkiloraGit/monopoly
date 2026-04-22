/**
 * MessageHandler - Enruta todos los mensajes WebSocket del cliente.
 */

class MessageHandler {
  constructor(gameManager) {
    this.gm = gameManager;
  }

  handle(msg, socketId, clients, wss) {
    const { type } = msg;
    console.log(`[MSG] ${type} | socket=${socketId}`);

    switch (type) {
      case 'register':          return this.onRegister(msg, socketId, clients);
      case 'get_lobby':         return this.onGetLobby(socketId, clients);
      case 'create_game':       return this.onCreateGame(msg, socketId, clients, wss);
      case 'join_game':         return this.onJoinGame(msg, socketId, clients, wss);
      case 'leave_game':        return this.onLeaveGame(socketId, clients, wss);
      case 'set_ready':         return this.onSetReady(msg, socketId, clients, wss);
      case 'start_game':        return this.onStartGame(socketId, clients, wss);
      case 'roll_dice':         return this.onRollDice(socketId, clients, wss);
      case 'buy_property':      return this.onBuyProperty(socketId, clients, wss);
      case 'upgrade_property':  return this.onUpgradeProperty(msg, socketId, clients, wss);
      case 'end_turn':          return this.onEndTurn(socketId, clients, wss);
      case 'pay_jail_fine':     return this.onPayJailFine(socketId, clients, wss);
      case 'use_item':          return this.onUseItem(msg, socketId, clients, wss);
      case 'propose_trade':     return this.onProposeTrade(msg, socketId, clients, wss);
      case 'respond_trade':     return this.onRespondTrade(msg, socketId, clients, wss);
      case 'resolve_duel':      return this.onResolveDuel(msg, socketId, clients, wss);
      case 'reconnect':         return this.onReconnect(msg, socketId, clients, wss);
      default:
        this._send(clients.get(socketId)?.ws, { type: 'error', message: `Tipo desconocido: ${type}` });
    }
  }

  // ─── Registro ─────────────────────────────────────────────────────────────

  onRegister(msg, socketId, clients) {
    const client = clients.get(socketId);
    if (!client) return;
    client.playerId    = msg.playerId;
    client.playerName  = msg.playerName;
    this._send(client.ws, { type: 'registered', playerId: msg.playerId, playerName: msg.playerName });
  }

  // ─── Lobby ────────────────────────────────────────────────────────────────

  onGetLobby(socketId, clients) {
    const client = clients.get(socketId);
    if (!client) return;
    this._send(client.ws, { type: 'lobby_list', games: this.gm.getLobbyList() });
  }

  onCreateGame(msg, socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client) return;
    const player = { id: client.playerId, name: client.playerName, socketId, ready: false };
    const config = { mode: msg.mode||'elimination', turnLimit: msg.turnLimit||30, turnTime: msg.turnTime||30, botCount: msg.botCount||0 };
    const game   = this.gm.createGame(player, config);
    client.gameId = game.gameId;

    // Registrar callback de timeout (humanos)
    game.setTurnTimeoutCallback((gameId, playerId) => {
      const g = this.gm.getGame(gameId);
      if (!g || g.phase !== 'playing') return;
      const result = g.endTurn();
      this._broadcastToGame(gameId, { type: 'turn_ended', ...result }, clients, wss);
      this._broadcastLobbyUpdate(clients);
    });

    // Registrar callback de turno de bot
    game.setBotTurnCallback((gameId, botId) => {
      this._executeBotTurn(gameId, botId, clients, wss);
    });

    this._send(client.ws, { type: 'game_created', gameId: game.gameId, gameState: game.getPublicState() });
    this._broadcastLobbyUpdate(clients);
  }

  onJoinGame(msg, socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client) return;
    const player = { id: client.playerId, name: client.playerName, socketId, ready: false };
    const result = this.gm.joinGame(msg.gameId, player);
    if (result.error) { this._send(client.ws, { type: 'error', message: result.error }); return; }

    client.gameId = msg.gameId;
    this._send(client.ws, { type: 'game_joined', gameId: msg.gameId, gameState: result.game.getPublicState() });
    this._broadcastToGame(msg.gameId, { type: 'player_joined', gameState: result.game.getPublicState() }, clients, wss);
    this._broadcastLobbyUpdate(clients);
  }

  onLeaveGame(socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client || !client.gameId) return;
    const gameId = client.gameId;
    this.gm.leaveGame(gameId, client.playerId);
    client.gameId = null;
    this._send(client.ws, { type: 'game_left' });
    const game = this.gm.getGame(gameId);
    if (game) this._broadcastToGame(gameId, { type: 'player_left', gameState: game.getPublicState() }, clients, wss);
    this._broadcastLobbyUpdate(clients);
  }

  onSetReady(msg, socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId) return;
    const game = this.gm.setPlayerReady(client.gameId, client.playerId, msg.ready);
    if (!game) return;
    this._broadcastToGame(client.gameId, {
      type: 'player_ready_changed', playerId: client.playerId,
      ready: msg.ready, gameState: game.getPublicState()
    }, clients, wss);
  }

  onStartGame(socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId) return;
    const result = this.gm.startGame(client.gameId, client.playerId);
    if (result.error) { this._send(client.ws, { type: 'error', message: result.error }); return; }

    // Registrar callbacks de timeout y bot
    result.game.setTurnTimeoutCallback((gameId, playerId) => {
      const g = this.gm.getGame(gameId);
      if (!g || g.phase !== 'playing') return;
      const r = g.endTurn();
      this._broadcastToGame(gameId, { type: 'turn_ended', ...r }, clients, wss);
    });

    result.game.setBotTurnCallback((gameId, botId) => {
      this._executeBotTurn(gameId, botId, clients, wss);
    });

    this._broadcastToGame(client.gameId, { type: 'game_started', gameState: result.game.getPublicState() }, clients, wss);
    this._broadcastLobbyUpdate(clients);
  }

  // ─── Acciones de juego ────────────────────────────────────────────────────

  onRollDice(socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId) return;
    const result = this.gm.rollDice(client.gameId, client.playerId);
    if (result.error) { this._send(client.ws, { type: 'error', message: result.error }); return; }
    this._broadcastToGame(client.gameId, { type: 'dice_rolled', ...result }, clients, wss);
  }

  onBuyProperty(socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId) return;
    const result = this.gm.buyProperty(client.gameId, client.playerId);
    if (result.error) { this._send(client.ws, { type: 'error', message: result.error }); return; }
    this._broadcastToGame(client.gameId, { type: 'property_bought', ...result }, clients, wss);
  }

  onUpgradeProperty(msg, socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId) return;
    const result = this.gm.upgradeProperty(client.gameId, client.playerId, msg.cellIndex);
    if (result.error) { this._send(client.ws, { type: 'error', message: result.error }); return; }
    this._broadcastToGame(client.gameId, { type: 'property_upgraded', ...result }, clients, wss);
  }

  onEndTurn(socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId) return;
    const result = this.gm.endTurn(client.gameId, client.playerId);
    if (result.error) { this._send(client.ws, { type: 'error', message: result.error }); return; }
    this._broadcastToGame(client.gameId, { type: 'turn_ended', ...result }, clients, wss);
  }

  onPayJailFine(socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId) return;
    const result = this.gm.payJailFine(client.gameId, client.playerId);
    if (result.error) { this._send(client.ws, { type: 'error', message: result.error }); return; }
    this._broadcastToGame(client.gameId, { type: 'jail_fine_paid', ...result }, clients, wss);
  }

  onUseItem(msg, socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId) return;
    const result = this.gm.useItem(client.gameId, client.playerId, msg.itemIndex);
    if (result.error) { this._send(client.ws, { type: 'error', message: result.error }); return; }
    this._broadcastToGame(client.gameId, { type: 'item_used', ...result }, clients, wss);
  }

  onProposeTrade(msg, socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId) return;
    const result = this.gm.proposeTrade(client.gameId, client.playerId,
      msg.toPlayerId, msg.fromCellIndex, msg.toCellIndex);
    if (result.error) { this._send(client.ws, { type: 'error', message: result.error }); return; }
    this._broadcastToGame(client.gameId, { type: 'trade_proposed', ...result }, clients, wss);
  }

  onRespondTrade(msg, socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId) return;
    const result = this.gm.proposeTradeResponse(client.gameId, client.playerId, msg.accepted);
    if (result.error) { this._send(client.ws, { type: 'error', message: result.error }); return; }
    this._broadcastToGame(client.gameId, { type: 'trade_response', ...result }, clients, wss);
  }

  onResolveDuel(msg, socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId) return;
    const game = this.gm.getGame(client.gameId);
    if (!game) return;
    const result = game.resolveDuel(client.playerId, msg.targetId || '');
    if (result.error) { this._send(client.ws, { type: 'error', message: result.error }); return; }
    this._broadcastToGame(client.gameId, { type: 'duel_resolved', ...result }, clients, wss);
  }

  // ─── Reconexión ───────────────────────────────────────────────────────────

  onReconnect(msg, socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client) return;
    client.playerId = msg.playerId;
    client.gameId   = msg.gameId;

    const game = this.gm.handleReconnect(msg.gameId, msg.playerId, socketId, clients);
    if (!game) {
      this._send(client.ws, { type: 'error', message: 'Partida no encontrada para reconexión' });
      return;
    }
    this._send(client.ws, { type: 'reconnected', gameState: game.getPublicState() });
    this._broadcastToGame(msg.gameId,
      { type: 'player_reconnected', playerId: msg.playerId, gameState: game.getPublicState() },
      clients, wss, socketId);
  }

  // ─── Desconexión ──────────────────────────────────────────────────────────

  handleDisconnect(socketId, clients, wss) {
    const client = clients.get(socketId);
    if (!client?.gameId || !client?.playerId) return;
    const { gameId, playerId } = client;
    const game = this.gm.getGame(gameId);
    if (!game) return;

    const player = game.getPlayer(playerId);
    if (player) player.disconnected = true;

    this._broadcastToGame(gameId, {
      type: 'player_disconnected', playerId, gameState: game.getPublicState()
    }, clients, wss);

    if (game.phase === 'lobby') {
      this.gm.leaveGame(gameId, playerId);
      const updated = this.gm.getGame(gameId);
      if (updated) this._broadcastToGame(gameId, { type: 'player_left', gameState: updated.getPublicState() }, clients, wss);
      this._broadcastLobbyUpdate(clients);
    }
  }

  // ─── Bot execution ────────────────────────────────────────────────────────

  _executeBotTurn(gameId, botId, clients, wss) {
    const game = this.gm.getGame(gameId);
    if (!game || game.phase !== 'playing') return;
    if (game.currentPlayerId !== botId) return;

    const bot = game.getPlayer(botId);
    if (!bot || !bot.isBot || !bot.active) return;

    console.log(`[BOT] Turno de ${bot.name} (${botId})`);

    try {
      const results = game.playBotTurn(botId);
      for (const result of results) {
        if (result && result.type) {
          this._broadcastToGame(gameId, result, clients, wss);
          // Pausa pequeña entre mensajes para que el cliente los procese
        }
      }
    } catch (err) {
      console.error(`[BOT] Error en turno de ${bot.name}:`, err.message);
      // Fallback: terminar turno para no bloquear
      try {
        const fallback = game.endTurn();
        this._broadcastToGame(gameId, { type: 'turn_ended', ...fallback }, clients, wss);
      } catch(e2) {
        console.error('[BOT] Fallback endTurn failed:', e2.message);
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _send(ws, data) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
  }

  _broadcastToGame(gameId, data, clients, wss, excludeSocket) {
    for (const [sid, client] of clients) {
      if (client.gameId === gameId && sid !== excludeSocket) {
        this._send(client.ws, data);
      }
    }
  }

  _broadcastLobbyUpdate(clients) {
    const list = this.gm.getLobbyList();
    for (const [, client] of clients) {
      if (!client.gameId) this._send(client.ws, { type: 'lobby_update', games: list });
    }
  }
}

module.exports = MessageHandler;
