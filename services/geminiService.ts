
import { GoogleGenAI, Type } from "@google/genai";
import { GateType, Gate } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// ... (keep existing explainCircuit code) ...
export const explainCircuit = async (
  gates: Gate[], 
  currentQuestion?: string, 
  imageBase64?: string | null, 
  language: string = "English"
): Promise<string> => {
  const model = "gemini-3-pro-preview";
  
  const gateDescription = gates.length > 0 
    ? gates.map(g => `${g.type} on q${g.target}${g.control !== undefined ? ` (controlled by q${g.control})` : ''}`).join(", ") 
    : "No gates applied (Identity state |0000>)";

  const hardwareContext = `
    App Feature Context - Hardware Bridge:
    - The app allows connecting to external hardware (Arduino, ESP32, Raspberry Pi Pico) via Web Serial API to visualize qubit states physically.
    - Data Stream: The app calculates the probability P(|1>) for each qubit, scales it to 0-255 (PWM range), and sends it via Serial.
    - Baud Rate: 115200.
    - Protocol: JSON Lines. Example: {"q": [0, 255, 128, 64]} means q0 is 0% on, q1 is 100% on, q2 is 50%, q3 is 25%.
    - Default C++ code provided in the app uses the 'ArduinoJson' library.
  `;

  const promptText = `
    You are an expert Quantum Computing Tutor for a visual programming tool called "QuantumLens".
    You are also an expert in the Google Cirq Python framework and Embedded Systems programming (Arduino C++, MicroPython).
    
    ${hardwareContext}
    
    Current Circuit Context (in the app editor):
    - 4-Qubit System (q0, q1, q2, q3)
    - Initial State: |0000>
    - Gate Sequence Applied: [${gateDescription}]
    
    User Question: ${currentQuestion || "Explain what this specific sequence of gates does to the system state."}

    ${imageBase64 ? "The user has uploaded an image. Please analyze this image. It is likely a quantum circuit diagram, a physics equation, or a whiteboard sketch. Relate it to the current circuit if relevant, or explain the concepts shown in the image." : ""}

    Instructions:
    1. Respond strictly in ${language}.
    2. Be concise but accurate.
    3. Use analogies suitable for a computer science student learning quantum physics.
    4. If Entanglement is present, explain it clearly.
    5. If the user asks about code, provide the equivalent Python code using the 'cirq' library.
       - Use 'q0, q1, q2, q3 = cirq.GridQubit.rect(1, 4)' for 4 qubits.
    6. If the user asks about Hardware/Arduino/MicroPython:
       - Explain the JSON protocol ({"q": [...]}).
       - Provide code snippets for the requested platform (e.g., MicroPython for Pico using 'json' and 'machine.PWM').
    
    Format:
    - Use Markdown headers (###) for sections.
    - Use bullet points (- ) for lists.
    - Use bold (**text**) for key terms.
    - Code blocks must be fenced with \`\`\`language ... \`\`\`.
  `;

  const parts: any[] = [];
  
  if (imageBase64) {
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Data
      }
    });
  }
  
  parts.push({ text: promptText });

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
        systemInstruction: "You are a helpful, precise, and enthusiastic quantum physics instructor proficient in Google Cirq and Embedded Hardware.",
      }
    });

    return response.text || "I couldn't analyze that at the moment.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error connecting to the quantum knowledge base.";
  }
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
        3. EXTRACT the circuit into a list of gates that can be executed on a 4-qubit simulator.
        
        Supported Gates: H, X, Y, Z, S, T, CX, CZ, CY, CS.
        Qubits: 0, 1, 2, 3.
        
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

// ... (keep generateHardwareCode and solveQuantumProblem) ...
export const generateHardwareCode = async (platform: string): Promise<string> => {
  const model = "gemini-3-pro-preview";
  const prompt = `
    Generate complete, compilable firmware code for the "${platform}" to work with the QuantumLens Hardware Bridge.
    Requirements:
    1. Initialize Serial communication at 115200 baud.
    2. Listen for newline-terminated JSON strings. Format: {"q": [v0, v1, v2, v3]} where v is 0-255.
    3. Parse the JSON (using ArduinoJson for C++ or ujson for Python).
    4. Write the values to 4 PWM-capable pins.
    5. Print "DEBUG: Received <value>" back to Serial.
    Specifics:
    - Arduino Uno: pins 3, 5, 6, 9. <ArduinoJson.h>.
    - ESP32: pins 16, 17, 18, 19.
    - Pico: GP0, GP1, GP2, GP3. 'machine.PWM'.
    Output ONLY code, no markdown.
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
        Your goal is to translate a real-world problem or mathematical equation into a Quantum Circuit (max 4 qubits: q0, q1, q2, q3).

        Capabilities:
        - Search Problems (Grover's)
        - Boolean Logic / Equations (e.g., find x where f(x)=1)
        - Entanglement patterns
        - Simple Arithmetics (Adder via QFT or logical gates)

        Rules:
        1. Always initialize from |0000>.
        2. Use a maximum of 20 gates.
        3. If the problem is "Factor 15", simulate a simplified version or just set the state to the answer for demonstration if the circuit is too deep for 4 qubits.
        4. "Gates" array must be strictly linear execution order.
        5. ALLOWED GATE TYPES: "H", "X", "Y", "Z", "S", "T", "CX", "CZ", "CY", "CS".
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
