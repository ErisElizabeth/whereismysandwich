import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD_LIMIT } from './rules.js';

const palette = {
  ink: '#30382d', lawn: '#a4bd7a', grass: '#91ae68', pavement: '#dfd6b9',
  road: '#777d76', cream: '#fff6dc', roof: '#626d58', bread: '#e6a647',
};

export class World {
  constructor(canvas, neighborhood) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#d8e4bf');
    this.scene.fog = new THREE.Fog('#d8e4bf', 72, 140);
    this.camera = new THREE.OrthographicCamera(-25, 25, 20, -20, 0.1, 180);
    this.photoCamera = new THREE.PerspectiveCamera(44, 1.35, 0.1, 100);
    this.materials = new Map();
    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.sphereGeometry = new THREE.IcosahedronGeometry(1, 1);
    this.static = new THREE.Group();
    this.scene.add(this.static);
    this.scene.add(new THREE.HemisphereLight('#fff9de', '#93a581', 2.6));
    const sun = new THREE.DirectionalLight('#fff2d3', 3.1);
    sun.position.set(-22, 42, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, far: 120 });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.buildGround();
    neighborhood.houses.forEach(h => this.house(h));
    this.mergeStatic();
    this.player = this.human('#f3ba42', true);
    this.scene.add(this.player);
    this.marker = this.makeMarker();
    this.scene.add(this.marker);
    this.bags = neighborhood.houses.map(h => {
      const group = this.bag();
      group.position.set(h.x + 1.3, 0.45, h.z + 4.25);
      this.scene.add(group); return group;
    });
    this.cars = Array.from({ length: 6 }, (_, i) => {
      const car = this.car(['#e9aa5f', '#89b6b3', '#d17659', '#c4bc9c'][i % 4]);
      this.scene.add(car);
      return { mesh: car, axis: i < 3 ? 'x' : 'z', lane: i % 2 ? -1.9 : 1.9, dir: i % 2 ? 1 : -1, at: -34 + (i % 3) * 26, speed: 7.2 + i * 0.55 };
    });
    this.dogs = [0, 5, 10, 15].map((id, i) => {
      const h = neighborhood.houses[id];
      const mesh = this.dog(i % 2 ? '#a9673e' : '#805c41');
      const home = { x: h.x - 5.7, z: h.z + 6.8 };
      mesh.position.set(home.x, 0, home.z);
      this.scene.add(mesh);
      return { mesh, home, phase: i * 1.7, chasing: false };
    });
    this.owners = [];
    this.photo = '';
    this.follow = new THREE.Vector3(-5, 0, 5);
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.resize();
    this.takePhoto(neighborhood.houses[neighborhood.target]);
  }

  material(color, emissive = false) {
    const key = color + emissive;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshLambertMaterial({ color, ...(emissive ? { emissive: color, emissiveIntensity: 0.45 } : {}) }));
    return this.materials.get(key);
  }

  box(parent, x, y, z, w, h, d, color, shadow = true) {
    const mesh = new THREE.Mesh(this.boxGeometry, this.material(color));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  sphere(parent, x, y, z, r, color, scale = [1, 1, 1]) {
    const mesh = new THREE.Mesh(this.sphereGeometry, this.material(color));
    mesh.position.set(x, y, z); mesh.scale.set(r * scale[0], r * scale[1], r * scale[2]);
    mesh.castShadow = true; parent.add(mesh); return mesh;
  }

  text(parent, text, x, y, z, width, bg = palette.cream, fg = palette.ink, flat = false) {
    const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 384, 128);
    ctx.fillStyle = fg; ctx.font = '900 66px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 192, 66, 368);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 3), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z);
    if (flat) mesh.rotation.x = -Math.PI / 2;
    parent.add(mesh); return mesh;
  }

  buildGround() {
    this.box(this.static, 0, -0.35, 0, 91, 0.6, 91, palette.grass);
    for (const pos of [-36, 0, 36]) {
      this.box(this.static, pos, 0, 0, 8, 0.08, 80, palette.road, false);
      this.box(this.static, 0, 0.01, pos, 80, 0.08, 8, palette.road, false);
      for (const side of [-1, 1]) {
        this.box(this.static, pos + side * 5, 0.13, 0, 1.8, 0.3, 80, palette.pavement);
        this.box(this.static, 0, 0.13, pos + side * 5, 80, 0.3, 1.8, palette.pavement);
      }
      for (let dash = -39; dash < 40; dash += 6) {
        if ([-36, 0, 36].some(p => Math.abs(dash - p) < 5)) continue;
        this.box(this.static, pos, 0.065, dash, 0.12, 0.025, 2.5, '#dfd9b3', false);
        this.box(this.static, dash, 0.075, pos, 2.5, 0.025, 0.12, '#dfd9b3', false);
      }
    }
    for (const cx of [-18, 18]) for (const cz of [-18, 18]) {
      this.box(this.static, cx, 0.025, cz, 24, 0.12, 24, palette.lawn, false);
      this.box(this.static, cx, 0.13, cz, 1.5, 0.14, 24, palette.pavement);
      this.box(this.static, cx, 0.13, cz + 2.5, 24, 0.14, 1.3, palette.pavement);
    }
    // Zebra crossings give each dangerous intersection a readable approach.
    for (const axis of [0, 1]) for (const side of [-1, 1]) for (let stripe = -3; stripe <= 3; stripe++) {
      this.box(this.static, axis ? side * 6.8 : stripe, 0.08, axis ? stripe : side * 6.8, axis ? 2 : 0.55, 0.02, axis ? 0.55 : 2, '#f7efd2', false);
    }
    for (let i = 0; i < 22; i++) {
      const x = i < 12 ? (i % 2 ? -43 : 43) : (i % 2 ? -18 : 18);
      const z = i < 12 ? -36 + Math.floor(i / 2) * 14 : -33 + (i - 12) * 7;
      this.tree(x, z, 0.8 + (i % 3) * 0.15);
    }
    for (const [x, z, name] of [[-5, -5, 'PICKLE LN'], [5, 5, 'MUSTARD ST'], [31, -5, 'MAYO AVE'], [-31, 5, 'CRUMB CT']]) {
      this.box(this.static, x, 1.7, z, 0.14, 3.4, 0.14, palette.ink);
      this.text(this.static, name, x, 3.15, z + 0.1, 4, '#42634c', '#fff9e4');
    }
  }

  tree(x, z, scale) {
    this.box(this.static, x, 1.1 * scale, z, 0.45, 2.2 * scale, 0.45, '#83684b');
    this.sphere(this.static, x, 3.1 * scale, z, 1.9 * scale, '#6e965e', [1, 1.15, 1]);
    this.sphere(this.static, x + 0.7, 2.9 * scale, z + 0.4, 1.25 * scale, '#84a666');
  }

  house(h) {
    const g = new THREE.Group(); g.position.set(h.x, 0, h.z); this.static.add(g);
    this.box(g, 0, 0.35, 0, 8.5, 0.5, 6.5, '#beb7a0');
    this.box(g, 0, 2.5, 0, 8, 4.5, 6, h.wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.3, 2.5, 4), this.material(palette.roof));
    roof.rotation.y = Math.PI / 4; roof.scale.z = 0.83; roof.position.y = 5.65; roof.castShadow = true; g.add(roof);
    this.box(g, 0, 1.7, 3.08, 1.65, 2.9, 0.22, h.door.color);
    this.sphere(g, 0.55, 1.65, 3.24, 0.09, '#f8d181');
    for (const x of [-2.65, 2.65]) {
      this.box(g, x, 2.35, 3.05, 1.85, 1.95, 0.12, palette.cream);
      this.box(g, x, 2.35, 3.14, 1.55, 1.65, 0.08, '#70a5ab');
      this.box(g, x, 2.35, 3.2, 0.08, 1.65, 0.04, palette.cream);
      this.box(g, x, 2.35, 3.2, 1.55, 0.08, 0.04, palette.cream);
    }
    this.box(g, 0, 0.2, 4, 4.2, 0.3, 2, palette.pavement);
    this.box(g, 0, 0.12, 6.1, 1.6, 0.08, 3.1, palette.pavement, false);
    this.text(g, String(h.number), 0, 3.55, 3.16, 1.35, palette.cream);
    this.box(g, -3.7, 5.9, -0.8, 0.8, 2, 0.8, '#b77c60');
    this.prop(g, h.prop);
    // Short hedge sections leave all porches accessible.
    this.box(g, -3.6, 0.55, 6.8, 2.3, 0.9, 0.65, '#6e965e');
    this.box(g, 3.6, 0.55, 6.8, 2.3, 0.9, 0.65, '#6e965e');
  }

  prop(g, type) {
    if (type === 0) {
      this.sphere(g, 3.3, 1.3, 4.7, 0.55, '#ee82a0', [1, 0.65, 0.6]);
      this.box(g, 3.25, 0.55, 4.7, 0.08, 1.2, 0.08, '#e37691');
      this.box(g, 3.65, 1.7, 4.7, 0.12, 1.1, 0.12, '#ee82a0');
      this.sphere(g, 3.63, 2.2, 4.7, 0.24, '#ee82a0');
      this.box(g, 3.65, 2.13, 4.93, 0.14, 0.15, 0.35, '#30382d');
    } else if (type === 1) {
      this.box(g, 3.3, 0.65, 4.7, 0.16, 1.3, 0.16, '#ede2c6');
      this.box(g, 3.3, 1.4, 4.7, 0.85, 0.65, 1.1, '#428fb1');
      this.box(g, 3.77, 1.7, 4.7, 0.08, 0.55, 0.35, '#d56642');
    } else if (type === 2) {
      this.box(g, 3.3, 0.35, 4.7, 0.9, 0.6, 0.9, '#bb7251');
      this.box(g, 3.3, 1.25, 4.7, 0.07, 1.5, 0.07, '#589353');
      this.sphere(g, 3.3, 2, 4.7, 0.49, '#f8cd53', [1, 1, 0.28]);
      this.sphere(g, 3.3, 2, 4.83, 0.24, '#795443', [1, 1, 0.3]);
    } else {
      const back = this.box(g, 3.4, 1.1, 4.5, 1.1, 1.6, 0.16, '#faf0d4'); back.rotation.x = -0.3;
      this.box(g, 3.4, 0.55, 4.9, 1.1, 0.15, 1, '#d57659');
      for (const x of [3, 3.8]) this.box(g, x, 0.35, 4.9, 0.09, 0.7, 0.7, '#faf0d4');
      this.box(g, 3.4, 1.15, 4.64, 0.25, 1.4, 0.04, '#d57659');
    }
  }

  mergeStatic() {
    this.static.updateMatrixWorld(true);
    const batches = new Map();
    const keep = [];
    this.static.traverse(object => {
      if (!object.isMesh) return;
      if (object.material.map) { keep.push(object); return; }
      if (!batches.has(object.material)) batches.set(object.material, []);
      const source = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      batches.get(object.material).push(source.applyMatrix4(object.matrixWorld));
    });
    for (const object of keep) this.scene.attach(object);
    this.scene.remove(this.static);
    for (const [material, geometries] of batches) {
      const geometry = mergeGeometries(geometries, false);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh);
      geometries.forEach(g => g.dispose());
    }
  }

  human(color, player = false) {
    const g = new THREE.Group();
    const body = this.box(g, 0, 1.2, 0, 0.66, 0.75, 0.45, color);
    this.sphere(g, 0, 1.9, 0, 0.35, '#edbf91');
    this.sphere(g, 0, 2.09, -0.03, 0.36, '#4b4034', [1, 0.55, 1]);
    for (const x of [-0.12, 0.12]) this.sphere(g, x, 1.94, 0.3, 0.045, palette.ink);
    g.userData.legs = [-0.2, 0.2].map(x => this.box(g, x, 0.43, 0, 0.24, 0.75, 0.3, '#3a5858'));
    g.userData.arms = [-0.45, 0.45].map(x => this.box(g, x, 1.15, 0, 0.2, 0.7, 0.24, color));
    if (player) {
      this.box(g, 0, 1.3, -0.32, 0.48, 0.55, 0.2, '#df754a');
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 24), new THREE.MeshBasicMaterial({ color: '#fff4ae', side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.19; g.add(ring);
    }
    body.userData.character = true;
    return g;
  }

  dog(color) {
    const g = new THREE.Group();
    this.box(g, 0, 0.5, 0, 0.45, 0.45, 1, color);
    this.box(g, 0, 0.77, 0.56, 0.52, 0.52, 0.48, color);
    this.box(g, 0, 0.7, 0.85, 0.3, 0.2, 0.25, '#342e27');
    for (const x of [-0.3, 0.3]) this.box(g, x, 0.7, 0.54, 0.15, 0.52, 0.32, '#4e3c2c');
    for (const x of [-0.16, 0.16]) for (const z of [-0.35, 0.35]) this.box(g, x, 0.17, z, 0.12, 0.35, 0.15, color);
    const tail = this.box(g, 0, 0.68, -0.65, 0.13, 0.65, 0.13, color); tail.rotation.x = -0.7;
    return g;
  }

  car(color) {
    const g = new THREE.Group();
    this.box(g, 0, 0.7, 0, 1.65, 0.72, 3.4, color);
    this.box(g, 0, 1.32, -0.1, 1.45, 0.65, 1.8, '#435555');
    this.box(g, 0, 1.7, -0.1, 1.6, 0.15, 1.85, color);
    for (const x of [-0.88, 0.88]) for (const z of [-1.05, 1.05]) this.box(g, x, 0.35, z, 0.22, 0.6, 0.6, '#30382d');
    for (const x of [-0.55, 0.55]) this.box(g, x, 0.75, 1.73, 0.35, 0.25, 0.05, '#fff4b3');
    const sign = this.box(g, 0, 2.02, -0.15, 1.3, 0.5, 0.35, '#d9f28b');
    sign.material = this.material('#d9f28b', true);
    this.text(g, 'SUPER', 0, 2.03, 0.035, 1.2, '#d9f28b', '#25352c');
    this.text(g, 'SUPER', 0, 2.03, -0.335, 1.2, '#d9f28b', '#25352c');
    return g;
  }

  bag() {
    const g = new THREE.Group();
    this.box(g, 0, 0.23, 0, 0.62, 0.65, 0.45, '#c8995b');
    this.box(g, 0, 0.58, 0, 0.68, 0.12, 0.48, '#b3854d');
    this.text(g, 'SF', 0, 0.25, 0.235, 0.48, '#c8995b', '#42634c');
    return g;
  }

  makeMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 32), new THREE.MeshBasicMaterial({ color: '#fbe897', side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2; g.add(ring); g.position.y = 0.2; g.visible = false; return g;
  }

  addOwner(h) {
    const existing = this.owners.find(o => o.id === h.id);
    if (existing) { existing.ttl = 8; return; }
    const mesh = this.human('#d36f56'); mesh.position.set(h.x - 1, 0, h.z + 4.5);
    const label = this.text(mesh, 'MY LAWN!', 0, 2.9, 0, 3.1, '#fff2ce', '#b6432c');
    this.scene.add(mesh);
    this.owners.push({ mesh, label, id: h.id, ttl: 8 });
  }

  takePhoto(house) {
    this.bags.forEach((bag, id) => { bag.visible = id === house.id; });
    this.player.visible = false;
    this.photoCamera.position.set(house.x + 2.8, 4.6, house.z + 14);
    this.photoCamera.lookAt(house.x, 2, house.z + 2.5);
    const old = new THREE.Vector2(); this.renderer.getSize(old);
    this.renderer.setSize(540, 400, false);
    this.renderer.render(this.scene, this.photoCamera);
    this.photo = this.canvas.toDataURL('image/jpeg', 0.88);
    this.renderer.setSize(old.x, old.y, false);
    this.player.visible = true;
    this.bags.forEach(bag => { bag.visible = true; });
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const size = width < 700 ? 15 : 20;
    Object.assign(this.camera, { left: -size * aspect, right: size * aspect, top: size, bottom: -size });
    this.camera.updateProjectionMatrix();
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const point = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, point);
  }

  render(state, time, dt) {
    const { player, playing, mode } = state;
    this.player.position.set(player.x, 0.2, player.z);
    if (player.moving) this.player.rotation.y = player.angle;
    const swing = player.moving ? Math.sin(time * 13) * 0.5 : 0;
    this.player.userData.legs.forEach((leg, i) => { leg.rotation.x = swing * (i ? 1 : -1); });
    this.player.userData.arms.forEach((arm, i) => { arm.rotation.x = swing * (i ? -1 : 1); });
    this.player.visible = !state.invincible || Math.sin(time * 23) > -0.35;
    const intro = mode === 'intro';
    const desired = new THREE.Vector3(intro ? 1 : player.x, 0, intro ? 4 : player.z);
    this.follow.lerp(desired, 1 - Math.exp(-dt * (intro ? 1.5 : 7)));
    this.camera.position.copy(this.follow).add(new THREE.Vector3(26, 35, 26));
    this.camera.lookAt(this.follow);
    this.marker.visible = playing && !!state.nearby;
    if (state.nearby) this.marker.position.set(state.nearby.x, 0.25, state.nearby.z + 4.7);
    this.marker.rotation.y = time * 0.3;
    this.cars.forEach(car => {
      car.mesh.position.set(car.axis === 'x' ? car.at : car.lane, 0.2, car.axis === 'z' ? car.at : car.lane);
      car.mesh.rotation.y = car.axis === 'x' ? car.dir * Math.PI / 2 : car.dir < 0 ? Math.PI : 0;
    });
    this.owners.forEach(owner => {
      owner.label.quaternion.copy(this.camera.quaternion).multiply(owner.mesh.quaternion.clone().invert());
      const walking = playing;
      owner.mesh.userData.legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(time * 11) * 0.4 * (i ? 1 : -1) : 0; });
    });
    this.renderer.render(this.scene, this.camera);
  }

  reset() {
    this.owners.forEach(o => this.scene.remove(o.mesh)); this.owners = [];
    this.bags.forEach(b => { b.visible = true; });
    this.dogs.forEach(d => { d.mesh.position.set(d.home.x, 0, d.home.z); d.chasing = false; });
    this.cars.forEach((c, i) => { c.at = -34 + (i % 3) * 26; });
  }
}

export function drawMap(canvas, state, neighborhood, dogs, owners, cars) {
  const ctx = canvas.getContext('2d'); const s = canvas.width / (WORLD_LIMIT * 2 + 6);
  const map = n => (n + WORLD_LIMIT + 3) * s;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#d8e1b8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#8b9285';
  for (const p of [-36, 0, 36]) {
    ctx.fillRect(map(p - 4), 0, 8 * s, canvas.height);
    ctx.fillRect(0, map(p - 4), canvas.width, 8 * s);
  }
  neighborhood.houses.forEach(h => {
    ctx.fillStyle = state.checked.has(h.id) ? '#adb797' : h.wall;
    ctx.fillRect(map(h.x - 4), map(h.z - 3), 8 * s, 6 * s);
    ctx.fillStyle = state.checked.has(h.id) ? '#57715a' : '#fff7dd';
    ctx.fillRect(map(h.x - 1), map(h.z + 3), 2 * s, 2 * s);
  });
  const dot = (x, z, color, radius) => { ctx.beginPath(); ctx.arc(map(x), map(z), radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); };
  cars.forEach(c => dot(c.mesh.position.x, c.mesh.position.z, '#49585a', 2));
  dogs.forEach(d => dot(d.mesh.position.x, d.mesh.position.z, '#a96944', 2.5));
  owners.forEach(o => dot(o.mesh.position.x, o.mesh.position.z, '#d66d4c', 2.5));
  dot(state.player.x, state.player.z, '#fff7dd', 6);
  dot(state.player.x, state.player.z, '#d95832', 4);
}
