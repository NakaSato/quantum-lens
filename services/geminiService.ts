
import { GoogleGenAI, Type } from "@google/genai";
import { GateType, Gate, Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Hardware context string shared between functions
const HARDWARE_CONTEXT = `
    App Feature Context - Hardware Bridge:
    - The app allows connecting to external hardware (Arduino, ESP32, Raspberry Pi Pico) via Web Serial API to visualize qubit states physically.
    - Data Stream: The app calculates the probability P(|1>) for each qubit, scales it to 0-255 (PWM range), and sends it via Serial.
    - Baud Rate: 115200.
    - Protocol: JSON Lines. Example: {"q": [0, 255, 128, 64]} means q0 is 0% on, q1 is 100% on, q2 is 50%, q3 is 25%.
    - Default C++ code provided in the app uses the 'ArduinoJson' library.
`;

/**
 * Stream a chat response with full context of the circuit and conversation history.
 */
export const streamChat = async (
  gates: Gate[],
  currentMessage: string,
  history: Message[],
  imageBase64: string | null,
  language: string = "English",
  numQubits: number = 4
): Promise<AsyncIterable<string>> => {
  const model = "gemini-2.5-flash"; // Faster for chat interactions

  const gateDescription = gates.length > 0 
    ? gates.map(g => `${g.type} on q${g.target}${g.control !== undefined ? ` (controlled by q${g.control})` : ''}`).join(", ") 
    : `No gates applied (Identity state |${'0'.repeat(numQubits)}>)`;

  const systemInstruction = `
    You are an expert Quantum Computing Tutor for a visual programming tool called "QuantumLens".
    You are also an expert in the Google Cirq Python framework and Embedded Systems programming (Arduino C++, MicroPython).
    
    ${HARDWARE_CONTEXT}
    
    Current Circuit Context (The user is currently editing this):
    - ${numQubits}-Qubit System (${Array.from({length: numQubits}, (_, i) => `q${i}`).join(', ')})
    - Initial State: |${'0'.repeat(numQubits)}>
    - Gate Sequence Applied: [${gateDescription}]
    
    Instructions:
    1. Respond strictly in ${language}.
    2. Be concise, friendly, and accurate.
    3. Use analogies suitable for a computer science student learning quantum physics.
    4. If Entanglement is present, explain it clearly.
    5. If the user asks about code, provide the equivalent Python code using the 'cirq' library.
    6. Format output with Markdown. Use simple bullet points.
  `;

  // Construct Content History
  // We filter out any previous messages that might have huge payloads or invalid roles if necessary
  const contents = history.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
  }));

  // Add current turn
  const currentParts: any[] = [];
  if (imageBase64) {
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    currentParts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Data
      }
    });
  }
  currentParts.push({ text: currentMessage });
  
  // Note: We don't push to 'contents' array immediately if we want to follow strict typing 
  // but generateContentStream accepts the full history including current turn.
  contents.push({ role: 'user', parts: currentParts });

  try {
    const responseStream = await ai.models.generateContentStream({
      model: model,
      contents: contents as any,
      config: {
        systemInstruction: systemInstruction,
        // Using a balanced config for chat
        temperature: 0.7,
      }
    });

    async function* iterator() {
        for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) yield text;
        }
    }
    return iterator();

  } catch (error) {
    console.error("Gemini Chat Error:", error);
    // Return a generator that yields a single error message
    async function* errorIterator() {
        yield "I'm having trouble connecting to the quantum realm right now. Please try again.";
    }
    return errorIterator();
  }
};

// ... (Existing explainCircuit can remain for legacy single-shot use or be deprecated) ...
export const explainCircuit = async (
  gates: Gate[], 
  currentQuestion?: string, 
  imageBase64?: string | null, 
  language: string = "English",
  numQubits: number = 4
): Promise<string> => {
  // Legacy support using the streaming function but awaiting full response
  let fullText = "";
  const iterator = await streamChat(gates, currentQuestion || "Explain this circuit", [], imageBase64, language, numQubits);
  for await (const chunk of iterator) {
      fullText += chunk;
  }
  return fullText;
};

/**
 * New function to analyze Documents (PDFs/Images) specifically to extract circuits.
 */
export const analyzeDocument = async (
    base64Data: string, 
    mimeType: string,
    prompt: string
): Promise<{ explanation: string, gates: Gate[] }> => {
    const model = "gemini-3-pro-preview";

    const systemInstruction = `
        You are a Quantum Research Assistant. 
        Your task is to analyze academic papers (PDF) or circuit diagrams (Images).
        
        1. Identify any Quantum Circuit, Algorithm, or Equation in the document.
        2. Explain the concept found.
        3. EXTRACT the circuit into a list of gates that can be executed on a quantum simulator.
        
        Supported Gates: H, X, Y, Z, S, T, CX, CZ, CY, CS.
        
        If the circuit uses generic unitary U or unsupported gates, approximate it using supported gates or skip that part with a note in the explanation.
    `;

    const parts = [
        {
            inlineData: {
                mimeType: mimeType,
                data: base64Data.includes(',') ? base64Data.split(',')[1] : base64Data
            }
        },
        { text: prompt || "Analyze this document and extract the quantum circuit." }
    ];

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        explanation: { type: Type.STRING },
                        gates: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING },
                                    type: { type: Type.STRING },
                                    target: { type: Type.INTEGER },
                                    control: { type: Type.INTEGER, nullable: true }
                                },
                                required: ["type", "target"]
                            }
                        }
                    },
                    required: ["explanation", "gates"]
                },
                thinkingConfig: { thinkingBudget: 16000 }
            }
        });

        const text = response.text;
        if (!text) throw new Error("No response generated");
        
        const result = JSON.parse(text);
        
        // Post-process to ensure IDs exist
        const gates = result.gates.map((g: any) => ({
            ...g,
            id: g.id || Math.random().toString(36).substr(2, 9)
        }));

        return { explanation: result.explanation, gates };

    } catch (error) {
        console.error("Document Analysis Error:", error);
        return { 
            explanation: "I was unable to process the document for circuits. Please ensure it contains a clear quantum circuit diagram or description.", 
            gates: [] 
        };
    }
};

export const generateCircuitFromText = async (prompt: string): Promise<Gate[]> => {
  return []; 
};

export const generateHardwareCode = async (platform: string, mode: 'pwm' | 'neopixel' = 'pwm'): Promise<string> => {
  const model = "gemini-3-pro-preview";
  
  const modeContext = mode === 'neopixel' 
    ? `Mode: NEOPIXEL (Smart LEDs). 
       - Expect JSON format: {"n": [[R,G,B], [R,G,B], ...]} where values are 0-255.
       - Use 'Adafruit_NeoPixel' library for Arduino/ESP32 or 'neopixel' for MicroPython.
       - Use 4 LEDs on Data Pin 6 (Arduino), 16 (ESP32), or 0 (Pico).`
    : `Mode: PWM (Standard LEDs).
       - Expect JSON format: {"q": [v0, v1, v2, v3]} where v is 0-255 brightness.
       - Map to PWM pins.`;

  const prompt = `
    Generate complete, compilable firmware code for the "${platform}" to work with the QuantumLens Hardware Bridge.
    
    ${modeContext}

    Requirements:
    1. Initialize Serial communication at 115200 baud.
    2. Listen for newline-terminated JSON strings.
    3. Parse the JSON (using 'ArduinoJson' for C++ or 'ujson' for Python).
    4. Apply values to LEDs based on Mode.
    5. INPUT HANDLING: Add a physical button (on Pin 2 or GP2).
       - When pressed (debounce it), send '{"cmd": "next"}' via Serial to the computer.
       - This allows the user to step through the circuit using hardware.
    
    Output ONLY code, no markdown explanations.
  `;
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 2048 } }
    });
    let code = response.text || "";
    code = code.replace(/```\w*\n/g, "").replace(/```/g, "");
    return code;
  } catch (error) {
    return "// Error generating code.";
  }
};

export interface QuantumAlgorithmSolution {
    explanation: string;
    algorithmName: string;
    gates: { type: string, target: number, control?: number }[];
    interpretation: string;
}

export const solveQuantumProblem = async (problem: string): Promise<QuantumAlgorithmSolution | null> => {
    const model = "gemini-3-pro-preview";

    const systemInstruction = `
        You are a Quantum Algorithm Architect.
        Your goal is to translate a real-world problem or mathematical equation into a Quantum Circuit.

        Capabilities:
        - Search Problems (Grover's)
        - Boolean Logic / Equations (e.g., find x where f(x)=1)
        - Entanglement patterns
        - Simple Arithmetics (Adder via QFT or logical gates)

        Rules:
        1. Always initialize from |0000...>.
        2. Use a maximum of 20 gates.
        3. "Gates" array must be strictly linear execution order.
        4. ALLOWED GATE TYPES: "H", "X", "Y", "Z", "S", "T", "CX", "CZ", "CY", "CS".
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: `Solve this problem using quantum computing: "${problem}"`,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        algorithmName: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                        interpretation: { type: Type.STRING },
                        gates: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    type: { type: Type.STRING },
                                    target: { type: Type.INTEGER },
                                    control: { type: Type.INTEGER, nullable: true }
                                },
                                required: ["type", "target"]
                            }
                        }
                    },
                    required: ["algorithmName", "explanation", "gates", "interpretation"]
                },
                thinkingConfig: { thinkingBudget: 4096 }
            }
        });
        
        const text = response.text;
        if (!text) return null;
        return JSON.parse(text) as QuantumAlgorithmSolution;

    } catch (e) {
        console.error("Solver Error", e);
        return null;
    }
};

export interface RigSpecification {
    name: string;
    description: string;
    theme: 'gold' | 'cyber' | 'lab';
    coreColor: string;
    stages: number;
    cableStyle: 'messy' | 'clean' | 'fiber';
}

export const generateRigSpecification = async (numQubits: number, depth: number): Promise<RigSpecification> => {
    const model = "gemini-2.5-flash"; 
    
    const prompt = `
        Analyze a quantum circuit with ${numQubits} qubits and depth ${depth}.
        Invent a fictional, high-tech quantum computer model that would be required to run this specific circuit.
        
        Return a JSON object with:
        - name: A cool sci-fi name (e.g., "Chronos-4 Dilution", "Sycamore Prime").
        - description: A 2-sentence marketing description of its capability.
        - theme: Visual style, strictly one of: 'gold' (Steampunk/IBM style), 'cyber' (Neon/Dark), 'lab' (Clean/White).
        - coreColor: Hex code for the glowing core (e.g., #00ff00).
        - stages: Number of cooling stages (integer 3-8).
        - cableStyle: 'messy' (lots of coax), 'clean' (hidden wiring), or 'fiber' (glowing optical).
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        description: { type: Type.STRING },
                        theme: { type: Type.STRING, enum: ['gold', 'cyber', 'lab'] },
                        coreColor: { type: Type.STRING },
                        stages: { type: Type.INTEGER },
                        cableStyle: { type: Type.STRING, enum: ['messy', 'clean', 'fiber'] }
                    },
                    required: ['name', 'description', 'theme', 'coreColor', 'stages', 'cableStyle']
                }
            }
        });
        return JSON.parse(response.text || "{}") as RigSpecification;
    } catch (e) {
        return {
            name: "Generic QPU",
            description: "Standard quantum processing unit.",
            theme: "gold",
            coreColor: "#ff00ff",
            stages: 5,
            cableStyle: "messy"
        };
    }
};
