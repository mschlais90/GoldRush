import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { modelKey } from '../../sim/economy';
import { getModel } from '../../sim/estimate';
import { GRID_D, GRID_H, GRID_W, cx, cy } from '../../sim/geology/types';
import type { Property } from '../../sim/state';
import { getTruth } from '../../sim/truth';
import { gradeColor } from '../format';
import { PALETTES, hash01 } from '../map/terrain';
import { VZ, buildDiorama, surfaceY } from './diorama';

interface Props {
  prop: Property;
  version: number;
  cutoff: number;
  showShell: boolean;
  xray: boolean;
  showTruth: boolean; // only offered after game over
}

const N = GRID_W * GRID_H;
const BG = 0x0d1117;

/** Instanced trees/shrubs matching the 2D map's vegetation (same hash), skipping pit and creek. */
function buildTrees(t: ReturnType<typeof getTruth>, prop: Property): THREE.Object3D {
  const pal = PALETTES[prop.region];
  const spots: [number, number, number, number][] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = y * GRID_W + x;
      if (t.stream[c] || prop.mine.mined[c] > 0) continue;
      const e = t.terrain[c];
      const dens = pal.vegDensity * (pal.veg === 'pine' ? 0.6 + e : 1.4 - e);
      for (let k = 0; k < 3; k++) {
        if (hash01(x * 3 + k, y, prop.seed + 11) > dens) continue;
        const fx = x + hash01(x, y * 7 + k, prop.seed + 12);
        const fy = y + hash01(x * 5 + k, y, prop.seed + 13);
        spots.push([fx, fy, surfaceY(t, prop.mine, c), 0.28 + 0.2 * hash01(x, y, prop.seed + k)]);
      }
    }
  }
  const geo =
    pal.veg === 'pine' ? new THREE.ConeGeometry(0.45, 1.6, 6) : new THREE.IcosahedronGeometry(pal.veg === 'scrub' ? 0.35 : 0.55, 0);
  const [r, g, b] = pal.vegColor;
  const inst = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ color: new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear(), roughness: 0.9, flatShading: true }),
    spots.length,
  );
  const m4 = new THREE.Matrix4();
  spots.forEach(([x, y, h, s], i) => {
    const sc = s / 0.38;
    const lift = pal.veg === 'pine' ? 0.8 * sc : 0.3 * sc;
    m4.makeScale(sc, sc, sc).setPosition(x, h + lift, y);
    inst.setMatrixAt(i, m4);
  });
  return inst;
}

export function Reveal3D({ prop, version, cutoff, showShell, xray, showTruth }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    content: THREE.Group;
    raf: number;
  } | null>(null);

  // one-time scene setup
  useEffect(() => {
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 70, 160);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    camera.position.set(GRID_W * 1.2, GRID_D * 1.5, GRID_H * 1.45);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(GRID_W / 2, -GRID_D * VZ * 0.4, GRID_H / 2);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.maxPolarAngle = Math.PI * 0.62;
    controls.addEventListener('start', () => (controls.autoRotate = false));

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2a1a, 0.9));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(25, 60, 45);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6688ff, 0.35);
    rim.position.set(40, 10, 50);
    scene.add(rim);

    // subtle ground plane far below for depth cue
    const floor = new THREE.Mesh(new THREE.CircleGeometry(120, 48), new THREE.MeshBasicMaterial({ color: 0x0a0d12 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(GRID_W / 2, -GRID_D * VZ - 0.05, GRID_H / 2);
    scene.add(floor);

    const content = new THREE.Group();
    scene.add(content);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight || 500;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      ctxRef.current!.raf = requestAnimationFrame(loop);
    };
    ctxRef.current = { renderer, scene, camera, controls, content, raf: 0 };
    loop();
    return () => {
      cancelAnimationFrame(ctxRef.current!.raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      ctxRef.current = null;
    };
  }, []);

  // rebuild content when data changes
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { content } = ctx;
    content.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | undefined;
      if (mat) mat.dispose();
    });
    content.clear();

    const k = prop.knowledge;
    const m = prop.mine;
    const surface = getTruth(prop.seed, prop.region); // public: terrain + streams
    const mat4 = new THREE.Matrix4();
    const col = new THREE.Color();

    // terrain diorama
    const terrain = new THREE.Mesh(
      buildDiorama(surface, m, prop.region, prop.seed),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
        transparent: xray,
        opacity: xray ? 0.22 : 1,
        depthWrite: !xray,
        side: THREE.DoubleSide,
      }),
    );
    content.add(terrain);
    if (!xray) content.add(buildTrees(surface, prop));
    if (xray) {
      // crisp outline of the claim block so it still reads as a solid
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(GRID_W, GRID_D * VZ, GRID_H)),
        new THREE.LineBasicMaterial({ color: 0x6b7a8c, transparent: true, opacity: 0.5 }),
      );
      edges.position.set(GRID_W / 2, -GRID_D * VZ / 2, GRID_H / 2);
      content.add(edges);
    }

    const voxPos = (i: number) => {
      const c = i % N;
      const z = Math.floor(i / N);
      return [cx(c) + 0.5, -(z + 0.5) * VZ, cy(c) + 0.5] as const;
    };

    // known assays: glowing when above cutoff
    const samples: Record<number, number> = { ...(k.reported ?? {}), ...k.assays };
    const keys = Object.keys(samples)
      .map(Number)
      .filter((i) => Math.floor(i / N) >= m.mined[i % N] && !m.stoped?.[i]);
    const addSamples = (list: number[], ore: boolean) => {
      if (!list.length) return;
      const geo = ore ? new THREE.BoxGeometry(0.62, VZ * 0.94, 0.62) : new THREE.BoxGeometry(0.34, VZ * 0.9, 0.34);
      const material = ore
        ? new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6, emissive: 0xffaa22, emissiveIntensity: 0.35 })
        : new THREE.MeshStandardMaterial({ roughness: 0.8 });
      const inst = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((i, n) => {
        const [x, y, z] = voxPos(i);
        mat4.makeTranslation(x, y, z);
        inst.setMatrixAt(n, mat4);
        const [r, gg, b] = gradeColor(samples[i]);
        inst.setColorAt(n, col.setRGB(r / 255, gg / 255, b / 255).convertSRGBToLinear());
      });
      content.add(inst);
    };
    addSamples(keys.filter((i) => samples[i] >= cutoff), true);
    addSamples(keys.filter((i) => samples[i] < cutoff), false);

    // drill traces from the collar down, with a small rig pad at surface
    const pts: number[] = [];
    for (const h of k.holes) {
      const top = surfaceY(surface, m, h.c);
      pts.push(cx(h.c) + 0.5, top + 0.6, cy(h.c) + 0.5, cx(h.c) + 0.5, -h.depth * VZ, cy(h.c) + 0.5);
    }
    if (pts.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      content.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xcfd8e3, transparent: true, opacity: 0.7 })));
    }

    // underground workings: shaft + headframe, mined-out stopes, planned stopes
    if (m.shaft) {
      const top = surfaceY(surface, m, m.shaft.c);
      const h = Math.max(0.2, m.shaft.depth * VZ + top);
      const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, h, 0.55),
        new THREE.MeshStandardMaterial({ color: 0x8d97a3, roughness: 0.6, metalness: 0.4 }),
      );
      shaft.position.set(cx(m.shaft.c) + 0.5, top - h / 2, cy(m.shaft.c) + 0.5);
      content.add(shaft);
      const frame = new THREE.Mesh(
        new THREE.ConeGeometry(0.9, 3, 4, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xe6e1d6, wireframe: true }),
      );
      frame.position.set(cx(m.shaft.c) + 0.5, top + 1.5, cy(m.shaft.c) + 0.5);
      content.add(frame);
      const house = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1), new THREE.MeshStandardMaterial({ color: 0x7a3b2a, roughness: 0.9 }));
      house.position.set(cx(m.shaft.c) + 1.8, top + 0.45, cy(m.shaft.c) + 0.5);
      content.add(house);
    }
    const voxBoxes = (list: number[], color: number, opacity: number, scale: number, emissive = 0) => {
      if (!list.length) return;
      const inst = new THREE.InstancedMesh(
        new THREE.BoxGeometry(scale, VZ * scale, scale),
        new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.4, transparent: true, opacity, depthWrite: false }),
        list.length,
      );
      list.forEach((i, n) => {
        const [x, y, z] = voxPos(i);
        mat4.makeTranslation(x, y, z);
        inst.setMatrixAt(n, mat4);
      });
      content.add(inst);
    };
    const stoped = Object.keys(m.stoped ?? {})
      .map(Number)
      .filter((i) => !m.shaft || i % N !== m.shaft.c);
    voxBoxes(stoped, 0x2a1640, 0.75, 1);
    voxBoxes(m.stopes ?? [], 0xe66eff, 0.2, 0.9, 0x8a2aa0);

    // estimated ore shell or (post-game) the real deposit
    const shell: { i: number; g: number; a: number }[] = [];
    if (showTruth) {
      const t = getTruth(prop.seed, prop.region);
      for (let i = 0; i < t.grade.length; i++) {
        if (t.grade[i] >= cutoff && Math.floor(i / N) >= m.mined[i % N] && !m.stoped?.[i]) shell.push({ i, g: t.grade[i], a: 0.9 });
      }
    } else if (showShell) {
      const model = getModel(modelKey(prop), k);
      for (let i = 0; i < model.est.length; i++) {
        if (model.conf[i] >= 0.2 && model.conf[i] < 1 && model.est[i] >= cutoff && Math.floor(i / N) >= m.mined[i % N] && !m.stoped?.[i]) {
          shell.push({ i, g: model.est[i], a: model.conf[i] });
        }
      }
    }
    if (shell.length) {
      const inst = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.96, VZ * 0.96, 0.96),
        new THREE.MeshStandardMaterial({
          transparent: true,
          opacity: showTruth ? 0.6 : 0.3,
          depthWrite: false,
          emissive: 0xffb02e,
          emissiveIntensity: showTruth ? 0.35 : 0.2,
          roughness: 0.4,
        }),
        shell.length,
      );
      shell.forEach(({ i, g, a }, n) => {
        const [x, y, z] = voxPos(i);
        mat4.makeTranslation(x, y, z);
        inst.setMatrixAt(n, mat4);
        const [r, gg, b] = gradeColor(g);
        const f = 0.5 + 0.5 * a;
        inst.setColorAt(n, col.setRGB((r / 255) * f, (gg / 255) * f, (b / 255) * f).convertSRGBToLinear());
      });
      content.add(inst);
    }
  }, [prop, version, cutoff, showShell, xray, showTruth]);

  return (
    <div className="view3d" ref={mount}>
      <div className="view3d-hint">Drag to orbit · scroll to zoom · right-drag to pan</div>
    </div>
  );
}
