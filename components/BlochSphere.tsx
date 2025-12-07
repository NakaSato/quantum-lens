
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { QubitState } from '../types';

interface BlochSphereProps {
  state: QubitState;
  size?: number;
  onStateChange?: (newState: QubitState) => void;
}

const BlochSphere: React.FC<BlochSphereProps> = ({ state, size = 300, onStateChange }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const vectorRef = useRef<THREE.ArrowHelper | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  
  // Local state to support immediate drag interaction
  const [localState, setLocalState] = useState<QubitState>(state);

  // Sync local state when prop changes (e.g. circuit update)
  useEffect(() => {
    setLocalState(state);
  }, [state]);
  
  // Use a ref for the callback to avoid re-initializing the Three.js scene when the callback changes
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!mountRef.current) return;

    // Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(2, 1.5, 2);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.innerHTML = ''; // Clear previous
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false;

    // --- Objects ---

    // 1. Transparent Sphere
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x3b82f6, 
      transparent: true, 
      opacity: 0.1,
      wireframe: false 
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // 2. Wireframe / Grid Lines
    const wireframeMat = new THREE.MeshBasicMaterial({ color: 0x334155, wireframe: true, transparent: true, opacity: 0.3 });
    const wireframe = new THREE.Mesh(geometry, wireframeMat);
    scene.add(wireframe);

    // 3. Equator Ring
    const equatorGeo = new THREE.RingGeometry(0.98, 1.02, 64);
    const equatorMat = new THREE.MeshBasicMaterial({ color: 0x64748b, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const equator = new THREE.Mesh(equatorGeo, equatorMat);
    equator.rotation.x = Math.PI / 2;
    scene.add(equator);

    // 4. Axes Helpers
    const axesHelper = new THREE.AxesHelper(1.2);
    // Colors: X (Red), Y (Green), Z (Blue) by default in Three.js
    // Mapping: Bloch Z -> Three Y (Up), Bloch X -> Three X (Right), Bloch Y -> Three Z (Forward)
    scene.add(axesHelper);

    // 5. Vector Arrow (The State)
    const dir = new THREE.Vector3(0, 1, 0); // Start at |0> (Up)
    const origin = new THREE.Vector3(0, 0, 0);
    const length = 1.1; // Slightly longer than sphere radius
    const hex = 0xf43f5e; // Rose color
    const arrowHelper = new THREE.ArrowHelper(dir, origin, length, hex, 0.25, 0.15); // Slightly thicker head
    scene.add(arrowHelper);
    vectorRef.current = arrowHelper;

    // 6. Pole Markers
    const poleGeo = new THREE.SphereGeometry(0.05);
    const poleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const northPole = new THREE.Mesh(poleGeo, poleMat);
    northPole.position.set(0, 1, 0);
    scene.add(northPole);

    const southPole = new THREE.Mesh(poleGeo, poleMat);
    southPole.position.set(0, -1, 0);
    scene.add(southPole);

    // 7. Interaction Sphere (Invisible hit target for raycasting)
    // Slightly larger than visual sphere to capture clicks easily
    const interactionGeo = new THREE.SphereGeometry(1.05, 32, 32); 
    const interactionMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    const interactionMesh = new THREE.Mesh(interactionGeo, interactionMat);
    scene.add(interactionMesh);

    // --- Interaction Logic ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;

    const updateStateFromIntersection = (event: PointerEvent | MouseEvent) => {
      if (!renderer.domElement) return false;
      
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(interactionMesh);

      if (intersects.length > 0) {
        const point = intersects[0].point.normalize();
        
        // Reverse Mapping: Three.js (x, y, z) -> Bloch (theta, phi)
        // Three Y is Up (Bloch Z) => cos(theta) = y
        const theta = Math.acos(Math.max(-1, Math.min(1, point.y)));
        
        // Three X is Right, Three Z is Forward
        // x = sin(theta)cos(phi)
        // z = sin(theta)sin(phi)
        // phi = atan2(z, x)
        let phi = Math.atan2(point.z, point.x);
        if (phi < 0) phi += 2 * Math.PI;

        const p0 = Math.cos(theta / 2) ** 2;
        const p1 = Math.sin(theta / 2) ** 2;

        const newState = {
          theta,
          phi,
          probabilityZero: p0,
          probabilityOne: p1
        };

        // Update local state immediately for responsiveness
        setLocalState(newState);

        // Notify parent
        if (onStateChangeRef.current) {
          onStateChangeRef.current(newState);
        }
        return true;
      }
      return false;
    };

    const onPointerDown = (e: PointerEvent) => {
      // Allow orbit controls with right click or secondary touch, only drag on left click (button 0)
      if (e.button !== 0) return;

      const hit = updateStateFromIntersection(e);
      if (hit) {
        isDragging = true;
        controls.enabled = false;
        renderer.domElement.style.cursor = 'grabbing';
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isDragging) {
        updateStateFromIntersection(e);
      } else {
        // Hover effect to indicate interactivity
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(interactionMesh);
        
        if (intersects.length > 0) {
            renderer.domElement.style.cursor = 'grab';
        } else {
            renderer.domElement.style.cursor = 'default';
        }
      }
    };

    const onPointerUp = () => {
      if (isDragging) {
        isDragging = false;
        controls.enabled = true;
        renderer.domElement.style.cursor = 'grab';
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    // Listen on window for move/up to catch drags leaving the canvas
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Animation Loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [size]);

  // Update State Vector Arrow based on localState (Visuals reflect drag instantly)
  useEffect(() => {
    if (!vectorRef.current) return;

    // Convert Spherical (Physics) to Cartesian (Three.js)
    // Bloch Sphere Convention: Z-axis is Up (|0>), X is Forward/Right.
    // Three.js Convention: Y is Up.
    
    // theta is angle from Up (Y)
    const y = Math.cos(localState.theta);
    // Projection on XZ plane is sin(theta)
    const sinTheta = Math.sin(localState.theta);
    
    const x = sinTheta * Math.cos(localState.phi);
    const z = sinTheta * Math.sin(localState.phi);

    const direction = new THREE.Vector3(x, y, z).normalize();
    vectorRef.current.setDirection(direction);

  }, [localState]);

  return (
    <div className="flex flex-col items-center justify-center p-2">
      {/* 3D Container Wrapper with Explicit Size */}
      <div className="relative group" style={{ width: size, height: size }}>
          {/* Canvas Mount */}
          <div 
            ref={mountRef} 
            className="w-full h-full rounded-full border border-slate-800 bg-slate-900/50 shadow-inner group-hover:border-cyan-500/30 transition-colors" 
            title="Drag vector to set state, or drag background to rotate view" 
          />
          
          {/* Labels - Positioned relative to the sized container */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-slate-200 font-bold text-sm pointer-events-none drop-shadow-md">|0⟩</div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-slate-200 font-bold text-sm pointer-events-none drop-shadow-md">|1⟩</div>
      </div>

      {/* Info Box - Separate flow content */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono text-slate-400 bg-slate-900/80 p-3 rounded-lg border border-slate-800 backdrop-blur-sm w-full max-w-[240px]">
        <div>
           <span className="text-slate-500">θ:</span> {localState.theta.toFixed(2)}
        </div>
        <div>
           <span className="text-slate-500">φ:</span> {localState.phi.toFixed(2)}
        </div>
        <div>
           <span className="text-blue-400">P|0⟩:</span> {(localState.probabilityZero * 100).toFixed(0)}%
        </div>
        <div>
           <span className="text-rose-400">P|1⟩:</span> {(localState.probabilityOne * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
};

export default BlochSphere;
