import SolverCube from "cubejs/lib/cube.js";
import solverSource from "cubejs/lib/solve.js?raw";
import type { Axis, CubeState, Face } from "./CubeState";

export type SolverMove = {
  axis: Axis;
  layerIndex: number;
  turns: number;
};

type SolverFace = "U" | "R" | "F" | "D" | "L" | "B";
type WholeCubeRotation = "x" | "y" | "z";

const SOLVED_FACELETS =
  "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

const SOLVER_FACE_ORDER: SolverFace[] = ["U", "R", "F", "D", "L", "B"];

const SOLVER_FACE_TO_PROJECT_FACE: Record<SolverFace, Face> = {
  U: "YP",
  R: "XP",
  F: "ZP",
  D: "YN",
  L: "XN",
  B: "ZN",
};

const PROJECT_FACE_TO_SOLVER_COLOR: Record<Face, SolverFace> = {
  YP: "U",
  XP: "R",
  ZP: "F",
  YN: "D",
  XN: "L",
  ZN: "B",
};

const FACELET_TRANSFORMS: Record<
  SolverFace,
  (row: number, column: number) => [number, number]
> = {
  U: (row, column) => [2 - row, column],
  R: (row, column) => [column, row],
  F: (row, column) => [2 - row, column],
  D: (row, column) => [2 - row, column],
  L: (row, column) => [2 - column, 2 - row],
  B: (row, column) => [row, 2 - column],
};

const OUTER_FACE_MOVES: Record<
  SolverFace,
  { axis: Axis; layerIndex: number; turnSign: 1 | -1 }
> = {
  U: { axis: "y", layerIndex: 2, turnSign: -1 },
  R: { axis: "x", layerIndex: 2, turnSign: -1 },
  F: { axis: "z", layerIndex: 2, turnSign: -1 },
  D: { axis: "y", layerIndex: 0, turnSign: 1 },
  L: { axis: "x", layerIndex: 0, turnSign: 1 },
  B: { axis: "z", layerIndex: 0, turnSign: 1 },
};

const WHOLE_CUBE_TURN_SIGN = -1;

let solverInitialized = false;
let solverMethodsInstalled = false;

export function solveCubeState(cubeState: CubeState): SolverMove[] {
  const facelets = getSolverFacelets(cubeState);

  if (facelets === SOLVED_FACELETS) {
    return [];
  }

  ensureSolverInitialized();

  const cube = SolverCube.fromString(facelets);
  const upright = cube.upright();
  const uprightCube = cube.clone();
  uprightCube.move(upright);

  const solution =
    uprightCube.asString() === SOLVED_FACELETS
      ? ""
      : uprightCube.solveUpright();

  return parseAlgorithm([upright, solution].filter(Boolean).join(" "));
}

function ensureSolverInitialized() {
  if (solverInitialized) {
    return;
  }

  installSolverMethods();
  SolverCube.initSolver();
  solverInitialized = true;
}

function installSolverMethods() {
  if (solverMethodsInstalled) {
    return;
  }

  const install = Function(solverSource) as (this: {
    Cube: typeof SolverCube;
  }) => void;

  install.call({ Cube: SolverCube });
  solverMethodsInstalled = true;
}

function getSolverFacelets(cubeState: CubeState): string {
  let facelets = "";

  for (const solverFace of SOLVER_FACE_ORDER) {
    const projectFace = SOLVER_FACE_TO_PROJECT_FACE[solverFace];
    const transform = FACELET_TRANSFORMS[solverFace];

    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const [projectRow, projectColumn] = transform(row, column);
        const sticker = cubeState.getStickerAtFace(
          projectFace,
          projectRow,
          projectColumn,
        );

        if (!sticker) {
          throw new Error(`Missing sticker on ${projectFace}`);
        }

        facelets += PROJECT_FACE_TO_SOLVER_COLOR[sticker.originalFace];
      }
    }
  }

  return facelets;
}

function parseAlgorithm(algorithm: string): SolverMove[] {
  if (!algorithm.trim()) {
    return [];
  }

  return algorithm
    .trim()
    .split(/\s+/)
    .flatMap((token) => parseToken(token));
}

function parseToken(token: string): SolverMove[] {
  const face = token[0];
  const turns = getTokenTurns(token);

  if (isSolverFace(face)) {
    const move = OUTER_FACE_MOVES[face];

    return [
      {
        axis: move.axis,
        layerIndex: move.layerIndex,
        turns: turns * move.turnSign,
      },
    ];
  }

  if (isWholeCubeRotation(face)) {
    return [0, 1, 2].map((layerIndex) => ({
      axis: face,
      layerIndex,
      turns: turns * WHOLE_CUBE_TURN_SIGN,
    }));
  }

  throw new Error(`Unsupported solver move: ${token}`);
}

function getTokenTurns(token: string): number {
  const suffix = token[1];

  if (suffix === "2") {
    return 2;
  }

  if (suffix === "'") {
    return -1;
  }

  return 1;
}

function isSolverFace(value: string): value is SolverFace {
  return SOLVER_FACE_ORDER.includes(value as SolverFace);
}

function isWholeCubeRotation(value: string): value is WholeCubeRotation {
  return value === "x" || value === "y" || value === "z";
}
