import { initHaptic, triggerHaptic, triggerHapticError } from "./haptic.js";

initHaptic();

// --- CONFIGURATION ---
const config = {
  rotationSpeed: 0.01,
  vertexCount: 14, // Starting vertex count for Level 1
  cameraDistance: 4.2,
  gameDuration: 60,
  matchesToLevelUp: 5,
  baseShapes: ["Box", "Sphere", "Octahedron", "Dodecahedron", "Icosahedron"],
};

const tubeSettings = {
  default: { radius: 0.08 },
  selected: { color: new THREE.Color(0x268bd2), radius: 0.1 },
  incorrect: { color: new THREE.Color(0xdc322f), radius: 0.1 },
};

const solarizedPalette = [
  0x2aa198, // cyan
  0xd33682, // magenta
  0x6c71c4, // violet
  0xb58900, // yellow
  0x859900, // green
  0xcb4b16, // orange
  0x268bd2, // blue
].map((c) => new THREE.Color(c));

// --- GAME STATE VARIABLES ---
let scenes = [],
  cameras = [],
  renderers = [],
  figures = [];
let selections = [];
let isRoundOver = false;
let timerId,
  timeLeft,
  score,
  isPaused,
  isGameStarted = false;
let level, matchesThisLevel;

// --- DOM ELEMENTS ---
const introScreen = document.getElementById("intro-screen");
const endScreen = document.getElementById("end-screen");
const gameUi = document.getElementById("game-ui");
const pauseOverlay = document.getElementById("pause-overlay");
const grid = document.getElementById("figures-grid");
const timerDisplay = document.getElementById("timer");
const scoreDisplay = document.getElementById("score-display");
const levelDisplay = document.getElementById("level-display");
const finalScoreDisplay = document.getElementById("final-score");

// --- INITIALIZATION ---
introScreen.addEventListener("click", startGame);
endScreen.addEventListener("click", startGame);
timerDisplay.addEventListener("click", togglePause);
pauseOverlay.addEventListener("click", togglePause); // Unpause by clicking overlay

function startGame() {
  triggerHaptic();
  isGameStarted = true;
  isPaused = false;
  score = 0;
  level = 1;
  matchesThisLevel = 0;
  config.vertexCount = config.vertexCount;
  timeLeft = config.gameDuration;
  introScreen.classList.add("hidden");
  endScreen.classList.add("hidden");
  pauseOverlay.classList.add("hidden");
  gameUi.classList.remove("hidden");
  updateScoreDisplay();
  updateLevelDisplay();
  startTimer();
  setupRound();
  animate();
}

function setupRound() {
  clearGrid();
  isRoundOver = false;

  const numLines = config.vertexCount / 2;
  const paletteSize = solarizedPalette.length;
  const roundColors = [];

  // Loop to build the color palette for the round, repeating if necessary
  for (let i = 0; i < numLines; i++) {
    roundColors.push(solarizedPalette[i % paletteSize]);
  }

  const figureData = config.baseShapes.map((shapeName) => {
    const baseGeometry = createBaseGeometry(shapeName);
    const vertices = samplePointsOnSurface(baseGeometry, config.vertexCount);
    const colors = shuffleArray([...roundColors]);
    baseGeometry.dispose();
    return { shapeName, vertices, colors };
  });

  const shapeToDuplicate =
    figureData[Math.floor(Math.random() * figureData.length)];

  const roundFigures = shuffleArray([
    ...figureData,
    {
      ...shapeToDuplicate,
      vertices: shapeToDuplicate.vertices.slice(),
      colors: shapeToDuplicate.colors.slice(),
    },
  ]).map((data) => ({
    ...data,
    initialRotation: new THREE.Euler(
      Math.random() * 2 * Math.PI,
      Math.random() * 2 * Math.PI,
      Math.random() * 2 * Math.PI,
    ),
  }));

  for (let i = 0; i < 6; i++) {
    const data = roundFigures[i];
    const container = document.createElement("div");
    container.classList.add("figure-container");
    container.dataset.shape = data.shapeName;
    container.dataset.id = i;
    grid.appendChild(container);
    initThreeScene(
      container,
      i,
      data.vertices,
      data.colors,
      data.initialRotation,
    );
    container.addEventListener("click", handleFigureClick);
  }
  requestAnimationFrame(() => {
    const allContainers = grid.querySelectorAll(".figure-container");
    allContainers.forEach((container) => container.classList.add("visible"));
  });
}

function initThreeScene(container, index, vertices, colors, initialRotation) {
  scenes[index] = new THREE.Scene();
  cameras[index] = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    1000,
  );
  cameras[index].position.z = config.cameraDistance;

  renderers[index] = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderers[index].setSize(container.clientWidth, container.clientHeight);
  renderers[index].setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderers[index].domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scenes[index].add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 1);
  scenes[index].add(directionalLight);

  const figureGroup = new THREE.Group();

  for (let i = 0; i < vertices.length; i += 2) {
    const p1 = vertices[i];
    const p2 = vertices[i + 1];
    const color = colors[i / 2];
    const lineGroup = createCapsule(p1, p2, tubeSettings.default.radius, color);
    figureGroup.add(lineGroup);
  }

  figures[index] = figureGroup;
  figures[index].rotation.copy(initialRotation);
  scenes[index].add(figures[index]);
}

function createCapsule(p1, p2, radius, color) {
  const path = new THREE.LineCurve3(p1, p2);
  const tubeGeometry = new THREE.TubeGeometry(path, 1, radius, 8, false);
  const sphereGeometry = new THREE.SphereGeometry(radius, 16, 16);

  const material = new THREE.MeshStandardMaterial({
    color: color,
    metalness: 0.1,
    roughness: 0.5,
  });

  const tubeMesh = new THREE.Mesh(tubeGeometry, material);
  const sphere1 = new THREE.Mesh(sphereGeometry, material);
  const sphere2 = new THREE.Mesh(sphereGeometry, material);
  sphere1.position.copy(p1);
  sphere2.position.copy(p2);

  const lineGroup = new THREE.Group();
  lineGroup.add(tubeMesh, sphere1, sphere2);
  lineGroup.userData.originalColor = color;
  lineGroup.userData.path = path;
  return lineGroup;
}

function createBaseGeometry(shapeName) {
  switch (shapeName) {
    case "Sphere":
      return new THREE.SphereGeometry(2.4, 32, 32);
    case "Octahedron":
      return new THREE.OctahedronGeometry(2.6, 0);
    case "Dodecahedron":
      return new THREE.DodecahedronGeometry(2.6, 0);
    case "Icosahedron":
      return new THREE.IcosahedronGeometry(2.6, 0);
    case "Box":
    default:
      return new THREE.BoxGeometry(3.3, 3.3, 3.3);
  }
}

function samplePointsOnSurface(geometry, pointCount) {
  const nonIndexedGeom = geometry.toNonIndexed();
  const position = nonIndexedGeom.getAttribute("position");
  const numFaces = position.count / 3;
  const points = [];
  const p1 = new THREE.Vector3(),
    p2 = new THREE.Vector3(),
    p3 = new THREE.Vector3();
  for (let i = 0; i < pointCount; i++) {
    const faceIndex = Math.floor(Math.random() * numFaces);
    p1.fromBufferAttribute(position, faceIndex * 3 + 0);
    p2.fromBufferAttribute(position, faceIndex * 3 + 1);
    p3.fromBufferAttribute(position, faceIndex * 3 + 2);
    let r1 = Math.random(),
      r2 = Math.random();
    if (r1 + r2 > 1) {
      r1 = 1 - r1;
      r2 = 1 - r2;
    }
    const point = new THREE.Vector3()
      .addScaledVector(p1, 1 - r1 - r2)
      .addScaledVector(p2, r1)
      .addScaledVector(p3, r2);
    points.push(point);
  }
  nonIndexedGeom.dispose();
  return points;
}

function handleFigureClick(event) {
  triggerHaptic();
  if (isRoundOver || isPaused || selections.length >= 2) return;
  const container = event.currentTarget;
  const id = parseInt(container.dataset.id);
  if (selections.some((sel) => sel.id === id)) return;

  updateFigureLook(figures[id], tubeSettings.selected);
  selections.push({ shape: container.dataset.shape, id: id });
  if (selections.length === 2) {
    checkMatch();
  }
}

function updateFigureLook(figureGroup, setting, revertToOriginal = false) {
  figureGroup.children.forEach((lineGroup) => {
    const newRadius = setting.radius;
    const newColor = revertToOriginal
      ? lineGroup.userData.originalColor
      : setting.color;

    lineGroup.children.forEach((mesh) => {
      if (mesh.geometry.type === "TubeGeometry") {
        const newGeo = new THREE.TubeGeometry(
          lineGroup.userData.path,
          1,
          newRadius,
          8,
          false,
        );
        mesh.geometry.dispose();
        mesh.geometry = newGeo;
      } else if (mesh.geometry.type === "SphereGeometry") {
        const newGeo = new THREE.SphereGeometry(newRadius, 16, 16);
        mesh.geometry.dispose();
        mesh.geometry = newGeo;
      }
      mesh.material.color.set(newColor);
    });
  });
}

function checkMatch() {
  isRoundOver = true;
  const [first, second] = selections;
  const isMatch = first.shape === second.shape;

  if (isMatch) {
    score++;
    matchesThisLevel++;
    updateScoreDisplay();

    if (matchesThisLevel >= config.matchesToLevelUp) {
      level++;
      matchesThisLevel = 0;
      config.vertexCount += 2;
      timeLeft = config.gameDuration;
      updateLevelDisplay();
    }

    const allContainers = grid.querySelectorAll(".figure-container");

    // --- The Fix ---
    // This function will set up the next round.
    const setupNextRound = () => {
      // Remove the listener to prevent it from firing again accidentally
      allContainers[0].removeEventListener("transitionend", setupNextRound);
      setupRound();
    };

    // Listen for the transition to end on the first container.
    // When it finishes, it will call our function to set up the next round.
    allContainers[0].addEventListener("transitionend", setupNextRound, {
      once: true,
    });

    // Now, trigger the fade-out by removing the .visible class.
    allContainers.forEach((container) => container.classList.remove("visible"));
  } else {
    triggerHapticError();
    const firstFigure = figures[first.id];
    const secondFigure = figures[second.id];
    const firstContainer = grid.children[first.id];
    const secondContainer = grid.children[second.id];

    programmaticShake(firstContainer);
    programmaticShake(secondContainer);

    updateFigureLook(firstFigure, tubeSettings.incorrect);
    updateFigureLook(secondFigure, tubeSettings.incorrect);

    setTimeout(() => {
      if (figures[first.id] && figures[second.id]) {
        updateFigureLook(firstFigure, tubeSettings.default, true);
      }
      if (figures[second.id]) {
        // Add a check in case it was cleared
        updateFigureLook(secondFigure, tubeSettings.default, true);
      }
      selections = [];
      isRoundOver = false;
    }, 500);
  }
}

function programmaticShake(element) {
  element.classList.add("shake");
  // Remove the class after the animation completes
  setTimeout(() => {
    element.classList.remove("shake");
  }, 400); // Duration must match the animation in style.css
}

function startTimer() {
  clearInterval(timerId);
  updateTimerDisplay();
  timerId = setInterval(() => {
    if (!isPaused) {
      timeLeft--;
      updateTimerDisplay();
      if (timeLeft <= 0) {
        endGame();
      }
    }
  }, 1000);
}

function togglePause() {
  triggerHaptic();
  if (!isGameStarted || timeLeft <= 0) return;
  isPaused = !isPaused;
  pauseOverlay.classList.toggle("hidden", !isPaused);
}

function endGame() {
  clearInterval(timerId);
  isGameStarted = false;
  gameUi.classList.add("hidden");
  finalScoreDisplay.textContent = score;
  endScreen.classList.remove("hidden");
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function updateScoreDisplay() {
  scoreDisplay.textContent = score;
}

function updateLevelDisplay() {
  levelDisplay.textContent = `L${level}`;
}

let animationFrameId;
function animate() {
  animationFrameId = requestAnimationFrame(animate);
  if (isPaused || !isGameStarted) return;

  for (let i = 0; i < figures.length; i++) {
    if (figures[i] && renderers[i]) {
      figures[i].rotation.x += config.rotationSpeed;
      figures[i].rotation.y += config.rotationSpeed * 1.5;
      renderers[i].render(scenes[i], cameras[i]);
    }
  }
}

function clearGrid() {
  grid.innerHTML = "";
  selections = [];
  scenes.forEach((scene) => {
    while (scene.children.length > 0) {
      const obj = scene.children[0];
      scene.remove(obj);
      if (obj.isMesh || obj.isGroup) {
        obj.traverse((child) => {
          if (child.isMesh) {
            child.geometry.dispose();
            child.material.dispose();
          }
        });
      }
    }
  });
  renderers.forEach((renderer) => renderer.dispose());
  scenes.length = 0;
  cameras.length = 0;
  renderers.length = 0;
  figures.length = 0;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

window.addEventListener("resize", () => {
  for (let i = 0; i < grid.children.length; i++) {
    const container = grid.children[i];
    if (container && cameras[i] && renderers[i]) {
      const width = container.clientWidth;
      const height = container.clientHeight;
      cameras[i].aspect = width / height;
      cameras[i].updateProjectionMatrix();
      renderers[i].setSize(width, height);
    }
  }
});
