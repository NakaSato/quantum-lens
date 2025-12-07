
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Complex } from '../types';

interface QSphereProps {
  amplitudes: Complex[];
}

const QSphere: React.FC<QSphereProps> = ({ amplitudes }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [hoverData, setHoverData] = useState<{ label: string; prob: string; phase: string } | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const numStates = amplitudes.length;
    const numQubits = Math.log2(numStates);
    
    // Scene Setup
    const scene = new THREE.Scene();
    // scene.background = new THREE.Color(0x020617); // Match Slate 950

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 2, 4);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // --- Q-Sphere Geometry ---

    // 1. Core Sphere (Wireframe)
    const sphereGeo = new THREE.SphereGeometry(1.5, 32, 32);
    const sphereMat = new THREE.MeshBasicMaterial({ 
        color: 0x334155, 
        transparent: true, 
        opacity: 0.1, 
        wireframe: true 
    });
    const mainSphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(mainSphere);

    // 2. Axis Line
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 1.8, 0),
        new THREE.Vector3(0, -1.8, 0)
    ]);
    const axisMat = new THREE.LineBasicMaterial({ color: 0x475569, opacity: 0.5, transparent: true });
    const axisLine = new THREE.Line(axisGeo, axisMat);
    scene.add(axisLine);

    // Group to hold state nodes
    const nodeGroup = new THREE.Group();
    scene.add(nodeGroup);

    // Group to hold connecting lines
    const lineGroup = new THREE.Group();
    scene.add(lineGroup);

    // Helper: Hamming Weight
    const getHammingWeight = (n: number) => {
        let count = 0;
        while (n > 0) {
            n &= (n - 1);
            count++;
        }
        return count;
    };

    // Helper: Phase Color (HSL to Hex)
    const getPhaseColor = (complex: Complex) => {
        const phase = Math.atan2(complex.i, complex.r); // -PI to PI
        let hue = (phase * 180) / Math.PI;
        if (hue < 0) hue += 360;
        const color = new THREE.Color();
        color.setHSL(hue / 360, 1.0, 0.5);
        return color;
    };

    const nodes: THREE.Mesh[] = [];

    // --- Render Nodes ---
    // We group states by Hamming weight (layers)
    const layers: number[][] = Array.from({ length: numQubits + 1 }, () => []);
    
    amplitudes.forEach((_, idx) => {
        const hw = getHammingWeight(idx);
        layers[hw].push(idx);
    });

    layers.forEach((layerIndices, layerIdx) => {
        // Calculate Latitude (Z-like coordinate in Q-Sphere, usually Y in ThreeJS)
        // Map 0 -> North Pole (+Y), N -> South Pole (-Y)
        // Using equal spacing along the axis
        const t = layerIdx / numQubits; 
        const y = 1.5 * Math.cos(t * Math.PI); // 1.5 is radius
        const radiusAtY = 1.5 * Math.sin(t * Math.PI); // Radius of the ring at this latitude

        layerIndices.forEach((stateIdx, i) => {
            const amp = amplitudes[stateIdx];
            const prob = amp.r*amp.r + amp.i*amp.i;

            if (prob < 0.0001) return; // Skip zero prob states for visual clarity

            // Calculate Longitude (Angle around Y axis)
            // Distribute evenly
            const phi = (2 * Math.PI * i) / layerIndices.length;

            const x = radiusAtY * Math.cos(phi);
            const z = radiusAtY * Math.sin(phi);

            // Create Node
            const nodeSize = 0.05 + (prob * 0.25); // Scale size by probability
            const geometry = new THREE.SphereGeometry(nodeSize, 32, 32);
            const color = getPhaseColor(amp);
            
            const material = new THREE.MeshStandardMaterial({ 
                color: color,
                roughness: 0.1,
                metalness: 0.5,
                emissive: color,
                emissiveIntensity: 0.5
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            
            // Metadata for raycasting
            mesh.userData = {
                stateIdx,
                label: `|${stateIdx.toString(2).padStart(numQubits, '0')}⟩`,
                prob: (prob * 100).toFixed(1) + '%',
                phase: (Math.atan2(amp.i, amp.r) / Math.PI).toFixed(2) + 'π'
            };

            nodeGroup.add(mesh);
            nodes.push(mesh);

            // Draw line to origin (optional, helps see phase 0 vs phase PI differences in position?)
            // Standard QSphere connects Hamming distance neighbors, but that's expensive.
            // Let's draw a thin line to the center axis to anchor it visually.
            const connectorGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, y, 0),
                new THREE.Vector3(x, y, z)
            ]);
            const connectorMat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.3 });
            lineGroup.add(new THREE.Line(connectorGeo, connectorMat));
        });
    });

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    // Raycaster for Hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseMove = (event: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(nodes);

        if (intersects.length > 0) {
            const data = intersects[0].object.userData;
            setHoverData({
                label: data.label,
                prob: data.prob,
                phase: data.phase
            });
            document.body.style.cursor = 'pointer';
        } else {
            setHoverData(null);
            document.body.style.cursor = 'default';
        }
    };

    mountRef.current.addEventListener('mousemove', onMouseMove);

    // Animation
    const animate = () => {
        requestAnimationFrame(animate);
        controls.update();
        // nodeGroup.rotation.y += 0.002; // Slow rotation
        // lineGroup.rotation.y += 0.002;
        renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        if (mountRef.current) {
            mountRef.current.removeEventListener('mousemove', onMouseMove);
            if (renderer.domElement) mountRef.current.removeChild(renderer.domElement);
        }
        renderer.dispose();
    };
  }, [amplitudes]);

  return (
    <div className="w-full h-full relative group">
        <div ref={mountRef} className="w-full h-full cursor-move" />
        
        {/* Legend / HUD */}
        <div className="absolute top-4 left-4 bg-slate-900/80 border border-slate-700 p-3 rounded-lg backdrop-blur-sm pointer-events-none select-none">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">Q-Sphere</h4>
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                    <span className="text-[10px] text-slate-300">Lat: Hamming Weight</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                    <span className="text-[10px] text-slate-300">Size: Probability</span>
                </div>
                <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-gradient-to-r from-red-500 via-green-500 to-blue-500"></div>
                     <span className="text-[10px] text-slate-300">Color: Phase</span>
                </div>
            </div>
        </div>

        {/* Hover Tooltip */}
        {hoverData && (
             <div className="absolute bottom-4 right-4 bg-slate-900/90 border border-cyan-500/50 p-3 rounded-lg shadow-[0_0_15px_rgba(34,211,238,0.2)] backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
                 <div className="text-lg font-mono font-bold text-white mb-1">{hoverData.label}</div>
                 <div className="flex justify-between gap-4 text-xs font-mono text-slate-300">
                     <span>Prob: <span className="text-emerald-400">{hoverData.prob}</span></span>
                     <span>Phase: <span className="text-pink-400">{hoverData.phase}</span></span>
                 </div>
             </div>
        )}
    </div>
  );
};

export default QSphere;
