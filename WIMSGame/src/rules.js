export const ROUND_SECONDS = 100;
export const HIT_COST = 8;
export const WORLD_LIMIT = 40;
export const HOUSE_COLORS = ['#edb875', '#b4c6a5', '#df9d85', '#87b8c1'];
export const DOORS = [
  { color: '#db6038', name: 'orange' },
  { color: '#32777c', name: 'teal' },
  { color: '#7470a4', name: 'purple' },
  { color: '#b7474c', name: 'red' },
];
export const PROPS = ['pink flamingo', 'blue mailbox', 'sunflower pot', 'striped deck chair'];
export const STREETS = ['Pickle Lane', 'Mayo Avenue', 'Mustard Street', 'Crumb Court'];

export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNeighborhood(seed) {
  const rand = random(seed);
  const houses = [];
  for (let block = 0; block < 4; block++) {
    const cx = block % 2 ? 18 : -18;
    const cz = block < 2 ? -18 : 18;
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 2; column++) {
        const id = houses.length;
        houses.push({
          id, x: cx + (column ? 8 : -8), z: cz + (row ? 8 : -8),
          number: 101 + block * 10 + row * 2 + column,
          street: STREETS[block],
          wall: HOUSE_COLORS[Math.floor(rand() * HOUSE_COLORS.length)],
          door: DOORS[Math.floor(rand() * DOORS.length)],
          prop: (row * 2 + column + block) % PROPS.length,
          block,
        });
      }
    }
  }
  // The destination is always across at least one road from your own porch.
  const target = 4 + Math.floor(rand() * 12);
  return { houses, target, seed };
}

export function canMove(x, z, houses, radius = 0.48) {
  if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return false;
  return !houses.some(h => Math.abs(x - h.x) < 4.25 + radius && Math.abs(z - h.z) < 3.25 + radius);
}

// Camera-relative screen directions, independent of input device.
export function screenDirection(x, y) {
  const size = Math.hypot(x, y);
  if (size < 0.08) return { x: 0, z: 0 };
  const magnitude = Math.min(1, size);
  return { x: ((x + y) / size) * Math.SQRT1_2 * magnitude, z: ((y - x) / size) * Math.SQRT1_2 * magnitude };
}

export function scoreFor(hunger, hits, checked) {
  return Math.max(0, Math.round(hunger * 100) + Math.max(0, 500 - hits * 100) + Math.max(0, 200 - checked * 20));
}

export function nearestPorch(x, z, houses) {
  let closest = null;
  let distance = 2.7;
  for (const house of houses) {
    const d = Math.hypot(x - house.x, z - (house.z + 4.7));
    if (d < distance) { distance = d; closest = house; }
  }
  return closest;
}

export function safeName(name) {
  return String(name ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} ._!'-]/gu, '').trim().slice(0, 18) || 'Hungry human';
}

// Validates a submitted round ({ player_name, time_ms, hunger_ms, incidents, checked }).
// wallSeconds is the real time since the round's ticket was issued. Returns the row to
// store, with points recomputed (never trusted from the client), or null if impossible.
export function checkResult(data, wallSeconds) {
  const { time_ms, hunger_ms, incidents, checked } = data ?? {};
  if (![time_ms, hunger_ms, incidents, checked].every(Number.isInteger)) return null;
  const elapsed = time_ms / 1000, hunger = hunger_ms / 1000;
  if (elapsed < 3 || elapsed > ROUND_SECONDS + 0.5 || elapsed > wallSeconds + 2) return null;
  if (hunger <= 0 || hunger > ROUND_SECONDS - elapsed - incidents * HIT_COST + 0.1) return null;
  if (incidents < 0 || incidents > Math.ceil(ROUND_SECONDS / HIT_COST) || checked < 1 || checked > 16) return null;
  return { player_name: safeName(data.player_name), points: scoreFor(hunger, incidents, checked), time_ms, incidents };
}
