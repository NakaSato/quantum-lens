
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RigSpecification } from '../services/geminiService';
import { Gate } from '../types';

interface QuantumRigVisualizerProps {
  spec: RigSpecification;
  numQubits: number;
  gates: Gate[];
  onClose: () => void;
}

// Helper to create gate texture for holographic projection
function createGateTexture(label: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0,0,128,128);
    // Glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    
    // Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(10,10,108,108);
    
    // Text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 50px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

const QuantumRigVisualizer: React.FC<QuantumRigVisualizerProps> = ({ spec, numQubits, gates, onClose }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    
    // Theme-based Fog/Background
    if (spec.theme === 'lab') {
        scene.background = new THREE.Color(0xf1f5f9); // Slate 100
        scene.fog = new THREE.FogExp2(0xf1f5f9, 0.02);
    } else {
        scene.background = new THREE.Color(0x020617); // Slate 950
        scene.fog = new THREE.FogExp2(0x020617, 0.03); 
    }

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    
    // Adjust camera based on rig type
    if (spec.rigType === 'photonic') {
        camera.position.set(0, 5, 5); // Top-down angled view for chip
    } else {
        camera.position.set(4, 1, 6); // Side/Bottom view for chandelier/chip
    }
    camera.lookAt(0, -1, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    // --- Post Processing (Bloom) ---
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
    bloomPass.threshold = spec.theme === 'lab' ? 0.8 : 0.15;
    bloomPass.strength = spec.theme === 'cyber' ? 2.5 : 1.2;
    bloomPass.radius = 0.5;

    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    const rigGroup = new THREE.Group();
    scene.add(rigGroup);

    // --- Materials (Physics Based) ---
    let plateMat, rodMat, coreMat, cableMat, qubitMat;

    if (spec.theme === 'gold') {
        plateMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.15 });
        rodMat = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.8, roughness: 0.2 });
        cableMat = new THREE.MeshStandardMaterial({ color: 0xcc9966, metalness: 0.4, roughness: 0.6 });
        coreMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 });
        qubitMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: spec.coreColor, emissiveIntensity: 3.0 });
    } else if (spec.theme === 'cyber') {
        plateMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1, emissive: 0x001133, emissiveIntensity: 0.2 });
        rodMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9 });
        cableMat = new THREE.MeshStandardMaterial({ color: spec.coreColor, emissive: spec.coreColor, emissiveIntensity: 1.0, opacity: 0.8, transparent: true });
        coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        qubitMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    } else { // Lab
        plateMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.1, transmission: 0.05, thickness: 0.5 });
        rodMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.5 });
        cableMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
        coreMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        qubitMat = new THREE.MeshStandardMaterial({ color: spec.coreColor, emissive: spec.coreColor, emissiveIntensity: 1.0 });
    }

    // --- Animation State ---
    const pulses: { mesh: THREE.Mesh, path: THREE.CurvePath<THREE.Vector3>, offset: number, speed: number }[] = [];
    const particlesRef = useRef<THREE.Points | null>(null);

    // --- PROCEDURAL GENERATION ---

    if (spec.rigType === 'photonic') {
        // ... (Photonic code unchanged) ...
        const boardW = 5;
        const boardH = 3;
        const substrateGeo = new THREE.BoxGeometry(boardW, 0.2, boardH);
        const substrateMat = new THREE.MeshPhysicalMaterial({
            color: 0x0f172a, roughness: 0.2, metalness: 0.8, clearcoat: 1.0, transmission: 0.1
        });
        const substrate = new THREE.Mesh(substrateGeo, substrateMat);
        rigGroup.add(substrate);

        const waveguideMat = new THREE.MeshBasicMaterial({ color: spec.coreColor, transparent: true, opacity: 0.3 });
        const phaseShifterMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffaa00, emissiveIntensity: 2 });
        const couplerMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.2 });

        const linesGroup = new THREE.Group();
        rigGroup.add(linesGroup);

        const lanes = Math.max(numQubits, 4);
        const segments = 8; 
        const zStep = (boardH - 0.5) / lanes;
        const xStep = (boardW - 0.5) / segments;

        for (let i = 0; i < lanes; i++) {
            const z = -((boardH - 0.5)/2) + i * zStep;
            const points = [];
            points.push(new THREE.Vector3(-boardW/2, 0.15, z));

            for (let j = 1; j <= segments; j++) {
                const x = -boardW/2 + j * xStep;
                const prevX = -boardW/2 + (j-1) * xStep;
                const midX = (prevX + x) / 2;
                points.push(new THREE.Vector3(x, 0.15, z));
                const heaterGeo = new THREE.BoxGeometry(0.2, 0.08, 0.08);
                const heater = new THREE.Mesh(heaterGeo, phaseShifterMat);
                heater.position.set(midX, 0.15, z);
                linesGroup.add(heater);
                if (i < lanes - 1 && (i + j) % 2 === 0) {
                    const nextZ = -((boardH - 0.5)/2) + (i + 1) * zStep;
                    const couplePoints = [
                        new THREE.Vector3(x - 0.1, 0.15, z),
                        new THREE.Vector3(x - 0.1, 0.15, nextZ)
                    ];
                    const coupleCurve = new THREE.CatmullRomCurve3(couplePoints);
                    const coupleGeo = new THREE.TubeGeometry(coupleCurve, 2, 0.03, 4, false);
                    const coupler = new THREE.Mesh(coupleGeo, couplerMat);
                    linesGroup.add(coupler);
                }
            }
            const curve = new THREE.CatmullRomCurve3(points);
            const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.03, 4, false);
            const tube = new THREE.Mesh(tubeGeo, waveguideMat);
            linesGroup.add(tube);
            const pGeo = new THREE.SphereGeometry(0.05, 8, 8);
            const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const pMesh = new THREE.Mesh(pGeo, pMat);
            rigGroup.add(pMesh);
            pulses.push({ mesh: pMesh, path: curve, offset: Math.random(), speed: 0.2 + Math.random()*0.3 });
        }
    } else {
        // --- Standard Dilution Refrigerator (Chandelier) ---
        
        // 1. Plates
        const numStages = Math.min(Math.max(spec.stages, 3), 8);
        const maxRadius = 1.8;
        const minRadius = 0.5;
        const stageHeight = 0.7;
        const startY = (numStages * stageHeight) / 2;

        const plateInfos: {y: number, r: number}[] = [];

        for(let i=0; i<numStages; i++) {
            const progress = i / (numStages - 1);
            const radius = maxRadius - (progress * (maxRadius - minRadius));
            const y = startY - (i * stageHeight);
            plateInfos.push({y, r: radius});

            const plateGeo = new THREE.CylinderGeometry(radius, radius, 0.05, 64);
            const plate = new THREE.Mesh(plateGeo, plateMat);
            plate.position.y = y;
            rigGroup.add(plate);

            if (i < numStages - 1) {
                const nextRadius = maxRadius - ((i+1) / (numStages - 1) * (maxRadius - minRadius));
                const numRods = 3 + i;
                for(let j=0; j<numRods; j++) {
                    const angle = (j / numRods) * Math.PI * 2;
                    const rOffset = nextRadius * 0.8;
                    const rodX = rOffset * Math.cos(angle);
                    const rodZ = rOffset * Math.sin(angle);
                    const rodGeo = new THREE.CylinderGeometry(0.04, 0.04, stageHeight, 8);
                    const rod = new THREE.Mesh(rodGeo, rodMat);
                    rod.position.set(rodX, y - (stageHeight/2), rodZ);
                    rigGroup.add(rod);
                }
            }
        }

        // 2. Cables
        if (spec.cableStyle !== 'clean') {
            const cablesPerStage = spec.cableStyle === 'messy' ? 12 : 6;
            for (let i = 0; i < numStages - 1; i++) {
                const currentP = plateInfos[i];
                const nextP = plateInfos[i+1];
                for (let c = 0; c < cablesPerStage; c++) {
                    const angleStart = (c / cablesPerStage) * Math.PI * 2 + (i * 0.5);
                    const startR = currentP.r * 0.85;
                    const startX = startR * Math.cos(angleStart);
                    const startZ = startR * Math.sin(angleStart);
                    
                    const angleEnd = angleStart + 0.8;
                    const endR = nextP.r * 0.8;
                    const endX = endR * Math.cos(angleEnd);
                    const endZ = endR * Math.sin(angleEnd);

                    const midY = (currentP.y + nextP.y) / 2;
                    const midR = Math.max(startR, endR) * 1.3;
                    const midX = midR * Math.cos((angleStart + angleEnd)/2);
                    const midZ = midR * Math.sin((angleStart + angleEnd)/2);

                    const curve = new THREE.CatmullRomCurve3([
                        new THREE.Vector3(startX, currentP.y - 0.05, startZ),
                        new THREE.Vector3(startX, currentP.y - 0.25, startZ), 
                        new THREE.Vector3(midX, midY, midZ),
                        new THREE.Vector3(endX, nextP.y + 0.25, endZ),
                        new THREE.Vector3(endX, nextP.y + 0.05, endZ),
                    ]);
                    
                    const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.012, 6, false);
                    const tube = new THREE.Mesh(tubeGeo, cableMat);
                    rigGroup.add(tube);
                }
            }
        }

        // 3. Mixing Chamber Processor
        const lastPlate = plateInfos[plateInfos.length-1];
        const coreY = lastPlate.y - 0.5;

        // Mounting Bracket
        const mountGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32);
        const mountMat = new THREE.MeshStandardMaterial({ color: 0xb87333, roughness: 0.3, metalness: 0.8 }); // Copper
        const mount = new THREE.Mesh(mountGeo, mountMat);
        mount.position.y = lastPlate.y - 0.1;
        rigGroup.add(mount);

        // Chip Holder / Can
        const holderGeo = new THREE.BoxGeometry(0.8, 0.05, 0.8);
        const holderMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.1 }); // Gold
        const holder = new THREE.Mesh(holderGeo, holderMat);
        holder.position.y = coreY;
        rigGroup.add(holder);

        // Silicon Die
        const dieGeo = new THREE.BoxGeometry(0.6, 0.02, 0.6);
        const dieMat = new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: 0.2, roughness: 0.0, clearcoat: 1.0 }); // Silicon
        const die = new THREE.Mesh(dieGeo, dieMat);
        die.position.y = coreY + 0.035;
        rigGroup.add(die);

        // --- Processor Specific Geometry ---
        if (spec.processorType === 'spin') {
            // --- Spin Qubit (Silicon Dots) ---
            const dotSpacing = 0.1;
            const startX = -((numQubits - 1) * dotSpacing) / 2;
            
            // Nanowire Substrate (Grey)
            const wireGeo = new THREE.BoxGeometry(numQubits * 0.15 + 0.2, 0.01, 0.2);
            const wireMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5 });
            const nanowire = new THREE.Mesh(wireGeo, wireMat);
            nanowire.position.y = coreY + 0.05;
            rigGroup.add(nanowire);

            for (let i = 0; i < numQubits; i++) {
                const x = startX + i * dotSpacing;
                
                // Quantum Dot (Glowing Orb)
                const dotGeo = new THREE.SphereGeometry(0.015, 16, 16);
                const dotMat = new THREE.MeshBasicMaterial({ color: spec.coreColor });
                const dot = new THREE.Mesh(dotGeo, dotMat);
                dot.position.set(x, coreY + 0.06, 0);
                rigGroup.add(dot);

                // Gate Electrodes (Finger Gates over the dot)
                const gateGeo = new THREE.BoxGeometry(0.01, 0.01, 0.3);
                const gateMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0 });
                const gate1 = new THREE.Mesh(gateGeo, gateMat);
                gate1.position.set(x - 0.02, coreY + 0.07, 0);
                rigGroup.add(gate1);
                
                const gate2 = new THREE.Mesh(gateGeo, gateMat);
                gate2.position.set(x + 0.02, coreY + 0.07, 0);
                rigGroup.add(gate2);
            }
            
            // SET (Readout Device) on the side
            const setGeo = new THREE.BoxGeometry(0.1, 0.05, 0.1);
            const setMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8 });
            const setDev = new THREE.Mesh(setGeo, setMat);
            setDev.position.set(0, coreY + 0.05, 0.25);
            rigGroup.add(setDev);

        } else {
            // --- Transmon Qubits (Crosses) ---
            const qSize = 0.08;
            const spacing = 0.15;
            const gridSize = Math.ceil(Math.sqrt(numQubits));
            
            for(let i=0; i<numQubits; i++) {
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                const x = (col - (gridSize-1)/2) * spacing;
                const z = (row - (gridSize-1)/2) * spacing;

                // Cross Geometry
                const bar1 = new THREE.BoxGeometry(qSize, 0.01, qSize/3);
                const bar2 = new THREE.BoxGeometry(qSize/3, 0.01, qSize);
                const qColor = spec.theme === 'cyber' ? 0x00ffff : 0xffaa00; 
                const qMat = new THREE.MeshStandardMaterial({ color: qColor, metalness: 1.0, emissive: qColor, emissiveIntensity: 0.5 });
                
                const m1 = new THREE.Mesh(bar1, qMat);
                const m2 = new THREE.Mesh(bar2, qMat);
                m1.position.set(x, coreY + 0.05, z);
                m2.position.set(x, coreY + 0.05, z);
                rigGroup.add(m1);
                rigGroup.add(m2);

                // Readout Resonator
                const rPoints = [];
                let currX = x;
                let currZ = z;
                for(let k=0; k<5; k++) {
                    rPoints.push(new THREE.Vector3(currX, coreY + 0.05, currZ));
                    currX += 0.03;
                    currZ += (k%2===0 ? 0.04 : -0.04);
                }
                const rCurve = new THREE.CatmullRomCurve3(rPoints);
                const rGeo = new THREE.TubeGeometry(rCurve, 8, 0.002, 4, false);
                const rMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
                const rMesh = new THREE.Mesh(rGeo, rMat);
                rigGroup.add(rMesh);
                
                // Pulse Animation
                if (Math.random() > 0.4) {
                    const pGeo = new THREE.SphereGeometry(0.01);
                    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
                    const pMesh = new THREE.Mesh(pGeo, pMat);
                    rigGroup.add(pMesh);
                    pulses.push({ mesh: pMesh, path: rCurve, offset: Math.random(), speed: 0.4 });
                }
            }
        }

        // Holograms above chip
        const holoGroup = new THREE.Group();
        holoGroup.position.y = coreY + 0.3;
        rigGroup.add(holoGroup);

        const displayGates = gates.slice(0, 12); 
        displayGates.forEach((g, idx) => {
            const tex = createGateTexture(g.type, spec.coreColor);
            const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
            const sprite = new THREE.Sprite(spriteMat);
            const t = idx / displayGates.length;
            const angle = t * Math.PI * 2;
            const radius = 0.5 + (idx * 0.05);
            const yOffset = (idx * 0.05);
            sprite.position.set(Math.cos(angle) * radius, yOffset, Math.sin(angle) * radius);
            sprite.scale.set(0.2, 0.2, 0.2);
            holoGroup.add(sprite);
        });
    }

    // --- Common: Cryo Particles ---
    const particleCount = 200;
    const particlesGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    for(let i=0; i<particleCount*3; i++) {
        posArray[i] = (Math.random() - 0.5) * 6;
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMat = new THREE.PointsMaterial({
        size: 0.03,
        color: spec.theme === 'cyber' ? spec.coreColor : 0xaaccff,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particles);
    particlesRef.current = particles;

    // --- Lights ---
    const spotLight = new THREE.SpotLight(0xffffff, 150);
    spotLight.position.set(5, 10, 5);
    spotLight.angle = Math.PI / 6;
    scene.add(spotLight);

    const fillLight = new THREE.PointLight(spec.theme === 'gold' ? 0xffaa00 : 0x0055ff, 5, 20);
    fillLight.position.set(-5, 0, 5);
    scene.add(fillLight);

    if (spec.rigType === 'fridge') {
        const coreLight = new THREE.PointLight(spec.coreColor, 3, 5);
        // @ts-ignore
        coreLight.position.set(0, -1, 0); 
        scene.add(coreLight);
    } else {
        const boardLight = new THREE.PointLight(spec.coreColor, 2, 10);
        boardLight.position.set(0, 1, 0);
        scene.add(boardLight);
    }

    // --- Animation Loop ---
    const animate = () => {
        requestAnimationFrame(animate);
        controls.update();
        
        const time = Date.now() * 0.001;

        rigGroup.rotation.y = Math.sin(time * 0.1) * 0.05;

        // Pulses
        pulses.forEach(p => {
            p.offset += p.speed * 0.01;
            if (p.offset > 1) p.offset = 0;
            const point = p.path.getPoint(p.offset);
            p.mesh.position.copy(point);
        });

        // Particles
        if (particlesRef.current) {
            particlesRef.current.rotation.y = time * 0.05;
            const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
            for(let i=1; i<particleCount*3; i+=3) {
                positions[i] += 0.005; 
                if (positions[i] > 3) positions[i] = -3;
            }
            particlesRef.current.geometry.attributes.position.needsUpdate = true;
        }

        composer.render();
    };
    animate();

    const handleResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        composer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('resize', handleResize);
        mountRef.current?.removeChild(renderer.domElement);
        renderer.dispose();
        composer.dispose();
    };
  }, [spec, numQubits, gates]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 animate-in fade-in duration-700">
        <div className="relative w-full max-w-6xl h-[85vh] bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row ring-1 ring-white/10">
            
            {/* 3D Canvas */}
            <div ref={mountRef} className="flex-1 h-full relative cursor-move">
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
                
                <div className="absolute top-4 left-4 md:top-8 md:left-8 pointer-events-none select-none z-20">
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_currentColor] animate-pulse`} style={{ color: spec.coreColor, backgroundColor: spec.coreColor }}></div>
                        <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-slate-400">System Online</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-500 uppercase tracking-tighter drop-shadow-2xl">
                        {spec.name}
                    </h1>
                    <div className="mt-4 flex gap-2 flex-wrap">
                        <span className={`text-[9px] md:text-[10px] uppercase font-bold px-2 py-1 md:px-3 rounded-full border bg-black/50 backdrop-blur-md ${spec.theme === 'cyber' ? 'border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'border-amber-500 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]'}`}>
                            {spec.rigType === 'photonic' ? 'QPGA Chip' : spec.processorType === 'spin' ? 'Spin Qubit Array' : `${spec.theme} Fridge`}
                        </span>
                        <span className="text-[9px] md:text-[10px] uppercase font-bold px-2 py-1 md:px-3 rounded-full border border-slate-700 text-slate-300 bg-black/50 backdrop-blur-md">
                            {spec.rigType === 'photonic' ? 'MZI Lattice' : spec.processorType === 'spin' ? 'Silicon Nanowires' : `${spec.stages} Stages`}
                        </span>
                        <span className="text-[9px] md:text-[10px] uppercase font-bold px-2 py-1 md:px-3 rounded-full border border-slate-700 text-emerald-400 bg-black/50 backdrop-blur-md">
                            {gates.length} OPS Active
                        </span>
                    </div>
                </div>
            </div>

            {/* Sidebar Info */}
            <div className="w-full md:w-80 bg-slate-950/90 border-t md:border-t-0 md:border-l border-slate-800 p-6 md:p-8 flex flex-col justify-between shrink-0 backdrop-blur-xl z-20 max-h-[40vh] md:max-h-full overflow-y-auto custom-scrollbar">
                <div>
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 md:mb-6 border-b border-slate-800 pb-2">Technical Specs</h2>
                    
                    <p className="text-sm text-slate-300 leading-relaxed font-light mb-6 md:mb-8">
                        {spec.description}
                    </p>
                    
                    <div className="space-y-4 md:space-y-6">
                        <div>
                            <div className="flex justify-between mb-2">
                                <span className="text-[10px] text-slate-500 uppercase font-bold">
                                    {spec.rigType === 'photonic' ? 'Waveguide Loss' : 'Wiring Density'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                    {spec.rigType === 'photonic' ? '0.2 dB/cm' : spec.cableStyle.toUpperCase()}
                                </span>
                            </div>
                            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-slate-500" style={{ width: spec.cableStyle === 'messy' ? '95%' : spec.cableStyle === 'clean' ? '30%' : '60%' }}></div>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 md:gap-4">
                            <div className="bg-slate-900 rounded p-2 md:p-3 border border-slate-800">
                                <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">
                                    {spec.rigType === 'photonic' ? 'Clock Rate' : 'Base Temp'}
                                </div>
                                <div className="text-base md:text-lg font-mono text-cyan-400">
                                    {spec.rigType === 'photonic' ? '10 GHz' : '12 mK'}
                                </div>
                            </div>
                            <div className="bg-slate-900 rounded p-2 md:p-3 border border-slate-800">
                                <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">
                                    {spec.rigType === 'photonic' ? 'Fidelity' : 'Coherence'}
                                </div>
                                <div className="text-base md:text-lg font-mono text-purple-400">
                                    {spec.rigType === 'photonic' ? '99.9%' : '140 μs'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Active Program</h3>
                    <div className="flex flex-wrap gap-1">
                        {gates.slice(0, 10).map((g, i) => (
                            <div key={i} className="w-6 h-6 bg-slate-800 border border-slate-700 rounded flex items-center justify-center text-[9px] text-white font-bold">
                                {g.type}
                            </div>
                        ))}
                        {gates.length > 10 && <div className="text-slate-500 text-[9px] self-center">...</div>}
                    </div>
                </div>

                <button 
                    onClick={onClose}
                    className="w-full py-3 md:py-4 mt-6 bg-white text-black font-bold uppercase tracking-widest text-xs rounded hover:bg-slate-200 transition-colors shadow-lg shadow-white/10"
                >
                    Return to Lab
                </button>
            </div>
        </div>
    </div>
  );
};

export default QuantumRigVisualizer;
