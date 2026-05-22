import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { CubeInteractionController } from "./CubeInteractionController";
import { CubeState } from "./CubeState";
import { Cube } from "./Cube";
import { CircleDiagram } from "./CircleDiagram";
import "./style.css";

class BasicWorldDemo {
  private cubeState: CubeState;
  private renderer: THREE.WebGLRenderer;
  private circleRenderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private circleScene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private circleCamera: THREE.OrthographicCamera;
  private controls: OrbitControls;
  private cube: Cube;
  private circleDiagram: CircleDiagram;

  private interaction: CubeInteractionController;

  constructor() {
    this.cubeState = new CubeState();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.renderer.domElement.id = "cubeView";
    document.body.appendChild(this.renderer.domElement);

    this.circleRenderer = new THREE.WebGLRenderer({
      antialias: true,
    });
    this.circleRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.circleRenderer.setClearColor(0x000000, 1);
    this.circleRenderer.setPixelRatio(window.devicePixelRatio);
    this.circleRenderer.domElement.id = "circleDiagramView";
    document.body.appendChild(this.circleRenderer.domElement);

    window.addEventListener(
      "resize",
      () => {
        this.onWindowResize();
      },
      false,
    );

    const fov = 45;
    const aspect = 1920 / 1080;
    const near = 1.0;
    const far = 1000.0;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.camera.position.set(75, 20, 0);

    this.scene = new THREE.Scene();
    this.circleScene = new THREE.Scene();
    this.circleScene.background = new THREE.Color(0x000000);
    this.cube = new Cube(this.scene, this.cubeState);
    this.scene.add(this.camera);

    const axesHelper = new THREE.AxesHelper(5); // size = length of axes
    this.scene.add(axesHelper);

    this.circleCamera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    this.circleCamera.position.set(0, 0, 10);
    this.circleCamera.lookAt(0, 0, 0);
    this.circleScene.add(this.circleCamera);

    this.circleDiagram = new CircleDiagram(this.cubeState);
    this.circleScene.add(this.circleDiagram.object3d);
    this.resizeCircleRenderer();

    // this.circleDiagram.addIntersectionDebugPoints();

    let directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight1.position.set(20, 20, 10);
    directionalLight1.target.position.set(0, 0, 0);
    directionalLight1.castShadow = true;
    directionalLight1.shadow.bias = -0.001;
    directionalLight1.shadow.mapSize.width = 2048;
    directionalLight1.shadow.mapSize.height = 2048;
    directionalLight1.shadow.camera.near = 0.1;
    directionalLight1.shadow.camera.far = 500.0;
    directionalLight1.shadow.camera.near = 0.5;
    directionalLight1.shadow.camera.far = 500.0;
    directionalLight1.shadow.camera.left = 100;
    directionalLight1.shadow.camera.right = -100;
    directionalLight1.shadow.camera.top = 100;
    directionalLight1.shadow.camera.bottom = -100;
    this.scene.add(directionalLight1);

    let directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight2.position.set(-20, -20, -10);
    directionalLight2.target.position.set(0, 0, 0);
    directionalLight2.castShadow = true;
    directionalLight2.shadow.bias = -0.001;
    directionalLight2.shadow.mapSize.width = 2048;
    directionalLight2.shadow.mapSize.height = 2048;
    directionalLight2.shadow.camera.near = 0.1;
    directionalLight2.shadow.camera.far = 500.0;
    directionalLight2.shadow.camera.near = 0.5;
    directionalLight2.shadow.camera.far = 500.0;
    directionalLight2.shadow.camera.left = 100;
    directionalLight2.shadow.camera.right = -100;
    directionalLight2.shadow.camera.top = 100;
    directionalLight2.shadow.camera.bottom = -100;
    this.scene.add(directionalLight2);

    const ambientLight = new THREE.AmbientLight(0x101010);
    this.scene.add(ambientLight);

    const circleAmbientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.circleScene.add(circleAmbientLight);

    const circleDirectionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    circleDirectionalLight.position.set(0, 0, 10);
    this.circleScene.add(circleDirectionalLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.update();

    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([
      "./resources/posX.jpg",
      "./resources/negX.jpg",
      "./resources/posY.jpg",
      "./resources/negY.jpg",
      "./resources/posZ.jpg",
      "./resources/negZ.jpg",
    ]);
    this.scene.background = texture;

    this.controls.target.set(0, 0, 0);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 10;

    this.interaction = new CubeInteractionController(
      this.camera,
      this.renderer.domElement,
      this.controls,
      this.cubeState,
      this.cube,
    );

    this.interaction.attach();
    this.requestAnimationFrame();

    document.getElementById("spinBtn")?.addEventListener("click", () => {
      this.cubeState.requestMove("x", 0, 1);
    });

    document.getElementById("debugModeBtn")?.addEventListener("click", () => {
      this.cubeState.setDebugMode(!this.cubeState.getDebugMode());
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.resizeCircleRenderer();
  }

  private resizeCircleRenderer() {
    const rect = this.circleRenderer.domElement.getBoundingClientRect();
    this.circleRenderer.setSize(rect.width, rect.height, false);

    const aspect = rect.width / rect.height;
    const viewSize = 7;

    this.circleCamera.left = (-viewSize * aspect) / 2;
    this.circleCamera.right = (viewSize * aspect) / 2;
    this.circleCamera.top = viewSize / 2;
    this.circleCamera.bottom = -viewSize / 2;
    this.circleCamera.updateProjectionMatrix();
  }

  requestAnimationFrame() {
    requestAnimationFrame(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.circleRenderer.render(this.circleScene, this.circleCamera);
      this.requestAnimationFrame();
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new BasicWorldDemo();
});
