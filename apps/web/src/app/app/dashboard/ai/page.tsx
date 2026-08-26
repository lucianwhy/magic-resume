import { useEffect, useState } from "react";
import { Bot, Check, ExternalLink, Sparkles } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DeepSeekLogo from "@/components/ai/icon/IconDeepseek";
import IconDoubao from "@/components/ai/icon/IconDoubao";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { cn } from "@/lib/utils";
import IconOpenAi from "@/components/ai/icon/IconOpenAi";

const AISettingsPage = () => {
  const {
    doubaoApiKey,
    doubaoModelId,
    deepseekApiKey,
    openaiApiKey,
    openaiModelId,
    openaiApiEndpoint,
    geminiApiKey,
    geminiModelId,
    setDoubaoApiKey,
    setDoubaoModelId,
    setDeepseekApiKey,
    setOpenaiApiKey,
    setOpenaiModelId,
    setOpenaiApiEndpoint,
    setGeminiApiKey,
    setGeminiModelId,
    selectedModel,
    setSelectedModel,
  } = useAIConfigStore();
  const {
    digitalHumanEnabled,
    digitalHumanApiUrl,
    setDigitalHumanEnabled,
    setDigitalHumanApiUrl,
    digitalHumanModel,
    setDigitalHumanModel,
  } = useAIConfigStore();
  const [currentModel, setCurrentModel] = useState<AIModelType | "digitalHuman">(selectedModel);
  const [runtimeConfig, setRuntimeConfig] = useState({ llm_base_url: "", llm_model: "", llm_api_key: "", stt_provider: "", stt_base_url: "", stt_model: "", stt_api_key: "", tts_provider: "edge", tts_base_url: "", tts_model: "", tts_voice: "", tts_api_key: "", mem0_llm_provider: "", mem0_llm_base_url: "", mem0_llm_model: "", mem0_llm_api_key: "", mem0_embedder_provider: "", mem0_embedder_base_url: "", mem0_embedder_model: "", mem0_embedder_api_key: "" });
  const [runtimeMessage, setRuntimeMessage] = useState("");

  const t = useTranslations();

  useEffect(() => {
    setCurrentModel(selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (!digitalHumanApiUrl) return;
    void fetch(`${digitalHumanApiUrl.replace(/\/$/, "")}/runtime-config`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data && setRuntimeConfig((current) => ({
        ...current,
        llm_base_url: data.llm?.base_url ?? current.llm_base_url,
        llm_model: data.llm?.model ?? current.llm_model,
        stt_provider: data.stt?.provider ?? current.stt_provider,
        stt_base_url: data.stt?.base_url ?? current.stt_base_url,
        stt_model: data.stt?.model ?? current.stt_model,
        tts_provider: data.tts?.provider ?? current.tts_provider,
        tts_base_url: data.tts?.base_url ?? current.tts_base_url,
        tts_model: data.tts?.model ?? current.tts_model,
        tts_voice: data.tts?.voice ?? current.tts_voice,
      })))
      .catch(() => undefined);
  }, [digitalHumanApiUrl]);

  const updateRuntime = (key: keyof typeof runtimeConfig, value: string) => setRuntimeConfig((current) => ({ ...current, [key]: value }));
  const ttsVoices = runtimeConfig.tts_provider === "edge"
    ? ["zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural", "zh-CN-YunjianNeural", "zh-CN-XiaoyiNeural", "en-US-AriaNeural", "en-US-GuyNeural"]
    : runtimeConfig.tts_provider === "dashscope"
      ? ["Cherry", "Serena", "Ethan", "Jada", "Dylan", "Sunny"]
      : ["default"];
  const saveRuntimeConfig = async () => {
    setRuntimeMessage("保存中…");
    try {
      const response = await fetch(`${digitalHumanApiUrl.replace(/\/$/, "")}/runtime-config/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(runtimeConfig) });
      if (!response.ok) throw new Error("保存失败");
      setRuntimeMessage("已写入数字人服务 .env");
    } catch (error) { setRuntimeMessage(error instanceof Error ? error.message : "保存失败"); }
  };

  const handleApiKeyChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "doubao" | "deepseek" | "openai" | "gemini"
  ) => {
    const newApiKey = e.target.value;
    if (type === "doubao") {
      setDoubaoApiKey(newApiKey);
    } else if (type === "deepseek") {
      setDeepseekApiKey(newApiKey);
    } else if (type === "gemini") {
      setGeminiApiKey(newApiKey);
    } else {
      setOpenaiApiKey(newApiKey);
    }
  };

  const handleModelIdChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "doubao" | "deepseek" | "openai" | "gemini"
  ) => {
    const newModelId = e.target.value;
    if (type === "doubao") {
      setDoubaoModelId(newModelId);
    } else if (type === "openai") {
      setOpenaiModelId(newModelId);
    } else if (type === "gemini") {
      setGeminiModelId(newModelId);
    }
  };

  const handleApiEndpointChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "openai"
  ) => {
    const newApiEndpoint = e.target.value;
    if (type === "openai") {
      setOpenaiApiEndpoint(newApiEndpoint);
    }
  };

  const models = [
    {
      id: "deepseek",
      name: t("dashboard.settings.ai.deepseek.title"),
      description: t("dashboard.settings.ai.deepseek.description"),
      icon: DeepSeekLogo,
      link: "https://platform.deepseek.com",
      color: "text-purple-500",
      bgColor: "bg-purple-50 dark:bg-purple-950/50",
      isConfigured: !!deepseekApiKey,
    },
    {
      id: "doubao",
      name: t("dashboard.settings.ai.doubao.title"),
      description: t("dashboard.settings.ai.doubao.description"),
      icon: IconDoubao,
      link: "https://console.volcengine.com/ark",
      color: "text-blue-500",
      bgColor: "bg-blue-50 dark:bg-blue-950/50",
      isConfigured: !!(doubaoApiKey && doubaoModelId),
    },
    {
      id: "openai",
      name: t("dashboard.settings.ai.openai.title"),
      description: t("dashboard.settings.ai.openai.description"),
      icon: IconOpenAi,
      link: "https://platform.openai.com/api-keys",
      color: "text-blue-500",
      bgColor: "bg-blue-50 dark:bg-blue-950/50",
      isConfigured: !!(openaiApiKey && openaiModelId && openaiApiEndpoint),
    },
    {
      id: "gemini",
      name: t("dashboard.settings.ai.gemini.title"),
      description: t("dashboard.settings.ai.gemini.description"),
      icon: Sparkles,
      link: "https://aistudio.google.com/app/apikey",
      color: "text-amber-500",
      bgColor: "bg-amber-50 dark:bg-amber-950/50",
      isConfigured: !!(geminiApiKey && geminiModelId),
    },
  ];

  return (
    <div className="min-h-full bg-sidebar px-4 py-4">
      <div className="flex gap-8">
        <div className="w-64 space-y-6">
          <div className="flex flex-col space-y-1">
            {models.map((model) => {
              const Icon = model.icon;
              const isChecked = selectedModel === model.id;
              const isViewing = currentModel === model.id;
              return (
                <div
                  key={model.id}
                  onClick={() => {
                    setCurrentModel(model.id as typeof currentModel);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left border",
                    "transition-all duration-200 cursor-pointer",
                    "hover:bg-primary/10 hover:border-primary/30",
                    isViewing
                      ? "bg-primary/10 border-primary/40"
                      : "border-transparent"
                  )}
                >
                  <div
                    className={cn(
                      "shrink-0",
                      isViewing ? "text-primary" : "text-muted-foreground"
                    )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                  <div className="flex-1 min-w-0 flex flex-col items-start">
                    <span
                      className={cn(
                        "font-medium text-sm",
                        isViewing && "text-primary"
                      )}
                    >
                      {model.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate w-full">
                      {model.isConfigured
                        ? t("common.configured")
                        : t("common.notConfigured")}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Select ${model.name}`}
                    onClick={() => {
                      setSelectedModel(
                        model.id as "doubao" | "deepseek" | "openai" | "gemini"
                      );
                      setCurrentModel(
                        model.id as "doubao" | "deepseek" | "openai" | "gemini"
                      );
                    }}
                    className={cn(
                      "h-6 w-6 rounded-md flex items-center justify-center border transition-all",
                      "shrink-0",
                      isChecked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-transparent border-muted-foreground/40 text-transparent hover:border-primary/40"
                    )}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <div
              onClick={() => setCurrentModel("digitalHuman")}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left border transition-all duration-200 cursor-pointer",
                "hover:bg-primary/10 hover:border-primary/30",
                currentModel === "digitalHuman"
                  ? "bg-primary/10 border-primary/40"
                  : "border-transparent"
              )}
            >
              <div className={cn("shrink-0", currentModel === "digitalHuman" ? "text-primary" : "text-muted-foreground")}>
                <Bot className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col items-start">
                <span className={cn("font-medium text-sm", currentModel === "digitalHuman" && "text-primary")}>数字人</span>
                <span className="text-xs text-muted-foreground truncate w-full">OpenTalking</span>
              </div>
              <div className="h-6 w-6 rounded-md flex items-center justify-center border border-muted-foreground/40">
                {currentModel === "digitalHuman" && <Check className="h-4 w-4 text-primary" />}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 w-full max-w-2xl">
          {currentModel === "digitalHuman" && <section className="mb-10 rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Bot className="mt-1 h-6 w-6 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold">数字人助手</h2>
              <p className="mt-1 text-sm text-muted-foreground">配置 OpenTalking 的模型、语音和服务参数。</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={digitalHumanEnabled} onChange={(event) => setDigitalHumanEnabled(event.target.checked)} className="h-4 w-4 accent-primary" />
                启用
              </label>
            </div>
            <div className="mt-5 space-y-2">
              <Label htmlFor="digital-human-api-url">数字人 API 地址</Label>
              <Input id="digital-human-api-url" value={digitalHumanApiUrl} onChange={(event) => setDigitalHumanApiUrl(event.target.value)} placeholder="http://127.0.0.1:8210" />
              <p className="text-xs text-muted-foreground">远程服务器部署时填写浏览器可访问的地址，例如 https://human.example.com。</p>
            </div>
            <div className="mt-5 space-y-5">
              <div><h3 className="mb-3 text-sm font-semibold text-primary">数字人运行时</h3><div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="digital-human-model">数字人模型</Label><select id="digital-human-model" value={digitalHumanModel} onChange={(event) => setDigitalHumanModel(event.target.value)} className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="mock">Mock（无需 GPU）</option><option value="quicktalk">QuickTalk</option><option value="wav2lip">Wav2Lip</option><option value="flashtalk">FlashTalk</option></select></div>
              </div></div>
              <div><h3 className="mb-3 text-sm font-semibold text-primary">LLM</h3><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Base URL</Label><Input value={runtimeConfig.llm_base_url} onChange={(event) => updateRuntime("llm_base_url", event.target.value)} placeholder="https://api.example.com/v1" /></div>
              <div className="space-y-2"><Label>LLM Model</Label><Input value={runtimeConfig.llm_model} onChange={(event) => updateRuntime("llm_model", event.target.value)} placeholder="例如 deepseek-chat" /></div>
              <div className="space-y-2"><Label>API Key</Label><Input type="password" value={runtimeConfig.llm_api_key} onChange={(event) => updateRuntime("llm_api_key", event.target.value)} /></div></div></div>
              <div><h3 className="mb-3 text-sm font-semibold text-primary">TTS</h3><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Provider</Label><select value={runtimeConfig.tts_provider} onChange={(event) => updateRuntime("tts_provider", event.target.value)} className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="edge">Edge TTS（无需 Key）</option><option value="dashscope">DashScope / Qwen</option><option value="cosyvoice">CosyVoice</option><option value="openai_compatible">OpenAI Compatible</option></select></div>
              <div className="space-y-2"><Label>Base URL</Label><Input value={runtimeConfig.tts_base_url} onChange={(event) => updateRuntime("tts_base_url", event.target.value)} /></div>
              <div className="space-y-2"><Label>TTS Model</Label><Input value={runtimeConfig.tts_model} onChange={(event) => updateRuntime("tts_model", event.target.value)} /></div>
              <div className="space-y-2"><Label>TTS Voice</Label><select value={ttsVoices.includes(runtimeConfig.tts_voice) ? runtimeConfig.tts_voice : ttsVoices[0]} onChange={(event) => updateRuntime("tts_voice", event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{ttsVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></div>
              <div className="space-y-2"><Label>API Key</Label><Input type="password" value={runtimeConfig.tts_api_key} onChange={(event) => updateRuntime("tts_api_key", event.target.value)} /></div></div></div>
              <div><h3 className="mb-3 text-sm font-semibold text-primary">STT</h3><div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Provider</Label><select value={runtimeConfig.stt_provider} onChange={(event) => updateRuntime("stt_provider", event.target.value)} className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="dashscope">DashScope</option><option value="sensevoice">SenseVoice</option><option value="openai">OpenAI</option></select></div><div className="space-y-2"><Label>Base URL</Label><Input value={runtimeConfig.stt_base_url} onChange={(event) => updateRuntime("stt_base_url", event.target.value)} /></div><div className="space-y-2"><Label>Model</Label><Input value={runtimeConfig.stt_model} onChange={(event) => updateRuntime("stt_model", event.target.value)} /></div><div className="space-y-2"><Label>API Key</Label><Input type="password" value={runtimeConfig.stt_api_key} onChange={(event) => updateRuntime("stt_api_key", event.target.value)} /></div></div></div>
            </div>
            <div className="mt-5 flex items-center gap-3"><button type="button" onClick={saveRuntimeConfig} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">保存数字人配置</button><span className="text-sm text-muted-foreground">{runtimeMessage}</span></div>
          </section>}
          {models.map(
            (model) =>
              model.id === currentModel && (
                <div key={model.id} className="space-y-8">
                  <div>
                    <h2 className="text-2xl font-semibold flex items-center gap-2">
                      <div className={cn("shrink-0", model.color)}>
                        <model.icon className="h-6 w-6" />
                      </div>
                      {model.name}
                    </h2>
                    <p className="mt-2 text-muted-foreground">
                      {model.description}
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-medium">
                          {t(`dashboard.settings.ai.${model.id}.apiKey`)}
                        </Label>
                        <a
                          href={model.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                        >
                          {t("dashboard.settings.ai.getApiKey")}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <Input
                        value={
                          model.id === "doubao"
                            ? doubaoApiKey
                            : model.id === "openai"
                            ? openaiApiKey
                            : model.id === "gemini"
                            ? geminiApiKey
                            : deepseekApiKey
                        }
                        onChange={(e) =>
                          handleApiKeyChange(
                            e,
                            model.id as "doubao" | "deepseek" | "openai" | "gemini"
                          )
                        }
                        type="password"
                        placeholder={t(
                          `dashboard.settings.ai.${model.id}.apiKey`
                        )}
                        className={cn(
                          "h-11 w-full",
                          "bg-white dark:bg-gray-900",
                          "border-gray-200 dark:border-gray-800",
                          "focus:ring-2 focus:ring-primary/20"
                        )}
                      />
                    </div>

                    {model.id === "doubao" && (
                      <div className="space-y-4">
                        <Label className="text-base font-medium">
                          {t("dashboard.settings.ai.doubao.modelId")}
                        </Label>
                        <Input
                          value={doubaoModelId}
                          onChange={(e) => handleModelIdChange(e, "doubao")}
                          placeholder={t(
                            "dashboard.settings.ai.doubao.modelId"
                          )}
                          className={cn(
                            "h-11 w-full",
                            "bg-white dark:bg-gray-900",
                            "border-gray-200 dark:border-gray-800",
                            "focus:ring-2 focus:ring-primary/20"
                          )}
                        />
                      </div>
                    )}

                    {model.id === "openai" && (
                      <div className="space-y-4">
                        <Label className="text-base font-medium">
                          {t("dashboard.settings.ai.openai.modelId")}
                        </Label>
                        <Input
                          value={openaiModelId}
                          onChange={(e) => handleModelIdChange(e, "openai")}
                          placeholder={t(
                            "dashboard.settings.ai.openai.modelId"
                          )}
                          className={cn(
                            "h-11 w-full",
                            "bg-white dark:bg-gray-900",
                            "border-gray-200 dark:border-gray-800",
                            "focus:ring-2 focus:ring-primary/20"
                          )}
                        />
                      </div>
                    )}

                    {model.id === "gemini" && (
                      <div className="space-y-4">
                        <Label className="text-base font-medium">
                          {t("dashboard.settings.ai.gemini.modelId")}
                        </Label>
                        <Input
                          value={geminiModelId}
                          onChange={(e) => handleModelIdChange(e, "gemini")}
                          placeholder={t("dashboard.settings.ai.gemini.modelId")}
                          className={cn(
                            "h-11 w-full",
                            "bg-white dark:bg-gray-900",
                            "border-gray-200 dark:border-gray-800",
                            "focus:ring-2 focus:ring-primary/20"
                          )}
                        />
                      </div>
                    )}

                    {model.id === "openai" && (
                      <div className="space-y-4">
                        <Label className="text-base font-medium">
                          {t("dashboard.settings.ai.openai.apiEndpoint")}
                        </Label>
                        <Input
                          value={openaiApiEndpoint}
                          onChange={(e) => handleApiEndpointChange(e, "openai")}
                          placeholder={t(
                            "dashboard.settings.ai.openai.apiEndpoint"
                          )}
                          className={cn(
                            "h-11 w-full",
                            "bg-white dark:bg-gray-900",
                            "border-gray-200 dark:border-gray-800",
                            "focus:ring-2 focus:ring-primary/20"
                          )}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
          )}
        </div>
      </div>
    </div>
  );
};
export const runtime = "edge";

export default AISettingsPage;
