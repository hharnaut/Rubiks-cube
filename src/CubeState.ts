import { makeAutoObservable } from "mobx";

export type Axis = "x" | "y" | "z";

export type RotationStatus = "dragging" | "snapping" | "animating";
export type RotationState = {
  readonly axis: Axis;
  readonly layerIndex: number;
  readonly angle: number;
  readonly status: RotationStatus;
  readonly turns: number;
};

export type Face = "ZP" | "ZN" | "XN" | "XP" | "YP" | "YN";

const FACE_COLORS: Record<Face, number> = {
  ZP: 0xffffff, // white
  ZN: 0xffff00, // yellow
  XN: 0xff8000, // orange
  XP: 0xff0000, // red
  YP: 0x00ff00, // green
  YN: 0x0000ff, // blue
};

export function getFaceColor(face: Face): number {
  return FACE_COLORS[face];
}

export function getAxisFromFace(face: Face): Axis {
  switch (face) {
    case "XP":
    case "XN":
      return "x";

    case "YP":
    case "YN":
      return "y";

    case "ZP":
    case "ZN":
      return "z";
  }
}

export type Sticker = {
  id: string;
  originalFace: Face;
};

export type Cell = {
  id: number;
  stickers: Array<Sticker | null>;
};

export class CubeState {
  private grid: Cell[][][]; // store IDs instead of objects
  private rotation: RotationState | null = null;
  private debugMode: boolean = false;

  constructor() {
    this.grid = this.createSolvedGrid();
    makeAutoObservable(this);
  }

  private createSolvedGrid(): Cell[][][] {
    let id = 0;

    let cells: Cell[][][] = Array.from({ length: 3 }, () =>
      Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({
          id: id++,
          stickers: Array<Sticker>(),
        })),
      ),
    );

    id = 0;
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          cells[x][y][z].stickers.push(
            x === 1
              ? null
              : {
                  id: `${x == 0 ? "XN" : "XP"}-${y}-${x == 0 ? z : 2 - z}`,
                  originalFace: x == 0 ? "XN" : "XP",
                },
          );
          cells[x][y][z].stickers.push(
            y === 1
              ? null
              : {
                  id: `${y == 0 ? "YN" : "YP"}-${x}-${y == 0 ? z : 2 - z}`,
                  originalFace: y == 0 ? "YN" : "YP",
                },
          );
          cells[x][y][z].stickers.push(
            z === 1
              ? null
              : {
                  id: `${z == 0 ? "ZN" : "ZP"}-${z == 0 ? 2 - x : x}-${y}`,
                  originalFace: z == 0 ? "ZN" : "ZP",
                },
          );
        }
      }
    }

    return cells;
  }

  rotate(axis: Axis, layerIndex: number, direction: 1 | -1) {
    const newLayer: Cell[][] = [[], [], []];

    const rotateStickers = (
      stickers: Array<Sticker | null>,
    ): Array<Sticker | null> => {
      const [sx, sy, sz] = stickers;

      if (axis === "z") {
        // X <-> Y
        return [sy, sx, sz];
      }

      if (axis === "x") {
        // Y <-> Z
        return [sx, sz, sy];
      }

      if (axis === "y") {
        // X <-> Z
        return [sz, sy, sx];
      }

      return stickers;
    };

    if (axis === "z") {
      // rotate XY plane at z = layerIndex
      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          const source =
            direction === -1
              ? this.grid[2 - y][x][layerIndex]
              : this.grid[y][2 - x][layerIndex];

          newLayer[x][y] = {
            ...source,
            stickers: rotateStickers(source.stickers),
          };
        }
      }

      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          this.grid[x][y][layerIndex] = newLayer[x][y];
        }
      }
    } else if (axis === "x") {
      // rotate YZ plane at x = layerIndex
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          const source =
            direction === -1
              ? this.grid[layerIndex][2 - z][y]
              : this.grid[layerIndex][z][2 - y];

          newLayer[y][z] = {
            ...source,
            stickers: rotateStickers(source.stickers),
          };
        }
      }

      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          this.grid[layerIndex][y][z] = newLayer[y][z];
        }
      }
    } else if (axis === "y") {
      // rotate XZ plane at y = layerIndex
      for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
          const source =
            direction === -1
              ? this.grid[z][layerIndex][2 - x]
              : this.grid[2 - z][layerIndex][x];

          newLayer[x][z] = {
            ...source,
            stickers: rotateStickers(source.stickers),
          };
        }
      }

      for (let x = 0; x < 3; x++) {
        for (let z = 0; z < 3; z++) {
          this.grid[x][layerIndex][z] = newLayer[x][z];
        }
      }
    }
  }
  getIdAt(x: number, y: number, z: number): number {
    return this.grid[x][y][z].id;
  }

  getCoordinatesOfId(targetId: number): { x: number; y: number; z: number } {
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          if (this.grid[x][y][z].id === targetId) {
            return { x, y, z };
          }
        }
      }
    }

    throw new Error(`Id ${targetId} not found in grid`);
  }

  getStickerAt(x: number, y: number, z: number, axis: Axis): Sticker | null {
    const cell = this.grid[x][y][z];

    if (axis === "x") {
      return cell.stickers[0];
    }

    if (axis === "y") {
      return cell.stickers[1];
    }

    return cell.stickers[2];
  }

  getStickerAtFace(face: Face, i: number, j: number): Sticker | null {
    switch (face) {
      case "YP": {
        const x = j;
        const y = 2;
        const z = 2 - i;
        return this.getStickerAt(x, y, z, "y");
      }

      case "YN": {
        const x = j;
        const y = 0;
        const z = i;
        return this.getStickerAt(x, y, z, "y");
      }

      case "ZN": {
        const x = j;
        const y = 2 - i;
        const z = 0;
        return this.getStickerAt(x, y, z, "z");
      }

      case "ZP": {
        const x = j;
        const y = i;
        const z = 2;
        return this.getStickerAt(x, y, z, "z");
      }

      case "XP": {
        const x = 2;
        const y = 2 - j;
        const z = 2 - i;
        return this.getStickerAt(x, y, z, "x");
      }

      case "XN": {
        const x = 0;
        const y = j;
        const z = 2 - i;
        return this.getStickerAt(x, y, z, "x");
      }
    }
  }

  startRotation(axis: Axis, layerIndex: number) {
    this.rotation = {
      axis,
      layerIndex,
      angle: 0,
      status: "dragging",
      turns: 0,
    };
  }

  updateRotation(angle: number) {
    if (!this.rotation) return;
    this.rotation = { ...this.rotation, angle };
  }

  finishRotation() {
    this.rotation = null;
  }

  getRotation(): RotationState | null {
    return this.rotation;
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }

  setDebugMode(value: boolean) {
    this.debugMode = value;
  }

  requestSnap() {
    if (!this.rotation) return;
    this.rotation = { ...this.rotation, status: "snapping" };
  }

  applyMove(axis: Axis, layerIndex: number, turns: number) {
    if (turns === 0) return;

    // normalize to range [-2, 2]
    let t = ((turns % 4) + 4) % 4; // 0..3

    if (t === 3) {
      t = -1;
    }

    const direction = Math.sign(t) as -1 | 1;

    for (let i = 0; i < Math.abs(t); i++) {
      this.rotate(axis, layerIndex, direction);
    }
  }

  requestMove(axis: Axis, layerIndex: number, turns: number) {
    if (this.rotation) {
      return;
    }
    this.rotation = { axis, layerIndex, turns, status: "animating", angle: 0 };
  }
}
