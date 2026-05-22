# Rubik

A quick attempt to build an interactive Rubik's Cube-like toy with Three.js.

This is a hobby project and an experiment more than a polished application. The
main goal was to see how far a small TypeScript/Three.js prototype could go:
rendering a cube, animating layer rotations, tracking cube state, and showing a
second "circle diagram" view of the same movements.

## What It Does

- Renders a 3D cube with draggable layer rotations.
- Keeps a logical cube state separate from the Three.js objects.
- Shows an independent circle-diagram view of the cube state.
- Supports animated shuffle.
- Supports animated undo, unwinding the move history back toward the original
  configuration.
- Includes a hidden debug mode in code for labels, axes, and colored diagram
  rings.

## Running Locally

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Notes

The code is intentionally compact and exploratory. Some parts are still very
prototype-shaped, especially the circle diagram logic and animation sequencing.
That is part of the spirit of the project: it was built quickly to try the idea,
learn from it, and make something fun to play with.
