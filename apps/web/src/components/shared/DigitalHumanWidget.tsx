import { FormEvent, useEffect, useState } from "react";
import { Bot, LoaderCircle, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAIConfigStore } from "@/store/useAIConfigStore";

type ChatMessage = { role: "user" | "assistant"; text: string };

/**
 * Lightweight integration shell. The OpenTalking service remains independent;
 * this widget only creates a session and sends text to its public HTTP API.
 */
export default function DigitalHumanWidget() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "你好，我是你的职业助手。有什么想聊的吗？" },
  ]);
  const { digitalHumanEnabled, digitalHumanApiUrl, digitalHumanModel } = useAIConfigStore();
  const DIGITAL_HUMAN_API = digitalHumanApiUrl.replace(/\/$/, "");

  if (!digitalHumanEnabled) return null;

  useEffect(() => {
    if (!open || sessionId) return;
    void fetch(`${DIGITAL_HUMAN_API}/avatars`)
      .then((response) => {
        if (!response.ok) throw new Error("数字人服务暂不可用");
        return response.json();
      })
      .catch(() => setError("数字人服务未连接，稍后可以重试。"));
  }, [open, sessionId]);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError("");
    setMessages((current) => [...current, { role: "user", text }]);
    setBusy(true);
    try {
      let activeSession = sessionId;
      if (!activeSession) {
        const created = await fetch(`${DIGITAL_HUMAN_API}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // `anchor` is shipped with the OpenTalking source snapshot.
          body: JSON.stringify({ avatar_id: "anchor", model: digitalHumanModel }),
        });
        if (!created.ok) throw new Error("无法创建数字人会话");
        activeSession = (await created.json()).session_id;
        setSessionId(activeSession);
      }
      const response = await fetch(
        `${DIGITAL_HUMAN_API}/sessions/${activeSession}/speak`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      if (!response.ok) throw new Error("数字人暂时无法回复");
      const data = await response.json().catch(() => ({}));
      const reply = data.text ?? data.response ?? data.message ?? "已收到，我会结合你的职业资料继续协助。";
      setMessages((current) => [...current, { role: "assistant", text: reply }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "请求失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open && (
        <aside className="fixed bottom-24 right-6 z-50 flex h-[min(620px,calc(100vh-7rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary"><Bot /></div>
              <div><p className="font-semibold">数字人助手</p><p className="text-xs text-muted-foreground">职业资料与简历顾问</p></div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="关闭"><X /></Button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{message.text}</div>
              </div>
            ))}
            {busy && <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <form onSubmit={sendMessage} className="flex gap-2 border-t p-3">
            <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入想聊的内容…" disabled={busy} />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="发送"><Send /></Button>
          </form>
        </aside>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full border-4 border-background bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-xl transition-transform hover:scale-105" aria-label="打开数字人助手">
        {open ? <X /> : <><Bot className="h-8 w-8" /><MessageCircle className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-background p-0.5 text-primary" /></>}
      </button>
    </>
  );
}
