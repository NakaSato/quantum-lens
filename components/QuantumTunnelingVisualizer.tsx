import React, { useRef, useEffect, useState } from 'react';

const N = 400; // Grid points
const SIM_SPEED = 2; // Steps per frame

const QuantumTunnelingVisualizer: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [barrierWidth, setBarrierWidth] = useState(15);
    const [barrierHeight, setBarrierHeight] = useState(0.22); // ~Particle Energy
    const [isSimulating, setIsSimulating] = useState(true);

    // Simulation State (Refs for performance/mutability)
    const psiRe = useRef(new Float32Array(N));
    const psiIm = useRef(new Float32Array(N));
    const V = useRef(new Float32Array(N));
    const animationRef = useRef<number>(0);

    // Physics Constants
    const k0 = 0.6; // Initial Momentum (Energy ~ k^2/2 = 0.18)
    const sigma = 15.0; // Packet Width
    const x0 = 60.0; // Initial Position

    const initialize = () => {
        // 1. Setup Wave Packet (Gaussian)
        for(let i=0; i<N; i++) {
            const x = i;
            // Gaussian Envelope
            const envelope = Math.exp(-Math.pow(x - x0, 2) / (2 * Math.pow(sigma, 2)));
            // Plane Wave factor
            psiRe.current[i] = envelope * Math.cos(k0 * x);
            psiIm.current[i] = envelope * Math.sin(k0 * x);
        }

        // 2. Setup Potential Barrier
        const center = N / 2;
        const halfW = barrierWidth;
        for(let i=0; i<N; i++) {
            if (i >= center - halfW && i <= center + halfW) {
                V.current[i] = barrierHeight;
            } else {
                V.current[i] = 0;
            }
        }
    };

    const step = () => {
        const re = psiRe.current;
        const im = psiIm.current;
        const pot = V.current;
        const dt = 0.5; 

        // Numerical Integration: Symplectic Euler / Leapfrog
        // H = -0.5 * d^2/dx^2 + V(x)
        // dRe/dt = H * Im
        // dIm/dt = -H * Re

        // 1. Update Real part based on Imaginary
        for (let i = 1; i < N - 1; i++) {
            const laplacian = im[i+1] - 2*im[i] + im[i-1];
            const H_im = -0.5 * laplacian + pot[i] * im[i];
            re[i] += dt * H_im;
        }

        // 2. Update Imaginary part based on NEW Real
        for (let i = 1; i < N - 1; i++) {
            const laplacian = re[i+1] - 2*re[i] + re[i-1];
            const H_re = -0.5 * laplacian + pot[i] * re[i];
            im[i] -= dt * H_re;
        }
    };

    const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
        // Clear Background
        ctx.fillStyle = '#0f172a'; // Slate 950
        ctx.fillRect(0, 0, width, height);

        const xScale = width / N;
        const yScale = height / 0.5; // Scaling factor for wavefunction height

        // 1. Draw Potential Barrier
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(0, height);
        for(let i=0; i<N; i++) {
            const x = i * xScale;
            // Scale potential height visibly
            const potHeight = V.current[i] * (height * 2.5); 
            ctx.lineTo(x, height - potHeight);
        }
        ctx.lineTo(width, height);
        ctx.fill();

        // 2. Draw Wavefunction Real Part (Phase) - Faint Pink
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.3)';
        ctx.lineWidth = 1;
        for(let i=0; i<N; i++) {
            const x = i * xScale;
            const y = height/2 - psiRe.current[i] * (yScale * 0.4);
            if(i===0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 3. Draw Probability Density |psi|^2 - Bright Cyan
        ctx.beginPath();
        ctx.strokeStyle = '#22d3ee'; // Cyan 400
        ctx.lineWidth = 2;
        // Optional: Fill gradient
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, "rgba(34, 211, 238, 0.5)");
        grad.addColorStop(1, "rgba(34, 211, 238, 0)");
        ctx.fillStyle = grad;

        let startX = 0;
        let startY = height;

        for(let i=0; i<N; i++) {
            const prob = (psiRe.current[i]**2 + psiIm.current[i]**2);
            const x = i * xScale;
            const y = height - prob * yScale;
            
            if (i===0) {
                ctx.moveTo(x, y);
                startX = x;
                startY = y;
            }
            else ctx.lineTo(x, y);
        }
        // Close path for fill
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.fill();
        // Redraw stroke on top
        ctx.beginPath();
        for(let i=0; i<N; i++) {
            const prob = (psiRe.current[i]**2 + psiIm.current[i]**2);
            const x = i * xScale;
            const y = height - prob * yScale;
            if (i===0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    };

    // Re-initialize when barrier parameters change
    useEffect(() => {
        initialize();
    }, [barrierHeight, barrierWidth]);

    // Animation Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Handle resize for canvas resolution
        if (containerRef.current) {
            canvas.width = containerRef.current.clientWidth;
            canvas.height = containerRef.current.clientHeight;
        }

        const animate = () => {
            if (isSimulating) {
                for(let k=0; k<SIM_SPEED; k++) step();
            }
            draw(ctx, canvas.width, canvas.height);
            animationRef.current = requestAnimationFrame(animate);
        };
        animate();
        return () => cancelAnimationFrame(animationRef.current);
    }, [isSimulating, barrierWidth, barrierHeight]);

    return (
        <div className="w-full h-full flex flex-col gap-4">
            {/* Controls */}
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 backdrop-blur-sm flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">Quantum Tunneling</h3>
                    <button 
                        onClick={() => initialize()}
                        className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded shadow transition-colors"
                    >
                        Fire Particle
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Barrier Height (V)</label>
                        <input 
                            type="range" min="0" max="0.4" step="0.01"
                            value={barrierHeight}
                            onChange={(e) => setBarrierHeight(parseFloat(e.target.value))}
                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-400 uppercase font-mono block mb-1">Barrier Width</label>
                        <input 
                            type="range" min="2" max="50" step="1"
                            value={barrierWidth}
                            onChange={(e) => setBarrierWidth(parseFloat(e.target.value))}
                            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                    </div>
                </div>
            </div>

            {/* Visualization Canvas */}
            <div ref={containerRef} className="flex-1 min-h-[250px] bg-slate-950 rounded-xl border border-slate-800 overflow-hidden relative shadow-inner">
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
                <div className="absolute top-2 left-3 text-[10px] font-mono text-cyan-400 pointer-events-none">
                    |ψ(x)|² Probability Density
                </div>
                <div className="absolute top-2 right-3 text-[10px] font-mono text-slate-500 pointer-events-none">
                    Potential Barrier V(x)
                </div>
            </div>
        </div>
    );
};

export default QuantumTunnelingVisualizer;