declare module "cubejs/lib/cube.js" {
  type CubeStateJson = {
    center: number[];
    cp: number[];
    co: number[];
    ep: number[];
    eo: number[];
  };

  export default class Cube {
    constructor(other?: Cube | CubeStateJson);

    static fromString(facelets: string): Cube;
    static initSolver(): void;

    asString(): string;
    clone(): Cube;
    move(algorithm: string): Cube;
    solveUpright(maxDepth?: number): string;
    upright(): string;
  }
}
