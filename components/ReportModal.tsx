
import React, { useState } from 'react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (name: string, password: string) => void;
  projectTitle: string;
}

const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, onGenerate, projectTitle }) => {
  const [studentName, setStudentName] = useState("");
  const [password, setPassword] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    // Add small delay to show UI feedback
    await new Promise(resolve => setTimeout(resolve, 500));
    onGenerate(studentName, password);
    setIsGenerating(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
        
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
           <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Generate Lab Report
           </h2>
           <button onClick={onClose} className="text-slate-500 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
            
            <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Student Name</label>
                <input 
                  type="text" 
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white focus:border-emerald-500 outline-none placeholder-slate-600"
                  autoFocus
                />
            </div>

            <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Password Protection <span className="text-slate-600 font-normal normal-case">(Optional)</span>
                </label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white focus:border-emerald-500 outline-none placeholder-slate-600"
                />
                <p className="text-[9px] text-slate-500 mt-1">
                    If set, the PDF will require this password to open.
                </p>
            </div>

            <div className="bg-slate-800/50 p-3 rounded border border-slate-800">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Project:</span>
                    <span className="text-white font-medium truncate max-w-[150px]">{projectTitle}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                    <span>Format:</span>
                    <span className="text-white font-medium">PDF (Standard Lab)</span>
                </div>
            </div>

            <button 
               type="submit" 
               disabled={isGenerating}
               className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
            >
               {isGenerating ? (
                   <>
                     <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                     Generating...
                   </>
               ) : (
                   "Download PDF"
               )}
            </button>

        </form>
      </div>
    </div>
  );
};

export default ReportModal;
