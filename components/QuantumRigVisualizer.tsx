
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
    camera.position.set(5, 2, 7);
    camera.lookAt(0, 0, 0);

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

    // --- Materials (Physics Based) ---
    // Realistic Gold Approximation for Dilution Fridge
    let plateMat, rodMat, coreMat, cableMat, qubitMat;

    if (spec.theme === 'gold') {
        plateMat = new THREE.MeshStandardMaterial({ 
            color: 0xffd700, 
            metalness: 1.0, 
            roughness: 0.15,
            emissive: 0x332200,
            emissiveIntensity: 0.1
        });
        rodMat = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.8, roughness: 0.2 });
        cableMat = new THREE.MeshStandardMaterial({ color: 0xcc9966, metalness: 0.4, roughness: 0.6 });
        coreMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 });
        qubitMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: spec.coreColor, emissiveIntensity: 3.0 });
    } else if (spec.theme === 'cyber') {
        plateMat = new THREE.MeshStandardMaterial({ 
            color: 0x111111, metalness: 0.9, roughness: 0.1,
            emissive: 0x001133, emissiveIntensity: 0.2
        });
        rodMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9 });
        cableMat = new THREE.MeshStandardMaterial({ 
            color: spec.coreColor, emissive: spec.coreColor, emissiveIntensity: 1.0, opacity: 0.8, transparent: true 
        });
        coreMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        qubitMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    } else { // Lab
        plateMat = new THREE.MeshPhysicalMaterial({ 
            color: 0xffffff, metalness: 0.1, roughness: 0.1, transmission: 0.05, thickness: 0.5
        });
        rodMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.5 });
        cableMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
        coreMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        qubitMat = new THREE.MeshStandardMaterial({ color: spec.coreColor, emissive: spec.coreColor, emissiveIntensity: 1.0 });
    }

    const rigGroup = new THREE.Group();
    scene.add(rigGroup);

    // --- Procedural Generation ---

    // 1. Chandelier Stages
    const numStages = Math.min(Math.max(spec.stages, 3), 8);
    const maxRadius = 1.8;
    const minRadius = 0.5;
    const stageHeight = 0.7;
    const startY = (numStages * stageHeight) / 2;

    const plates: {y: number, r: number}[] = [];

    for(let i=0; i<numStages; i++) {
        const progress = i / (numStages - 1);
        const radius = maxRadius - (progress * (maxRadius - minRadius));
        const y = startY - (i * stageHeight);
        
        plates.push({y, r: radius});

        // Plate
        const plateGeo = new THREE.CylinderGeometry(radius, radius, 0.05, 64);
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.y = y;
        rigGroup.add(plate);

        // Support Rods
        if (i < numStages - 1) {
            const nextRadius = maxRadius - ((i+1) / (numStages - 1) * (maxRadius - minRadius));
            const numRods = 3 + i; // More rods at top
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

    // 2. Procedural Cabling with Pulses
    const cableCurves: THREE.CurvePath<THREE.Vector3>[] = [];
    const pulses: { mesh: THREE.Mesh, curveIdx: number, offset: number, speed: number }[] = [];
    
    if (spec.cableStyle !== 'clean') {
        const cablesPerStage = spec.cableStyle === 'messy' ? 12 : 6;
        
        for (let i = 0; i < numStages - 1; i++) {
            const currentP = plates[i];
            const nextP = plates[i+1];
            
            for (let c = 0; c < cablesPerStage; c++) {
                const angleStart = (c / cablesPerStage) * Math.PI * 2 + (i * 0.5);
                const startR = currentP.r * 0.85; // Slightly inner
                const startX = startR * Math.cos(angleStart);
                const startZ = startR * Math.sin(angleStart);
                
                const angleEnd = angleStart + 0.8; // Twist
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
                cableCurves.push(curve);

                const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.012, 6, false);
                const tube = new THREE.Mesh(tubeGeo, cableMat);
                rigGroup.add(tube);

                // Add pulse
                if (Math.random() > 0.3) {
                    const pGeo = new THREE.SphereGeometry(0.025, 8, 8);
                    const pMat = new THREE.MeshBasicMaterial({ color: spec.coreColor });
                    const pMesh = new THREE.Mesh(pGeo, pMat);
                    rigGroup.add(pMesh);
                    pulses.push({ 
                        mesh: pMesh, 
                        curveIdx: cableCurves.length - 1, 
                        offset: Math.random(), 
                        speed: 0.5 + Math.random() * 0.5 
                    });
                }
            }
        }
    }

    // 3. QPU Core
    const lastPlate = plates[plates.length-1];
    const coreY = lastPlate.y - 0.5;
    
    const coreGeo = new THREE.CylinderGeometry(0.35, 0.15, 0.7, 32);
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = coreY;
    rigGroup.add(core);

    const qubitGroup = new THREE.Group();
    qubitGroup.position.y = coreY - 0.3;
    rigGroup.add(qubitGroup);

    for(let i=0; i<numQubits; i++) {
        const angle = (i / numQubits) * Math.PI * 2;
        const r = 0.25;
        const x = r * Math.cos(angle);
        const z = r * Math.sin(angle);
        
        const qGeo = new THREE.SphereGeometry(0.06, 16, 16);
        const qMesh = new THREE.Mesh(qGeo, qubitMat);
        qMesh.position.set(x, 0, z);
        qubitGroup.add(qMesh);
    }

    // 4. Holographic Gate Orbit (Magic Visualization)
    const holoGroup = new THREE.Group();
    holoGroup.position.y = coreY;
    rigGroup.add(holoGroup);

    // Limit displayed gates to avoid clutter
    const displayGates = gates.slice(0, 12); 
    displayGates.forEach((g, idx) => {
        const tex = createGateTexture(g.type, spec.coreColor);
        const spriteMat = new THREE.SpriteMaterial({ 
            map: tex, 
            transparent: true, 
            opacity: 0.8,
            blending: THREE.AdditiveBlending 
        });
        const sprite = new THREE.Sprite(spriteMat);
        
        // Spiral placement
        const t = idx / displayGates.length;
        const angle = t * Math.PI * 2;
        const radius = 0.8 + (idx * 0.05);
        const yOffset = (idx * 0.1) - 0.5;

        sprite.position.set(Math.cos(angle) * radius, yOffset, Math.sin(angle) * radius);
        sprite.scale.set(0.3, 0.3, 0.3);
        holoGroup.add(sprite);
    });

    // 5. Cryo Particles
    const particleCount = 200;
    const particlesGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    for(let i=0; i<particleCount*3; i++) {
        posArray[i] = (Math.random() - 0.5) * 6; // Spread
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


    // --- Lights ---
    const spotLight = new THREE.SpotLight(0xffffff, 150);
    spotLight.position.set(5, 10, 5);
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = 0.5;
    spotLight.decay = 2;
    spotLight.distance = 50;
    scene.add(spotLight);

    const fillLight = new THREE.PointLight(spec.theme === 'gold' ? 0xffaa00 : 0x0055ff, 5, 20);
    fillLight.position.set(-5, 0, 5);
    scene.add(fillLight);

    const rimLight = new THREE.SpotLight(0xffffff, 80);
    rimLight.position.set(0, 5, -10);
    rimLight.lookAt(0,0,0);
    scene.add(rimLight);

    const coreLight = new THREE.PointLight(spec.coreColor, 3, 5);
    coreLight.position.set(0, coreY, 0);
    scene.add(coreLight);

    // --- Animation Loop ---
    const animate = () => {
        requestAnimationFrame(animate);
        controls.update();
        
        const time = Date.now() * 0.001;

        // Rotate rig slightly
        rigGroup.rotation.y = Math.sin(time * 0.1) * 0.05;

        // Animate Pulses along cables
        pulses.forEach(p => {
            p.offset += p.speed * 0.01;
            if (p.offset > 1) p.offset = 0;
            const curve = cableCurves[p.curveIdx];
            if (curve) {
                const point = curve.getPoint(p.offset);
                p.mesh.position.copy(point);
            }
        });

        // Rotate Holograms
        holoGroup.rotation.y = -time * 0.2;
        holoGroup.children.forEach((child, i) => {
            const sprite = child as THREE.Sprite;
            // Bobbing effect
            sprite.position.y += Math.sin(time * 2 + i) * 0.002;
        });

        // Pulse Qubits
        const pulse = 1 + Math.sin(time * 3) * 0.1;
        qubitGroup.scale.set(pulse, pulse, pulse);
        qubitGroup.rotation.y -= 0.02;

        // Particle drift
        particles.rotation.y = time * 0.05;
        const positions = particles.geometry.attributes.position.array as Float32Array;
        for(let i=1; i<particleCount*3; i+=3) {
            positions[i] += 0.005; // Move up
            if (positions[i] > 3) positions[i] = -3; // Reset
        }
        particles.geometry.attributes.position.needsUpdate = true;

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
                {/* Cinematic Overlay */}
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
                
                {/* Title Overlay */}
                <div className="absolute top-8 left-8 pointer-events-none select-none z-20">
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_currentColor] animate-pulse`} style={{ color: spec.coreColor, backgroundColor: spec.coreColor }}></div>
                        <span className="text-[10px] uppercase font-mono tracking-[0.2em] text-slate-400">System Online</span>
                    </div>
                    <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-500 uppercase tracking-tighter drop-shadow-2xl">
                        {spec.name}
                    </h1>
                    <div className="mt-4 flex gap-2">
                        <span className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full border bg-black/50 backdrop-blur-md ${spec.theme === 'cyber' ? 'border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'border-amber-500 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]'}`}>
                            {spec.theme} Class
                        </span>
                        <span className="text-[10px] uppercase font-bold px-3 py-1 rounded-full border border-slate-700 text-slate-300 bg-black/50 backdrop-blur-md">
                            {spec.stages} Stages
                        </span>
                        <span className="text-[10px] uppercase font-bold px-3 py-1 rounded-full border border-slate-700 text-emerald-400 bg-black/50 backdrop-blur-md">
                            {gates.length} OPS Active
                        </span>
                    </div>
                </div>
            </div>

            {/* Sidebar Info */}
            <div className="w-full md:w-80 bg-slate-950/90 border-l border-slate-800 p-8 flex flex-col justify-between shrink-0 backdrop-blur-xl z-20">
                <div>
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-6 border-b border-slate-800 pb-2">Technical Specs</h2>
                    
                    <p className="text-sm text-slate-300 leading-relaxed font-light mb-8">
                        {spec.description}
                    </p>
                    
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between mb-2">
                                <span className="text-[10px] text-slate-500 uppercase font-bold">Wiring Density</span>
                                <span className="text-[10px] text-slate-400 font-mono">{spec.cableStyle.toUpperCase()}</span>
                            </div>
                            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-slate-500" style={{ width: spec.cableStyle === 'messy' ? '95%' : spec.cableStyle === 'clean' ? '30%' : '60%' }}></div>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-900 rounded p-3 border border-slate-800">
                                <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Base Temp</div>
                                <div className="text-lg font-mono text-cyan-400">12 mK</div>
                            </div>
                            <div className="bg-slate-900 rounded p-3 border border-slate-800">
                                <div className="text-[9px] text-slate-500 uppercase font-bold mb-1">Coherence</div>
                                <div className="text-lg font-mono text-purple-400">140 μs</div>
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
                    className="w-full py-4 mt-6 bg-white text-black font-bold uppercase tracking-widest text-xs rounded hover:bg-slate-200 transition-colors shadow-lg shadow-white/10"
                >
                    Return to Lab
                </button>
            </div>
        </div>
    </div>
  );
};

export default QuantumRigVisualizer;
