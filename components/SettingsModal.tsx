
import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: {
    qubitCount: number;
    stepCount: number;
  };
  onConfigChange: (newQubits: number, newSteps: number) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, config, onConfigChange }) => {
  const [localQubits, setLocalQubits] = useState(config.qubitCount);
  const [localSteps, setLocalSteps] = useState(config.stepCount);
  const [apiKeySet, setApiKeySet] = useState(false);

  useEffect(() => {
    setLocalQubits(config.qubitCount);
    setLocalSteps(config.stepCount);
  }, [config, isOpen]);

  useEffect(() => {
    // Check if API key is selected on mount/open
    const checkKey = async () => {
        const aistudio = (window as any).aistudio;
        if (aistudio?.hasSelectedApiKey) {
            const has = await aistudio.hasSelectedApiKey();
            setApiKeySet(has);
        }
    };
    if (isOpen) checkKey();
  }, [isOpen]);

  const handleSave = () => {
    onConfigChange(localQubits, localSteps);
    onClose();
  };
  
  const handleApiKeyChange = async () => {
      const aistudio = (window as any).aistudio;
      if (aistudio?.openSelectKey) {
          await aistudio.openSelectKey();
          const has = await aistudio.hasSelectedApiKey();
          setApiKeySet(has);
      } else {
          alert("API Key selection is managed by the hosting environment.");
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
           <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Settings
           </h2>
           <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </div>

        <div className="p-6 space-y-8">
            
            {/* API Section */}
            <div className="space-y-3">
                <label className="text-xs uppercase font-bold text-slate-500 tracking-widest block">API Access</label>
                <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${apiKeySet ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`}></div>
                        <div>
                            <div className="text-sm font-bold text-slate-200">{apiKeySet ? "API Key Active" : "No API Key"}</div>
                            <div className="text-[10px] text-slate-500">Google Gemini API</div>
                        </div>
                    </div>
                    <button 
                       onClick={handleApiKeyChange}
                       className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded border border-slate-700 transition-colors"
                    >
                        Change Key
                    </button>
                </div>
            </div>

            {/* System Section */}
            <div className="space-y-6">
                 <label className="text-xs uppercase font-bold text-slate-500 tracking-widest block border-b border-slate-800 pb-2">Quantum System Config</label>
                 
                 {/* Qubits */}
                 <div className="space-y-3">
                     <div className="flex justify-between">
                         <span className="text-sm font-bold text-slate-300">Qubits</span>
                         <span className="text-sm font-mono text-cyan-400 font-bold">{localQubits}</span>
                     </div>
                     <input 
                       type="range" min="2" max="6" step="1" 
                       value={localQubits}
                       onChange={(e) => setLocalQubits(parseInt(e.target.value))}
                       className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                     />
                     <div className="text-[10px] text-slate-500 flex justify-between">
                         <span>2 (Simple)</span>
                         <span>4 (Standard)</span>
                         <span>6 (Advanced)</span>
                     </div>
                 </div>

                 {/* Steps */}
                 <div className="space-y-3">
                     <div className="flex justify-between">
                         <span className="text-sm font-bold text-slate-300">Circuit Width</span>
                         <span className="text-sm font-mono text-purple-400 font-bold">{localSteps} Steps</span>
                     </div>
                     <input 
                       type="range" min="10" max="50" step="5" 
                       value={localSteps}
                       onChange={(e) => setLocalSteps(parseInt(e.target.value))}
                       className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                     />
                 </div>
            </div>
            
            <div className="bg-amber-900/10 border border-amber-500/20 p-3 rounded text-[10px] text-amber-200/70 leading-relaxed">
               <strong>Note:</strong> Changing qubit count or circuit width will resize the grid. Existing gates outside the new bounds may be truncated.
            </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-3">
             <button onClick={onClose} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors">
                 Cancel
             </button>
             <button onClick={handleSave} className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold uppercase tracking-wider rounded shadow-lg transition-transform active:scale-95">
                 Save Changes
             </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
