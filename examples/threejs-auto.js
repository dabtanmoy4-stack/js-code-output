// Three.js is detected and loaded automatically when you press Run.
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10172a);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(3, 2, 5);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 2));
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 120, 16), new THREE.MeshStandardMaterial({color:0xffc857,metalness:0.6,roughness:0.25}));
scene.add(mesh);
function animate(){ requestAnimationFrame(animate); mesh.rotation.x += 0.006; mesh.rotation.y += 0.009; renderer.render(scene,camera); }
animate();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
