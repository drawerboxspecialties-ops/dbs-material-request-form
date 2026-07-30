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

type AppView = "request" | "board";

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
  const [view, setView] = useState<AppView>("request");
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
            setRequests(event.requests);
          } else if (event.type === "created" || event.type === "updated") {
            setRequests((current) => upsertRequest(current, event.request));
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

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" aria-hidden />
      <div className="ambient ambient-b" aria-hidden />

      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden>
            DBS
          </div>
          <div>
            <p className="brand-kicker">Operations</p>
            <h1>Material Requests</h1>
          </div>
        </div>

        <div className="topbar-meta">
          <div className={`live-pill${connected ? " on" : ""}`}>
            <span className="live-dot" aria-hidden />
            {connected ? "Live sync on" : "Reconnecting…"}
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

      <nav className="view-switch" aria-label="App views">
        <button
          type="button"
          className={view === "request" ? "active" : ""}
          onClick={() => setView("request")}
        >
          <span className="view-title">New request</span>
          <span className="view-copy">Raise Material, Hardware, or Edgeband</span>
        </button>
        <button
          type="button"
          className={view === "board" ? "active" : ""}
          onClick={() => setView("board")}
        >
          <span className="view-title">Live board</span>
          <span className="view-copy">Track replies, prices, and status</span>
        </button>
      </nav>

      <p className="page-lede">
        {view === "request"
          ? "Start with customer and PO, then mix Material, Hardware, and Edgeband in one request. Material needs core and color. Edgeband must match a sheet."
          : "Everyone sees updates instantly. Filter by customer or PO, then managers reply per product with availability, lead time, price, and vendor."}
      </p>

      {loadError ? <p className="banner error">{loadError}</p> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}

      <main className="view-stage">
        {view === "request" ? (
          <section className="panel panel-focus enter">
            <div className="panel-heading">
              <div>
                <h2>Create request</h2>
                <p>
                  One submission can include Material, Hardware, and Edgeband
                  together.
                </p>
              </div>
            </div>
            <RequestForm
              onCreated={(requestId) => {
                setFlashRequestId(requestId);
                setToast("Request submitted");
                setView("board");
              }}
            />
          </section>
        ) : (
          <div className="enter">
            <RequestBoard
              requests={requests}
              connected={connected}
              highlightId={flashRequestId}
              onStatusChange={handleStatusChange}
              onManagerReply={handleManagerReply}
              onEditRequest={handleEditRequest}
              onCreateClick={() => setView("request")}
            />
          </div>
        )}
      </main>
    </div>
  );
}
