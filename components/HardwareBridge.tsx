import React, { useState, useEffect, useRef } from 'react';
import { Complex } from '../types';
import { generateHardwareCode } from '../services/geminiService';

interface HardwareBridgeProps {
  amplitudes: Complex[];
  numQubits: number;
}

const HardwareBridge: React.FC<HardwareBridgeProps> = ({ amplitudes, numQubits }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'code' | 'monitor'>('dashboard');
  
  // Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [port, setPort] = useState<any>(null);
  const [writer, setWriter] = useState<WritableStreamDefaultWriter | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const readerCancelledRef = useRef<boolean>(false);
  
  // Data State
  const [lastSent, setLastSent] = useState<string>("");
  const [monitorLogs, setMonitorLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  // Code Gen State
  const [platform, setPlatform] = useState<string>("Arduino Uno");
  const [code, setCode] = useState<string>(`/* 
  QuantumLens Default Firmware
  Board: Arduino Uno
*/
#include <ArduinoJson.h>

void setup() {
  Serial.begin(115200);
  pinMode(3, OUTPUT);
  pinMode(5, OUTPUT);
  pinMode(6, OUTPUT);
  pinMode(9, OUTPUT);
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\\n');
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, line);

    if (!error) {
      JsonArray q = doc["q"];
      analogWrite(3, q[0].as<int>());
      analogWrite(5, q[1].as<int>());
      analogWrite(6, q[2].as<int>());
      analogWrite(9, q[3].as<int>());
      
      // Echo for Monitor
      Serial.print("DEBUG: Set LEDs to ");
      Serial.println(line);
    }
  }
}`);
  const [isGenerating, setIsGenerating] = useState(false);
  const monitorEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && !('serial' in navigator)) {
        setIsSupported(false);
        setErrorMsg("Web Serial API is not supported. Use Chrome or Edge.");
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'monitor' && monitorEndRef.current) {
        monitorEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [monitorLogs, activeTab]);

  const getQubitIntensities = () => {
    const intensities = new Array(numQubits).fill(0);
    const numStates = amplitudes.length;
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
    return intensities;
  };

  const connectSerial = async () => {
    setErrorMsg(null);
    try {
      if (!isSupported) throw new Error("Web Serial API not supported.");

      const p = await (navigator as any).serial.requestPort();
      await p.open({ baudRate: 115200 });
      
      // Setup Writer
      const textEncoder = new TextEncoderStream();
      const writableStreamClosed = textEncoder.readable.pipeTo(p.writable);
      const w = textEncoder.writable.getWriter();

      // Setup Reader
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = p.readable.pipeTo(textDecoder.writable);
      const r = textDecoder.readable.getReader();

      setPort(p);
      setWriter(w);
      readerRef.current = r;
      readerCancelledRef.current = false;
      setIsConnected(true);

      // Start Read Loop
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
           setMonitorLogs(prev => {
               const newLogs = [...prev, value];
               return newLogs.slice(-50); // Keep last 50 lines
           });
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
      const newCode = await generateHardwareCode(platform);
      setCode(newCode);
      setIsGenerating(false);
  };

  // Data Loop
  useEffect(() => {
    if (!isConnected || !writer) return;
    const sendData = async () => {
      try {
        const intensities = getQubitIntensities();
        const payload = JSON.stringify({ q: intensities }) + '\n';
        await writer.write(payload);
        setLastSent(payload.trim());
      } catch (err) {
        console.error("Write error", err);
        setIsConnected(false);
      }
    };
    sendData(); // Send on state change
  }, [amplitudes, isConnected, writer]);

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
                 {/* Visual Feedback */}
                 <div className="grid grid-cols-4 gap-2">
                    {getQubitIntensities().map((val, idx) => (
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
                    ))}
                 </div>

                 {/* Last Packet */}
                 <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Outgoing Data Stream</div>
                    <div className="font-mono text-xs text-cyan-400 truncate">
                       {lastSent || "Waiting for signal..."}
                    </div>
                 </div>

                 <div className="p-3 bg-blue-900/10 border border-blue-800/30 rounded-lg">
                    <h4 className="text-xs font-bold text-blue-300 mb-1 flex items-center gap-2">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Instructions
                    </h4>
                    <ul className="text-[10px] text-blue-200/70 space-y-1 list-disc list-inside">
                        <li>Connect your microcontroller via USB.</li>
                        <li>Click "Connect USB" above and select the port.</li>
                        <li>Ensure firmware is uploaded (see <strong>Code</strong> tab).</li>
                        <li>The app sends JSON probability data automatically.</li>
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
                         className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white text-xs font-bold py-1.5 rounded transition-colors flex items-center justify-center gap-2"
                      >
                         {isGenerating ? (
                             <>
                                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Generating...
                             </>
                         ) : (
                             <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                Generate Firmware
                             </>
                         )}
                      </button>
                  </div>

                  <div className="flex-1 relative border border-slate-700 rounded-lg overflow-hidden bg-[#0d1117] group">
                      <textarea 
                         value={code}
                         onChange={(e) => setCode(e.target.value)}
                         className="w-full h-full bg-transparent text-xs font-mono text-slate-300 p-3 resize-none outline-none custom-scrollbar"
                         spellCheck={false}
                      />
                      <button 
                        onClick={() => navigator.clipboard.writeText(code)}
                        className="absolute top-2 right-2 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copy to Clipboard"
                      >
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                      </button>
                  </div>
                  <p className="text-[9px] text-slate-500 text-center">
                     Copy this code to your Arduino IDE or Thonny to flash the device.
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