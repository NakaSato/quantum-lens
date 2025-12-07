
import React, { useState, useRef, useEffect } from 'react';
import { Gate, Message } from '../types';
import { streamChat, analyzeDocument } from '../services/geminiService';
import CameraModal from './CameraModal';

interface ChatInterfaceProps {
  currentGates: Gate[];
  onApplyCircuit: (gates: Gate[]) => void;
  numQubits?: number;
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

// --- Sub-Components ---

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language = 'CODE' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-slate-700/80 bg-[#0d1117] shadow-sm group relative">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/50 border-b border-slate-700/50">
         <span className="text-[10px] uppercase font-mono text-slate-400 select-none">{language}</span>
         <button 
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500 hover:text-white transition-colors"
         >
            {copied ? (
                <>
                  <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-emerald-400">Copied</span>
                </>
            ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                  <span>Copy</span>
                </>
            )}
         </button>
      </div>
      <div className="p-3 overflow-x-auto custom-scrollbar">
        <pre className="text-xs font-mono text-slate-300 leading-relaxed tab-4">
          <code>{code.trim()}</code>
        </pre>
      </div>
    </div>
  );
};

const renderMessageContent = (text: string) => {
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

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

  return parts.map((part, index) => {
    if (part.type === 'code') {
      const lines = part.content.trim().split('\n');
      const langLine = lines[0].trim();
      const isLang = langLine.length < 15 && /^[a-zA-Z0-9]+$/.test(langLine) && lines.length > 1;
      const codeContent = isLang ? lines.slice(1).join('\n') : part.content;
      const languageDisplay = isLang ? langLine : 'Code';
      return <CodeBlock key={index} code={codeContent} language={languageDisplay} />;
    } 

    const parseInline = (text: string) => {
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

    return (
      <div key={index}>
        {part.content.split('\n').map((line, lineIdx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={lineIdx} className="h-2" />;
          if (line.startsWith('### ')) {
            return <h3 key={lineIdx} className="text-sm font-bold text-cyan-200 mt-4 mb-2">{parseInline(line.replace('### ', ''))}</h3>;
          }
          if (line.startsWith('## ')) {
            return <h2 key={lineIdx} className="text-base font-bold text-cyan-400 mt-5 mb-2 border-b border-slate-700/50 pb-1">{parseInline(line.replace('## ', ''))}</h2>;
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return (
              <div key={lineIdx} className="flex gap-2 ml-1 my-1">
                <div className="text-cyan-500 mt-2 w-1 h-1 rounded-full bg-cyan-500 shrink-0" />
                <div className="flex-1 leading-relaxed text-slate-200">{parseInline(trimmed.substring(2))}</div>
              </div>
            );
          }
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
          return <div key={lineIdx} className="leading-relaxed min-h-[1.5em] text-slate-200">{parseInline(line)}</div>;
        })}
      </div>
    );
  });
};

const BotAvatar = () => (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-lg border border-white/10">
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
    </div>
);

const UserAvatar = () => (
    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0 shadow-lg border border-white/10">
        <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
    </div>
);

// --- Main Component ---

const ChatInterface: React.FC<ChatInterfaceProps> = ({ currentGates, onApplyCircuit, numQubits = 4 }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: "Hello! I'm your Quantum Tutor. Build a circuit on the left, and I can explain the physics behind it. \n\nYou can also upload academic papers (PDF) or circuit diagrams for me to analyze and apply to the board!",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

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

  const handleCameraCapture = (base64Image: string) => {
      setSelectedFile({
          data: base64Image,
          type: 'image/jpeg',
          name: `capture_${new Date().toISOString().split('T')[0]}.jpg`
      });
  };

  const processMessage = async (text: string, file: {data: string, type: string} | null) => {
    const userMsg: Message = {
      role: 'user',
      text: text || (file ? `Analyze this file (${file.type.includes('pdf') ? 'PDF' : 'Image'})` : ""),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    let finalResponseText = "";
    let circuitData = undefined;

    try {
        // Logic Branch: Document Analysis vs Regular Chat
        if (file && file.type.includes('pdf')) {
            // Use specialized document analyzer for PDFs (usually one-shot)
            const result = await analyzeDocument(file.data, file.type, text);
            finalResponseText = result.explanation;
            if (result.gates.length > 0) {
                circuitData = {
                    gates: result.gates,
                    description: "Extracted from document"
                };
            }
            
            const modelMsg: Message = {
                role: 'model',
                text: finalResponseText,
                timestamp: new Date(),
                circuitData
            };
            setMessages(prev => [...prev, modelMsg]);

        } else {
            // Streaming Chat for text or image queries
            // Create a placeholder message for streaming
            const placeholderMsg: Message = {
                role: 'model',
                text: '',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, placeholderMsg]);

            const stream = await streamChat(
                currentGates, 
                userMsg.text, 
                messages, // Pass history
                file ? file.data : null, 
                selectedLanguage, 
                numQubits
            );

            for await (const chunk of stream) {
                finalResponseText += chunk;
                // Update the last message (placeholder) with accumulated text
                setMessages(prev => {
                    const newHistory = [...prev];
                    const lastIdx = newHistory.length - 1;
                    newHistory[lastIdx] = {
                        ...newHistory[lastIdx],
                        text: finalResponseText
                    };
                    return newHistory;
                });
            }
        }
    } catch (e) {
        console.error("Chat Error", e);
        setMessages(prev => [...prev, {
            role: 'model',
            text: "Sorry, I encountered an error processing your request.",
            timestamp: new Date()
        }]);
    }

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
      <CameraModal 
        isOpen={isCameraOpen} 
        onClose={() => setIsCameraOpen(false)} 
        onCapture={handleCameraCapture} 
      />

      <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center shadow-md z-10">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <BotAvatar />
          <div>
              <div className="leading-none">Gemini Tutor</div>
              <div className="text-[9px] text-slate-500 font-normal mt-0.5">Powered by Google GenAI</div>
          </div>
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

      <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div key={idx} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              
              {/* Avatar */}
              <div className="shrink-0 mt-1">
                  {isUser ? <UserAvatar /> : <BotAvatar />}
              </div>

              {/* Message Bubble */}
              <div 
                className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-sm ${
                  isUser 
                    ? 'bg-slate-800 text-slate-100 rounded-tr-sm border border-slate-700' 
                    : 'bg-slate-900/50 text-slate-200 rounded-tl-sm border border-slate-800'
                }`}
              >
                 {isUser ? (
                   <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                 ) : (
                   <div className="space-y-1 min-h-[20px]">
                      {msg.text ? renderMessageContent(msg.text) : (
                          <div className="flex gap-1 h-5 items-center">
                             <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></div>
                             <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-75"></div>
                             <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce delay-150"></div>
                          </div>
                      )}
                      
                      {/* Actionable Circuit Button */}
                      {msg.circuitData && msg.circuitData.gates.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-700/50 animate-in fade-in slide-in-from-top-2">
                              <div className="flex items-center justify-between bg-slate-950/50 p-3 rounded-lg border border-slate-800 hover:border-emerald-500/30 transition-colors group">
                                  <div>
                                      <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                          Circuit Found
                                      </span>
                                      <span className="text-[10px] text-slate-500">{msg.circuitData.gates.length} operations extracted</span>
                                  </div>
                                  <button 
                                      onClick={() => onApplyCircuit(msg.circuitData!.gates)}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow-lg transition-transform active:scale-95 group-hover:shadow-emerald-900/20"
                                  >
                                      Apply
                                  </button>
                              </div>
                          </div>
                      )}
                   </div>
                 )}
              </div>
            </div>
          );
        })}

        {/* Suggestion Chips */}
        {messages.length === 1 && !isLoading && (
          <div className="mt-8 px-2 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-4 px-1 text-center">Start a conversation</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SUGGESTIONS.map((s, i) => (
                <button 
                  key={i} 
                  onClick={() => handleSuggestionClick(s)}
                  className="text-left text-xs p-3 bg-slate-800/40 hover:bg-slate-800 hover:border-cyan-500/30 text-slate-400 hover:text-cyan-300 border border-slate-700/50 rounded-xl transition-all duration-200 flex items-center gap-3 group"
                >
                  <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-600 group-hover:text-cyan-400 group-hover:bg-slate-900 transition-colors">
                      ?
                  </div>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3 z-10">
        {selectedFile && (
          <div className="relative w-fit group animate-in zoom-in-95 duration-200">
            {selectedFile.type.includes('image') ? (
                <img src={selectedFile.data} alt="Preview" className="h-16 w-auto rounded-lg border border-slate-700 object-cover shadow-md" />
            ) : (
                <div className="h-16 w-16 rounded-lg border border-slate-700 bg-slate-800 flex flex-col items-center justify-center text-red-400 shadow-md">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    <span className="text-[8px] uppercase font-bold mt-1">PDF</span>
                </div>
            )}
            <div className="absolute top-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-bl">
                {selectedFile.name.length > 10 ? selectedFile.name.substring(0,8)+'...' : selectedFile.name}
            </div>
            <button 
              onClick={() => setSelectedFile(null)}
              className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5 hover:bg-rose-600 shadow-md transition-transform hover:scale-110"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {currentGates.length > 0 && !selectedFile && messages.length > 1 && (
             <button 
                onClick={handleExplainCurrent}
                className="w-full text-xs py-2 px-3 bg-slate-800/50 hover:bg-slate-800 text-cyan-400 border border-slate-700/50 hover:border-slate-600 rounded-lg transition-colors mb-2 flex items-center justify-center gap-2"
             >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Analyze current circuit state
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
            onClick={() => setIsCameraOpen(true)}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-400 rounded-xl transition-colors border border-slate-700"
            title="Take Photo"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl transition-colors border border-slate-700"
            title="Upload Image or PDF"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </button>
          
          <div className="flex-1 relative">
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={selectedFile ? "Ask about this file..." : "Ask about quantum physics..."}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 block p-2.5 pl-4 outline-none placeholder-slate-500 shadow-inner"
            />
          </div>
          
          <button
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && !selectedFile)}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl px-4 py-2.5 transition-colors shadow-lg shadow-cyan-900/20 active:scale-95"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
