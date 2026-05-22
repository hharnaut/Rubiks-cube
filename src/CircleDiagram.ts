import * as THREE from "three";
import {
  getFaceColor,
  type CubeState,
  type Face,
  type Sticker,
} from "./CubeState";
import { reaction } from "mobx";

type Axis = "x" | "y" | "z";
type PairFamily = "xy" | "xz" | "yz";

export interface CircleIntersectionPair {
  front: THREE.Vector3;
  back: THREE.Vector3;
}

export type IntersectionGrid = Record<
  PairFamily,
  Array<Array<CircleIntersectionPair | null>>
>;

type RingPathPoint = {
  bead: Bead;
  theta: number; // unwrapped cumulative angle
};

export interface Faces {
  ZP: THREE.Vector3[][];
  ZN: THREE.Vector3[][];
  XN: THREE.Vector3[][];
  XP: THREE.Vector3[][];
  YP: THREE.Vector3[][];
  YN: THREE.Vector3[][];
}
type Bead = {
  id: string;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  label: THREE.Sprite;
};

export class CircleDiagram {
  private readonly root: THREE.Group;
  private readonly faces: Faces;
  private beadsInRotatingRing: Bead[] | null;
  private beadsInRotatingFace:
    | { bead: Bead; ring: { center: THREE.Vector3; radius: number } }[]
    | null;

  private cubeState: CubeState;

  private readonly ringMap: Record<Axis, THREE.Mesh[]> = {
    x: [],
    y: [],
    z: [],
  };
  private readonly debugRingColors: Record<Axis, number> = {
    x: 0xff5555,
    y: 0x55ff55,
    z: 0x5555ff,
  };
  private readonly defaultRingColor = 0xb0b0b0;

  private readonly radii = [1.75, 2, 2.25];
  private readonly triangleSide = 2;

  private readonly centers: Record<Axis, THREE.Vector3>;

  private beads: Map<string, Bead> = new Map();

  constructor(cubeState: CubeState) {
    this.cubeState = cubeState;
    this.beadsInRotatingRing = null;
    this.beadsInRotatingFace = null;

    this.root = new THREE.Group();

    const h = (Math.sqrt(3) / 2) * this.triangleSide;

    this.centers = {
      z: new THREE.Vector3(0, h / 2, 0),
      x: new THREE.Vector3(-this.triangleSide / 2, -h / 2, 0),
      y: new THREE.Vector3(this.triangleSide / 2, -h / 2, 0),
    };

    this.build();
    this.faces = this.getFaces();
    this.buildBeads(this.faces, this.cubeState.getDebugMode());

    reaction(
      () => cubeState.getDebugMode(),
      (debugMode) => {
        this.beads.forEach((bead) => (bead.label.visible = debugMode));
        this.updateRingColors(debugMode);
      },
    );

    reaction(
      () => cubeState.getRotation(),
      (rotation, previousRotation) => {
        if (
          rotation?.status === "snapping" &&
          previousRotation?.status !== "snapping" &&
          this.beadsInRotatingRing
        ) {
          this.animateSnap(rotation);
        } else if (!previousRotation && rotation) {
          const beadsInRing = this.getBeadsOnRing(
            rotation.axis,
            rotation.layerIndex,
          );

          const beadsInFace = this.getBeadsOnRotatingFace(
            rotation.axis,
            rotation.layerIndex,
          );

          this.beadsInRotatingFace = beadsInFace;

          // beadsInFace?.forEach((bead) => {
          //   bead.bead.mesh.visible = false;
          // });

          this.beadsInRotatingRing = beadsInRing;

          if (rotation.status === "animating") {
            this.animateMove(
              rotation.axis,
              rotation.layerIndex,
              rotation.turns,
              rotation.durationMs,
            );
          }
        } else if (previousRotation && !rotation) {
          // this.beadsInRotatingFace?.forEach((bead) => {
          //   bead.bead.mesh.visible = true;
          // });
          this.beadsInRotatingRing = null;
          this.beadsInRotatingFace = null;
        } else if (previousRotation && rotation && this.beadsInRotatingRing) {
          this.updateBeadsInRotatingRing(
            this.beadsInRotatingRing,
            rotation.angle * (rotation.axis === "z" ? 1 : -1),
            rotation.layerIndex,
            rotation.axis,
          );

          if (this.beadsInRotatingFace) {
            this.updateBeadsInRotatingFace(
              this.beadsInRotatingFace,
              rotation.angle,
            );
          }
        }

        if (!rotation) {
          return;
        }
      },
    );
  }

  get object3d(): THREE.Object3D {
    return this.root;
  }

  /**
   * Returns the natural 3x3x3 intersection structure:
   *
   * - xy[i][j] = intersections of x-ring i with y-ring j
   * - xz[i][j] = intersections of x-ring i with z-ring j
   * - yz[i][j] = intersections of y-ring i with z-ring j
   *
   * Each cell contains two points:
   * - front: the intersection closer to the third cluster center
   * - back: the other one
   */
  getIntersectionGrid(): IntersectionGrid {
    return {
      xy: this.buildPairGrid("x", "y", "z"),
      xz: this.buildPairGrid("x", "z", "y"),
      yz: this.buildPairGrid("y", "z", "x"),
    };
  }

  // ----------------------------------
  // Internal
  // ----------------------------------

  private build(): void {
    (["x", "y", "z"] as Axis[]).forEach((axis) => {
      const color = this.getRingColor(axis, this.cubeState.getDebugMode());
      const group = this.createRingCluster(axis, color);
      group.position.copy(this.centers[axis]);
      this.root.add(group);
    });
  }

  private getRingColor(axis: Axis, debugMode: boolean): number {
    return debugMode ? this.debugRingColors[axis] : this.defaultRingColor;
  }

  private updateRingColors(debugMode: boolean): void {
    (["x", "y", "z"] as Axis[]).forEach((axis) => {
      const color = this.getRingColor(axis, debugMode);

      this.ringMap[axis].forEach((ring) => {
        const material = ring.material as THREE.MeshStandardMaterial;
        material.color.set(color);
        material.emissive.set(color);
        material.needsUpdate = true;
      });
    });
  }

  private createRingCluster(axis: Axis, color: number): THREE.Group {
    const group = new THREE.Group();

    this.radii.forEach((radius, index) => {
      const ring = this.createRing(radius, color);
      group.add(ring);
      this.ringMap[axis][index] = ring;
    });

    return group;
  }

  private createRing(radius: number, color: number): THREE.Mesh {
    const geometry = new THREE.TorusGeometry(radius, 0.015, 32, 128);

    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.8,
      roughness: 0.25,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.1,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;

    return mesh;
  }

  private buildPairGrid(
    axisA: Axis,
    axisB: Axis,
    axisFacing: Axis,
  ): Array<Array<CircleIntersectionPair | null>> {
    const centerA = this.toVector2(this.centers[axisA]);
    const centerB = this.toVector2(this.centers[axisB]);
    const facingCenter = this.toVector2(this.centers[axisFacing]);

    return this.radii.map((radiusA) =>
      this.radii.map((radiusB) => {
        const intersections = this.intersectCircles(
          centerA,
          radiusA,
          centerB,
          radiusB,
        );

        if (intersections.length !== 2) return null;

        const [p0, p1] = intersections;

        const d0 = p0.distanceTo(facingCenter);
        const d1 = p1.distanceTo(facingCenter);

        const front2 = d0 <= d1 ? p0 : p1;
        const back2 = d0 <= d1 ? p1 : p0;

        return {
          front: new THREE.Vector3(front2.x, front2.y, 0),
          back: new THREE.Vector3(back2.x, back2.y, 0),
        };
      }),
    );
  }

  private intersectCircles(
    c0: THREE.Vector2,
    r0: number,
    c1: THREE.Vector2,
    r1: number,
  ): [THREE.Vector2, THREE.Vector2] | [] {
    const d = c0.distanceTo(c1);

    if (d > r0 + r1) return [];
    if (d < Math.abs(r0 - r1)) return [];
    if (d === 0) return [];

    const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
    const hSquared = r0 * r0 - a * a;

    if (hSquared < 0) return [];

    const h = Math.sqrt(hSquared);

    const p2 = c1
      .clone()
      .sub(c0)
      .multiplyScalar(a / d)
      .add(c0);

    const rx = -(c1.y - c0.y) * (h / d);
    const ry = (c1.x - c0.x) * (h / d);

    return [
      new THREE.Vector2(p2.x + rx, p2.y + ry),
      new THREE.Vector2(p2.x - rx, p2.y - ry),
    ];
  }

  private toVector2(v: THREE.Vector3): THREE.Vector2 {
    return new THREE.Vector2(v.x, v.y);
  }

  private createBead(sticker: Sticker): {
    mesh: THREE.Mesh;
    label: THREE.Sprite;
  } {
    const color = getFaceColor(sticker.originalFace);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshStandardMaterial({
        color,
        metalness: 0,
        roughness: 1,
      }),
    );

    mesh.renderOrder = 2;

    // 👉 add ID label
    const label = this.createTextSprite(color, sticker.id.toString());

    //since beads lie on XY plane, push label toward +Z
    label.position.set(0, 0, 0.12);

    mesh.add(label);

    return { mesh, label };
  }

  private drawLabelCanvas(color: number, text: string): HTMLCanvasElement {
    const size = 256;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);

    const colorToRGB = (color: number) => ({
      r: (color >> 16) & 255,
      g: (color >> 8) & 255,
      b: color & 255,
    });

    const getContrastTextColor = (color: number): string => {
      const { r, g, b } = colorToRGB(color);
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      return luminance > 140 ? "black" : "white";
    };

    const { r, g, b } = colorToRGB(color);

    // 👉 background
    const padding = 20;
    const radius = 30;

    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

    ctx.beginPath();
    ctx.moveTo(padding + radius, padding);
    ctx.lineTo(size - padding - radius, padding);
    ctx.quadraticCurveTo(
      size - padding,
      padding,
      size - padding,
      padding + radius,
    );
    ctx.lineTo(size - padding, size - padding - radius);
    ctx.quadraticCurveTo(
      size - padding,
      size - padding,
      size - padding - radius,
      size - padding,
    );
    ctx.lineTo(padding + radius, size - padding);
    ctx.quadraticCurveTo(
      padding,
      size - padding,
      padding,
      size - padding - radius,
    );
    ctx.lineTo(padding, padding + radius);
    ctx.quadraticCurveTo(padding, padding, padding + radius, padding);
    ctx.closePath();
    ctx.fill();

    // 👉 text
    ctx.fillStyle = getContrastTextColor(color);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // optional: adaptive font size (prevents overflow 👇)
    let fontSize = 62;
    ctx.font = `bold ${fontSize}px Arial`;

    const maxWidth = size - padding * 2;

    while (ctx.measureText(text).width > maxWidth && fontSize > 16) {
      fontSize -= 2;
      ctx.font = `bold ${fontSize}px Arial`;
    }

    ctx.fillText(text, size / 2, size / 2);

    return canvas;
  }

  private createSpriteFromCanvas(canvas: HTMLCanvasElement): THREE.Sprite {
    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.3, 0.3, 1);

    return sprite;
  }

  private createTextSprite(color: number, text: string): THREE.Sprite {
    const canvas = this.drawLabelCanvas(color, text);
    return this.createSpriteFromCanvas(canvas);
  }

  buildBeads(faces: Faces, debugMode: boolean) {
    (["ZP", "ZN", "XN", "XP", "YP", "YN"] as Face[]).forEach((face) => {
      const grid = faces[face];

      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const position = grid[row][col];
          if (!position) continue;

          const key = `${face}-${row}-${col}`;

          const { row: cubeRow, col: cubeCol } = this.mapFaceCoordsToCube(
            face,
            row,
            col,
          );

          const sticker = this.cubeState.getStickerAtFace(
            face,
            cubeRow,
            cubeCol,
          );

          if (!sticker) {
            return;
          }

          const { mesh, label } = this.createBead(sticker);

          mesh.position.copy(position);
          label.visible = debugMode;

          this.root.add(mesh);

          this.beads.set(key, {
            position,
            label,
            mesh,
            id: key,
          });
        }
      }
    });
  }

  private mapFaceCoordsToCube(
    face: Face,
    row: number,
    col: number,
  ): { row: number; col: number } {
    switch (face) {
      case "ZP":
        return { row: 2 - row, col: 2 - col };

      case "ZN":
        return { row: 2 - row, col: 2 - col };

      case "YP":
        return { row: row, col: 2 - col };

      case "YN":
        return { row, col: 2 - col };

      case "XP":
        return { row: row, col: 2 - col };

      case "XN":
        return { row: row, col: 2 - col };
    }
  }

  updateBeads(faces: Faces) {
    (["ZP", "ZN", "XN", "XP", "YP", "YN"] as Face[]).forEach((face) => {
      const grid = faces[face];

      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const position = grid[row][col];
          if (!position) continue;

          const { row: cubeRow, col: cubeCol } = this.mapFaceCoordsToCube(
            face,
            row,
            col,
          );

          const sticker = this.cubeState.getStickerAtFace(
            face,
            cubeRow,
            cubeCol,
          );

          if (!sticker) {
            return;
          }

          const key = `${face}-${row}-${col}`;

          const bead = this.beads.get(key);
          if (!bead) continue;

          bead.mesh.position.copy(position);
          const material = bead.mesh.material as THREE.MeshStandardMaterial;
          material.color.set(getFaceColor(sticker.originalFace));

          const label = this.updateTextSprite(
            getFaceColor(sticker.originalFace),
            sticker.id,
          );

          // remove old label
          bead.mesh.remove(bead.label);

          // create new one

          label.position.set(0, 0, 0.12);

          bead.mesh.add(label);
          label.visible = this.cubeState.getDebugMode();

          // store reference
          bead.label = label;
        }
      }
    });
  }

  private updateTextSprite(color: number, text: string): THREE.Sprite {
    const canvas = this.drawLabelCanvas(color, text);
    return this.createSpriteFromCanvas(canvas);
  }

  wrapIndex(i: number, n: number): number {
    return ((i % n) + n) % n;
  }

  shortestAngleDelta(a: number, b: number): number {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  private buildRingPath(beads: Bead[], center: THREE.Vector3): RingPathPoint[] {
    const result: RingPathPoint[] = [];

    let accumulatedTheta = 0;

    for (let i = 0; i < beads.length; i++) {
      const bead = beads[i];

      const v = bead.position.clone().sub(center);

      let theta = Math.atan2(v.y, v.x);

      if (i === 0) {
        accumulatedTheta = theta;
      } else {
        let delta = theta - result[i - 1].theta;

        // unwrap manually
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;

        accumulatedTheta = result[i - 1].theta + delta;
      }

      result.push({
        bead,
        theta: accumulatedTheta,
      });
    }

    // close loop continuity
    const first = result[0];
    const last = result[result.length - 1];

    if (last.theta < first.theta) {
      last.theta += Math.PI * 2;
    }

    return result;
  }

  updateBeadsInRotatingRing(
    beads: Bead[],
    angle: number,
    layerIndex: number,
    axis: Axis,
  ) {
    const ringGeometry = this.getRingGeometry(
      axis,
      axis === "z" ? layerIndex : 2 - layerIndex,
    );

    if (!ringGeometry) return;

    const n = beads.length;
    const quarterTurn = Math.PI / 2;
    const tau = Math.PI * 2;

    // ---------------------------------------------------------------------------
    // Build stable ordered ring path
    // ---------------------------------------------------------------------------

    const path = this.buildRingPath(beads, ringGeometry.center);

    // Normalize all angles to [0, 2PI)
    const normalizedAngles = path.map((p) => {
      let theta = p.theta % tau;

      if (theta < 0) {
        theta += tau;
      }

      return theta;
    });

    // ---------------------------------------------------------------------------
    // Rotation decomposition
    // ---------------------------------------------------------------------------

    const direction = angle >= 0 ? 1 : -1;

    const absoluteAngle = Math.abs(angle);

    // completed quarter turns
    const completedTurns = Math.floor(absoluteAngle / quarterTurn);

    // remaining partial turn
    const residualAngle = absoluteAngle % quarterTurn;

    // interpolation factor within current quarter turn
    const t = residualAngle / quarterTurn;

    // ---------------------------------------------------------------------------
    // Interpolate between discrete quarter-turn states
    // ---------------------------------------------------------------------------

    for (let i = 0; i < n; i++) {
      // Current discrete slot after completed quarter turns
      const currentSlot = (((i + direction * completedTurns * 3) % n) + n) % n;

      // Target slot after one MORE quarter turn
      const targetSlot = (((currentSlot + direction * 3) % n) + n) % n;

      const theta0 = normalizedAngles[currentSlot];
      const theta1 = normalizedAngles[targetSlot];

      let delta: number;

      if (direction > 0) {
        delta = theta1 - theta0;

        if (delta < 0) {
          delta += tau;
        }
      } else {
        delta = theta1 - theta0;

        if (delta > 0) {
          delta -= tau;
        }
      }

      const theta = theta0 + delta * t;

      const newPosition = new THREE.Vector3(
        ringGeometry.radius * Math.cos(theta),
        ringGeometry.radius * Math.sin(theta),
        beads[i].position.z,
      ).add(ringGeometry.center);

      beads[i].mesh.position.copy(newPosition);
    }
  }

  updateBeadsInRotatingFace(
    beads: Array<{
      bead: Bead;
      ring: { center: THREE.Vector3; radius: number };
    }>,
    angle: number,
  ) {
    const eighthTurn = Math.PI / 4;
    const n = beads.length; // should be 8

    const rawSlotProgress = angle / eighthTurn;

    const wholeSlotOffset = Math.floor(rawSlotProgress);
    const fractionalSlotProgress = rawSlotProgress - wholeSlotOffset;

    const originalPositions = beads.map((entry) => entry.bead.position.clone());

    for (let i = 0; i < n; i++) {
      const currentSlotIndex = this.wrapIndex(i + wholeSlotOffset, n);
      const nextSlotIndex = this.wrapIndex(currentSlotIndex + 1, n);

      const p0 = originalPositions[currentSlotIndex];
      const p1 = originalPositions[nextSlotIndex];

      const ring = beads[currentSlotIndex].ring;
      const center = ring.center;
      const radius = ring.radius;

      const v0 = p0.clone().sub(center);
      const v1 = p1.clone().sub(center);

      const theta0 = Math.atan2(v0.y, v0.x);
      const theta1 = Math.atan2(v1.y, v1.x);

      const delta = this.shortestAngleDelta(theta0, theta1);
      const theta = theta0 + delta * fractionalSlotProgress;

      const newPosition = new THREE.Vector3(
        center.x + radius * Math.cos(theta),
        center.y + radius * Math.sin(theta),
        p0.z,
      );

      beads[i].bead.mesh.position.copy(newPosition);
    }
  }

  getFaces(): Faces {
    const { xy, xz, yz } = this.getIntersectionGrid();

    const createFace = (): THREE.Vector3[][] =>
      Array.from({ length: 3 }, () => Array(3).fill(null));

    const faces: Faces = {
      YP: createFace(),
      YN: createFace(),
      ZP: createFace(),
      ZN: createFace(),
      XP: createFace(),
      XN: createFace(),
    };

    // --- ZP / ZN from XY ---
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        const pair = xy[x][y];
        if (!pair) continue;

        // original: xy[2 - x][y]
        faces.ZN[2 - y][x] = pair.front;
        faces.ZP[y][x] = pair.back;
      }
    }

    // --- YN / YP from XZ ---
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        const pair = xz[x][z];
        if (!pair) continue;

        // already normalized 👍
        faces.YP[2 - z][x] = pair.front;
        faces.YN[z][x] = pair.back;
      }
    }

    // --- XN / XP from YZ ---
    for (let y = 0; y < 3; y++) {
      for (let z = 0; z < 3; z++) {
        const pair = yz[y][z];
        if (!pair) continue;

        faces.XP[2 - z][2 - y] = pair.front;
        faces.XN[2 - z][y] = pair.back;
      }
    }

    return faces;
  }

  rotateByLargestGap(beads: Bead[], center: THREE.Vector3) {
    const withAngles = beads.map((bead) => {
      const v = bead.position.clone().sub(center);
      const angle = normalizeAngle(Math.atan2(v.y, v.x));
      return angle;
    });

    const n = withAngles.length;

    let maxGap = -Infinity;
    let startIndex = 0;

    for (let i = 0; i < n; i++) {
      const current = withAngles[i];
      const next = withAngles[(i + 1) % n];

      let gap = next - current;

      // handle wrap-around
      if (i === n - 1) {
        gap = 2 * Math.PI - current + next;
      }

      if (gap > maxGap) {
        maxGap = gap;
        startIndex = (i + 1) % n; // start AFTER the gap
      }
    }

    // rotate array
    return [...beads.slice(startIndex), ...beads.slice(0, startIndex)];
  }

  getBeadsOnRotatingFace(
    axis: Axis,
    layerIndex: number,
  ): Array<{
    bead: Bead;
    ring: { center: THREE.Vector3; radius: number };
  }> | null {
    let face: Face | null = null;

    if (axis === "x") {
      if (layerIndex === 0) face = "XN";
      if (layerIndex === 2) face = "XP";
    }

    if (axis === "y") {
      if (layerIndex === 0) face = "YN";
      if (layerIndex === 2) face = "YP";
    }

    if (axis === "z") {
      if (layerIndex === 0) face = "ZN";
      if (layerIndex === 2) face = "ZP";
    }

    if (!face) return null;

    const entries: Array<{
      bead: Bead;
      key: string;
    }> = [];

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (row === 1 && col === 1) continue;

        const key = `${face}-${row}-${col}`;
        const bead = this.beads.get(key);

        if (bead) {
          entries.push({ bead, key });
        }
      }
    }

    if (entries.length !== 8) return null;

    const center = entries
      .reduce((acc, entry) => acc.add(entry.bead.position), new THREE.Vector3())
      .multiplyScalar(1 / entries.length);

    entries.sort((a, b) => {
      const va = a.bead.position.clone().sub(center);
      const vb = b.bead.position.clone().sub(center);

      const ta = normalizeAngle(Math.atan2(va.y, va.x));
      const tb = normalizeAngle(Math.atan2(vb.y, vb.x));

      return ta - tb;
    });

    const orderedBeads = this.rotateByLargestGap(
      entries.map((entry) => entry.bead),
      center,
    );

    const orderedEntries = orderedBeads.map(
      (bead) => entries.find((entry) => entry.bead === bead)!,
    );

    if (layerIndex === 2) {
      orderedEntries.reverse();
    }
    const candidateAxes: Axis[] =
      axis === "x" ? ["y", "z"] : axis === "y" ? ["x", "z"] : ["x", "y"];

    const getSharedRing = (
      beadA: Bead,
      beadB: Bead,
    ): { center: THREE.Vector3; radius: number } | null => {
      const epsilon = 1e-3;

      for (const candidateAxis of candidateAxes) {
        const ringCenter = this.centers[candidateAxis];

        const distanceA = beadA.position.distanceTo(ringCenter);
        const distanceB = beadB.position.distanceTo(ringCenter);

        for (const radius of this.radii) {
          const aIsOnRing = Math.abs(distanceA - radius) < epsilon;
          const bIsOnRing = Math.abs(distanceB - radius) < epsilon;

          if (aIsOnRing && bIsOnRing) {
            return {
              center: ringCenter.clone(),
              radius,
            };
          }
        }
      }

      return null;
    };

    return orderedEntries.map((current, index) => {
      const next = orderedEntries[(index + 1) % orderedEntries.length];

      const ring = getSharedRing(current.bead, next.bead);

      if (!ring) {
        throw new Error(
          `Failed to determine geometric ring between ${current.key} and ${next.key}`,
        );
      }

      return {
        bead: current.bead,
        ring,
      };
    });
  }
  getBeadsOnRing(axis: Axis, layerIndex: number): Bead[] {
    const result: Bead[] = [];

    const pushBead = (face: Face, row: number, col: number) => {
      const key = `${face}-${row}-${col}`;
      const bead = this.beads.get(key);
      if (bead) result.push(bead);
    };

    if (axis === "x") {
      // Faces: YN → ZP → YP → ZN (loop around X axis)

      // YN (top → bottom)
      for (let i = 0; i < 3; i++) pushBead("YN", i, 2 - layerIndex);

      // ZP (left → right)
      for (let i = 0; i < 3; i++) pushBead("ZP", i, 2 - layerIndex);

      // YP (bottom → top)
      for (let i = 2; i >= 0; i--) pushBead("YP", i, 2 - layerIndex);

      // ZN (right → left)
      for (let i = 2; i >= 0; i--) pushBead("ZN", i, 2 - layerIndex);
    }

    if (axis === "y") {
      // Faces: XN → ZP → XP → ZN (loop around Y axis)

      // XN (top → bottom)
      for (let i = 0; i < 3; i++) pushBead("XN", i, 2 - layerIndex);

      // ZP (left → right)
      for (let i = 0; i < 3; i++) pushBead("ZP", 2 - layerIndex, i);

      // XP (bottom → top)
      for (let i = 2; i >= 0; i--) pushBead("XP", i, layerIndex);

      // ZN (right → left)
      for (let i = 2; i >= 0; i--) pushBead("ZN", layerIndex, i);
    }

    if (axis === "z") {
      // (your original — already correct)
      for (let i = 0; i < 3; i++) pushBead("XN", 2 - layerIndex, i);
      for (let i = 0; i < 3; i++) pushBead("YP", 2 - layerIndex, i);
      for (let i = 0; i < 3; i++) pushBead("XP", 2 - layerIndex, i);
      for (let i = 0; i < 3; i++) pushBead("YN", layerIndex, i);
    }

    const ringGeometry = this.getRingGeometry(axis, layerIndex);

    result.sort((lhs, rhs) => {
      const v1 = lhs.position.clone().sub(ringGeometry.center);
      const v2 = rhs.position.clone().sub(ringGeometry.center);

      const t1 = normalizeAngle(Math.atan2(v1.y, v1.x));
      const t2 = normalizeAngle(Math.atan2(v2.y, v2.x));

      return t1 - t2;
    });

    return this.rotateByLargestGap(result, ringGeometry.center);
  }

  getRingGeometry(
    axis: Axis,
    layerIndex: number,
  ): {
    center: THREE.Vector3;
    radius: number;
  } {
    const center = this.centers[axis];
    const radius = this.radii[layerIndex];

    if (center === undefined) {
      throw new Error(`Invalid axis: ${axis}`);
    }

    if (radius === undefined) {
      throw new Error(`Invalid layerIndex: ${layerIndex}`);
    }

    return {
      center: center.clone(), // avoid accidental mutation
      radius,
    };
  }

  private animateSnap(rotation: {
    axis: Axis;
    layerIndex: number;
    angle: number;
  }) {
    const ninety = Math.PI / 2;
    const current = rotation.angle;

    const steps = Math.round(current / ninety);
    const target = steps * ninety;

    const duration = 200;
    const startTime = performance.now();
    const delta = target - current;

    const ringBeads = this.beadsInRotatingRing;
    const faceBeads = this.beadsInRotatingFace;

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);

      const eased = 1 - Math.pow(1 - t, 3);
      const value = current + delta * eased;

      // 🔥 update BOTH systems
      if (ringBeads) {
        this.updateBeadsInRotatingRing(
          ringBeads,
          value * (rotation.axis === "z" ? 1 : -1),
          rotation.layerIndex,
          rotation.axis,
        );
      }

      if (faceBeads) {
        this.updateBeadsInRotatingFace(faceBeads, value);
      }

      if (t < 1) {
        requestAnimationFrame(animate);
        return;
      }

      // ✅ FINAL SNAP
      if (ringBeads) {
        this.updateBeadsInRotatingRing(
          ringBeads,
          target * (rotation.axis === "z" ? 1 : -1),
          rotation.layerIndex,
          rotation.axis,
        );
      }

      if (faceBeads) {
        this.updateBeadsInRotatingFace(faceBeads, target);
      }

      this.updateBeads(this.faces);
    };

    requestAnimationFrame(animate);
  }

  animateMove(
    axis: Axis,
    layerIndex: number,
    turns: number,
    duration: number,
  ) {
    if (turns === 0) return;

    const ninety = Math.PI / 2;
    const target = turns * ninety;

    const ringBeads = this.getBeadsOnRing(axis, layerIndex);
    const faceBeads = this.getBeadsOnRotatingFace(axis, layerIndex);

    if (!ringBeads) return;

    // 👇 SNAPSHOT (CRUCIAL)

    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);

      const eased = 1 - Math.pow(1 - t, 3);
      const angle = target * eased;

      // 🔥 apply virtual rotation
      this.updateBeadsInRotatingRing(
        ringBeads,
        angle * (axis === "z" ? 1 : -1),
        layerIndex,
        axis,
      );

      if (faceBeads) {
        this.updateBeadsInRotatingFace(faceBeads, angle);
      }

      if (t < 1) {
        requestAnimationFrame(animate);
        return;
      }

      // ✅ final snap to real state
      this.updateBeads(this.faces);
    };

    requestAnimationFrame(animate);
  }
}

const TWO_PI = Math.PI * 2;

function normalizeAngle(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}
