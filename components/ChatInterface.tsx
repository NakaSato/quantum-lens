
import React, { useState, useRef, useEffect } from 'react';
import { Gate, Message } from '../types';
import { explainCircuit, analyzeDocument } from '../services/geminiService';

interface ChatInterfaceProps {
  currentGates: Gate[];
  onApplyCircuit: (gates: Gate[]) => void;
}

const LANGUAGES = [
  'English',
  'Español', 
  'Français', 
  'Deutsch', 
  '中文', 
  '日本語', 
  'हिन्दी', 
  'Português',
  'ไทย'
];

const SUGGESTIONS = [
  "What is a Qubit?",
  "Explain Quantum Superposition",
  "How does the Hardware Bridge work?",
  "Write MicroPython code for Raspberry Pi Pico",
  "How does the Hadamard (H) gate work?",
  "What is the Pauli-X gate?",
  "Explain the difference: Bit vs Qubit",
  "What is Phase Kickback?",
  "What is a Bell State?",
  "Explain Grover's Search Algorithm"
];

// --- Markdown Parser Helpers ---

const parseInline = (text: string) => {
  // Split by bold (**...**) and inline code (`...`)
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-cyan-200">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-slate-700/50 text-orange-300 rounded px-1.5 py-0.5 text-[11px] font-mono border border-slate-700/50">{part.slice(1, -1)}</code>;
    }
    return part;
  });
};

const renderMessageContent = (text: string) => {
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  // 1. Split text into Code Blocks and Regular Text
  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    parts.push({ type: 'code', content: match[1] });
    lastIndex = codeBlockRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }

  // 2. Render each part
  return parts.map((part, index) => {
    if (part.type === 'code') {
      const lines = part.content.trim().split('\n');
      // Detect language if provided (e.g., ```python)
      const langLine = lines[0].trim();
      const isLang = langLine.length < 15 && /^[a-zA-Z0-9]+$/.test(langLine) && lines.length > 1;
      const codeContent = isLang ? lines.slice(1).join('\n') : part.content;
      const languageDisplay = isLang ? langLine : 'Code';

      return (
        <div key={index} className="my-3 rounded-lg overflow-hidden border border-slate-700/80 bg-[#0d1117] shadow-sm group">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/50 border-b border-slate-700/50">
             <span className="text-[10px] uppercase font-mono text-slate-400 select-none">{languageDisplay}</span>
          </div>
          <div className="p-3 overflow-x-auto custom-scrollbar">
            <pre className="text-xs font-mono text-slate-300 leading-relaxed tab-4">
              <code>{codeContent.trim()}</code>
            </pre>
          </div>
        </div>
      );
    } 

    // Regular Text Rendering (Headers, Lists, Paragraphs)
    return (
      <div key={index}>
        {part.content.split('\n').map((line, lineIdx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={lineIdx} className="h-2" />;

          // Headers
          if (line.startsWith('### ')) {
            return <h3 key={lineIdx} className="text-sm font-bold text-cyan-200 mt-4 mb-2">{parseInline(line.replace('### ', ''))}</h3>;
          }
          if (line.startsWith('## ')) {
            return <h2 key={lineIdx} className="text-base font-bold text-cyan-400 mt-5 mb-2 border-b border-slate-700/50 pb-1">{parseInline(line.replace('## ', ''))}</h2>;
          }
          
          // Bullet Lists
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return (
              <div key={lineIdx} className="flex gap-2 ml-1 my-1">
                <div className="text-cyan-500 mt-2 w-1 h-1 rounded-full bg-cyan-500 shrink-0" />
                <div className="flex-1 leading-relaxed text-slate-200">{parseInline(trimmed.substring(2))}</div>
              </div>
            );
          }
          
          // Numbered Lists (Simple heuristic)
          if (/^\d+\. /.test(trimmed)) {
             const dotIndex = trimmed.indexOf('. ');
             const num = trimmed.substring(0, dotIndex + 1);
             const content = trimmed.substring(dotIndex + 2);
             return (
               <div key={lineIdx} className="flex gap-2 ml-1 my-1">
                 <span className="text-cyan-500 font-mono text-xs mt-0.5 shrink-0 select-none">{num}</span>
                 <div className="flex-1 leading-relaxed text-slate-200">{parseInline(content)}</div>
               </div>
             );
          }

          // Paragraph
          return <div key={lineIdx} className="leading-relaxed min-h-[1.5em] text-slate-200">{parseInline(line)}</div>;
        })}
      </div>
    );
  });
};


const ChatInterface: React.FC<ChatInterfaceProps> = ({ currentGates, onApplyCircuit }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: "Hello! I'm your Quantum Tutor. Build a circuit on the left, and I can explain the physics behind it. \n\nYou can also upload academic papers (PDF) or circuit diagrams for me to analyze and apply to the board!",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Persist language selection
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
      try {
        return localStorage.getItem('ql_language') || 'English';
      } catch {
        return 'English';
      }
  });

  const [selectedFile, setSelectedFile] = useState<{data: string, type: string, name: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    setSelectedLanguage(newLang);
    try {
        localStorage.setItem('ql_language', newLang);
    } catch (err) {
        console.error("Failed to save language preference", err);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedFile({
            data: reader.result as string,
            type: file.type,
            name: file.name
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const processMessage = async (text: string, file: {data: string, type: string} | null) => {
    const userMsg: Message = {
      role: 'user',
      text: text || (file ? `Analyze this file (${file.type.includes('pdf') ? 'PDF' : 'Image'})` : ""),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    let responseText = "";
    let circuitData = undefined;

    // Logic Branch: Document Analysis vs Regular Chat
    if (file) {
        // Use the specialized document analyzer
        const result = await analyzeDocument(file.data, file.type, text);
        responseText = result.explanation;
        if (result.gates.length > 0) {
            circuitData = {
                gates: result.gates,
                description: "Extracted from document"
            };
        }
    } else {
        // Standard context-aware chat
        responseText = await explainCircuit(currentGates, userMsg.text, null, selectedLanguage);
    }

    const modelMsg: Message = {
      role: 'model',
      text: responseText,
      timestamp: new Date(),
      circuitData
    };

    setMessages(prev => [...prev, modelMsg]);
    setIsLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedFile) return;
    
    const textToSend = input;
    const fileToSend = selectedFile;
    
    setInput('');
    setSelectedFile(null);

    await processMessage(textToSend, fileToSend);
  };

  const handleSuggestionClick = (text: string) => {
    processMessage(text, null);
  };

  const handleExplainCurrent = async () => {
    await processMessage("Explain this circuit.", null);
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800">
      <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-cyan-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          Gemini Tutor
        </h2>
        <select 
          value={selectedLanguage}
          onChange={handleLanguageChange}
          className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
        >
          {LANGUAGES.map(lang => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[90%] rounded-2xl p-4 text-sm shadow-lg ${
                msg.role === 'user' 
                  ? 'bg-cyan-600 text-white rounded-br-none' 
                  : 'bg-slate-800/80 text-slate-200 rounded-bl-none border border-slate-700/50 backdrop-blur-sm'
              }`}
            >
               {msg.role === 'user' ? (
                 <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
               ) : (
                 <div className="space-y-1">
                    {renderMessageContent(msg.text)}
                    
                    {/* Actionable Circuit Button */}
                    {msg.circuitData && msg.circuitData.gates.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-700/50">
                            <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg border border-slate-700">
                                <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Circuit Extracted ({msg.circuitData.gates.length} gates)
                                </span>
                                <button 
                                    onClick={() => onApplyCircuit(msg.circuitData!.gates)}
                                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow transition-colors"
                                >
                                    Apply to Board
                                </button>
                            </div>
                        </div>
                    )}
                 </div>
               )}
            </div>
          </div>
        ))}

        {messages.length === 1 && !isLoading && (
          <div className="mt-6">
            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-3 px-1">Suggested Questions</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button 
                  key={i} 
                  onClick={() => handleSuggestionClick(s)}
                  className="text-left text-xs p-3 bg-slate-800/50 hover:bg-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 border border-slate-700 rounded-lg transition-all duration-200 flex items-center gap-2 group"
                >
                  <span className="text-cyan-500/50 group-hover:text-cyan-400">?</span>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
           <div className="flex justify-start">
             <div className="bg-slate-800 rounded-2xl rounded-bl-none p-3 border border-slate-700">
               <div className="flex gap-1">
                 <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
                 <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-75"></div>
                 <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-150"></div>
               </div>
             </div>
           </div>
        )}
      </div>

      <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
        {selectedFile && (
          <div className="relative w-fit group">
            {selectedFile.type.includes('image') ? (
                <img src={selectedFile.data} alt="Preview" className="h-16 w-auto rounded border border-slate-700 object-cover" />
            ) : (
                <div className="h-16 w-16 rounded border border-slate-700 bg-slate-800 flex flex-col items-center justify-center text-red-400">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    <span className="text-[8px] uppercase font-bold mt-1">PDF</span>
                </div>
            )}
            <div className="absolute top-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-bl">
                {selectedFile.name.length > 10 ? selectedFile.name.substring(0,8)+'...' : selectedFile.name}
            </div>
            <button 
              onClick={() => setSelectedFile(null)}
              className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5 hover:bg-rose-600 shadow-md"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {currentGates.length > 0 && !selectedFile && (
             <button 
                onClick={handleExplainCurrent}
                className="w-full text-xs py-2 px-3 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded transition-colors mb-2"
             >
                ✨ Analyze current circuit
             </button>
        )}
        <div className="flex gap-2 items-center">
          <input 
            type="file" 
            accept="image/*,application/pdf" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileSelect}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors border border-slate-700"
            title="Upload Image or PDF"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </button>
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={selectedFile ? "Ask about this file..." : "Ask about quantum physics..."}
            className="flex-1 bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5 outline-none placeholder-slate-500"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && !selectedFile)}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg px-4 py-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
