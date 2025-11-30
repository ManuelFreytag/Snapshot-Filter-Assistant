
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { EvaluationResult } from '../types';

// Schema for single image result
const evaluationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    compositionScore: { type: Type.NUMBER, description: "Score from 0-100 for visual composition" },
    lightingScore: { type: Type.NUMBER, description: "Score from 0-100 for lighting quality" },
    technicalScore: { type: Type.NUMBER, description: "Score from 0-100 for focus, sharpness, and noise" },
    artisticScore: { type: Type.NUMBER, description: "Score from 0-100 for emotional impact and creativity" },
    totalScore: { type: Type.NUMBER, description: "Overall score from 0-100 representing potential" },
    isWorthKeeping: { type: Type.BOOLEAN, description: "True if the image is worth preserving. False if it should be discarded." },
    feedback: { type: Type.STRING, description: "Max 2 sentences." },
  },
  required: ["compositionScore", "lightingScore", "technicalScore", "artisticScore", "totalScore", "isWorthKeeping", "feedback"],
};

// Schema for group result (Map of filename -> result)
const groupEvaluationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
            fileName: { type: Type.STRING },
            evaluation: evaluationSchema
        },
        required: ["fileName", "evaluation"]
      }
    }
  },
  required: ["results"]
};

const getApiKey = (): string | undefined => {
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
    return process.env.API_KEY;
  }
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_API_KEY;
  }
  return undefined;
};

const createAI = () => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("API Key is missing.");
    return new GoogleGenAI({ apiKey });
}

export const evaluateImage = async (base64Image: string, mimeType: string): Promise<EvaluationResult> => {
  const ai = createAI();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: mimeType } },
          {
            text: `Act as a professional photo archivist. Analyze this image to decide if it has potential ("Select") or is a failed shot ("Reject").
            
            Criteria for KEEPING:
            - Interesting moment or subject.
            - Good composition/lighting.
            - Fixable flaws.
            
            Criteria for DISCARDING:
            - Severe motion blur/out of focus.
            - Accidental shots.
            
            Provide constructive feedback.`
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: evaluationSchema,
        temperature: 0.4, 
      },
    });

    if (response.text) return JSON.parse(response.text) as EvaluationResult;
    throw new Error("No response text");
  } catch (error) {
    console.error("Gemini Evaluation Failed:", error);
    throw error;
  }
};

export interface ImageInput {
    name: string;
    base64: string;
    mimeType: string;
}

export const evaluateImageGroup = async (images: ImageInput[]): Promise<Record<string, EvaluationResult>> => {
    const ai = createAI();
    
    // Construct parts: text instruction + images
    const parts: any[] = [];
    
    // Add images with text labels to help the model identify them
    images.forEach(img => {
        parts.push({ text: `Image Filename: ${img.name}` });
        parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
    });

    parts.push({
        text: `You are evaluating a burst/series of ${images.length} photos. 
        COMPARE them against each other.
        
        Task:
        1. Identify the BEST shot (sharpest focus, best expression, best composition). Mark it as 'isWorthKeeping: true' and give it a high score.
        2. Mark the INFERIOR duplicates as 'isWorthKeeping: false' (Reject). 
           In the feedback for rejects, state: "Discarded in favor of [Winner Filename] due to [reason]".
        3. If multiple images capture significantly different moments or are both excellent, you may keep multiple.
        
        Return a JSON object containing a list of results.`
    });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts },
            config: {
                responseMimeType: "application/json",
                responseSchema: groupEvaluationSchema,
                temperature: 0.2, // Lower temperature for consistent comparison
            },
        });

        if (response.text) {
            const parsed = JSON.parse(response.text);
            // Convert list back to map
            const resultMap: Record<string, EvaluationResult> = {};
            if (parsed.results && Array.isArray(parsed.results)) {
                parsed.results.forEach((r: any) => {
                    resultMap[r.fileName] = r.evaluation;
                });
            }
            return resultMap;
        }
        throw new Error("No response text");
    } catch (error) {
        console.error("Group Evaluation Failed:", error);
        throw error;
    }
};
