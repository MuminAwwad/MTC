"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { Sparkles, Send, Loader2, Paperclip, X, CheckCircle2, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, SectionCard, useToast } from "@/components/shared";

type Role = "user" | "assistant";

interface BaseMsg {
  role: Role;
  content: string;
}

interface UserTextMsg extends BaseMsg {
  role: "user";
  attachmentName?: string;
}

interface AssistantTextMsg extends BaseMsg {
  role: "assistant";
}

interface AssistantImportMsg {
  role: "assistant";
  content: string; // preview text
  envelope: unknown;
  canImport: boolean;
  // import outcome:
  status: "preview" | "importing" | "done" | "cancelled";
  resultSummary?: string;
}

interface PendingAction {
  kind: string;
  summary: string;
  warn?: string;
  payload: Record<string, unknown>;
}

interface ActionItemState {
  action: PendingAction;
  status: "pending" | "running" | "done" | "cancelled";
  resultSummary?: string;
}

interface AssistantActionMsg {
  role: "assistant";
  content: string; // optional header
  items: ActionItemState[];
}

type Msg = UserTextMsg | AssistantTextMsg | AssistantImportMsg | AssistantActionMsg;

const SUGGESTIONS = [
  "كم مبيعات اليوم؟",
  "من يدين لي بأكبر مبلغ؟",
  "ما المنتجات اللي خلصت من المخزون؟",
  "كم تذكرة صيانة مفتوحة؟",
  "أعطني أهم 5 زبائن آخر شهر",
];

const isImportMsg = (m: Msg): m is AssistantImportMsg =>
  m.role === "assistant" && "envelope" in m;

const isActionMsg = (m: Msg): m is AssistantActionMsg =>
  m.role === "assistant" && "items" in m;

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  // ── text-only chat path (read tools) ───────────────────────────────────
  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: UserTextMsg = { role: "user", content: trimmed };
    const nextHistory: Msg[] = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);
    try {
      // Only forward plain text turns to /api/chat (it expects role/content shape).
      const flat = nextHistory
        .filter((m) => !isImportMsg(m) && !isActionMsg(m))
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: flat }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "حدث خطأ", "error");
        setMessages(messages);
        return;
      }
      const pending = Array.isArray(data.pendingActions)
        ? (data.pendingActions as PendingAction[])
        : [];
      if (pending.length > 0) {
        const replyText = (data.reply ?? "").trim();
        const items: ActionItemState[] = pending.map((a) => ({ action: a, status: "pending" }));
        setMessages((prev) => [
          ...prev,
          ...(replyText ? [{ role: "assistant", content: replyText } as AssistantTextMsg] : []),
          {
            role: "assistant",
            content: replyText ? "" : "العمليات التالية بانتظار تأكيدك:",
            items,
          } as AssistantActionMsg,
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "" }]);
      }
    } catch {
      toast("تعذّر الاتصال بالمساعد", "error");
      setMessages(messages);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  // ── file-upload path (extract + preview) ───────────────────────────────
  const sendFile = async (file: File, note: string) => {
    const userMsg: UserTextMsg = {
      role: "user",
      content: note.trim() || `ارفقت ملف: ${file.name}`,
      attachmentName: file.name,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPendingFile(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (note.trim()) fd.append("note", note.trim());
      const res = await fetch("/api/chat/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "تعذّر قراءة الملف", "error");
        // Surface the failure as an assistant text bubble too so the user
        // sees what went wrong inline.
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠ ${data.error ?? "تعذّر قراءة الملف"}` },
        ]);
        return;
      }
      const importMsg: AssistantImportMsg = {
        role: "assistant",
        content: data.preview,
        envelope: data.envelope,
        canImport: !!data.canImport,
        status: "preview",
      };
      setMessages((prev) => [...prev, importMsg]);
    } catch {
      toast("تعذّر الاتصال بالخادم", "error");
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const confirmImport = async (index: number) => {
    const target = messages[index];
    if (!target || !isImportMsg(target) || target.status !== "preview") return;
    setMessages((prev) =>
      prev.map((m, i) =>
        i === index && isImportMsg(m) ? { ...m, status: "importing" } : m
      )
    );
    try {
      const res = await fetch("/api/chat/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ envelope: target.envelope }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "فشل الاستيراد", "error");
        setMessages((prev) =>
          prev.map((m, i) =>
            i === index && isImportMsg(m) ? { ...m, status: "preview" } : m
          )
        );
        return;
      }
      setMessages((prev) =>
        prev.map((m, i) =>
          i === index && isImportMsg(m)
            ? { ...m, status: "done", resultSummary: data.summary ?? "تم الاستيراد." }
            : m
        )
      );
      toast(data.summary ?? "تم الاستيراد بنجاح");
    } catch {
      toast("تعذّر الاتصال بالخادم", "error");
      setMessages((prev) =>
        prev.map((m, i) =>
          i === index && isImportMsg(m) ? { ...m, status: "preview" } : m
        )
      );
    }
  };

  const cancelImport = (index: number) => {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === index && isImportMsg(m) ? { ...m, status: "cancelled" } : m
      )
    );
  };

  // ── action confirm/cancel (write tools) ─────────────────────────────────
  const setActionStatus = (
    msgIndex: number,
    itemIndex: number,
    patch: Partial<ActionItemState>
  ) => {
    setMessages((prev) =>
      prev.map((m, i) => {
        if (i !== msgIndex || !isActionMsg(m)) return m;
        return {
          ...m,
          items: m.items.map((it, j) => (j === itemIndex ? { ...it, ...patch } : it)),
        };
      })
    );
  };

  const confirmAction = async (msgIndex: number, itemIndex: number) => {
    const target = messages[msgIndex];
    if (!target || !isActionMsg(target)) return;
    const item = target.items[itemIndex];
    if (!item || item.status !== "pending") return;
    setActionStatus(msgIndex, itemIndex, { status: "running" });
    try {
      const res = await fetch("/api/chat/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: item.action }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast(data.error ?? "تعذّر تنفيذ العملية", "error");
        setActionStatus(msgIndex, itemIndex, { status: "pending" });
        return;
      }
      setActionStatus(msgIndex, itemIndex, {
        status: "done",
        resultSummary: data.summary ?? "تم التنفيذ.",
      });
      toast(data.summary ?? "تم التنفيذ");
    } catch {
      toast("تعذّر الاتصال بالخادم", "error");
      setActionStatus(msgIndex, itemIndex, { status: "pending" });
    }
  };

  const cancelAction = (msgIndex: number, itemIndex: number) => {
    setActionStatus(msgIndex, itemIndex, { status: "cancelled" });
  };

  // ── form handlers ───────────────────────────────────────────────────────
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (pendingFile) {
      void sendFile(pendingFile, input);
    } else if (input.trim()) {
      void sendText(input);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    e.target.value = "";
    textareaRef.current?.focus();
  };

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      <PageHeader
        title="المساعد الذكي"
        subtitle="اسأل أو ارفع ملفات (فاتورة شراء، قائمة ديون، عملاء، أو منتجات) للاستيراد"
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "المساعد" },
        ]}
      />

      <SectionCard className="flex-1 flex flex-col min-h-0" noPadding>
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
        >
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-[#e8f0fc] flex items-center justify-center mb-4">
                <Sparkles className="h-7 w-7 text-[#104e98]" />
              </div>
              <h2 className="text-lg font-bold text-[#0b2345] mb-1">
                كيف يمكنني مساعدتك؟
              </h2>
              <p className="text-sm text-[#64748b] max-w-sm mb-2">
                اسأل أي سؤال عن بيانات محلك. سأستخدم الأدوات لاسترجاع الأرقام الحقيقية،
                ولن أخمّن.
              </p>
              <p className="text-xs text-[#94a3b8] max-w-sm mb-6">
                أو اضغط <Paperclip className="h-3 w-3 inline" /> لرفع فاتورة شراء، قائمة ديون، عملاء، أو منتجات لاستيرادها.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => void sendText(s)}
                      className="w-full text-right text-sm px-3 py-2 rounded-lg border border-[#e2e8f0] bg-white hover:border-[#104e98] hover:bg-[#f8fafc] transition-colors"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.role === "user") {
              const um = m as UserTextMsg;
              return (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-md px-4 py-2.5 text-sm bg-[#104e98] text-white whitespace-pre-wrap break-words">
                    {um.attachmentName && (
                      <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-white/20 text-xs text-white/90">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="truncate ltr">{um.attachmentName}</span>
                      </div>
                    )}
                    {um.content}
                  </div>
                </div>
              );
            }

            if (isImportMsg(m)) {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3 text-sm bg-[#f1f5f9] text-[#1e293b] whitespace-pre-wrap break-words space-y-2">
                    <div>{m.content}</div>

                    {m.status === "preview" && m.canImport && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => void confirmImport(i)}
                          className="gap-2"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          تأكيد الاستيراد
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelImport(i)}
                        >
                          إلغاء
                        </Button>
                      </div>
                    )}
                    {m.status === "importing" && (
                      <div className="flex items-center gap-2 text-xs text-[#64748b] pt-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري الاستيراد...
                      </div>
                    )}
                    {m.status === "done" && (
                      <div className="flex items-center gap-2 text-xs text-green-700 pt-1 border-t border-[#e2e8f0]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {m.resultSummary}
                      </div>
                    )}
                    {m.status === "cancelled" && (
                      <div className="text-xs text-[#94a3b8] pt-1 border-t border-[#e2e8f0]">
                        تم الإلغاء.
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            if (isActionMsg(m)) {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3 text-sm bg-[#f1f5f9] text-[#1e293b] space-y-2 w-full">
                    {m.content && <div className="text-[#64748b]">{m.content}</div>}
                    {m.items.map((it, j) => (
                      <div
                        key={j}
                        className="rounded-xl border border-[#e2e8f0] bg-white p-3 space-y-2"
                      >
                        <div className="break-words font-medium text-[#0b2345]">
                          {it.action.summary}
                        </div>
                        {it.action.warn && it.status === "pending" && (
                          <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                            <span>{it.action.warn}</span>
                          </div>
                        )}

                        {it.status === "pending" && (
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={() => void confirmAction(i, j)} className="gap-2">
                              <CheckCircle2 className="h-4 w-4" />
                              تأكيد
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => cancelAction(i, j)}>
                              إلغاء
                            </Button>
                          </div>
                        )}
                        {it.status === "running" && (
                          <div className="flex items-center gap-2 text-xs text-[#64748b]">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري التنفيذ...
                          </div>
                        )}
                        {it.status === "done" && (
                          <div className="flex items-center gap-2 text-xs text-green-700 border-t border-[#e2e8f0] pt-2">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {it.resultSummary}
                          </div>
                        )}
                        {it.status === "cancelled" && (
                          <div className="text-xs text-[#94a3b8] border-t border-[#e2e8f0] pt-2">
                            تم الإلغاء.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tl-md px-4 py-2.5 text-sm bg-[#f1f5f9] text-[#1e293b] whitespace-pre-wrap break-words">
                  {(m as AssistantTextMsg).content || "..."}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-end">
              <div className="bg-[#f1f5f9] text-[#64748b] rounded-2xl rounded-tl-md px-4 py-2.5 text-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {pendingFile ? "جاري قراءة الملف..." : "جاري التفكير..."}
              </div>
            </div>
          )}
        </div>

        {pendingFile && (
          <div className="border-t border-[#e2e8f0] px-3 sm:px-4 py-2 flex items-center justify-between gap-2 bg-[#f8fafc]">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-[#104e98] flex-shrink-0" />
              <span className="text-xs text-[#1e293b] truncate ltr">{pendingFile.name}</span>
              <span className="text-xs text-[#94a3b8] flex-shrink-0 ltr">
                {(pendingFile.size / 1024).toFixed(0)} KB
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="p-1 rounded text-[#94a3b8] hover:text-red-500 hover:bg-red-50"
              aria-label="إزالة الملف"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="border-t border-[#e2e8f0] p-3 sm:p-4 flex items-end gap-2 bg-white"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,.pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={onPickFile}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
            aria-label="إرفاق ملف"
            className="flex-shrink-0"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e as unknown as FormEvent);
              }
            }}
            placeholder={
              pendingFile
                ? "اكتب ملاحظة عن الملف (اختياري)..."
                : "اكتب سؤالك... (Enter للإرسال)"
            }
            rows={1}
            className="flex-1 min-h-0 max-h-32 resize-none"
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={loading || (!input.trim() && !pendingFile)}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">إرسال</span>
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}
