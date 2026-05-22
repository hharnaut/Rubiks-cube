import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  CubeState,
  getAxisFromFace,
  getFaceColor,
  type Axis,
  type Face,
} from "./CubeState";
import type { CubeHit } from "./CubeInteractionController";
import { reaction } from "mobx";

export class Cube {
  cubeState: CubeState;

  cubeGroup = new THREE.Group();

  cubelets: THREE.Group[] = [];
  cubeletMap = new Map<number, THREE.Group>();

  rotationGroup: THREE.Group | null = null;
  rotatingCubelets: THREE.Group[] = [];

  constructor(scene: THREE.Scene, state: CubeState) {
    this.cubeState = state;
    scene.add(this.cubeGroup);

    this.buildCubelets();

    reaction(
      () => this.cubeState.getDebugMode(),
      () => {
        console.log("debug mode reaction");
        this.updateStickerTextures();
      },
    );

    reaction(
      () => state.getRotation(),
      (rotation, previousRotation) => {
        if (previousRotation === null && rotation !== null) {
          this.startRotation();
          if (rotation.status === "animating") {
            this.animateMove(
              rotation.axis,
              rotation.layerIndex,
              rotation.turns,
            );
          }
        } else if (
          rotation?.status === "snapping" &&
          previousRotation?.status !== "snapping"
        ) {
          const ninety = Math.PI / 2;
          const current = rotation.angle;

          const steps = Math.round(current / ninety);
          const target = steps * ninety;

          this.animateRotation({
            axis: rotation.axis,
            fromAngle: current,
            toAngle: target,
            onComplete: () => {
              const committed = target !== 0;

              this.finalizeRotation({
                committed,
                steps: Math.abs(steps),
                group: this.rotationGroup!,
                cubelets: this.rotatingCubelets,
                axis: rotation.axis,
                direction: Math.sign(target) < 0 ? -1 : 1,
                layerIndex: rotation.layerIndex,
                recordHistory: rotation.recordHistory,
              });
            },
          });
        } else if (
          previousRotation !== null &&
          rotation !== null &&
          this.rotationGroup !== null
        ) {
          if (rotation.axis === "x") {
            this.rotationGroup.rotation.x = rotation.angle;
          }

          if (rotation.axis === "y") {
            this.rotationGroup.rotation.y = rotation.angle;
          }

          if (rotation.axis === "z") {
            this.rotationGroup.rotation.z = rotation.angle;
          }
        }
      },
    );
  }

  resetInteraction() {
    this.rotationGroup = null;
    this.rotatingCubelets = [];
  }

  private createCubelet(
    x: number,
    y: number,
    z: number,
    id: number,
  ): THREE.Group {
    const group = new THREE.Group();

    const size = 1;

    // --- Core ---
    const core = new THREE.Mesh(
      new RoundedBoxGeometry(1, 1, 1, 8, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.5,
      }),
    );

    group.add(core);

    // --- Stickers ---
    const stickerSize = 0.9;
    const offset = size / 2 + 0.001;

    const createSticker = (face: Face) => {
      const sticker = this.cubeState.getStickerAt(
        x,
        y,
        z,
        getAxisFromFace(face),
      );
      if (!sticker) {
        return;
      }
      const text = sticker.id.toString();
      const texture = this.createStickerTexture(face, text);

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(stickerSize, stickerSize),
        new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.15,
          metalness: 0.0,
        }),
      );
      mesh.userData.face = face;
      mesh.userData.text = text;
      return mesh;
    };

    // X+
    if (x === 2) {
      const s = createSticker("XP");
      if (s) {
        s.position.x = offset;
        s.rotation.y = Math.PI / 2;
        group.add(s);
      }
    }

    // X-
    if (x === 0) {
      const s = createSticker("XN");
      if (s) {
        s.position.x = -offset;
        s.rotation.y = -Math.PI / 2;
        group.add(s);
      }
    }

    // Y+
    if (y === 2) {
      const s = createSticker("YP");
      if (s) {
        s.position.y = offset;
        s.rotation.x = -Math.PI / 2;
        group.add(s);
      }
    }

    // Y-
    if (y === 0) {
      const s = createSticker("YN");
      if (s) {
        s.position.y = -offset;
        s.rotation.x = Math.PI / 2;
        group.add(s);
      }
    }

    // Z+
    if (z === 2) {
      const s = createSticker("ZP");
      if (s) {
        s.position.z = offset;
        group.add(s);
      }
    }

    // Z-
    if (z === 0) {
      const s = createSticker("ZN");
      if (s) {
        s.position.z = -offset;
        s.rotation.y = Math.PI;
        group.add(s);
      }
    }

    // Logical position
    group.userData = { isCubelet: true, id };

    return group;
  }

  private createStickerTexture(face: Face, text: string): THREE.CanvasTexture {
    const size = 256;
    const color = getFaceColor(face);

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d")!;

    // background
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.fillRect(0, 0, size, size);

    // 👇 only draw text if debugMode is ON
    if (this.cubeState.getDebugMode()) {
      ctx.fillStyle = "black";
      ctx.font = "bold 72px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillText(text, size / 2, size / 2);
    }

    ctx.fillText(text, size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return texture;
  }

  private updateStickerTextures() {
    this.cubelets.forEach((cubelet) => {
      cubelet.children.forEach((child) => {
        if (!(child instanceof THREE.Mesh)) return;

        const material = child.material as THREE.MeshStandardMaterial;
        if (!material.map) return;

        // We need to know which face this sticker belongs to.
        // 👉 easiest way: store it in userData when creating it
        const face = child.userData?.face as Face | undefined;
        const text = child.userData?.text as string | undefined;

        if (!face || !text) return;

        const newTexture = this.createStickerTexture(face, text);

        material.map.dispose(); // avoid memory leak
        material.map = newTexture;
        material.needsUpdate = true;
      });
    });
  }

  private buildCubelets() {
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          const cubeletId = this.cubeState.getIdAt(x, y, z);
          const cubelet = this.createCubelet(x, y, z, cubeletId);
          this.cubeletMap.set(cubeletId, cubelet);

          cubelet.position.set(x - 1, y - 1, z - 1);

          this.cubeGroup.add(cubelet);
          this.cubelets.push(cubelet);
        }
      }
    }
  }

  private getCubeletsSlice(layerIndex: number, axis: Axis): THREE.Group[] {
    let layer: THREE.Group[] = [];

    if (axis === "x") {
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          const cubeletId = this.cubeState.getIdAt(layerIndex, y, z);
          const cubelet = this.cubeletMap.get(cubeletId) as THREE.Group;
          layer.push(cubelet);
        }
      }
    } else if (axis === "y") {
      for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
          const cubeletId = this.cubeState.getIdAt(x, layerIndex, z);
          const cubelet = this.cubeletMap.get(cubeletId) as THREE.Group;
          layer.push(cubelet);
        }
      }
    } else {
      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          const cubeletId = this.cubeState.getIdAt(x, y, layerIndex);
          const cubelet = this.cubeletMap.get(cubeletId) as THREE.Group;
          layer.push(cubelet);
        }
      }
    }

    return layer;
  }

  private getCubelet(object: THREE.Object3D): THREE.Group | null {
    let current: THREE.Object3D | null = object;

    while (current) {
      if (current.userData?.isCubelet) {
        return current as THREE.Group;
      }
      current = current.parent;
    }

    return null;
  }

  finishRotation(
    steps: number,
    group: THREE.Group,
    cubelets: THREE.Group[],
    axis: Axis,
    direction: -1 | 1,
    layerIndex: number,
    recordHistory: boolean,
  ) {
    // Detach back to scene
    cubelets.forEach((c) => this.cubeGroup.attach(c));
    this.cubeGroup.remove(group);

    // for (let step = 0; step < steps % 4; step++) {
    //   this.cubeState.rotate(axis, layerIndex, direction);
    // }
    this.cubeState.applyMove(
      axis,
      layerIndex,
      steps * direction,
      recordHistory,
    );
    this.updatePositions();
  }

  private finalizeRotation(params: {
    committed: boolean;
    steps: number;
    group: THREE.Group;
    cubelets: THREE.Group[];
    axis: Axis;
    direction: -1 | 1;
    layerIndex: number;
    recordHistory: boolean;
  }) {
    const {
      committed,
      steps,
      group,
      cubelets,
      axis,
      direction,
      layerIndex,
      recordHistory,
    } = params;

    if (committed) {
      this.finishRotation(
        steps,
        group,
        cubelets,
        axis,
        direction,
        layerIndex,
        recordHistory,
      );
    } else {
      cubelets.forEach((c) => this.cubeGroup.attach(c));
      this.cubeGroup.remove(group);
    }

    this.clearGroup();
    this.cubeState.finishRotation();
  }

  updatePositions() {
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          const id = this.cubeState.getIdAt(x, y, z);
          const cubelet = this.cubeletMap.get(id)!;

          cubelet.position.set(x - 1, y - 1, z - 1);
        }
      }
    }
  }

  startRotation() {
    const rotation = this.cubeState.getRotation();
    if (!rotation) return;

    this.rotatingCubelets = this.getCubeletsSlice(
      rotation.layerIndex,
      rotation.axis,
    );

    this.rotationGroup = new THREE.Group();
    this.cubeGroup.add(this.rotationGroup);

    this.cubeGroup.updateMatrixWorld(true);

    this.rotatingCubelets.forEach((cubelet) => {
      this.rotationGroup!.attach(cubelet);
    });
  }

  clearGroup() {
    this.rotatingCubelets = [];
    this.rotationGroup = null;
  }

  raycast(raycaster: THREE.Raycaster): CubeHit | null {
    const intersects = raycaster.intersectObjects(this.cubelets, true);
    if (intersects.length === 0) return null;

    const hit = intersects[0];

    const cubelet = this.getCubelet(hit.object);
    if (!cubelet || !hit.face) return null;

    const normal = hit.face.normal
      .clone()
      .transformDirection(hit.object.matrixWorld);

    return {
      hitCubeletId: cubelet.userData.id,
      point: hit.point.clone(),
      normal,
    };
  }

  animateMove(axis: Axis, layerIndex: number, turns: number) {
    if (turns === 0) return;
    const rotation = this.cubeState.getRotation();
    if (!rotation) return;

    const ninety = Math.PI / 2;
    const target = turns * ninety;

    this.animateRotation({
      axis,
      fromAngle: 0,
      toAngle: target,
      duration: rotation.durationMs,
      onComplete: () => {
        this.finalizeRotation({
          committed: true,
          steps: Math.abs(turns),
          group: this.rotationGroup!,
          cubelets: this.rotatingCubelets,
          axis,
          direction: Math.sign(turns) as -1 | 1,
          layerIndex,
          recordHistory: rotation.recordHistory,
        });
      },
    });
  }

  private animateRotation({
    axis,
    fromAngle,
    toAngle,
    duration,
    onComplete,
  }: {
    axis: Axis;
    fromAngle: number;
    toAngle: number;
    duration?: number;
    onComplete: (finalAngle: number) => void;
  }) {
    const animationDuration = duration ?? 200;
    const startTime = performance.now();
    const delta = toAngle - fromAngle;

    const group = this.rotationGroup!;

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / animationDuration, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      const value = fromAngle + delta * eased;

      if (axis === "x") group.rotation.x = value;
      if (axis === "y") group.rotation.y = value;
      if (axis === "z") group.rotation.z = value;

      if (t < 1) {
        requestAnimationFrame(animate);
        return;
      }

      onComplete(toAngle);
    };

    requestAnimationFrame(animate);
  }
}
