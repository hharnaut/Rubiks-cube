import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { CubeState } from "./CubeState";
import type { Cube } from "./Cube";
import { reaction } from "mobx";

type InteractionState = {
  dragStartPoint: THREE.Vector3;
  faceNormal: THREE.Vector3;
  hitCubeletId: number;
};

export type CubeHit = {
  hitCubeletId: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
};

export class CubeInteractionController {
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private cubeState: CubeState;

  private camera: THREE.Camera;
  private domElement: HTMLElement;
  private controls: OrbitControls;
  private cube: Cube;

  private interaction: InteractionState | null = null;

  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    controls: OrbitControls,
    cubeState: CubeState,
    cube: Cube,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.cube = cube;
    this.controls = controls;
    this.cubeState = cubeState;

    reaction(
      () => this.cubeState.getRotation(),
      (rotation) => {
        if (rotation === null) {
          this.interaction = null;
          this.controls.enabled = true;
        }
      },
    );
  }

  attach() {
    this.domElement.addEventListener("pointerdown", this.onPointerDown);
    this.domElement.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  detach() {
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.domElement.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  private updateRaycaster = (event: PointerEvent) => {
    const rect = this.domElement.getBoundingClientRect();

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
  };

  private onPointerDown = (event: PointerEvent) => {
    const rotation = this.cubeState.getRotation();

    if (rotation) {
      return; // 🚫 ignore input
    }

    this.updateRaycaster(event);

    const hit = this.cube.raycast(this.raycaster);
    if (!hit) return;

    this.interaction = {
      hitCubeletId: hit.hitCubeletId,
      dragStartPoint: hit.point.clone(),
      faceNormal: hit.normal.clone(),
    };

    this.controls.enabled = false;
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.interaction) {
      return;
    }

    this.updateRaycaster(event);

    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      this.interaction.faceNormal,
      this.interaction.dragStartPoint,
    );

    const currentPoint = new THREE.Vector3();
    const hasIntersection = this.raycaster.ray.intersectPlane(
      plane,
      currentPoint,
    );

    if (!hasIntersection) {
      return;
    }

    const dragVector = currentPoint
      .clone()
      .sub(this.interaction.dragStartPoint);

    if (dragVector.length() < 0.05) {
      return;
    }

    if (!this.cubeState.getRotation()) {
      this.startRotation(dragVector);
    }

    this.updateRotation(dragVector);
  };

  private onPointerUp = () => {
    if (!this.interaction || !this.cubeState.getRotation()) {
      this.resetInteraction();
      return;
    }
    this.cubeState.requestSnap();
    this.interaction = null;
  };

  private getRotationAxis(
    dragVector: THREE.Vector3,
    faceNormal: THREE.Vector3,
  ) {
    const cross = new THREE.Vector3().crossVectors(dragVector, faceNormal);

    const absX = Math.abs(cross.x);
    const absY = Math.abs(cross.y);
    const absZ = Math.abs(cross.z);

    if (absX > absY && absX > absZ) {
      return "x";
    } else if (absY > absX && absY > absZ) {
      return "y";
    } else {
      return "z";
    }
  }

  private startRotation(dragVector: THREE.Vector3) {
    if (!this.interaction) return;

    const rotationAxis = this.getRotationAxis(
      dragVector,
      this.interaction.faceNormal,
    );

    const coords = this.cubeState.getCoordinatesOfId(
      this.interaction.hitCubeletId,
    );

    const layerIndex =
      rotationAxis === "x"
        ? coords.x
        : rotationAxis === "y"
          ? coords.y
          : coords.z;
    this.cubeState.startRotation(rotationAxis, layerIndex);
  }

  private updateRotation(dragVector: THREE.Vector3) {
    const rotation = this.cubeState.getRotation();
    if (!rotation || !this.interaction) return;

    const cross = new THREE.Vector3().crossVectors(
      this.interaction.faceNormal,
      dragVector,
    );

    const component =
      rotation.axis === "x"
        ? cross.x
        : rotation.axis === "y"
          ? cross.y
          : cross.z;

    const angle = component * 2;

    this.cubeState.updateRotation(angle);
  }

  private resetInteraction() {
    this.interaction = null;
    this.controls.enabled = true;
  }
}
