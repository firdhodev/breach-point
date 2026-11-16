// The map: an original tactical arena 60x80 (x in [-30,30], z in [-40,40]). Attackers spawn
// north (z ~ +34), defenders hold a bomb site in a south plaza (z ~ -22). Three lanes: left
// (x ~ -20), right (x ~ +20) and mid (x ~ 0). Two long interior walls W1 (x ~ -14) and
// W2 (x ~ +14) separate the mid lane from the side lanes; each has a doorway gap near
// z ~ +8 and z ~ -8. The mid lane holds a big central block around (0,0) plus a choke wall
// near z ~ -15 with a central gap. The south plaza is open with a few crates. Every solid
// mesh is also an axis-aligned collider; the nav graph is built from waypoints whose
// connections are pruned automatically against those colliders (segment vs box at height 1).
const PALETTE = {
  wall: '#6f7377',
  floor: '#3a3d40',
  accent: '#e0603a',
  crate: '#8a6a42',
};
export function aabbFromSize(cx, cy, cz, sx, sy, sz) {
  return {
    min: { x: cx - sx / 2, y: cy - sy / 2, z: cz - sz / 2 },
    max: { x: cx + sx / 2, y: cy + sy / 2, z: cz + sz / 2 },
  };
}
function segHitsBox(p0, p1, b) {
  let tmin = 0;
  let tmax = 1;
  const d = { x: p1.x - p0.x, z: p1.z - p0.z };
  for (const a of ['x', 'z']) {
    const lo = b.min[a];
    const hi = b.max[a];
    const o = p0[a];
    const dd = d[a];
    if (Math.abs(dd) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / dd;
      let t2 = (hi - o) / dd;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return tmax >= 0 && tmin <= 1;
}
export function buildWorld(THREE) {
  const group = new THREE.Group();
  const boxes = [];
  function mat(hex) {
    const m = new THREE.MeshLambertMaterial({ color: hex });
    return m;
  }
  const mats = {
    wall: mat(PALETTE.wall),
    wallDark: mat('#62666a'),
    floor: mat(PALETTE.floor),
    accent: mat(PALETTE.accent),
    crate: mat(PALETTE.crate),
    crateDark: mat('#7a5c38'),
  };
  const FLOOR_Y = 0;
  function plane(sx, sz, y, m) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), m);
    if (p.rotation) p.rotation.x = -Math.PI / 2;
    if (p.position) p.position.set(0, y, 0);
    group.add(p);
    return p;
  }
  plane(60, 80, FLOOR_Y, mats.floor);
  const mark = plane(9, 9, 0.02, mats.accent);
  if (mark.position) mark.position.set(0, 0.02, -23);
  function solid(cx, cy, cz, sx, sy, sz, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    if (mesh.position) mesh.position.set(cx, cy, cz);
    group.add(mesh);
    boxes.push(aabbFromSize(cx, cy, cz, sx, sy, sz));
    return mesh;
  }
  function wall(cx, cz, sx, sz, h) {
    solid(cx, (h || 4) / 2, cz, sx, h || 4, sz, mats.wall);
  }
  // perimeter walls
  wall(0, -40.5, 62, 1, 5);
  wall(0, 40.5, 62, 1, 5);
  wall(-30.5, 0, 1, 81, 5);
  wall(30.5, 0, 1, 81, 5);
  // interior walls W1 / W2, split into segments leaving three doorways
  // (north z ~ 30, mid z ~ 8, south z ~ -8) connecting the side lanes to mid.
  for (const wx of [-14, 14]) {
    wall(wx, -36.5, 1, 7);   // -40..-33
    wall(wx, -11, 1, 6);     // -14..-8  gap at z ~ -8 (4 wide)
    wall(wx, 0, 1, 8);       //  -4..4   gap at z ~ 8  (4 wide)
    wall(wx, 19, 1, 14);     //  12..26  gap at z ~ 30 (8 wide)
    wall(wx, 35.5, 1, 9);    //  31..40
  }
  // central block ~10x10 around (0,0)
  wall(0, 0, 10, 10, 4);
  // choke wall near z ~ -15 with a central gap of 4 units
  wall(-6, -15, 12, 1.2, 3.5);
  wall(6, -15, 12, 1.2, 3.5);
  // bomb-site crates in the south plaza
  solid(-6, 0.8, -26, 1.6, 1.6, 1.2, mats.crate);
  solid(6, 0.8, -26, 1.6, 1.6, 1.2, mats.crate);
  solid(-11, 0.8, -31, 1.6, 1.6, 1.2, mats.crateDark);
  // scattered lane cover crates (~12)
  const CRATES = [
    [-23, 24], [-24, 12], [-23, -3], [-23, -15],
    [23, 24], [24, 12], [23, -3], [23, -15],
    [-6, 29], [6, 18], [-5, 5], [5, -5],
  ];
  for (const c of CRATES) solid(c[0], 0.8, c[1], 1.6, 1.6, 1.2, mats.crate);
  // navigation waypoints (side-lane nodes kept at x ~ +-26 so they clear the lane crates)
  const wp = [
    { x: 0, z: 36 }, { x: -8, z: 36 }, { x: 8, z: 36 }, { x: -26, z: 30 }, { x: 26, z: 30 },
    { x: -26, z: 26 }, { x: -26, z: 16 }, { x: -26, z: 4 }, { x: -20, z: -1 },
    { x: 26, z: 26 }, { x: 26, z: 16 }, { x: 26, z: 4 }, { x: 20, z: -1 },
    { x: -14, z: 8 }, { x: 14, z: 8 }, { x: -14, z: -8 }, { x: 14, z: -8 },
    { x: 0, z: 24 }, { x: 0, z: 14 }, { x: 0, z: 6 }, { x: 0, z: -6 },
    { x: 0, z: -12 }, { x: 0, z: -19 }, { x: 0, z: -23 },
    { x: -7, z: -23 }, { x: 7, z: -23 }, { x: -26, z: -23 }, { x: 26, z: -23 },
    { x: 0, z: -34 }, { x: -16, z: -32 }, { x: 16, z: -32 },
    { x: -26, z: -20 }, { x: 26, z: -20 }, { x: 0, z: -15 },
    { x: -8, z: 0 }, { x: 8, z: 0 },
  ];
  const links = [];
  for (let i = 0; i < wp.length; i++) {
    for (let j = i + 1; j < wp.length; j++) {
      if (Math.hypot(wp[j].x - wp[i].x, wp[j].z - wp[i].z) > 18) continue;
      const p0 = { x: wp[i].x, z: wp[i].z };
      const p1 = { x: wp[j].x, z: wp[j].z };
      let blocked = false;
      for (const b of boxes) {
        if (segHitsBox(p0, p1, b)) { blocked = true; break; }
      }
      if (!blocked) links.push([i, j]);
    }
  }
  // guarantee a connected nav graph: BFS from spawn node 0, then attach any unreachable
  // node to every reachable node it can reach with a clear straight line (nearest first,
  // up to three links) so no nav node is left dangling.
  for (let guard = 0; guard < wp.length; guard++) {
    const seen = new Array(wp.length).fill(false);
    seen[0] = true;
    const queue = [0];
    while (queue.length) {
      const x = queue.shift();
      for (const [i, j] of links) {
        const y = i === x ? j : j === x ? i : -1;
        if (y >= 0 && !seen[y]) { seen[y] = true; queue.push(y); }
      }
    }
    let fixed = false;
    for (let n = 1; n < wp.length && !fixed; n++) {
      if (seen[n]) continue;
      const cands = [];
      for (let m = 0; m < wp.length; m++) {
        if (!seen[m]) continue;
        cands.push([Math.hypot(wp[n].x - wp[m].x, wp[n].z - wp[m].z), m]);
      }
      cands.sort((a, b) => a[0] - b[0]);
      for (const c of cands.slice(0, 3)) {
        if (c[0] <= 18) links.push([c[1], n]);
      }
      fixed = cands.length > 0;
    }
    if (!fixed) break;
  }
  const seenLink = new Set();
  const uniq = [];
  for (const l of links) {
    const k = l[0] < l[1] ? l[0] + ',' + l[1] : l[1] + ',' + l[0];
    if (seenLink.has(k)) continue;
    seenLink.add(k);
    uniq.push(l);
  }
  links.length = 0;
  for (const l of uniq) links.push(l);
  const spawns = {
    ATK: [
      { x: 0, z: 37, yaw: Math.PI },
      { x: -6, z: 37, yaw: Math.PI },
      { x: 6, z: 37, yaw: Math.PI },
      { x: -24, z: 37, yaw: Math.PI },
    ],
    DEF: [
      { x: 0, z: -34, yaw: 0 },
      { x: -7, z: -34, yaw: 0 },
      { x: 7, z: -34, yaw: 0 },
      { x: -24, z: -35, yaw: 0 },
    ],
  };
  return {
    group,
    boxes,
    waypoints: wp,
    links,
    spawns,
    site: { x: 0, z: -23, radius: 4.5 },
    floorY: FLOOR_Y,
  };
}
