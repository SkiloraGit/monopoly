/**
 * BoardData - Definición de las 44 casillas del tablero medieval
 */

const cells = [
  // 0: inicio
  { index: 0, name: 'Inicio', type: 'inicio' },
  // 1: aldea (grupo aldeas_1)
  { index: 1, name: 'Aldea del Valle', type: 'aldea', groupId: 'aldeas_1', buyPrice: 100,
    rents: [35, 60, 95, 150, 220], upgradeCosts: [70, 110, 160, 220] },
  // 2: puerto pesquero (recursos)
  { index: 2, name: 'Puerto Pesquero', type: 'recursos', groupId: 'recursos', buyPrice: 50,
    rents: [50, 120, 250] },
  // 3: aldea (aldeas_1)
  { index: 3, name: 'Aldea de la Colina', type: 'aldea', groupId: 'aldeas_1', buyPrice: 100,
    rents: [35, 60, 95, 150, 220], upgradeCosts: [70, 110, 160, 220] },
  // 4: ítem
  { index: 4, name: 'Tienda de Ítems', type: 'item' },
  // 5: puerta
  { index: 5, name: 'Puerta Norte', type: 'puerta', groupId: 'puertas', buyPrice: 60,
    rents: [60, 140, 260, 420] },
  // 6: mini evento
  { index: 6, name: 'Cruce de Caminos', type: 'mini_evento' },
  // 7: aldea (aldeas_1)
  { index: 7, name: 'Aldea del Río', type: 'aldea', groupId: 'aldeas_1', buyPrice: 100,
    rents: [35, 60, 95, 150, 220], upgradeCosts: [70, 110, 160, 220] },
  // 8: carta
  { index: 8, name: 'Pergamino del Destino', type: 'carta' },
  // 9: mazmorra
  { index: 9, name: 'Mazmorra del Rey', type: 'mazmorra' },
  // 10: aldea (aldeas_2)
  { index: 10, name: 'Aldea del Bosque', type: 'aldea', groupId: 'aldeas_2', buyPrice: 130,
    rents: [45, 80, 130, 200, 300], upgradeCosts: [90, 130, 200, 280] },
  // 11: puente
  { index: 11, name: 'Puente de Piedra', type: 'puente', groupId: 'puentes', buyPrice: 70,
    rents: [70, 160, 320] },
  // 12: aldea (aldeas_2)
  { index: 12, name: 'Aldea de las Montañas', type: 'aldea', groupId: 'aldeas_2', buyPrice: 130,
    rents: [45, 80, 130, 200, 300], upgradeCosts: [90, 130, 200, 280] },
  // 13: duelo
  { index: 13, name: 'Arena de Duelos', type: 'duelo' },
  // 14: granja (recursos)
  { index: 14, name: 'Granja Real', type: 'recursos', groupId: 'recursos', buyPrice: 50,
    rents: [50, 120, 250] },
  // 15: carta
  { index: 15, name: 'Carta del Oráculo', type: 'carta' },
  // 16: aldea (aldeas_2)
  { index: 16, name: 'Aldea del Lago', type: 'aldea', groupId: 'aldeas_2', buyPrice: 130,
    rents: [45, 80, 130, 200, 300], upgradeCosts: [90, 130, 200, 280] },
  // 17: mini evento
  { index: 17, name: 'Feria Medieval', type: 'mini_evento' },
  // 18: puerta
  { index: 18, name: 'Puerta del Este', type: 'puerta', groupId: 'puertas', buyPrice: 60,
    rents: [60, 140, 260, 420] },
  // 19: bonus oro
  { index: 19, name: 'Tesoro Escondido', type: 'bonus_oro' },
  // 20: barraca
  { index: 20, name: 'Cuartel Norte', type: 'barraca', groupId: 'barracas', buyPrice: 90,
    rents: [90, 260] },
  // 21: carta
  { index: 21, name: 'Carta del Mago', type: 'carta' },
  // 22: puente
  { index: 22, name: 'Puente del Dragón', type: 'puente', groupId: 'puentes', buyPrice: 70,
    rents: [70, 160, 320] },
  // 23: ítem
  { index: 23, name: 'Artefacto Mágico', type: 'item' },
  // 24: ciudad
  { index: 24, name: 'Ciudad del Comercio', type: 'ciudad', groupId: 'ciudades', buyPrice: 260,
    rents: [90, 160, 260, 400, 600], upgradeCosts: [120, 180, 260, 360] },
  // 25: evento global
  { index: 25, name: 'Consejo del Reino', type: 'evento_global' },
  // 26: ciudad
  { index: 26, name: 'Ciudad de la Forja', type: 'ciudad', groupId: 'ciudades', buyPrice: 260,
    rents: [90, 160, 260, 400, 600], upgradeCosts: [120, 180, 260, 360] },
  // 27: mini evento
  { index: 27, name: 'Mercado Nocturno', type: 'mini_evento' },
  // 28: puerta
  { index: 28, name: 'Puerta del Sur', type: 'puerta', groupId: 'puertas', buyPrice: 60,
    rents: [60, 140, 260, 420] },
  // 29: mazmorra
  { index: 29, name: 'Torre Oscura', type: 'mazmorra' },
  // 30: ciudad
  { index: 30, name: 'Ciudad de las Artes', type: 'ciudad', groupId: 'ciudades', buyPrice: 260,
    rents: [90, 160, 260, 400, 600], upgradeCosts: [120, 180, 260, 360] },
  // 31: ítem
  { index: 31, name: 'Reliquia Antigua', type: 'item' },
  // 32: barraca
  { index: 32, name: 'Cuartel Sur', type: 'barraca', groupId: 'barracas', buyPrice: 90,
    rents: [90, 260] },
  // 33: puente
  { index: 33, name: 'Puente Real', type: 'puente', groupId: 'puentes', buyPrice: 70,
    rents: [70, 160, 320] },
  // 34: duelo
  { index: 34, name: 'Campo de Honor', type: 'duelo' },
  // 35: carta
  { index: 35, name: 'Carta del Rey', type: 'carta' },
  // 36: molino (recursos)
  { index: 36, name: 'Molino del Viento', type: 'recursos', groupId: 'recursos', buyPrice: 50,
    rents: [50, 120, 250] },
  // 37: castillo
  { index: 37, name: 'Castillo del Norte', type: 'castillo', groupId: 'castillos', buyPrice: 400,
    rents: [150, 300, 500, 800, 1200], upgradeCosts: [200, 300, 450, 650] },
  // 38: mazmorra
  { index: 38, name: 'Calabozos del Castillo', type: 'mazmorra' },
  // 39: puerta
  { index: 39, name: 'Puerta del Oeste', type: 'puerta', groupId: 'puertas', buyPrice: 60,
    rents: [60, 140, 260, 420] },
  // 40: mini evento
  { index: 40, name: 'Eclipse Lunar', type: 'mini_evento' },
  // 41: castillo
  { index: 41, name: 'Castillo de la Luna', type: 'castillo', groupId: 'castillos', buyPrice: 400,
    rents: [150, 300, 500, 800, 1200], upgradeCosts: [200, 300, 450, 650] },
  // 42: bonus oro
  { index: 42, name: 'Cámara del Tesoro', type: 'bonus_oro' },
  // 43: castillo
  { index: 43, name: 'Castillo del Rey', type: 'castillo', groupId: 'castillos', buyPrice: 400,
    rents: [150, 300, 500, 800, 1200], upgradeCosts: [200, 300, 450, 650] },
];

const groups = {
  aldeas_1: [1, 3, 7],
  aldeas_2: [10, 12, 16],
  recursos: [2, 14, 36],
  puertas: [5, 18, 28, 39],
  puentes: [11, 22, 33],
  barracas: [20, 32],
  ciudades: [24, 26, 30],
  castillos: [37, 41, 43],
};

function getGroup(groupId) {
  return groups[groupId] || [];
}

module.exports = { cells, groups, getGroup };
