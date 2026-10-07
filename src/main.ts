import * as THREE from 'three';

const canvas = document.querySelector<HTMLCanvasElement>('#app')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 0, 5);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.3 }),
);
scene.add(cube);
scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 2));
const key = new THREE.DirectionalLight(0xffffff, 2);
key.position.set(2, 3, 4);
scene.add(key);

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((t) => {
  cube.rotation.set(t * 0.0004, t * 0.0007, 0);
  renderer.render(scene, camera);
});
