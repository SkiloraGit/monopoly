/**
 * GameState - Estado completo y autoritativo de una partida
 * Incluye timeout de turno automático server-side
 */

const BOARD_DATA = require('./BoardData');

const COLORS = ['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#E91E63'];

class GameState {
  constructor(gameId, hostPlayer, config) {
    this.gameId = gameId;
    this.host   = hostPlayer;
    this.config = {
      mode:      config.mode      || 'elimination',
      turnLimit: config.turnLimit || 30,
      turnTime:  config.turnTime  || 30,
    };
    this.phase   = 'lobby';
    this.players = [hostPlayer];

    this.properties          = {};
    this.currentPlayerIndex  = 0;
    this.currentPlayerId     = null;
    this.turnCount           = 0;
    this.turnState = {
      diceRolled:    false,
      diceResult:    null,
      extraRoll:     false,
      actionPending: null,
      actionData:    null,
    };
    this.pendingTrade = null;
    this._turnTimer   = null;   // timeout server-side
    this._onTimeout   = null;   // callback externo para broadcast
    this._onBotTurn   = null;   // callback para ejecutar turno de bot
    this.events       = [];
  }

  // ─── Jugadores ────────────────────────────────────────────────────────────

  addPlayer(player) {
    player.color  = COLORS[this.players.length % COLORS.length];
    player.ready  = false;
    player.gold   = 0;
    player.position = 0;
    player.jailTurns = 0;
    player.items  = [];
    player.active = true;
    player.bonusRentTurns = 0;
    player.disconnected   = false;
    this.players.push(player);
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId) || null;
  }

  getActivePlayers() {
    return this.players.filter(p => p.active);
  }

  // ─── Inicio de partida ────────────────────────────────────────────────────

  startGame() {
    this.phase = 'playing';
    this.properties = {};
    this.players.forEach((p, i) => {
      p.gold   = 1000;
      p.position = 0;
      p.jailTurns = 0;
      p.items  = [];
      p.active = true;
      p.ready  = true;
      p.bonusRentTurns = 0;
      p.color  = COLORS[i % COLORS.length];
      if (p.isBot) p.disconnected = false;
    });
    this.currentPlayerIndex = 0;
    this.currentPlayerId    = this.players[0].id;
    this.turnCount = 0;
    this._resetTurnState();
    this._pushEvent('game_started', {});
    this._startTurnTimer();
  }

  // ─── Timeout de turno (server-side) ──────────────────────────────────────

  setTurnTimeoutCallback(cb) {
    this._onTimeout = cb;
  }

  setBotTurnCallback(cb) {
    this._onBotTurn = cb;
  }

  // Agrega un bot como jugador
  addBot(name) {
    const bot = {
      id:           'bot_' + Date.now() + '_' + Math.floor(Math.random() * 9999),
      name:         name || ('Bot_' + (this.players.length)),
      socketId:     null,
      isBot:        true,
      ready:        true,
      color:        null,
      gold:         0,
      position:     0,
      jailTurns:    0,
      items:        [],
      active:       true,
      bonusRentTurns: 0,
      disconnected: false,
    };
    // Asignar color como addPlayer pero sin sobrescribir ready/isBot
    const COLORS = ['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#E91E63'];
    bot.color = COLORS[this.players.length % COLORS.length];
    this.players.push(bot);
    return bot;
  }

  _startTurnTimer() {
    this._clearTurnTimer();
    // Si el turno actual es de un bot, disparar acción automática tras 1.2s
    const currentPlayer = this.getPlayer(this.currentPlayerId);
    if (currentPlayer && currentPlayer.isBot && this.phase === 'playing') {
      this._turnTimer = setTimeout(() => {
        if (this.phase === 'playing' && this._onBotTurn) {
          this._onBotTurn(this.gameId, this.currentPlayerId);
        }
      }, 1200);
      return;
    }
    const secs = (this.config.turnTime || 30) + 5; // +5s de gracia
    this._turnTimer = setTimeout(() => {
      console.log(`[GameState] Timeout de turno para ${this.currentPlayerId}`);
      if (this.phase === 'playing' && this._onTimeout) {
        this._onTimeout(this.gameId, this.currentPlayerId);
      }
    }, secs * 1000);
  }

  _clearTurnTimer() {
    if (this._turnTimer) {
      clearTimeout(this._turnTimer);
      this._turnTimer = null;
    }
  }

  // ─── Dados ────────────────────────────────────────────────────────────────

  rollDice() {
    const player = this.getPlayer(this.currentPlayerId);
    if (!player) return { error: 'Jugador no encontrado' };
    if (this.turnState.diceRolled) return { error: 'Ya tiraste el dado' };

    const d1    = Math.floor(Math.random() * 6) + 1;
    const d2    = Math.floor(Math.random() * 6) + 1;
    const total = d1 + d2;
    const isDouble = d1 === d2;

    this.turnState.diceRolled = true;
    this.turnState.diceResult = { d1, d2, total };

    // En mazmorra
    if (player.jailTurns > 0) {
      if (isDouble) {
        player.jailTurns = 0;
        this._pushEvent('jail_escape_double', { playerId: player.id });
        return this._movePlayer(player, total);
      } else {
        player.jailTurns--;
        this.turnState.actionPending = 'end_turn';
        return { diceResult: { d1, d2, total }, events: this._flushEvents(), gameState: this._getPublicState() };
      }
    }

    if (isDouble && !this.turnState.extraRoll) {
      this.turnState.extraRoll = true;
    }

    return this._movePlayer(player, total);
  }

  _movePlayer(player, steps) {
    const oldPos = player.position;
    let newPos   = (player.position + steps) % 44;
    if (newPos < oldPos || (oldPos === 0 && steps > 0)) {
      player.gold += 200;
      this._pushEvent('pass_start', { playerId: player.id, gold: 200 });
    }
    player.position = newPos;
    this._pushEvent('player_moved', { playerId: player.id, from: oldPos, to: newPos, steps });
    return this._resolveCellAction(player, newPos);
  }

  // ─── Resolución de casilla ────────────────────────────────────────────────

  _resolveCellAction(player, cellIndex) {
    const cell   = BOARD_DATA.cells[cellIndex];
    const result = { diceResult: this.turnState.diceResult, cellType: cell.type, cellIndex, events: [] };

    switch (cell.type) {
      case 'inicio':
        this.turnState.actionPending = 'end_turn';
        break;
      case 'aldea': case 'ciudad': case 'castillo':
      case 'recursos': case 'puerta': case 'puente':
      case 'barraca':  case 'granja': case 'molino':
        this._resolveProperty(player, cellIndex, result);
        break;
      case 'mazmorra':
        player.jailTurns = 3;
        this._pushEvent('sent_to_jail', { playerId: player.id });
        this.turnState.actionPending = 'end_turn';
        break;
      case 'duelo':
        this.turnState.actionPending = 'duel';
        this.turnState.actionData    = { challenger: player.id };
        break;
      case 'carta':
        this._resolveCard(player, result);
        break;
      case 'mini_evento':
        this._resolveMiniEvent(player, result);
        break;
      case 'evento_global':
        this._resolveGlobalEvent(player, result);
        break;
      case 'item':
        this._resolveItem(player, result);
        break;
      case 'bonus_oro':
        player.gold += 100;
        this._pushEvent('bonus_gold', { playerId: player.id, amount: 100 });
        this.turnState.actionPending = 'end_turn';
        break;
      default:
        this.turnState.actionPending = 'end_turn';
    }

    result.events     = this._flushEvents();
    result.gameState  = this._getPublicState();
    return result;
  }

  _resolveProperty(player, cellIndex, result) {
    const prop     = this.properties[cellIndex];
    const cellData = BOARD_DATA.cells[cellIndex];

    if (!prop) {
      result.canBuy   = true;
      result.buyPrice = cellData.buyPrice || 0;
      this.turnState.actionPending = 'buy';
      this.turnState.actionData    = { cellIndex };
    } else if (prop.ownerId === player.id) {
      result.ownedByYou  = true;
      result.canUpgrade  = this._canUpgrade(player.id, cellIndex);
      this.turnState.actionPending = 'end_turn';
    } else {
      const owner = this.getPlayer(prop.ownerId);
      if (owner && owner.active) {
        // Evitar pago con ítem
        if (player._avoidNextPayment) {
          player._avoidNextPayment = false;
          this._pushEvent('payment_avoided', { playerId: player.id });
        } else {
          const rent       = this._calculateRent(cellIndex, prop.level || 0);
          const multiplier = owner.bonusRentTurns > 0 ? 2 : 1;
          const actual     = Math.min(rent, player.gold);
          player.gold  -= actual;
          owner.gold   += actual * multiplier;
          result.rentPaid  = actual;
          result.rentOwner = prop.ownerId;
          this._pushEvent('rent_paid', { from: player.id, to: prop.ownerId, amount: actual, cellIndex });
          this._checkBankruptcy(player);
        }
      }
      this.turnState.actionPending = 'end_turn';
    }
  }

  buyProperty(playerId) {
    if (this.turnState.actionPending !== 'buy') return { error: 'No hay propiedad disponible' };
    const cellIndex = this.turnState.actionData.cellIndex;
    const player    = this.getPlayer(playerId);
    const cellData  = BOARD_DATA.cells[cellIndex];

    if (!player)               return { error: 'Jugador no encontrado' };
    if (this.properties[cellIndex]) return { error: 'Propiedad ya comprada' };
    if (player.gold < cellData.buyPrice) return { error: 'Oro insuficiente' };

    player.gold -= cellData.buyPrice;
    this.properties[cellIndex] = { ownerId: playerId, level: 0 };
    this._pushEvent('property_bought', { playerId, cellIndex, price: cellData.buyPrice });
    this.turnState.actionPending = 'end_turn';
    return { success: true, events: this._flushEvents(), gameState: this._getPublicState() };
  }

  upgradeProperty(playerId, cellIndex) {
    const player = this.getPlayer(playerId);
    const prop   = this.properties[cellIndex];
    if (!prop || prop.ownerId !== playerId) return { error: 'No eres el dueño' };
    if (!this._canUpgrade(playerId, cellIndex)) return { error: 'No puedes mejorar' };

    const cellData = BOARD_DATA.cells[cellIndex];
    const level    = prop.level || 0;
    if (!cellData.upgradeCosts || level >= cellData.upgradeCosts.length) return { error: 'Nivel máximo' };

    const cost = cellData.upgradeCosts[level];
    if (player.gold < cost) return { error: 'Oro insuficiente' };

    player.gold -= cost;
    prop.level   = level + 1;
    this._pushEvent('property_upgraded', { playerId, cellIndex, newLevel: prop.level, cost });
    return { success: true, events: this._flushEvents(), gameState: this._getPublicState() };
  }

  _canUpgrade(playerId, cellIndex) {
    const cell = BOARD_DATA.cells[cellIndex];
    if (!cell.groupId) return false;
    const upgradable = ['aldea','ciudad','castillo'];
    if (!upgradable.includes(cell.type)) return false;
    const group = BOARD_DATA.getGroup(cell.groupId);
    return group.every(idx => {
      const p = this.properties[idx];
      return p && p.ownerId === playerId;
    });
  }

  _calculateRent(cellIndex, level) {
    const cell = BOARD_DATA.cells[cellIndex];
    if (cell.rents && cell.rents[level] !== undefined) {
      // Para sets (puertas, puentes, etc.) la renta escala por cantidad poseída
      if (['puerta','puente','barraca','recursos'].includes(cell.type) && cell.groupId) {
        const group  = BOARD_DATA.getGroup(cell.groupId);
        const ownerId = this.properties[cellIndex]?.ownerId;
        const owned  = group.filter(i => this.properties[i]?.ownerId === ownerId).length;
        const idx    = Math.min(owned - 1, cell.rents.length - 1);
        return cell.rents[Math.max(0, idx)];
      }
      return cell.rents[level];
    }
    return 0;
  }

  // ─── Mazmorra ─────────────────────────────────────────────────────────────

  payJailFine(playerId) {
    const player = this.getPlayer(playerId);
    if (!player || player.jailTurns <= 0) return { error: 'No estás en la mazmorra' };
    const fine = Math.floor(player.gold * 0.2);
    if (player.gold < fine) return { error: 'Oro insuficiente' };
    player.gold    -= fine;
    player.jailTurns = 0;
    this._pushEvent('jail_fine_paid', { playerId, amount: fine });
    return { success: true, events: this._flushEvents(), gameState: this._getPublicState() };
  }

  // ─── Ítems ────────────────────────────────────────────────────────────────

  _resolveItem(player, result) {
    if (Math.random() >= 0.6 || player.items.length >= 3) {
      this._pushEvent('item_miss', { playerId: player.id });
      this.turnState.actionPending = 'end_turn';
      return;
    }
    const r = Math.random();
    let item;
    if      (r < 0.25) item = { type: 'escape_jail',    name: 'Fuga de Mazmorra' };
    else if (r < 0.45) item = { type: 'avoid_payment',  name: 'Escudo Dorado' };
    else if (r < 0.55) item = { type: 'teleport',       name: 'Portal Místico' };
    else if (r < 0.70) item = { type: 'random_upgrade', name: 'Mejora Rúnica' };
    else if (r < 0.75) item = { type: 'revive',         name: 'Elixir de Resurrección' };
    else               item = null;

    if (item) {
      item.id = Date.now().toString();
      player.items.push(item);
      this._pushEvent('item_obtained', { playerId: player.id, item });
    }
    this.turnState.actionPending = 'end_turn';
  }

  useItem(playerId, itemIndex) {
    const player = this.getPlayer(playerId);
    if (!player || itemIndex < 0 || itemIndex >= player.items.length) return { error: 'Ítem inválido' };
    const item = player.items.splice(itemIndex, 1)[0];

    switch (item.type) {
      case 'escape_jail':
        player.jailTurns = 0;
        break;
      case 'avoid_payment':
        player._avoidNextPayment = true;
        break;
      case 'teleport': {
        const newPos = Math.floor(Math.random() * 44);
        player.position = newPos;
        this._pushEvent('item_used', { playerId, item, effect: 'teleported', to: newPos });
        return this._resolveCellAction(player, newPos);
      }
      case 'random_upgrade': {
        const myProps = Object.entries(this.properties).filter(([,v]) => v.ownerId === playerId);
        if (myProps.length > 0) {
          const [idx] = myProps[Math.floor(Math.random() * myProps.length)];
          const cd = BOARD_DATA.cells[parseInt(idx)];
          const prop = this.properties[idx];
          if (cd.upgradeCosts && prop.level < cd.upgradeCosts.length) {
            prop.level++;
          }
        }
        break;
      }
      case 'revive':
        player.active = true;
        player.gold   = 200;
        break;
    }

    this._pushEvent('item_used', { playerId, item });
    return { success: true, events: this._flushEvents(), gameState: this._getPublicState() };
  }

  // ─── Cartas ───────────────────────────────────────────────────────────────

  _resolveCard(player, result) {
    const damaged = Math.random() >= 0.7;

    if (damaged) {
      const r = Math.random();
      if (r < 0.33) {
        const loss = Math.floor(100 + Math.random() * 200);
        player.gold = Math.max(0, player.gold - loss);
        this._pushEvent('card', { type: 'lose_gold', amount: loss, playerId: player.id });
      } else if (r < 0.66) {
        player.jailTurns = 3;
        this._pushEvent('card', { type: 'jail', playerId: player.id });
      } else {
        const myProps = Object.keys(this.properties).filter(i => this.properties[i].ownerId === player.id);
        if (myProps.length > 0) {
          const idx = myProps[Math.floor(Math.random() * myProps.length)];
          delete this.properties[idx];
          this._pushEvent('card', { type: 'lose_property', cellIndex: idx, playerId: player.id });
        } else {
          player.gold = Math.max(0, player.gold - 50);
          this._pushEvent('card', { type: 'lose_gold', amount: 50, playerId: player.id });
        }
      }
    } else {
      const r = Math.random();
      if (r < 0.30) {
        const gain = Math.floor(100 + Math.random() * 250);
        player.gold += gain;
        this._pushEvent('card', { type: 'gain_gold', amount: gain, playerId: player.id });
      } else if (r < 0.50) {
        const abandoned = Object.entries(this.properties)
          .filter(([,v]) => !this.getPlayer(v.ownerId)?.active)
          .map(([k]) => k);
        if (abandoned.length > 0) {
          const idx = abandoned[Math.floor(Math.random() * abandoned.length)];
          this.properties[idx] = { ownerId: player.id, level: 0 };
          this._pushEvent('card', { type: 'inherit_property', cellIndex: idx, playerId: player.id });
        } else {
          player.gold += 100;
          this._pushEvent('card', { type: 'gain_gold', amount: 100, playerId: player.id });
        }
      } else if (r < 0.70) {
        player.bonusRentTurns = 3;
        this._pushEvent('card', { type: 'double_rent', turns: 3, playerId: player.id });
      } else if (r < 0.85) {
        const newPos = Math.floor(Math.random() * 44);
        player.position = newPos;
        this._pushEvent('card', { type: 'advance', to: newPos, playerId: player.id });
      } else {
        player.position = 0;
        player.gold    += 200;
        this._pushEvent('card', { type: 'return_start', playerId: player.id });
      }
    }

    this._checkBankruptcy(player);
    this.turnState.actionPending = 'end_turn';
  }

  // ─── Eventos ──────────────────────────────────────────────────────────────

  _resolveMiniEvent(player, result) {
    const active = this.getActivePlayers();
    const r = Math.random();
    if (r < 0.20) {
      active.forEach(p => { p.gold += Math.floor(p.gold * 0.1); });
      this._pushEvent('mini_event', { type: 'all_gain_10pct' });
    } else if (r < 0.40) {
      active.forEach(p => { p.gold = Math.max(0, p.gold - Math.floor(p.gold * 0.1)); });
      this._pushEvent('mini_event', { type: 'all_lose_10pct' });
    } else if (r < 0.60) {
      player.gold += Math.floor(player.gold * 0.1);
      this._pushEvent('mini_event', { type: 'one_gain', playerId: player.id });
    } else if (r < 0.80) {
      player.gold = Math.max(0, player.gold - Math.floor(player.gold * 0.1));
      this._pushEvent('mini_event', { type: 'one_lose', playerId: player.id });
    } else {
      player.jailTurns = 3;
      this._pushEvent('mini_event', { type: 'jail', playerId: player.id });
    }
    active.forEach(p => this._checkBankruptcy(p));
    this.turnState.actionPending = 'end_turn';
  }

  _resolveGlobalEvent(player, result) {
    const active = this.getActivePlayers();
    if (Math.random() < 0.5) {
      active.forEach(p => {
        const myProps = Object.keys(this.properties).filter(i => this.properties[i].ownerId === p.id);
        if (myProps.length > 0) {
          const idx = myProps[Math.floor(Math.random() * myProps.length)];
          delete this.properties[idx];
          this._pushEvent('global_event_prop_lost', { playerId: p.id, cellIndex: idx });
        }
      });
      this._pushEvent('global_event', { type: 'all_lose_property' });
    } else {
      const target = active[Math.floor(Math.random() * active.length)];
      const myProps = Object.keys(this.properties).filter(i => this.properties[i].ownerId === target.id);
      if (myProps.length > 0) {
        const idx = myProps[Math.floor(Math.random() * myProps.length)];
        delete this.properties[idx];
        this._pushEvent('global_event', { type: 'one_lose_property', playerId: target.id, cellIndex: idx });
      }
    }
    this.turnState.actionPending = 'end_turn';
  }

  // ─── Duelos ───────────────────────────────────────────────────────────────

  resolveDuel(challengerId, targetId) {
    if (this.turnState.actionPending !== 'duel') {
      return { error: 'No hay duelo pendiente' };
    }
    const challenger = this.getPlayer(challengerId);
    const active     = this.getActivePlayers().filter(p => p.id !== challengerId);
    if (active.length === 0) {
      this.turnState.actionPending = 'end_turn';
      return { error: 'Sin rivales disponibles' };
    }
    const target = targetId
      ? this.getPlayer(targetId)
      : active[Math.floor(Math.random() * active.length)];

    if (!target || !target.active) {
      this.turnState.actionPending = 'end_turn';
      return { error: 'Rival no disponible' };
    }

    let cRoll, tRoll;
    do { cRoll = Math.floor(Math.random()*6)+1; tRoll = Math.floor(Math.random()*6)+1; }
    while (cRoll === tRoll);

    const [winner, loser] = cRoll > tRoll ? [challenger, target] : [target, challenger];
    const prize = Math.floor(loser.gold * 0.10);
    loser.gold  = Math.max(0, loser.gold - prize);
    winner.gold += prize;

    this._pushEvent('duel_resolved', { challengerId, targetId: target.id,
      challengerRoll: cRoll, targetRoll: tRoll, winnerId: winner.id, loserId: loser.id, prize });
    this._checkBankruptcy(loser);
    this.turnState.actionPending = 'end_turn';

    return { success: true, challengerRoll: cRoll, targetRoll: tRoll,
             winnerId: winner.id, prize, events: this._flushEvents(), gameState: this._getPublicState() };
  }

  // ─── Intercambio ──────────────────────────────────────────────────────────

  initiateTrade(fromId, toId, fromCellIdx, toCellIdx) {
    const fromProp = this.properties[fromCellIdx];
    const toProp   = this.properties[toCellIdx];
    if (!fromProp || fromProp.ownerId !== fromId) return { error: 'No tienes esa propiedad' };
    if (!toProp   || toProp.ownerId   !== toId)   return { error: 'El otro no tiene esa propiedad' };

    this.pendingTrade = { fromId, toId,
      fromCellIdx: parseInt(fromCellIdx), toCellIdx: parseInt(toCellIdx),
      expiresAt: Date.now() + 30000 };
    this._pushEvent('trade_proposed', { fromId, toId, fromCellIdx, toCellIdx });
    return { success: true, trade: this.pendingTrade, events: this._flushEvents() };
  }

  respondTrade(playerId, accepted) {
    if (!this.pendingTrade) return { error: 'Sin intercambio pendiente' };
    if (this.pendingTrade.toId !== playerId) return { error: 'No eres el destinatario' };
    if (Date.now() > this.pendingTrade.expiresAt) {
      this.pendingTrade = null;
      return { error: 'Intercambio expirado' };
    }
    if (!accepted) {
      this._pushEvent('trade_rejected', { ...this.pendingTrade });
      this.pendingTrade = null;
      return { success: true, accepted: false, events: this._flushEvents() };
    }
    const { fromId, toId, fromCellIdx, toCellIdx } = this.pendingTrade;
    this.properties[fromCellIdx] = { ownerId: toId,   level: 0 };
    this.properties[toCellIdx]   = { ownerId: fromId, level: 0 };
    this._pushEvent('trade_completed', { fromId, toId, fromCellIdx, toCellIdx });
    this.pendingTrade = null;
    return { success: true, accepted: true, events: this._flushEvents(), gameState: this._getPublicState() };
  }

  // ─── Fin de turno ─────────────────────────────────────────────────────────

  endTurn() {
    this._clearTurnTimer();
    const player = this.getPlayer(this.currentPlayerId);
    if (player && player.bonusRentTurns > 0) player.bonusRentTurns--;

    // Doble → tira de nuevo
    if (this.turnState.extraRoll) {
      this.turnState.extraRoll  = false;
      this.turnState.diceRolled = false;
      this.turnState.diceResult = null;
      this.turnState.actionPending = null;
      this._pushEvent('extra_roll', { playerId: this.currentPlayerId });
      this._startTurnTimer();
      return { extraRoll: true, events: this._flushEvents(), gameState: this._getPublicState() };
    }

    const gameOverResult = this._checkGameOver();
    if (gameOverResult) return gameOverResult;

    this._advanceTurn();
    this._startTurnTimer();

    return { turnEnded: true, nextPlayerId: this.currentPlayerId,
             events: this._flushEvents(), gameState: this._getPublicState() };
  }

  _advanceTurn() {
    const active = this.getActivePlayers();
    if (active.length === 0) return;
    this.turnCount++;
    let next = (this.currentPlayerIndex + 1) % this.players.length;
    let tries = 0;
    while (!this.players[next]?.active && tries < this.players.length) {
      next = (next + 1) % this.players.length;
      tries++;
    }
    this.currentPlayerIndex = next;
    this.currentPlayerId    = this.players[next].id;
    this._resetTurnState();
  }

  _resetTurnState() {
    this.turnState = { diceRolled: false, diceResult: null,
                       extraRoll: false, actionPending: null, actionData: null };
  }

  // ─── Bancarrota / Fin ─────────────────────────────────────────────────────

  _checkBankruptcy(player) {
    if (player.gold <= 0 && player.active) {
      player.active = false;
      player.gold   = 0;
      Object.keys(this.properties).forEach(idx => {
        if (this.properties[idx].ownerId === player.id) delete this.properties[idx];
      });
      this._pushEvent('bankruptcy', { playerId: player.id });
    }
  }

  _checkGameOver() {
    const active = this.getActivePlayers();
    if (this.config.mode === 'elimination' && active.length <= 1) return this._endGame();
    if (this.config.mode === 'turn_limit'  && this.turnCount >= this.config.turnLimit) return this._endGame();
    return null;
  }

  _endGame() {
    this._clearTurnTimer();
    this.phase = 'finished';
    const ranking = [...this.players]
      .sort((a,b) => b.gold - a.gold)
      .map((p,i) => ({ rank: i+1, playerId: p.id, name: p.name, gold: p.gold, active: p.active }));
    this._pushEvent('game_over', { ranking });
    return { gameOver: true, ranking, events: this._flushEvents(), gameState: this._getPublicState() };
  }

  // ─── IA de bots ──────────────────────────────────────────────────────────────

  // Ejecuta un turno completo del bot de forma autoritativa.
  // Retorna un array de resultados de acciones para que el caller los emita.
  playBotTurn(botId) {
    const bot = this.getPlayer(botId);
    if (!bot || !bot.isBot || !bot.active) return [];
    if (this.currentPlayerId !== botId) return [];

    const results = [];

    // 1. Tirar dado (usa la misma lógica que rollDice())
    const diceResult = this.rollDice();
    results.push({ type: 'dice_rolled', ...diceResult });

    // 2. Evaluar la casilla y tomar decisión
    const cellAction = this._botDecideAction(bot, diceResult);
    if (cellAction) results.push(cellAction);

    // 3. Si quedó en mazmorra y tiene ítem de escape, usarlo
    if (bot.jailTurns > 0) {
      const escapeIdx = bot.items.findIndex(i => i.type === 'escape_jail');
      if (escapeIdx >= 0) {
        const itemResult = this.useItem(botId, escapeIdx);
        if (!itemResult.error) results.push({ type: 'item_used', ...itemResult });
      }
    }

    // 4. Terminar turno
    // Si hubo extraRoll (doble), el bot tira de nuevo — se maneja en el callback
    if (!this.turnState.extraRoll) {
      const endResult = this.endTurn();
      results.push({ type: 'turn_ended', ...endResult });
    } else {
      // Doble: el callback _onBotTurn será llamado de nuevo por _startTurnTimer
      const endResult = this.endTurn(); // esto vacía el extraRoll y relanza el timer
      results.push({ type: 'turn_ended', ...endResult });
    }

    return results;
  }

  _botDecideAction(bot, diceResult) {
    // Si hubo error en el dado, no hacer nada
    if (diceResult.error) return null;

    const pending = this.turnState.actionPending;

    if (pending === 'buy') {
      // Comprar si tiene oro suficiente y la propiedad no es demasiado cara relativamente
      const cellIndex = this.turnState.actionData?.cellIndex;
      if (cellIndex !== undefined) {
        const cell = require('./BoardData').cells[cellIndex];
        const price = cell?.buyPrice || 0;
        // Bot compra si tiene al menos el doble del precio (estrategia conservadora)
        if (bot.gold >= price && bot.gold >= price * 1.5) {
          const buyResult = this.buyProperty(bot.id);
          if (!buyResult.error) return { type: 'property_bought', ...buyResult };
        }
        // Si no compra, termina turno (pasar)
        this.turnState.actionPending = 'end_turn';
      }
    } else if (pending === 'duel') {
      // Elegir rival aleatorio
      const rivals = this.getActivePlayers().filter(p => p.id !== bot.id);
      if (rivals.length > 0) {
        const target = rivals[Math.floor(Math.random() * rivals.length)];
        const duelResult = this.resolveDuel(bot.id, target.id);
        if (!duelResult.error) return { type: 'duel_resolved', ...duelResult };
      }
      this.turnState.actionPending = 'end_turn';
    } else if (pending === 'end_turn') {
      // Intentar mejorar propiedades antes de terminar
      const upgraded = this._botTryUpgrade(bot);
      if (upgraded) return { type: 'property_upgraded', ...upgraded };
    }

    return null;
  }

  _botTryUpgrade(bot) {
    // Intentar mejorar la propiedad más barata que pueda
    const myProps = Object.entries(this.properties)
      .filter(([, v]) => v.ownerId === bot.id);

    for (const [idxStr, prop] of myProps) {
      const idx = parseInt(idxStr);
      if (this._canUpgrade(bot.id, idx)) {
        const cell = require('./BoardData').cells[idx];
        if (!cell.upgradeCosts) continue;
        const level = prop.level || 0;
        const cost = cell.upgradeCosts[level];
        if (cost && bot.gold >= cost * 1.5) {
          const result = this.upgradeProperty(bot.id, idx);
          if (!result.error) return result;
        }
      }
    }
    return null;
  }

  // ─── Estado público ───────────────────────────────────────────────────────

  _getPublicState() {
    return {
      gameId:          this.gameId,
      phase:           this.phase,
      config:          this.config,
      host:            { id: this.host.id, name: this.host.name },
      players:         this.players.map(p => ({
        id:              p.id,
        name:            p.name,
        color:           p.color,
        gold:            p.gold,
        position:        p.position,
        jailTurns:       p.jailTurns,
        items:           p.items,
        active:          p.active,
        ready:           p.ready,
        bonusRentTurns:  p.bonusRentTurns,
        disconnected:    p.disconnected,
        isBot:           p.isBot || false,
      })),
      properties:      this.properties,
      currentPlayerId: this.currentPlayerId,
      turnCount:       this.turnCount,
      turnState:       this.turnState,
      pendingTrade:    this.pendingTrade,
    };
  }

  getPublicState() { return this._getPublicState(); }

  // ─── Eventos internos ─────────────────────────────────────────────────────

  _pushEvent(type, data) { this.events.push({ type, data, ts: Date.now() }); }
  _flushEvents()          { const e = [...this.events]; this.events = []; return e; }
}

module.exports = GameState;
