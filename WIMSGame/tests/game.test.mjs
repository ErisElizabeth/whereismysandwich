import test from 'node:test';
import assert from 'node:assert/strict';
import { makeNeighborhood, canMove, screenDirection, nearestPorch, scoreFor, safeName } from '../src/rules.js';

test('Every generated destination is away from the starting block and has a reachable porch', () => {
  for (let seed = 0; seed < 500; seed++) {
    const n = makeNeighborhood(seed);
    assert.deepEqual(n, makeNeighborhood(seed));
    assert.equal(n.houses.length, 16);
    assert.ok(n.target >= 4 && n.target <= 15);
    for (const h of n.houses) {
      assert.ok(canMove(h.x, h.z + 4.7, n.houses));
      assert.equal(nearestPorch(h.x, h.z + 4.7, n.houses).id, h.id);
      assert.equal(canMove(h.x, h.z, n.houses), false);
    }
  }
});

test('All candidate porches are reachable from the spawn using the actual collision rules', () => {
  const { houses } = makeNeighborhood(1729);
  const queue = [[-26, -20]]; const seen = new Set(['-26,-20']);
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, key = `${nx},${nz}`;
      if (!seen.has(key) && canMove(nx, nz, houses)) { seen.add(key); queue.push([nx, nz]); }
    }
  }
  houses.forEach(h => assert.ok(seen.has(`${h.x},${h.z + 5}`), `Porch ${h.number} is unreachable`));
});

test('Screen movement is normalized and handles joystick deadzone', () => {
  assert.deepEqual(screenDirection(0.01, 0.01), { x: 0, z: 0 });
  for (const [x, y] of [[1, 0], [1, 1], [-1, -1]]) {
    const d = screenDirection(x, y); assert.ok(Math.abs(Math.hypot(d.x, d.z) - 1) < 0.00001);
  }
  const right = screenDirection(1, 0); assert.ok(right.x > 0 && right.z < 0);
  const up = screenDirection(0, -1); assert.ok(up.x < 0 && up.z < 0);
  assert.equal(canMove(41, 0, []), false);
});

test('Score rewards remaining hunger and cleaner hunts; names are bounded text', () => {
  assert.ok(scoreFor(80, 0, 1) > scoreFor(70, 0, 1));
  assert.ok(scoreFor(80, 0, 1) > scoreFor(80, 1, 2));
  assert.equal(scoreFor(0, 20, 20), 0);
  assert.equal(safeName(''), 'Hungry human');
  assert.equal(safeName('<script>hi</script>').includes('<'), false);
  assert.ok(safeName('x'.repeat(50)).length <= 18);
});
