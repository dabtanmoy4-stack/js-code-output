// Babylon.js is detected and loaded automatically when you press Run.
const canvas = document.createElement('canvas');
canvas.style.cssText = 'width:100vw;height:100vh;display:block';
document.body.appendChild(canvas);
const engine = new BABYLON.Engine(canvas, true);
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.03,0.05,0.12,1);
const camera = new BABYLON.ArcRotateCamera('camera', -Math.PI/2, Math.PI/2.5, 7, BABYLON.Vector3.Zero(), scene);
camera.attachControl(canvas, true);
scene.addLight(new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0,1,0), scene));
const box = BABYLON.MeshBuilder.CreateBox('box', {size:2}, scene);
const mat = new BABYLON.StandardMaterial('mat', scene); mat.diffuseColor = new BABYLON.Color3(0.95,0.55,0.15); box.material = mat;
engine.runRenderLoop(()=>{box.rotation.y += 0.01; box.rotation.x += 0.004; scene.render()});
addEventListener('resize',()=>engine.resize());
