/**
 * GameManager - Gestión autoritativa de todas las partidas
 */

const { v4: uuidv4 } = require('uuid');
const GameState = require('./GameState');

class GameManager {
  constructor() {
    // gameId -> GameState
    this.games = new Map();
  }

  // ─── Lobby ───────────────────────────────────────────────────────────────

  createGame(hostPlayer, config) {
    const gameId = uuidv4().substring(0, 8).toUpperCase();
    const game = new GameState(gameId, hostPlayer, config);
    this.games.set(gameId, game);
    console.log(`[GM] Partida creada: ${gameId} por ${hostPlayer.name}`);

    // Agregar bots si se solicitaron
    const botCount = Math.max(0, Math.min(7, parseInt(config.botCount) || 0));
    for (let i = 0; i < botCount; i++) {
      game.addBot(`Bot_${i + 1}`);
    }

    return game;
  }

  getGame(gameId) {
    return this.games.get(gameId) || null;
  }

  deleteGame(gameId) {
    this.games.delete(gameId);
    console.log(`[GM] Partida eliminada: ${gameId}`);
  }

  getLobbyList() {
    const list = [];
    for (const [id, game] of this.games) {
      if (game.phase === 'lobby') {
        const botCount = game.players.filter(p => p.isBot).length;
        list.push({
          gameId: id,
          hostName: game.host.name,
          playerCount: game.players.length,
          botCount,
          maxPlayers: 8,
          mode: game.config.mode,
          turnLimit: game.config.turnLimit,
        });
      }
    }
    return list;
  }

  joinGame(gameId, player) {
    const game = this.getGame(gameId);
    if (!game) return { error: 'Partida no encontrada' };
    if (game.phase !== 'lobby') return { error: 'Partida ya iniciada' };
    if (game.players.length >= 8) return { error: 'Partida llena' };
    if (game.players.find(p => p.id === player.id)) return { error: 'Ya estás en la partida' };

    game.addPlayer(player);
    return { success: true, game };
  }

  leaveGame(gameId, playerId) {
    const game = this.getGame(gameId);
    if (!game) return;
    game.removePlayer(playerId);
    if (game.players.length === 0) {
      this.deleteGame(gameId);
    } else if (game.host.id === playerId && game.players.length > 0) {
      game.host = game.players[0];
    }
  }

  setPlayerReady(gameId, playerId, ready) {
    const game = this.getGame(gameId);
    if (!game) return null;
    const player = game.players.find(p => p.id === playerId);
    if (player) player.ready = ready;
    return game;
  }

  startGame(gameId, requesterId) {
    const game = this.getGame(gameId);
    if (!game) return { error: 'Partida no encontrada' };
    if (game.host.id !== requesterId) return { error: 'Solo el host puede iniciar' };
    if (game.players.length < 2) return { error: 'Se necesitan al menos 2 jugadores' };
    if (!game.players.every(p => p.ready)) return { error: 'No todos están listos' };

    game.startGame();
    return { success: true, game };
  }

  // ─── Turno / Acciones ────────────────────────────────────────────────────

  rollDice(gameId, playerId) {
    const game = this.getGame(gameId);
    if (!game) return { error: 'Partida no encontrada' };
    if (game.phase !== 'playing') return { error: 'Partida no iniciada' };
    if (game.currentPlayerId !== playerId) return { error: 'No es tu turno' };
    if (game.turnState.diceRolled) return { error: 'Ya tiraste el dado' };

    return game.rollDice();
  }

  buyProperty(gameId, playerId) {
    const game = this.getGame(gameId);
    if (!game) return { error: 'Partida no encontrada' };
    if (game.currentPlayerId !== playerId) return { error: 'No es tu turno' };
    return game.buyProperty(playerId);
  }

  upgradeProperty(gameId, playerId, cellIndex) {
    const game = this.getGame(gameId);
    if (!game) return { error: 'Partida no encontrada' };
    if (game.currentPlayerId !== playerId) return { error: 'No es tu turno' };
    return game.upgradeProperty(playerId, cellIndex);
  }

  endTurn(gameId, playerId) {
    const game = this.getGame(gameId);
    if (!game) return { error: 'Partida no encontrada' };
    if (game.currentPlayerId !== playerId) return { error: 'No es tu turno' };
    return game.endTurn();
  }

  payJailFine(gameId, playerId) {
    const game = this.getGame(gameId);
    if (!game) return { error: 'Partida no encontrada' };
    return game.payJailFine(playerId);
  }

  useItem(gameId, playerId, itemIndex) {
    const game = this.getGame(gameId);
    if (!game) return { error: 'Partida no encontrada' };
    return game.useItem(playerId, itemIndex);
  }

  proposeTradeResponse(gameId, playerId, accepted) {
    const game = this.getGame(gameId);
    if (!game) return { error: 'Partida no encontrada' };
    return game.respondTrade(playerId, accepted);
  }

  proposeTrade(gameId, fromPlayerId, toPlayerId, fromCell, toCell) {
    const game = this.getGame(gameId);
    if (!game) return { error: 'Partida no encontrada' };
    return game.initiateTrade(fromPlayerId, toPlayerId, fromCell, toCell);
  }

  handleReconnect(gameId, playerId, newSocketId, clients) {
    const game = this.getGame(gameId);
    if (!game) return null;
    const player = game.players.find(p => p.id === playerId);
    if (player) {
      player.socketId = newSocketId;
      player.disconnected = false;
    }
    return game;
  }
}

module.exports = GameManager;
