"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  EditRequestForm,
  type EditRequestPayload,
} from "@/components/EditRequestForm";
import {
  ManagerReplyForm,
  ManagerResponseSummary,
  type ManagerReplyPayload,
} from "@/components/ManagerReplyForm";
import {
  AVAILABILITY_LABELS,
  PRODUCT_TYPE_LABELS,
  allItemsResponded,
  formatMaterialSpec,
  repliedItemCount,
  type MaterialRequest,
  type RequestStatus,
} from "@/lib/types";

const STATUS_OPTIONS: { value: RequestStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "in_progress", label: "In progress" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "rejected", label: "Rejected" },
];

type BoardFilter = "all" | "awaiting" | "open" | "done";

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: RequestStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

type RequestBoardProps = {
  requests: MaterialRequest[];
  connected: boolean;
  highlightId?: string | null;
  onStatusChange: (
    id: string,
    status: RequestStatus,
    managerPassword: string,
  ) => Promise<void>;
  onManagerReply: (id: string, payload: ManagerReplyPayload) => Promise<void>;
  onEditRequest: (id: string, payload: EditRequestPayload) => Promise<void>;
};

export function RequestBoard({
  requests,
  connected,
  highlightId,
  onStatusChange,
  onManagerReply,
  onEditRequest,
}: RequestBoardProps) {
  const [filter, setFilter] = useState<BoardFilter>("awaiting");
  const [query, setQuery] = useState("");
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>(
    {},
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managerPassword, setManagerPassword] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [managerUnlocked, setManagerUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const openCount = requests.filter(
    (item) => item.status !== "fulfilled" && item.status !== "rejected",
  ).length;
  const awaitingReply = requests.filter(
    (item) => !allItemsResponded(item.items),
  ).length;
  const doneCount = requests.filter(
    (item) => item.status === "fulfilled" || item.status === "rejected",
  ).length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter((request) => {
      const complete = allItemsResponded(request.items);
      const isDone =
        request.status === "fulfilled" || request.status === "rejected";
      const isOpen = !isDone;

      if (filter === "awaiting" && complete) return false;
      if (filter === "open" && !isOpen) return false;
      if (filter === "done" && !isDone) return false;

      if (!needle) return true;

      const haystack = [
        request.customer,
        request.poNumber,
        request.department,
        request.requesterName,
        request.notes,
        ...request.items.map((item) =>
          [
            item.productName,
            item.core,
            item.color,
            item.matchToSheet,
            PRODUCT_TYPE_LABELS[item.productType],
          ]
            .filter(Boolean)
            .join(" "),
        ),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [requests, filter, query]);

  function toggleReply(itemId: string) {
    setExpandedReplies((current) => ({
      ...current,
      [itemId]: !current[itemId],
    }));
  }

  async function unlockManager(event: FormEvent) {
    event.preventDefault();
    setUnlocking(true);
    setUnlockError(null);

    try {
      const response = await fetch("/api/manager/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordDraft }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Incorrect manager password");
      }

      setManagerPassword(passwordDraft.trim());
      setManagerUnlocked(true);
      setPasswordDraft("");
    } catch (err) {
      setManagerUnlocked(false);
      setManagerPassword("");
      setUnlockError(
        err instanceof Error ? err.message : "Could not unlock manager access",
      );
    } finally {
      setUnlocking(false);
    }
  }

  function lockManager() {
    setManagerUnlocked(false);
    setManagerPassword("");
    setPasswordDraft("");
    setUnlockError(null);
    setExpandedReplies({});
  }

  return (
    <section className="board">
      <div className="board-header">
        <div>
          <h2>Live board</h2>
          <p>
            {openCount} open · {awaitingReply} awaiting · {requests.length} total
          </p>
        </div>
        <div className="board-actions">
          <div className={`live-pill${connected ? " on" : ""}`}>
            <span className="live-dot" aria-hidden />
            {connected ? "Live" : "Reconnecting…"}
          </div>
        </div>
      </div>

      <div className="board-toolbar">
        <div className="filter-row" role="tablist" aria-label="Filter requests">
          {(
            [
              ["awaiting", `Awaiting (${awaitingReply})`],
              ["open", `Open (${openCount})`],
              ["done", `Done (${doneCount})`],
              ["all", `All (${requests.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <span className="sr-only">Search requests</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, PO, product, requester…"
          />
        </label>

        <div className={`manager-gate${managerUnlocked ? " unlocked" : ""}`}>
          {managerUnlocked ? (
            <div className="manager-gate-row">
              <p>
                <strong>Manager mode on</strong>
                <span>You can reply and update status.</span>
              </p>
              <button type="button" className="ghost-btn" onClick={lockManager}>
                Lock
              </button>
            </div>
          ) : (
            <form className="manager-gate-form" onSubmit={unlockManager}>
              <div>
                <strong>Manager access</strong>
                <p>Enter the manager password to reply or change status.</p>
              </div>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passwordDraft}
                  onChange={(e) => setPasswordDraft(e.target.value)}
                  placeholder="Manager password"
                  required
                />
              </label>
              <button className="reply-btn" type="submit" disabled={unlocking}>
                {unlocking ? "Checking…" : "Unlock"}
              </button>
              {unlockError ? (
                <p className="form-message error">{unlockError}</p>
              ) : null}
            </form>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <h3>
            {requests.length === 0
              ? "No requests yet"
              : "Nothing matches this view"}
          </h3>
          <p>
            {requests.length === 0
              ? "Create the first material request and it will appear here live."
              : "Try another filter or clear your search."}
          </p>
        </div>
      ) : (
        <ul className="request-list">
          {filtered.map((request) => {
            const replied = repliedItemCount(request.items);
            const complete = allItemsResponded(request.items);

            return (
              <li
                key={request.id}
                className={`request-row status-${request.status}${
                  highlightId === request.id ? " flash" : ""
                }`}
              >
                <div className="request-main">
                  <div className="request-title-row">
                    <h3>{request.customer || "Untitled customer"}</h3>
                    <span className="badge po-badge">
                      PO {request.poNumber || "—"}
                    </span>
                    {Array.from(
                      new Set(request.items.map((item) => item.productType)),
                    ).map((type) => (
                      <span key={type} className={`badge product-${type}`}>
                        {PRODUCT_TYPE_LABELS[type]}
                      </span>
                    ))}
                    <span className={`badge status-${request.status}`}>
                      {statusLabel(request.status)}
                    </span>
                    {!complete ? (
                      <span className="badge awaiting-reply">
                        {replied}/{request.items.length} replied
                      </span>
                    ) : (
                      <span className="badge availability-available">
                        Fully replied
                      </span>
                    )}
                  </div>

                  <p className="request-meta">
                    <span>
                      {request.items.length} product
                      {request.items.length === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span>{request.department}</span>
                    <span>·</span>
                    <span>{request.requesterName}</span>
                  </p>

                  <div className="order-context" aria-label="Order details">
                    <div>
                      <span>Customer</span>
                      <strong>{request.customer || "—"}</strong>
                    </div>
                    <div>
                      <span>PO</span>
                      <strong>{request.poNumber || "—"}</strong>
                    </div>
                  </div>

                  {request.notes ? (
                    <p className="request-notes">{request.notes}</p>
                  ) : null}

                  <div className="date-locks" aria-label="Request dates">
                    <div className="date-lock">
                      <span>Submitted</span>
                      <strong>{formatTime(request.createdAt)}</strong>
                    </div>
                    <div className="date-lock">
                      <span>Last edited</span>
                      <strong>{formatTime(request.updatedAt)}</strong>
                    </div>
                    <div className="date-lock">
                      <span>Responded</span>
                      <strong>
                        {request.respondedAt
                          ? formatTime(request.respondedAt)
                          : `— ${replied}/${request.items.length} products replied`}
                      </strong>
                    </div>
                  </div>

                  <div className="request-edit-bar">
                    {editingId === request.id ? null : (
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => setEditingId(request.id)}
                      >
                        Edit request
                      </button>
                    )}
                  </div>

                  {editingId === request.id ? (
                    <EditRequestForm
                      request={request}
                      onCancel={() => setEditingId(null)}
                      onSave={async (id, payload) => {
                        await onEditRequest(id, payload);
                        setEditingId(null);
                      }}
                    />
                  ) : null}

                  <ul className="line-items">
                    {request.items.map((item) => {
                      const replyOpen = expandedReplies[item.id] ?? false;

                      return (
                        <li key={item.id} className="line-item">
                          <div className="line-item-header">
                            <div>
                              <strong>{item.productName}</strong>
                              <p>
                                {PRODUCT_TYPE_LABELS[item.productType]} ·{" "}
                                {item.quantity} {item.unit}
                              </p>
                              {item.productType === "material" &&
                              formatMaterialSpec(item) ? (
                                <p className="line-item-spec">
                                  Core / Color: {formatMaterialSpec(item)}
                                </p>
                              ) : null}
                              {item.productType === "edgeband" &&
                              item.matchToSheet ? (
                                <p className="line-item-spec">
                                  Match to sheet: {item.matchToSheet}
                                </p>
                              ) : null}
                            </div>
                            {item.managerResponse ? (
                              <span
                                className={`badge availability-${item.managerResponse.availability}`}
                              >
                                {
                                  AVAILABILITY_LABELS[
                                    item.managerResponse.availability
                                  ]
                                }
                              </span>
                            ) : (
                              <span className="badge awaiting-reply">
                                Awaiting reply
                              </span>
                            )}
                          </div>

                          {item.managerResponse ? (
                            <ManagerResponseSummary
                              response={item.managerResponse}
                              submittedAt={request.createdAt}
                              productLabel={
                                PRODUCT_TYPE_LABELS[item.productType]
                              }
                            />
                          ) : null}

                          {managerUnlocked ? (
                            <>
                              <button
                                type="button"
                                className="reply-toggle"
                                onClick={() => toggleReply(item.id)}
                              >
                                {replyOpen
                                  ? "Hide manager reply form"
                                  : item.managerResponse
                                    ? "Update manager reply"
                                    : "Reply as manager"}
                              </button>

                              {replyOpen ? (
                                <ManagerReplyForm
                                  request={request}
                                  item={item}
                                  managerPassword={managerPassword}
                                  onSubmit={onManagerReply}
                                />
                              ) : null}
                            </>
                          ) : (
                            <p className="manager-locked-note">
                              Unlock manager access above to reply.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <label className="status-control">
                  <span>Quick status</span>
                  <select
                    value={request.status}
                    disabled={!managerUnlocked}
                    onChange={(event) => {
                      void onStatusChange(
                        request.id,
                        event.target.value as RequestStatus,
                        managerPassword,
                      );
                    }}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {!managerUnlocked ? (
                    <em className="locked-hint">Manager unlock required</em>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
