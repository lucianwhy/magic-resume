import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AI_MODEL_CONFIGS, AIModelType } from "@/config/ai";

interface AIConfigState {
  selectedModel: AIModelType;
  doubaoApiKey: string;
  doubaoModelId: string;
  deepseekApiKey: string;
  deepseekModelId: string;
  openaiApiKey: string;
  openaiModelId: string;
  openaiApiEndpoint: string;
  geminiApiKey: string;
  geminiModelId: string;
  digitalHumanEnabled: boolean;
  digitalHumanApiUrl: string;
  digitalHumanModel: string;
  setDigitalHumanEnabled: (enabled: boolean) => void;
  setDigitalHumanApiUrl: (url: string) => void;
  setDigitalHumanModel: (model: string) => void;
  setSelectedModel: (model: AIModelType) => void;
  setDoubaoApiKey: (apiKey: string) => void;
  setDoubaoModelId: (modelId: string) => void;
  setDeepseekApiKey: (apiKey: string) => void;
  setDeepseekModelId: (modelId: string) => void;
  setOpenaiApiKey: (apiKey: string) => void;
  setOpenaiModelId: (modelId: string) => void;
  setOpenaiApiEndpoint: (endpoint: string) => void;
  setGeminiApiKey: (apiKey: string) => void;
  setGeminiModelId: (modelId: string) => void;
  isConfigured: () => boolean;
}

export const useAIConfigStore = create<AIConfigState>()(
  persist(
    (set, get) => ({
      selectedModel: "doubao",
      doubaoApiKey: "",
      doubaoModelId: "",
      deepseekApiKey: "",
      deepseekModelId: "",
      openaiApiKey: "",
      openaiModelId: "",
      openaiApiEndpoint: "",
      geminiApiKey: "",
      geminiModelId: "gemini-flash-latest",
      digitalHumanEnabled: true,
      digitalHumanApiUrl: import.meta.env.VITE_DIGITAL_HUMAN_API_BASE_URL ?? "http://127.0.0.1:8210",
      digitalHumanModel: "mock",
      setSelectedModel: (model: AIModelType) => set({ selectedModel: model }),
      setDoubaoApiKey: (apiKey: string) => set({ doubaoApiKey: apiKey }),
      setDoubaoModelId: (modelId: string) => set({ doubaoModelId: modelId }),
      setDeepseekApiKey: (apiKey: string) => set({ deepseekApiKey: apiKey }),
      setDeepseekModelId: (modelId: string) => set({ deepseekModelId: modelId }),
      setOpenaiApiKey: (apiKey: string) => set({ openaiApiKey: apiKey }),
      setOpenaiModelId: (modelId: string) => set({ openaiModelId: modelId }),
      setOpenaiApiEndpoint: (endpoint: string) => set({ openaiApiEndpoint: endpoint }),
      setGeminiApiKey: (apiKey: string) => set({ geminiApiKey: apiKey }),
      setGeminiModelId: (modelId: string) => set({ geminiModelId: modelId }),
      setDigitalHumanEnabled: (enabled: boolean) => set({ digitalHumanEnabled: enabled }),
      setDigitalHumanApiUrl: (url: string) => set({ digitalHumanApiUrl: url.trim() }),
      setDigitalHumanModel: (model: string) => set({ digitalHumanModel: model }),
      isConfigured: () => {
        const state = get();
        const config = AI_MODEL_CONFIGS[state.selectedModel];
        return config.validate(state);
      }
    }),
    {
      name: "ai-config-storage"
    }
  )
);
