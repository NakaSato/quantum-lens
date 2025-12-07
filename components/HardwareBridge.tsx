
import React, { useState, useEffect, useRef } from 'react';
import { Complex } from '../types';
import { generateHardwareCode } from '../services/geminiService';

interface HardwareBridgeProps {
  amplitudes: Complex[];
  numQubits: number;
  onCircuitControl?: (action: 'next' | 'prev' | 'reset') => void;
}

const HardwareBridge: React.FC<HardwareBridgeProps> = ({ amplitudes, numQubits, onCircuitControl }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'code' | 'monitor'>('dashboard');
  const [hardwareMode, setHardwareMode] = useState<'pwm' | 'neopixel'>('pwm');
  
  // Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [port, setPort] = useState<any>(null);
  const [writer, setWriter] = useState<WritableStreamDefaultWriter | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const readerCancelledRef = useRef<boolean>(false);
  
  // Data State
  const [lastSent, setLastSent] = useState<string>("");
  const [monitorLogs, setMonitorLogs] = useState<string[]>([]);
  const [inputLogs, setInputLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  // Code Gen State
  const [platform, setPlatform] = useState<string>("Arduino Uno");
  const [code, setCode] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false); // New state for edit toggle
  const monitorEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && !('serial' in navigator)) {
        setIsSupported(false);
        setErrorMsg("Web Serial API is not supported. Use Chrome or Edge.");
    }
  }, []);

  // Initialize default code based on mode
  useEffect(() => {
      const defaultPwmCode = `/* QuantumLens PWM (Standard LEDs) */\n#include <ArduinoJson.h>\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(3, OUTPUT); pinMode(5, OUTPUT);\n}\n\nvoid loop() {\n  if (Serial.available()) {\n    String line = Serial.readStringUntil('\\n');\n    // Parse and set PWM...\n  }\n}`;
      const defaultNeoCode = `/* QuantumLens NeoPixel (Smart LEDs) */\n#include <Adafruit_NeoPixel.h>\n#include <ArduinoJson.h>\n\nvoid setup() {\n  Serial.begin(115200);\n  // Init NeoPixels...\n}\n\nvoid loop() {\n  // Parse JSON and set colors...\n}`;
      setCode(hardwareMode === 'pwm' ? defaultPwmCode : defaultNeoCode);
  }, [hardwareMode]);

  useEffect(() => {
    if (activeTab === 'monitor' && monitorEndRef.current) {
        monitorEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [monitorLogs, activeTab]);

  // HSL to RGB Helper for Neopixels
  const hslToRgb = (h: number, s: number, l: number) => {
    let r, g, b;
    if (s === 0) {
      r = g = b = l; 
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  };

  const getQubitData = () => {
    const numStates = amplitudes.length;
    
    if (hardwareMode === 'pwm') {
        const intensities = new Array(numQubits).fill(0);
        for (let q = 0; q < numQubits; q++) {
            let probOne = 0;
            for (let i = 0; i < numStates; i++) {
                if ((i & (1 << q)) !== 0) {
                    const amp = amplitudes[i];
                    probOne += amp.r * amp.r + amp.i * amp.i;
                }
            }
            intensities[q] = Math.min(255, Math.max(0, Math.floor(probOne * 255)));
        }
        return { q: intensities };
    } else {
        const pixels = [];
        for (let q = 0; q < numQubits; q++) {
             let r_x = 0;
             let r_y = 0;
             
             for (let i = 0; i < numStates; i++) {
                if ((i & (1 << q)) === 0) {
                    const j = i | (1 << q);
                    const amp0 = amplitudes[i];
                    const amp1 = amplitudes[j];
                    r_x += 2 * (amp0.r * amp1.r + amp0.i * amp1.i);
                    r_y += 2 * (amp0.r * amp1.i - amp0.i * amp1.r);
                }
             }
             
             const phase = Math.atan2(r_y, r_x);
             
             let probOne = 0;
             for(let k=0; k<numStates; k++) {
                 if((k & (1 << q)) !== 0) {
                     probOne += amplitudes[k].r**2 + amplitudes[k].i**2;
                 }
             }

             const hue = ((phase + Math.PI) / (2 * Math.PI));
             const saturation = 1.0;
             const lightness = Math.min(0.5, probOne * 0.5); 
             
             pixels.push(hslToRgb(hue, saturation, lightness));
        }
        return { n: pixels };
    }
  };

  const connectSerial = async () => {
    setErrorMsg(null);
    try {
      if (!isSupported) throw new Error("Web Serial API not supported.");

      const p = await (navigator as any).serial.requestPort();
      await p.open({ baudRate: 115200 });
      
      const textEncoder = new TextEncoderStream();
      const writableStreamClosed = textEncoder.readable.pipeTo(p.writable);
      const w = textEncoder.writable.getWriter();

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = p.readable.pipeTo(textDecoder.writable);
      const r = textDecoder.readable.getReader();

      setPort(p);
      setWriter(w);
      readerRef.current = r;
      readerCancelledRef.current = false;
      setIsConnected(true);

      readLoop(r);

    } catch (err: any) {
      console.error(err);
      if (err.name !== 'NotFoundError') setErrorMsg(err.message || "Failed to connect");
    }
  };

  const readLoop = async (reader: any) => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done || readerCancelledRef.current) break;
        if (value) {
           const trimmed = value.trim();
           if (!trimmed) continue;

           try {
               const lines = trimmed.split('\n');
               for (const line of lines) {
                   if (line.startsWith('{') && line.endsWith('}')) {
                       const cmd = JSON.parse(line);
                       if (cmd.cmd && onCircuitControl) {
                           onCircuitControl(cmd.cmd as 'next' | 'prev' | 'reset');
                           setInputLogs(prev => [`CMD: ${cmd.cmd}`, ...prev.slice(0, 9)]);
                       }
                   }
                   setMonitorLogs(prev => [...prev, line].slice(-50));
               }
           } catch (e) {
               setMonitorLogs(prev => [...prev, trimmed].slice(-50));
           }
        }
      }
    } catch (error) {
      console.error("Read error:", error);
    } finally {
      reader.releaseLock();
    }
  };

  const disconnectSerial = async () => {
    readerCancelledRef.current = true;
    try {
        if (writer) {
           await writer.close();
           setWriter(null);
        }
        if (readerRef.current) {
           await readerRef.current.cancel();
           readerRef.current = null;
        }
        if (port) {
           await port.close();
           setPort(null);
        }
    } catch (e) {
        console.error("Disconnect error", e);
    } finally {
        setIsConnected(false);
    }
  };

  const handleGenerateCode = async () => {
      setIsGenerating(true);
      setIsEditing(false); // Switch to view mode to see result
      const newCode = await generateHardwareCode(platform, hardwareMode);
      setCode(newCode);
      setIsGenerating(false);
  };

  // Data Loop
  useEffect(() => {
    if (!isConnected || !writer) return;
    const sendData = async () => {
      try {
        const data = getQubitData();
        const payload = JSON.stringify(data) + '\n';
        await writer.write(payload);
        setLastSent(payload.trim());
      } catch (err) {
        console.error("Write error", err);
        setIsConnected(false);
      }
    };
    sendData(); 
  }, [amplitudes, isConnected, writer, hardwareMode]);

  const currentData = getQubitData();

  // Simple Syntax Highlighter Logic
  const getHighlightedCode = () => {
      if (!code) return "";
      let html = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const isCpp = platform.includes('Arduino') || platform.includes('ESP32');
      
      if (isCpp) {
          // C++ Highlights
          const keywords = /\b(void|int|float|double|bool|char|const|if|else|while|for|return|include|define|struct|class|public|private|using|namespace)\b/g;
          const builtins = /\b(Serial|pinMode|digitalWrite|analogWrite|delay|begin|available|readStringUntil|println|print|write)\b/g;
          const types = /\b(String|Adafruit_NeoPixel|ArduinoJson|JsonDocument|deserializeJson)\b/g;
          const comments = /(\/\/.*)/g;
          const directives = /(#\w+)/g;
          const numbers = /\b(\d+)\b/g;

          html = html
            .replace(directives, '<span class="text-pink-400">$1</span>')
            .replace(comments, '<span class="text-slate-500 italic">$1</span>')
            .replace(keywords, '<span class="text-purple-400 font-bold">$1</span>')
            .replace(builtins, '<span class="text-yellow-300">$1</span>')
            .replace(types, '<span class="text-emerald-400">$1</span>')
            .replace(numbers, '<span class="text-orange-300">$1</span>');
      } else {
          // Python Highlights
          const keywords = /\b(def|import|from|while|if|elif|else|return|True|False|None|break|continue|global|try|except|pass)\b/g;
          const builtins = /\b(print|len|range|int|float|str|list|dict|machine|Pin|PWM|UART|sleep)\b/g;
          const comments = /(#.*)/g;
          const numbers = /\b(\d+)\b/g;

          html = html
            .replace(comments, '<span class="text-slate-500 italic">$1</span>')
            .replace(keywords, '<span class="text-purple-400 font-bold">$1</span>')
            .replace(builtins, '<span class="text-yellow-300">$1</span>')
            .replace(numbers, '<span class="text-orange-300">$1</span>');
      }
      return html;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-900/50 border-l border-slate-800">
       
       {/* Connection Bar */}
       <div className="p-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {isConnected ? 'Connected' : 'Disconnected'}
              </span>
          </div>
          <button
             onClick={isConnected ? disconnectSerial : connectSerial}
             disabled={!isSupported}
             className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                 isConnected 
                 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50' 
                 : 'bg-emerald-600 text-white hover:bg-emerald-500'
             }`}
           >
             {isConnected ? 'Disconnect' : 'Connect USB'}
           </button>
       </div>

       {/* Tabs */}
       <div className="flex border-b border-slate-800 bg-slate-900">
          {[
              { id: 'dashboard', label: 'Dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
              { id: 'code', label: 'Code', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
              { id: 'monitor', label: 'Monitor', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' }
          ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-2 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
                    activeTab === tab.id 
                    ? 'border-cyan-500 text-cyan-400 bg-slate-800/50' 
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                }`}
              >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} /></svg>
                  {tab.label}
              </button>
          ))}
       </div>

       {/* Content */}
       <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative">
          
          {errorMsg && (
             <div className="mb-4 p-2 bg-rose-950/30 border border-rose-900/50 rounded text-rose-300 text-xs flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {errorMsg}
             </div>
          )}

          {/* TAB: DASHBOARD */}
          {activeTab === 'dashboard' && (
             <div className="space-y-6">
                 
                 {/* Mode Selector */}
                 <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Hardware Mode</span>
                    <div className="flex bg-slate-900 rounded p-1 gap-1">
                        <button 
                          onClick={() => setHardwareMode('pwm')} 
                          className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${hardwareMode === 'pwm' ? 'bg-emerald-600 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                        >
                            Standard LEDs
                        </button>
                        <button 
                          onClick={() => setHardwareMode('neopixel')} 
                          className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${hardwareMode === 'neopixel' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-white'}`}
                        >
                            Smart LEDs
                        </button>
                    </div>
                 </div>

                 {/* Visual Feedback */}
                 <div className="grid grid-cols-4 gap-2">
                    {hardwareMode === 'pwm' ? (
                        (currentData as {q: number[]}).q.map((val, idx) => (
                            <div key={idx} className="bg-slate-950 rounded p-2 flex flex-col items-center gap-2 border border-slate-800 shadow-lg">
                               <div className="w-full aspect-[1/2] bg-slate-900 rounded-sm relative overflow-hidden border border-slate-800">
                                    <div 
                                        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-emerald-500 to-emerald-400 transition-all duration-200"
                                        style={{ height: `${(val / 255) * 100}%` }}
                                    />
                               </div>
                               <div className="text-center">
                                   <div className="text-[9px] text-slate-500 font-mono uppercase">q{idx}</div>
                                   <div className="text-xs font-mono font-bold text-white">{val}</div>
                               </div>
                            </div>
                        ))
                    ) : (
                        (currentData as {n: number[][]}).n.map((rgb, idx) => (
                            <div key={idx} className="bg-slate-950 rounded p-2 flex flex-col items-center gap-2 border border-slate-800 shadow-lg">
                               <div className="w-full aspect-square rounded-full relative overflow-hidden border border-slate-800 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] flex items-center justify-center">
                                    <div 
                                        className="w-full h-full rounded-full blur-md opacity-80 transition-colors duration-200"
                                        style={{ backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` }}
                                    />
                                    <div 
                                        className="w-4 h-4 rounded-full bg-white absolute shadow-[0_0_10px_white] transition-opacity duration-200"
                                        style={{ opacity: (rgb[0]+rgb[1]+rgb[2]) / 765 }}
                                    />
                               </div>
                               <div className="text-center">
                                   <div className="text-[9px] text-slate-500 font-mono uppercase">q{idx}</div>
                                   <div className="text-[9px] font-mono text-slate-400">{`[${rgb.join(',')}]`}</div>
                               </div>
                            </div>
                        ))
                    )}
                 </div>
                 
                 {/* Input Logs */}
                 {inputLogs.length > 0 && (
                     <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1 flex justify-between">
                            <span>Hardware Inputs</span>
                            <span className="text-emerald-500 animate-pulse">● Active</span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-300 space-y-1">
                            {inputLogs.map((log, i) => (
                                <div key={i} className="border-b border-slate-800/50 pb-0.5 last:border-0">{log}</div>
                            ))}
                        </div>
                     </div>
                 )}

                 {/* Last Packet */}
                 <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Outgoing Data Stream</div>
                    <div className="font-mono text-[10px] text-cyan-400 break-all leading-tight">
                       {lastSent || "Waiting for signal..."}
                    </div>
                 </div>

                 <div className="p-3 bg-blue-900/10 border border-blue-800/30 rounded-lg">
                    <h4 className="text-xs font-bold text-blue-300 mb-1 flex items-center gap-2">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Instructions
                    </h4>
                    <ul className="text-[10px] text-blue-200/70 space-y-1 list-disc list-inside">
                        <li><strong>Connect USB</strong> to start data stream.</li>
                        <li><strong>Standard LEDs:</strong> Connect LEDs to PWM pins.</li>
                        <li><strong>Smart LEDs:</strong> Connect Neopixel Data In to control pin.</li>
                        <li>Send <code>{"{\"cmd\":\"next\"}"}</code> from device to step circuit.</li>
                    </ul>
                 </div>
             </div>
          )}

          {/* TAB: CODE */}
          {activeTab === 'code' && (
              <div className="h-full flex flex-col gap-3">
                  <div className="flex gap-2 items-center bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <select 
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                        className="bg-slate-900 text-slate-300 text-xs rounded border border-slate-700 px-2 py-1.5 outline-none focus:border-cyan-500"
                      >
                          <option value="Arduino Uno">Arduino Uno/Nano</option>
                          <option value="ESP32">ESP32 (C++)</option>
                          <option value="Raspberry Pi Pico">RPi Pico (MicroPython)</option>
                      </select>
                      
                      <button 
                         onClick={handleGenerateCode}
                         disabled={isGenerating}
                         className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 text-white text-xs font-bold py-1.5 rounded transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-900/30"
                      >
                         {isGenerating ? (
                             <>
                                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                AI Generating...
                             </>
                         ) : (
                             <>
                                <svg className="w-3 h-3 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                Generate Firmware
                             </>
                         )}
                      </button>
                  </div>

                  <div className="flex-1 relative border border-slate-700 rounded-lg overflow-hidden bg-[#0d1117] group flex flex-col">
                      <div className="flex justify-between items-center bg-slate-800/50 px-3 py-1.5 border-b border-slate-700/50">
                          <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">
                              {platform.includes('Pico') ? 'MicroPython' : 'C++'} Source
                          </span>
                          <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setIsEditing(!isEditing)}
                                className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${isEditing ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700/50' : 'text-slate-400 border-transparent hover:text-white'}`}
                              >
                                  {isEditing ? 'Done' : 'Edit'}
                              </button>
                              <button 
                                onClick={() => navigator.clipboard.writeText(code)}
                                className="text-slate-400 hover:text-white transition-colors"
                                title="Copy"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                              </button>
                          </div>
                      </div>
                      
                      <div className="relative flex-1 overflow-hidden">
                          {isEditing ? (
                              <textarea 
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="absolute inset-0 w-full h-full bg-transparent text-xs font-mono text-slate-300 p-3 resize-none outline-none custom-scrollbar"
                                spellCheck={false}
                              />
                          ) : (
                              <div className="absolute inset-0 w-full h-full overflow-y-auto custom-scrollbar p-3">
                                  <pre 
                                    className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all"
                                    dangerouslySetInnerHTML={{ __html: getHighlightedCode() }}
                                  />
                              </div>
                          )}
                      </div>
                  </div>
                  <p className="text-[9px] text-slate-500 text-center">
                     {isEditing ? "Editing Mode. Switch back to view highlights." : "View Mode. Syntax highlighting active."}
                  </p>
              </div>
          )}

          {/* TAB: MONITOR */}
          {activeTab === 'monitor' && (
              <div className="h-full flex flex-col">
                  <div className="flex-1 bg-black rounded-lg border border-slate-800 p-3 overflow-y-auto custom-scrollbar font-mono text-xs">
                      {monitorLogs.length === 0 && (
                          <div className="text-slate-700 italic text-center mt-10">No data received yet...</div>
                      )}
                      {monitorLogs.map((log, i) => (
                          <div key={i} className="text-emerald-500 whitespace-pre-wrap break-all border-b border-slate-900/50 pb-0.5 mb-0.5">
                             <span className="text-slate-600 mr-2 select-none">[{i}]</span>
                             {log}
                          </div>
                      ))}
                      <div ref={monitorEndRef} />
                  </div>
                  <div className="mt-2 flex justify-between items-center">
                      <span className="text-[9px] text-slate-500 uppercase font-bold">Baud: 115200</span>
                      <button 
                        onClick={() => setMonitorLogs([])}
                        className="text-[10px] text-slate-400 hover:text-white underline"
                      >
                        Clear Output
                      </button>
                  </div>
              </div>
          )}
       </div>
    </div>
  );
};

export default HardwareBridge;
