// M-03: extraído de src/routes/bandeja.index.tsx.
// Consulta asistida del CRM (chat con SilvIA) — widget autocontenido, con su
// propio estado (toggle + historial de mensajes), sin dependencias del resto
// de BandejaPage.
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, ChevronDown, ChevronUp, Sparkles, User2, Loader2, Send } from "lucide-react";
import { askSilvia } from "@/lib/silvia.functions";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function AsistenteSilviaPanel() {
  const [showAssistant, setShowAssistant] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const askFn = useServerFn(askSilvia);

  // Auto-scroll chat to bottom.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: msg };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);
    try {
      const { reply } = await askFn({ data: { messages: history } });
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setChatError("No se pudo completar la consulta. Inténtalo de nuevo en unos segundos.");
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <>
      {/* Consulta asistida: secundaria respecto a la bandeja operativa. */}
      <button
        type="button"
        onClick={() => setShowAssistant((open) => !open)}
        className="mb-3 w-full h-10 px-4 rounded-lg border border-border bg-card flex items-center gap-2 text-sm font-medium hover:bg-accent transition-colors"
      >
        <Bot className="size-4 text-primary" />
        Consulta asistida del CRM
        <span className="ml-auto text-xs text-muted-foreground">
          {showAssistant ? "Ocultar" : "Abrir"}
        </span>
        {showAssistant ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {showAssistant && (
        <div className="mb-6 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <span className="text-sm font-medium">Pregunta a SilvIA</span>
            <span className="text-[10px] text-muted-foreground ml-auto">CRM · consulta segura</span>
          </div>

          {/* Messages */}
          {chatMessages.length > 0 && (
            <div className="px-4 py-3 max-h-80 overflow-y-auto space-y-3 border-b border-border">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-primary/20 to-accent/30 text-primary"}`}
                  >
                    {msg.role === "user" ? (
                      <User2 className="size-3.5" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/30 text-primary mt-0.5">
                    <Sparkles className="size-3.5" />
                  </div>
                  <div className="rounded-lg px-3 py-2 bg-muted">
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Error */}
          {chatError && (
            <div className="mx-4 my-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
              {chatError}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 p-3">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChat();
                }
              }}
              placeholder="Pregunta sobre leads, propiedades, recomendaciones…"
              disabled={chatLoading}
              className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <button
              type="button"
              onClick={sendChat}
              disabled={chatLoading || !chatInput.trim()}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground inline-flex items-center gap-1.5 text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              <Send className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
