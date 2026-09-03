"use client";

// src/lib/useCoordinatorChat.ts
// Koordinatör sohbet durumu, SSE canlı stream okuyucusu, terminal görevleri ve oturum bazlı arka plan state yöneticisi.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityGroup } from "@/lib/activityLog";
import type { PermissionRequest, PermissionDecision } from "@/components/PermissionPrompt";
import type { PipelineStepEvent } from "@/lib/pipeline/pipelineRunner";
import type { EditedFile } from "@/components/FileChangesBlock";
import type { TerminalTask } from "@/components/TerminalPanel";

export interface UiMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  statusNote?: string;
  editedFiles?: EditedFile[];
}

interface SseFrame {
  event: string;
  data: unknown;
}

function parseSseChunk(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    const lines = block.split("\n");
    let event = "message";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data = line.slice(5).trim();
    }
    if (data) {
      try {
        frames.push({ event, data: JSON.parse(data) });
      } catch {
        frames.push({ event, data });
      }
    }
  }
  return { frames, rest };
}

interface UseCoordinatorChatOptions {
  onTitleUpdate?: (sessionId: string, title: string) => void;
  onSessionCreated?: (sessionId: string) => void;
}

interface SessionRuntimeState {
  messages: UiMessage[];
  isStreaming: boolean;
  terminalTasks: TerminalTask[];
  activeTerminalTaskId: string | null;
  activityGroups: ActivityGroup[];
  continuePrompt: { visible: boolean; message: string } | null;
  permissionRequest: PermissionRequest | null;
  contextStatus?: { usedTokens: number; maxTokens: number; percent: number } | null;
}

export function useCoordinatorChat(
  sessionId: string | null,
  options?: UseCoordinatorChatOptions
) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pipelineRequested, setPipelineRequested] = useState(false);
  const [pipelineRequirement, setPipelineRequirement] = useState<string>("");
  const [pipelineEvents, setPipelineEvents] = useState<PipelineStepEvent[]>([]);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [continuePrompt, setContinuePrompt] = useState<{ visible: boolean; message: string } | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [contextStatus, setContextStatus] = useState<{ usedTokens: number; maxTokens: number; percent: number } | null>(null);
  const [activityGroups, setActivityGroups] = useState<ActivityGroup[]>([]);
  const [terminalTasks, setTerminalTasks] = useState<TerminalTask[]>([]);
  const [activeTerminalTaskId, setActiveTerminalTaskId] = useState<string | null>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const currentSessionIdRef = useRef<string | null>(sessionId);
  const sessionStore = useRef<Map<string, SessionRuntimeState>>(new Map());

  useEffect(() => {
    currentSessionIdRef.current = sessionId;
  }, [sessionId]);

  const getOrCreateSessionState = useCallback(
    (id: string, initialMessages: UiMessage[] = []): SessionRuntimeState => {
      if (!sessionStore.current.has(id)) {
        sessionStore.current.set(id, {
          messages: initialMessages,
          isStreaming: false,
          terminalTasks: [],
          activeTerminalTaskId: null,
          activityGroups: [],
          continuePrompt: null,
          permissionRequest: null,
          contextStatus: null,
        });
      }
      return sessionStore.current.get(id)!;
    },
    []
  );

  const syncActiveView = useCallback((state: SessionRuntimeState) => {
    setMessages(state.messages);
    setIsStreaming(state.isStreaming);
    setTerminalTasks(state.terminalTasks);
    setActiveTerminalTaskId(state.activeTerminalTaskId);
    setActivityGroups(state.activityGroups);
    setContinuePrompt(state.continuePrompt);
    setPermissionRequest(state.permissionRequest);
    setContextStatus(state.contextStatus ?? null);
  }, []);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const currentId = currentSessionIdRef.current;
    if (currentId && sessionStore.current.has(currentId)) {
      sessionStore.current.get(currentId)!.isStreaming = false;
    }
    setIsStreaming(false);
    setIsPipelineRunning(false);
    setContinuePrompt(null);
    setPermissionRequest(null);
  }, []);

  const loadHistory = useCallback(
    (history: UiMessage[], targetId?: string | null) => {
      const activeId = targetId !== undefined ? targetId : currentSessionIdRef.current;
      if (activeId) {
        const existing = sessionStore.current.get(activeId);
        if (existing && existing.isStreaming) {
          // Oturum hala arka planda akmaya devam ediyorsa, mevcut canlı durumu yansıt!
          syncActiveView(existing);
          return;
        }
        const state: SessionRuntimeState = {
          messages: history.length === 0 ? [] : (existing?.messages && existing.messages.length >= history.length ? existing.messages : history),
          isStreaming: existing?.isStreaming || false,
          terminalTasks: existing?.terminalTasks || [],
          activeTerminalTaskId: existing?.activeTerminalTaskId || null,
          activityGroups: existing?.activityGroups || [],
          continuePrompt: null,
          permissionRequest: null,
          contextStatus: null,
        };
        sessionStore.current.set(activeId, state);
        syncActiveView(state);
      } else {
        // Taslak / Yeni sohbet
        setMessages(history);
        setIsStreaming(false);
        setTerminalTasks([]);
        setActiveTerminalTaskId(null);
        setActivityGroups([]);
        setContinuePrompt(null);
        setPermissionRequest(null);
        setContextStatus(null);
      }
    },
    [syncActiveView]
  );

  const deleteSessionState = useCallback((id: string) => {
    sessionStore.current.delete(id);
    if (currentSessionIdRef.current === id || !currentSessionIdRef.current) {
      currentSessionIdRef.current = null;
      setMessages([]);
      setIsStreaming(false);
      setTerminalTasks([]);
      setActiveTerminalTaskId(null);
      setActivityGroups([]);
      setContinuePrompt(null);
      setPermissionRequest(null);
      setContextStatus(null);
    }
  }, []);

  const startPipelineExecution = useCallback(
    async (requirement: string) => {
      stop();
      const targetSessionId = currentSessionIdRef.current;

      setIsPipelineRunning(true);
      setPipelineRequested(false);
      setPipelineEvents([]);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `🚀 **Sıralı Pipeline Başlatıldı**\n\nHedef Gereksinim: *${requirement.slice(0, 200)}...*\n\n5 aşamalı ajan zinciri (Architect → Developer → QA → Micro-Fix → Reviewer) çalıştırılıyor...`,
        },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirement, sessionId: targetSessionId }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Pipeline sunucu hatası: HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = parseSseChunk(buffer);
          buffer = rest;

          for (const frame of frames) {
            if (currentSessionIdRef.current !== targetSessionId) break;

            if (frame.event === "pipeline_event") {
              const evt = frame.data as PipelineStepEvent;
              setPipelineEvents((prev) => [...prev, evt]);
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    statusNote: `${evt.stageIcon} [${evt.stageName}] ${evt.message}`,
                  };
                }
                return next;
              });
            } else if (frame.event === "status") {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = { ...last, statusNote: frame.data as string };
                }
                return next;
              });
            } else if (frame.event === "error") {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `⚠️ ${frame.data as string}` },
              ]);
            }
          }
        }
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === "AbortError";
        if (!isAbort) {
          const message = err instanceof Error ? err.message : "bilinmeyen hata";
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `⚠️ Pipeline Hatası: ${message}` },
          ]);
        }
      } finally {
        if (currentSessionIdRef.current === targetSessionId) {
          setIsPipelineRunning(false);
        }
      }
    },
    [stop]
  );

  const sendMessage = useCallback(
    async (prompt: string, overrideHistory?: UiMessage[], projectDir?: string) => {
      let targetSessionId = currentSessionIdRef.current;

      const baseHistory = overrideHistory ?? messages;
      const newMessages: UiMessage[] = [
        ...baseHistory,
        { role: "user", content: prompt },
        { role: "assistant", content: "" },
      ];

      if (targetSessionId) {
        const st = getOrCreateSessionState(targetSessionId, newMessages);
        st.messages = newMessages;
        st.isStreaming = true;
        syncActiveView(st);
      } else {
        setMessages(newMessages);
        setIsStreaming(true);
      }

      setPipelineRequested(false);
      setContinuePrompt(null);
      setPermissionRequest(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            sessionId: targetSessionId || undefined,
            projectDir: projectDir || undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Sunucu hatası: HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = parseSseChunk(buffer);
          buffer = rest;

          for (const frame of frames) {
            if (frame.event === "session_created") {
              const data = frame.data as { sessionId: string; title: string };
              targetSessionId = data.sessionId;
              const st = getOrCreateSessionState(targetSessionId, newMessages);
              st.isStreaming = true;

              if (currentSessionIdRef.current === null || currentSessionIdRef.current === targetSessionId) {
                currentSessionIdRef.current = targetSessionId;
                syncActiveView(st);
              }
              options?.onSessionCreated?.(data.sessionId);
              options?.onTitleUpdate?.(data.sessionId, data.title);
            }

            const st = targetSessionId ? getOrCreateSessionState(targetSessionId) : null;

            if (st) {
              if (frame.event === "content") {
                const last = st.messages[st.messages.length - 1];
                if (last && last.role === "assistant") {
                  last.content += (frame.data as string);
                  last.statusNote = undefined;
                }
              } else if (frame.event === "thinking") {
                const last = st.messages[st.messages.length - 1];
                if (last && last.role === "assistant") {
                  last.thinking = (last.thinking ?? "") + (frame.data as string);
                }
              } else if (frame.event === "status") {
                const last = st.messages[st.messages.length - 1];
                if (last && last.role === "assistant") {
                  last.statusNote = frame.data as string;
                }
              } else if (frame.event === "file_changes") {
                const last = st.messages[st.messages.length - 1];
                if (last && last.role === "assistant") {
                  last.editedFiles = frame.data as EditedFile[];
                }
              } else if (frame.event === "continue_prompt") {
                const data = frame.data as { needed: boolean; message: string };
                if (data.needed) {
                  st.continuePrompt = { visible: true, message: data.message };
                }
              } else if (frame.event === "context_status") {
                const data = frame.data as { usedTokens: number; maxTokens: number; percent: number };
                st.contextStatus = data;
                setContextStatus(data);
              } else if (frame.event === "permission_request") {
                st.permissionRequest = frame.data as PermissionRequest;
              } else if (frame.event === "activity") {
                const group = frame.data as ActivityGroup;
                const idx = st.activityGroups.findIndex((g) => g.turnId === group.turnId);
                if (idx >= 0) st.activityGroups[idx] = group;
                else st.activityGroups.push(group);
              } else if (frame.event === "session_title_updated") {
                const data = frame.data as { sessionId: string; title: string };
                options?.onTitleUpdate?.(data.sessionId, data.title);
              } else if (frame.event === "pipeline_start") {
                const pData = frame.data as { requirement?: string } | string;
                const req = typeof pData === "object" && pData?.requirement ? pData.requirement : prompt;
                setPipelineRequested(true);
                setPipelineRequirement(req);
                startPipelineExecution(req);
              } else if (frame.event === "terminal_task") {
                const task = frame.data as TerminalTask;
                const idx = st.terminalTasks.findIndex((t) => t.id === task.id);
                if (idx >= 0) st.terminalTasks[idx] = task;
                else st.terminalTasks.push(task);
                st.activeTerminalTaskId = task.id;
              } else if (frame.event === "terminal_chunk") {
                const { taskId, chunk } = frame.data as { taskId: string; chunk: string };
                const idx = st.terminalTasks.findIndex((t) => t.id === taskId);
                if (idx >= 0) {
                  st.terminalTasks[idx] = {
                    ...st.terminalTasks[idx],
                    output: st.terminalTasks[idx].output + chunk,
                  };
                }
              } else if (frame.event === "error") {
                const last = st.messages[st.messages.length - 1];
                if (last && last.role === "assistant") {
                  last.content += `\n\n⚠️ ${frame.data as string}`;
                }
              }
            }

            // Sadece kullanıcı şu an bu oturumu görüntülüyorsa UI'ı canlı güncelle
            const isViewingThisSession =
              currentSessionIdRef.current === targetSessionId ||
              (!currentSessionIdRef.current && !targetSessionId);

            if (isViewingThisSession && st) {
              syncActiveView(st);
            }
          }
        }
      } catch (err) {
        const isAbort = err instanceof DOMException && err.name === "AbortError";
        if (!isAbort) {
          const message = err instanceof Error ? err.message : "bilinmeyen hata";
          const st = targetSessionId ? sessionStore.current.get(targetSessionId) : null;
          if (st) {
            const last = st.messages[st.messages.length - 1];
            if (last && last.role === "assistant") {
              last.content += `\n\n⚠️ ${message}`;
            }
            if (currentSessionIdRef.current === targetSessionId) {
              syncActiveView(st);
            }
          }
        }
      } finally {
        if (targetSessionId && sessionStore.current.has(targetSessionId)) {
          sessionStore.current.get(targetSessionId)!.isStreaming = false;
        }
        if (currentSessionIdRef.current === targetSessionId || (!currentSessionIdRef.current && !targetSessionId)) {
          setIsStreaming(false);
        }
      }
    },
    [getOrCreateSessionState, messages, options, startPipelineExecution, syncActiveView]
  );

  const handleContinue = useCallback(() => {
    setContinuePrompt(null);
    sendMessage("Devam et, sonraki adımları tamamla.");
  }, [sendMessage]);

  const respondPermission = useCallback(
    (decision: PermissionDecision) => {
      setPermissionRequest(null);
      if (decision !== "deny") {
        sendMessage("Onaylandı, işleme devam et.");
      } else {
        sendMessage("İşlem kullanıcı tarafından reddedildi.");
      }
    },
    [sendMessage]
  );

  const retry = useCallback(
    (index?: number) => {
      const idx = index !== undefined ? index : messages.length - 1;
      if (idx < 0) return;
      let lastUserPrompt = "";
      for (let i = idx; i >= 0; i--) {
        if (messages[i].role === "user") {
          lastUserPrompt = messages[i].content;
          break;
        }
      }
      if (!lastUserPrompt) return;
      const historyToKeep = messages.slice(0, Math.max(0, idx - 1));
      sendMessage(lastUserPrompt, historyToKeep);
    },
    [messages, sendMessage]
  );

  /**
   * Sunucu tarafındaki registry'den bir terminal görevini gerçekten
   * sonlandırır (SIGTERM/SIGKILL) ve yerel state'i günceller.
   */
  const killTerminalTask = useCallback(async (taskId: string) => {
    try {
      await fetch(`/api/terminal/tasks/${taskId}/kill`, { method: "POST" });
    } catch {
      // ağ hatası olsa bile aşağıdaki senkronizasyon durumu düzeltir
    }
    const currentId = currentSessionIdRef.current;
    if (currentId) {
      const st = sessionStore.current.get(currentId);
      if (st) {
        const idx = st.terminalTasks.findIndex((t) => t.id === taskId);
        if (idx >= 0) {
          st.terminalTasks[idx] = { ...st.terminalTasks[idx], status: "killed" };
          setTerminalTasks([...st.terminalTasks]);
        }
      }
    }
  }, []);

  /**
   * Sayfa yenilendiğinde (F5) tarayıcı state'i sıfırlanır ama sunucu
   * tarafındaki `terminalRegistry` hayatta kalır (bkz. terminalRegistry.ts).
   * Bir oturum açıldığında, o oturuma ait hâlâ çalışan/son biten görevleri
   * sunucudan çekip terminal panelini "diriltiyoruz" — böylece arka planda
   * devam eden bir komut, sayfa yenilense bile kullanıcının önünde kalır.
   */
  const hydrateTerminalTasksFromServer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/terminal/tasks?sessionId=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data: { tasks?: TerminalTask[] } = await res.json();
      if (!data.tasks || data.tasks.length === 0) return;
      const st = getOrCreateSessionState(id);
      for (const serverTask of data.tasks) {
        const idx = st.terminalTasks.findIndex((t) => t.id === serverTask.id);
        if (idx >= 0) st.terminalTasks[idx] = serverTask;
        else st.terminalTasks.push(serverTask);
      }
      const hasRunning = data.tasks.some((t) => t.status === "running");
      if (hasRunning) st.activeTerminalTaskId = data.tasks[data.tasks.length - 1].id;
      if (currentSessionIdRef.current === id) {
        setTerminalTasks([...st.terminalTasks]);
        if (hasRunning) {
          setActiveTerminalTaskId(st.activeTerminalTaskId);
          setIsTerminalOpen(true);
        }
      }
    } catch {
      // sunucu ulaşılamazsa sessizce vazgeç
    }
  }, [getOrCreateSessionState]);

  // Bir oturuma her geçildiğinde (ilk yüklemede ve sekme değişiminde) o
  // oturumun sunucu tarafında hâlâ süren görevleri olup olmadığını kontrol et.
  useEffect(() => {
    if (sessionId) {
      hydrateTerminalTasksFromServer(sessionId);
    }
  }, [sessionId, hydrateTerminalTasksFromServer]);

  // Görünürde çalışan bir görev varsa, çıktısını periyodik olarak sunucudan
  // tazele (chat SSE bağlantısı kopmuş olsa bile canlı kalmaya devam etsin).
  useEffect(() => {
    const hasRunning = terminalTasks.some((t) => t.status === "running");
    if (!hasRunning) return;
    const interval = setInterval(() => {
      if (sessionId) hydrateTerminalTasksFromServer(sessionId);
    }, 1500);
    return () => clearInterval(interval);
  }, [terminalTasks, sessionId, hydrateTerminalTasksFromServer]);

  const undo = useCallback(
    async (index?: number) => {
      stop();
      const targetSessionId = currentSessionIdRef.current;
      const idx = index !== undefined ? index : messages.length - 1;
      if (idx < 0) return;
      let targetUserIdx = -1;
      for (let i = idx; i >= 0; i--) {
        if (messages[i].role === "user") {
          targetUserIdx = i;
          break;
        }
      }
      const cutoff = targetUserIdx >= 0 ? targetUserIdx : idx;
      const newMessages = messages.slice(0, cutoff);
      const removedMessages = messages.slice(cutoff);

      // ── ÖNCEKİ DAVRANIŞ (HATALI): sadece mesajları UI'dan gizlerdi; ne
      // diskteki dosyaları eski haline getirir ne de kısaltılmış geçmişi
      // oturuma kaydederdi — bu yüzden sayfa yenilenince "geri alınan"
      // mesajlar ve dosya değişiklikleri geri gelirdi ("Geri Al butonu
      // işlevsiz" şikayetinin kaynağı buydu). Şimdi:
      // 1) Geri alınan mesajlara ait dosya değişiklikleri gerçekten diske
      //    (eski içeriklerine) geri yazılır,
      // 2) Kısaltılmış konuşma geçmişi oturum dosyasına kalıcı olarak yazılır.
      for (const msg of removedMessages) {
        if (!msg.editedFiles) continue;
        for (const file of msg.editedFiles) {
          try {
            await fetch("/api/fs/restore", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filePath: file.path,
                oldContent: file.oldContent,
                isNew: file.isNew,
                sessionId: targetSessionId,
              }),
            });
          } catch {
            // bir dosya geri alınamazsa diğerlerini denemeye devam et
          }
        }
      }

      if (targetSessionId) {
        try {
          await fetch(`/api/sessions/${targetSessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversation_history: newMessages }),
          });
        } catch {
          // kalıcı kayıt başarısız olsa bile en azından UI güncellensin
        }
      }

      loadHistory(newMessages, targetSessionId);
    },
    [loadHistory, messages, stop]
  );

  return {
    messages,
    isStreaming,
    pipelineRequested,
    isPipelineRunning,
    pipelineRequirement,
    pipelineEvents,
    continuePrompt,
    permissionRequest,
    contextStatus,
    activityGroups,
    terminalTasks,
    activeTerminalTaskId,
    isTerminalOpen,
    setIsTerminalOpen,
    setActiveTerminalTaskId,
    sendMessage,
    handleContinue,
    respondPermission,
    retry,
    undo,
    stop,
    loadHistory,
    deleteSessionState,
    killTerminalTask,
  };
}
