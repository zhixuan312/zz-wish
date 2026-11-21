import { WINDOW } from './bell-lane-camera.js';
import { bellLaneShutterOffset } from './bell-lane-dawn.ts';

const corner = { width: 2.65, height: 1.38, sill: .81, wall: 0x91877a, frame: 0x4f6965, roof: 0x515754, bays: 3, awning: 1.04 };
const fronts = [
  { width: 2.48, height: 1.13, sill: .91, wall: 0x84785d, frame: 0x674233, roof: 0x695345, bays: 2, awning: .70 },
  { width: 3.14, height: 1.36, sill: .81, wall: 0x827f70, frame: 0x615747, roof: 0x555e5c, bays: 2, awning: .88 },
  { width: 1.96, height: 1.47, sill: .57, wall: 0xa28d73, frame: 0x775746, roof: 0x646159, bays: 1, awning: .56 },
  { width: 2.84, height: 1.09, sill: 1.02, wall: 0x747e75, frame: 0x515c45, roof: 0x4e5355, bays: 3, awning: .79 },
];

function paperTexture(THREE, bays, landmark) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 224;
  const g = canvas.getContext('2d');
  const { width, height } = canvas;
  g.fillStyle = '#241c13';
  g.fillRect(0, 0, width, height);
  const bayWidth = width / bays;
  for (let bay = 0; bay < bays; bay++) {
    const x = bay * bayWidth + 4;
    const w = bayWidth - 8;
    const h = landmark ? 151 : bays === 1 ? 177 : 159;
    const wash = g.createLinearGradient(x, 5, x + w, h);
    wash.addColorStop(0, '#e6d5ad');
    wash.addColorStop(.52, bay % 2 ? '#b69c72' : '#d1b887');
    wash.addColorStop(1, '#8e785a');
    g.fillStyle = wash;
    g.fillRect(x, 6, w, h);
    // Fine fibres, darker hand-height paper, and a patch with a cut margin.
    for (let k = 0; k < 360; k++) {
      const xx = x + (k * 37.237 % w);
      const yy = 6 + ((k * 19.923 + bay * 13) % h);
      g.fillStyle = k % 3 ? 'rgba(89,68,43,.14)' : 'rgba(245,227,184,.18)';
      g.fillRect(xx, yy, 1 + k % 5, 1);
    }
    if (landmark && bay === 2) {
      g.fillStyle = '#eedcba';
      g.beginPath();
      g.moveTo(x + 9, 44);
      g.lineTo(x + 65, 43);
      g.lineTo(x + 67, 112);
      g.lineTo(x + 10, 115);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = landmark ? '#33352c' : '#453326';
    g.lineWidth = 4;
    g.beginPath();
    const uprights = bays === 1 ? 9 : 4;
    for (let j = 1; j < uprights; j++) {
      const xx = x + j * w / uprights;
      g.moveTo(xx, 6);
      g.lineTo(xx, h + 6);
    }
    const rows = landmark ? [32, 50, 86, 122, 143] : bays === 1 ? [34, 97, 159] : [32, 58, 102, 133];
    for (const y of rows) {
      g.moveTo(x, y);
      g.lineTo(x + w, y);
    }
    g.stroke();
    const board = g.createLinearGradient(x, h + 7, x + w, height);
    board.addColorStop(0, landmark ? '#4b5446' : '#4b3828');
    board.addColorStop(1, '#231c16');
    g.fillStyle = board;
    g.fillRect(x, h + 7, w, height - h - 11);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function addBellLaneShops(h, stone) {
  const { THREE, M, box, put, lathe, roofMat, grainTex, brickTex, plasterTex } = h;
  const C = h.context;
  const timber = M(0x685341, .89, { map: grainTex });
  const bareWood = M(0x9c7957, .94, { map: grainTex });
  const greyIron = M(0x524a38, .71, { metalness: .56 });
  const strap = M(0x48392c, .93);
  const repair = M(0xb9a48a, .98, { map: plasterTex });
  const wornBrick = M(0x827264, .97, { map: brickTex });
  const darkBrick = M(0x665a50, .98, { map: brickTex });
  const jar = M(0x76523f, .78);
  const rim = M(0x9b7658, .68);
  const cloth = M(0x8b493a, .99);
  const basket = M(0xa08c67, .97, { map: grainTex });
  const papers = new Map();
  const paper = (bays, landmark) => {
    const key = landmark ? 'corner' : bays;
    if (!papers.has(key)) papers.set(key, paperTexture(THREE, bays, landmark));
    return papers.get(key);
  };
  const shutters = [];

  for (let shop = 0; shop < 7; shop++) for (const side of [-1, 1]) {
    const landmark = shop === 0 && side === 1;
    const variant = (shop + (side < 0 ? 2 : 3)) % fronts.length;
    const style = landmark ? corner : fronts[variant];
    const z = 14 + shop * 6;
    const face = landmark ? WINDOW[0] : side * (3.90 + (shop % 2) * .16);
    const windowZ = landmark ? WINDOW[2] : z + (variant % 2 ? .45 : -.30);
    const windowY = landmark ? WINDOW[1] : style.sill + style.height / 2;
    const height = 3.14 + (variant % 3) * .29;
    const { width, bays } = style;
    const inward = depth => face - side * depth;
    const isShutterShop = shop >= 2 && shop % 2 === 0;
    const frame = M(style.frame, .89, { map: grainTex });
    const wall = M(style.wall, .97, { map: landmark || variant % 2 ? plasterTex : brickTex });
    const siding = variant % 2 ? darkBrick : wornBrick;
    box(3.4, height, 5.84, wall, face + side * 1.72, height / 2, z);

    // Plaster has an exposed, repaired brick foot instead of repeating across the whole face.
    const plinth = landmark ? .64 : .46 + variant * .07;
    box(.105, plinth, 5.78, siding, inward(.049), plinth / 2 + .04, z);
    box(.155, .068, 5.75, stone, inward(.055), plinth + .045, z);
    if (landmark || variant === 2) {
      const pierZ = z + 2.74;
      box(.185, height - .25, .31, siding, inward(.067), (height - .25) / 2, pierZ);
      box(.284, .198, .42, stone, inward(.108), .158, pierZ);
    }
    if (landmark) {
      for (const [y, dz, w] of [[.69, -.96, .42], [.77, -.79, .26], [.84, .79, .55]]) {
        put(new THREE.BoxGeometry(.018, .062, w), repair, inward(.053), y, windowZ + dz);
      }
    }

    const texture = paper(bays, landmark);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(width, style.height), new THREE.MeshStandardMaterial({
      color: landmark ? 0xd2c6ad : 0xb7a488,
      map: texture, emissive: 0xffb66f, emissiveMap: texture, roughness: .92,
    }));
    pane.position.set(face, windowY, windowZ);
    pane.rotation.y = -side * Math.PI / 2;
    pane.receiveShadow = true;
    if (landmark) {
      pane.name = 'Bell Lane east shop window';
      pane.userData.bellLaneReferenceDetails = 'three green-painted bays, amber sill, patched paper and split shutter';
    }
    C.G.add(pane);

    const sill = landmark ? M(0x96604a, .92, { map: grainTex }) : variant % 2 ? stone : timber;
    const halfHeight = style.height / 2;
    box(.24, .128, width + .27, sill, inward(.078), windowY - halfHeight - .030, windowZ);
    box(.15, .102, width + .19, frame, inward(.049), windowY + halfHeight + .044, windowZ);
    for (let bay = 0; bay <= bays; bay++) {
      const dz = (bay / bays - .5) * width;
      box(.129, style.height + .07, bay === 0 || bay === bays ? .087 : .065, frame, inward(.048), windowY, windowZ + dz);
    }
    box(.13, .058, width, frame, inward(.052), windowY - halfHeight * .34, windowZ);
    box(.108, .033, width + .12, timber, inward(.065), windowY + halfHeight - .18, windowZ);

    if (landmark) {
      // The painted corner frame has a single slatted leaf, dark hinge straps,
      // and one short length of newer wood spliced into the weathered sill.
      box(.10, 1.44, .49, frame, inward(.16), windowY, windowZ - 1.48, -.46);
      for (let j = 0; j < 7; j++) {
        put(new THREE.BoxGeometry(.078, .040, .47), sill, inward(.208), .94 + j * .16, windowZ - 1.48, -.46);
      }
      for (const y of [1.11, 2.01]) put(new THREE.BoxGeometry(.07, .047, .21), strap, inward(.24), y, windowZ - 1.48, -.46);
      put(new THREE.BoxGeometry(.028, .025, .41), bareWood, inward(.20), windowY - halfHeight - .023, windowZ + .71);
      put(new THREE.BoxGeometry(.035, .064, .075), greyIron, inward(.128), windowY - .29, windowZ + .65);
    } else if (isShutterShop) {
      const leafSize = width / 2 - .018;
      for (const hinge of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(inward(.104), windowY, windowZ + hinge * width / 2);
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(.058, style.height - .012, leafSize), frame);
        leaf.position.z = -hinge * leafSize / 2;
        leaf.castShadow = leaf.receiveShadow = true;
        const rails = new THREE.BoxGeometry(.068, .067, leafSize - .11);
        for (const y of [-style.height * .32, style.height * .28]) {
          const rail = new THREE.Mesh(rails, timber);
          rail.position.set(-side * .031, y, leaf.position.z);
          rail.castShadow = rail.receiveShadow = true;
          pivot.add(rail);
        }
        pivot.add(leaf);
        C.G.add(pivot);
        shutters.push({ pivot, sign: side * hinge, timeOffset: bellLaneShutterOffset(shop, side) });
      }
    }

    // Some entrances are boarded and others leave a step and a place to put stock.
    const doorZ = z + (variant % 2 ? -2.19 : 2.13);
    if (!landmark) {
      box(.13, 2.22, .80, timber, inward(.043), 1.17, doorZ);
      for (const dz of [-.32, -.11, .11, .32]) {
        put(new THREE.BoxGeometry(.053, 2.14, .186), frame, inward(.12), 1.15, doorZ + dz);
      }
      box(.43, .10, 1.01, stone, inward(.23), .105, doorZ);
      put(new THREE.BoxGeometry(.042, .067, .045), greyIron, inward(.16), 1.07, doorZ - .07);
    }

    const awningY = height - (landmark ? .50 : .48 + variant * .07);
    const spanZ = landmark ? 5.92 : 5.22 + (variant % 3) * .24;
    const awningZ = z + (landmark ? 0 : (variant % 2 ? -.20 : .15));
    const canopy = roofMat(style.roof);
    box(3.57, .15, 5.84, canopy, face + side * 1.65, height + .06, z);
    const board = new THREE.BoxGeometry(style.awning, .092, spanZ);
    board.rotateZ(side * (landmark ? .23 : .13 + variant * .052));
    put(board, canopy, inward(style.awning / 2), awningY + .070, awningZ);
    box(.087, .121, spanZ, landmark ? sill : timber, inward(style.awning), awningY - .082, awningZ);
    for (let end = -spanZ / 2 + .20; end < spanZ / 2; end += landmark ? .235 : .36) {
      const tile = new THREE.CylinderGeometry(landmark ? .044 : .039, .046, .17, 8);
      tile.rotateZ(Math.PI / 2);
      put(tile, canopy, inward(style.awning + .029), awningY + .006, awningZ + end);
    }
    for (const dz of [-2.12, -.73, .66, 2.06]) {
      put(new THREE.BoxGeometry(style.awning + .055, .075, .082), timber, inward(style.awning / 2), awningY - .076, z + dz);
    }

    if (landmark || variant === 1) {
      // A handful of items left where the shop could actually use them.
      const shelfZ = landmark ? windowZ + 1.67 : z + .73;
      box(.36, .071, .86, timber, inward(.24), .57, shelfZ);
      for (const dz of [-.31, .31]) box(.072, .48, .067, timber, inward(.31), .30, shelfZ + dz);
      put(lathe([[.072, 0], [.105, .04], [.108, .137], [.079, .199], [.049, .21], [.046, .192], [.074, .174]],
        18), jar, inward(.25), .61, shelfZ + .23);
      put(new THREE.CylinderGeometry(.052, .057, .019, 16), rim, inward(.25), .823, shelfZ + .23);
      put(new THREE.BoxGeometry(.19, .035, .28), cloth, inward(.27), .628, shelfZ - .18, side * .08);
    } else if (variant === 0) {
      const wicker = [[.11, 0], [.165, .035], [.193, .22], [.199, .239], [.179, .237], [.163, .06], [.084, .037]];
      put(lathe(wicker, 18), basket, inward(.35), .069, z + .92);
      put(new THREE.CylinderGeometry(.216, .205, .043, 18), timber, inward(.37), .31, z + 1.09);
    } else if (variant === 2) {
      box(.45, .12, .88, stone, inward(.32), .12, z + 1.12);
      put(new THREE.BoxGeometry(.066, .41, .89), bareWood, inward(.19), .38, z + 1.13, side * .13);
    }

    const lamp = landmark ? new THREE.PointLight(0xffbc82, 0, 6, 2) : null;
    if (lamp) {
      lamp.position.set(inward(.43), 1.78, windowZ + .40);
      C.G.add(lamp);
    }
    const setWindowLight = light => {
      pane.material.emissiveIntensity = landmark ? .027 + 1.30 * light.lamp :
        .006 + light.lamp * (isShutterShop ? .12 : [.23, .49, .08, .33][variant]);
      if (lamp) lamp.intensity = .14 + 3.55 * light.lamp;
    };
    setWindowLight(C.light);
    C.up.push((_dt, _t, light) => setWindowLight(light));
  }
  return shutters;
}
