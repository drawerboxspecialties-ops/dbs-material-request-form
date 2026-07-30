"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EditRequestPayload } from "@/components/EditRequestForm";
import type { ManagerReplyPayload } from "@/components/ManagerReplyForm";
import { RequestBoard } from "@/components/RequestBoard";
import { RequestForm } from "@/components/RequestForm";
import {
  allItemsResponded,
  type MaterialRequest,
  type RequestStatus,
  type StoreEvent,
} from "@/lib/types";

function upsertRequest(
  requests: MaterialRequest[],
  request: MaterialRequest,
): MaterialRequest[] {
  const without = requests.filter((item) => item.id !== request.id);
  return [request, ...without].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function LiveApp() {
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [flashRequestId, setFlashRequestId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      source = new EventSource("/api/requests/stream");

      source.onopen = () => {
        if (!cancelled) {
          setConnected(true);
          setLoadError(null);
        }
      };

      source.onmessage = (message) => {
        if (cancelled) return;
        try {
          const event = JSON.parse(message.data) as StoreEvent;
          if (event.type === "snapshot") {
            // Shared Blob storage is authoritative — replace so deletes stick.
            setRequests(event.requests);
          } else if (event.type === "created" || event.type === "updated") {
            setRequests((current) => upsertRequest(current, event.request));
          } else if (event.type === "deleted") {
            setRequests((current) =>
              current.filter((item) => item.id !== event.id),
            );
          }
        } catch {
          setLoadError("Received an invalid live update");
        }
      };

      source.onerror = () => {
        if (cancelled) return;
        setConnected(false);
        source?.close();
        retryTimer = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await fetch("/api/requests", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { requests?: MaterialRequest[] };
        if (cancelled || !Array.isArray(data.requests)) return;
        setRequests(data.requests);
      } catch {
        // Keep SSE as primary; polling is a backup only.
      }
    };

    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!flashRequestId) return;
    const timer = setTimeout(() => setFlashRequestId(null), 2400);
    return () => clearTimeout(timer);
  }, [flashRequestId]);

  const stats = useMemo(() => {
    const open = requests.filter(
      (item) => item.status !== "fulfilled" && item.status !== "rejected",
    ).length;
    const awaiting = requests.filter(
      (item) => !allItemsResponded(item.items),
    ).length;
    return { open, awaiting, total: requests.length };
  }, [requests]);

  const handleStatusChange = useCallback(
    async (id: string, status: RequestStatus, managerPassword: string) => {
      const response = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, managerPassword }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setLoadError(data.error ?? "Failed to update status");
        return;
      }

      setToast("Status updated");
    },
    [],
  );

  const handleManagerReply = useCallback(
    async (id: string, payload: ManagerReplyPayload) => {
      const response = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save manager reply");
      }

      setToast("Manager reply saved");
    },
    [],
  );

  const handleEditRequest = useCallback(
    async (id: string, payload: EditRequestPayload) => {
      const response = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save request edits");
      }

      setFlashRequestId(id);
      setToast("Request updated · last edited time refreshed");
    },
    [],
  );

  const handleDeleteRequest = useCallback(
    async (id: string, managerPassword: string) => {
      const response = await fetch(`/api/requests/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerPassword }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to delete request");
      }

      setRequests((current) => current.filter((item) => item.id !== id));
      setToast("Request deleted");
    },
    [],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden>
            DBS
          </div>
          <div>
            <p className="brand-kicker">Ops</p>
            <h1>Material Requests</h1>
          </div>
        </div>

        <div className="topbar-meta">
          <div className={`live-pill${connected ? " on" : ""}`}>
            <span className="live-dot" aria-hidden />
            {connected ? "Live" : "Reconnecting…"}
          </div>
          <div className="stat-cluster" aria-label="Request summary">
            <div className="stat-chip">
              <span>Open</span>
              <strong>{stats.open}</strong>
            </div>
            <div className="stat-chip warn">
              <span>Awaiting</span>
              <strong>{stats.awaiting}</strong>
            </div>
            <div className="stat-chip">
              <span>Total</span>
              <strong>{stats.total}</strong>
            </div>
          </div>
        </div>
      </header>

      {loadError ? <p className="banner error">{loadError}</p> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}

      <main className="workspace">
        <section className="panel panel-compose">
          <div className="panel-heading">
            <div>
              <h2>New request</h2>
              <p>Compose and submit without leaving the board.</p>
            </div>
          </div>
          <RequestForm
            onCreated={(request) => {
              setRequests((current) => upsertRequest(current, request));
              setFlashRequestId(request.id);
              setToast("Request submitted");
            }}
          />
        </section>

        <RequestBoard
          requests={requests}
          connected={connected}
          highlightId={flashRequestId}
          onStatusChange={handleStatusChange}
          onManagerReply={handleManagerReply}
          onEditRequest={handleEditRequest}
          onDeleteRequest={handleDeleteRequest}
        />
      </main>
    </div>
  );
}
