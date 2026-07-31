"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EditRequestForm,
  type EditRequestPayload,
} from "@/components/EditRequestForm";
import {
  ManagerReplyForm,
  ManagerResponseSummary,
  type ManagerReplyPayload,
} from "@/components/ManagerReplyForm";
import { VendorEmailPanel } from "@/components/VendorEmailPanel";
import {
  AVAILABILITY_LABELS,
  PRODUCT_TYPE_LABELS,
  allItemsResponded,
  formatEdgebandSpec,
  materialDescription,
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

type RequestBoardProps = {
  requests: MaterialRequest[];
  connected: boolean;
  highlightId?: string | null;
  onStatusChange: (id: string, status: RequestStatus) => Promise<void>;
  onManagerReply: (id: string, payload: ManagerReplyPayload) => Promise<void>;
  onEditRequest: (id: string, payload: EditRequestPayload) => Promise<void>;
  onDeleteRequest: (id: string) => Promise<void>;
  onCopyRequest: (request: MaterialRequest) => void;
};

export function RequestBoard({
  requests,
  connected,
  highlightId,
  onStatusChange,
  onManagerReply,
  onEditRequest,
  onDeleteRequest,
  onCopyRequest,
}: RequestBoardProps) {
  const [filter, setFilter] = useState<BoardFilter>("awaiting");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>(
    {},
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  useEffect(() => {
    if (highlightId) {
      setSelectedId(highlightId);
      return;
    }
    if (selectedId && filtered.some((request) => request.id === selectedId)) {
      return;
    }
    setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, highlightId, selectedId]);

  const selected = useMemo(
    () => filtered.find((request) => request.id === selectedId) ?? null,
    [filtered, selectedId],
  );

  function toggleReply(itemId: string) {
    setExpandedReplies((current) => ({
      ...current,
      [itemId]: !current[itemId],
    }));
  }

  async function handleDelete(request: MaterialRequest) {
    const label = `${request.customer || "Untitled"} / PO ${request.poNumber || "—"}`;
    const confirmed = window.confirm(
      `Delete this request?\n\n${label}\n\nThis cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteRequest(request.id);
      setEditingId(null);
      if (selectedId === request.id) {
        setSelectedId(null);
      }
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete request",
      );
    } finally {
      setDeleting(false);
    }
  }

  function openEdit(request: MaterialRequest) {
    setSelectedId(request.id);
    setEditingId(request.id);
    setDeleteError(null);
  }

  function selectRequest(requestId: string) {
    setSelectedId(requestId);
    setEditingId(null);
    setDeleteError(null);
  }

  return (
    <>
      <section className="panel panel-queue">
        <div className="panel-heading queue-heading">
          <div>
            <h2>Queue</h2>
            <p>
              {awaitingReply} awaiting · {openCount} open · {requests.length}{" "}
              total
            </p>
          </div>
          <div className={`live-pill${connected ? " on" : ""}`}>
            <span className="live-dot" aria-hidden />
            {connected ? "Live" : "Reconnecting…"}
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
              placeholder="Search customer, PO, product…"
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state compact">
            <h3>
              {requests.length === 0
                ? "No requests yet"
                : "Nothing matches this view"}
            </h3>
            <p>
              {requests.length === 0
                ? "Submit a request on the left — it will show up here live."
                : "Try another filter or clear your search."}
            </p>
          </div>
        ) : (
          <ul className="queue-list" role="listbox" aria-label="Request queue">
            {filtered.map((request) => {
              const replied = repliedItemCount(request.items);
              const complete = allItemsResponded(request.items);
              const active = selectedId === request.id;

              return (
                <li key={request.id}>
                  <div
                    className={`queue-card status-${request.status}${
                      active ? " active" : ""
                    }${highlightId === request.id ? " flash" : ""}`}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className="queue-card-main"
                      onClick={() => selectRequest(request.id)}
                    >
                      <div className="queue-card-top">
                        <strong>
                          {request.customer || "Untitled customer"}
                        </strong>
                      </div>
                      <div className="queue-card-meta">
                        <span>PO {request.poNumber || "—"}</span>
                        <span>·</span>
                        <span>
                          {request.items.length} line
                          {request.items.length === 1 ? "" : "s"}
                        </span>
                        <span>·</span>
                        <span>{request.requesterName}</span>
                      </div>
                      <div className="queue-card-footer">
                        <div className="queue-type-row">
                          {Array.from(
                            new Set(
                              request.items.map((item) => item.productType),
                            ),
                          ).map((type) => (
                            <span
                              key={type}
                              className={`badge product-${type}`}
                            >
                              {PRODUCT_TYPE_LABELS[type]}
                            </span>
                          ))}
                        </div>
                        {complete ? (
                          <span className="badge availability-available">
                            Replied
                          </span>
                        ) : (
                          <span className="badge awaiting-reply">
                            {replied}/{request.items.length}
                          </span>
                        )}
                      </div>
                    </button>

                    <div className="queue-card-actions">
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => onCopyRequest(request)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => openEdit(request)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger-btn"
                        disabled={deleting}
                        onClick={() => {
                          void handleDelete(request);
                        }}
                      >
                        {deleting && selectedId === request.id
                          ? "…"
                          : "Delete"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel panel-detail">
        <div className="panel-heading">
          <div>
            <h2>Detail</h2>
            <p>Reply, edit, and update status for the selected request.</p>
          </div>
        </div>
        {deleteError ? (
          <p className="form-message error">{deleteError}</p>
        ) : null}

        {!selected ? (
          <div className="empty-state compact">
            <h3>Select a request</h3>
            <p>Pick one from the queue to review products and reply.</p>
          </div>
        ) : (
          <article
            className={`detail-card status-${selected.status}${
              highlightId === selected.id ? " flash" : ""
            }`}
          >
            <div className="detail-title-row">
              <div>
                <h3>{selected.customer || "Untitled customer"}</h3>
                <p className="request-meta">
                  <span>PO {selected.poNumber || "—"}</span>
                  <span>·</span>
                  <span>{selected.requesterName}</span>
                </p>
              </div>
            </div>

            <div className="order-context" aria-label="Order details">
              <div>
                <span>Customer</span>
                <strong>{selected.customer || "—"}</strong>
              </div>
              <div>
                <span>PO</span>
                <strong>{selected.poNumber || "—"}</strong>
              </div>
            </div>

            {selected.notes ? (
              <p className="request-notes">{selected.notes}</p>
            ) : null}

            <div className="date-locks" aria-label="Request dates">
              <div className="date-lock">
                <span>Submitted</span>
                <strong>{formatTime(selected.createdAt)}</strong>
              </div>
              <div className="date-lock">
                <span>Last edited</span>
                <strong>{formatTime(selected.updatedAt)}</strong>
              </div>
              <div className="date-lock">
                <span>Responded</span>
                <strong>
                  {selected.respondedAt
                    ? formatTime(selected.respondedAt)
                    : `— ${repliedItemCount(selected.items)}/${selected.items.length} replied`}
                </strong>
              </div>
            </div>

            <div className="detail-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => onCopyRequest(selected)}
              >
                Copy to new
              </button>
              {editingId === selected.id ? null : (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => openEdit(selected)}
                >
                  Edit request
                </button>
              )}
              <label className="status-control inline">
                <span>Status</span>
                <select
                  value={selected.status}
                  onChange={(event) => {
                    void onStatusChange(
                      selected.id,
                      event.target.value as RequestStatus,
                    );
                  }}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="danger-btn"
                disabled={deleting}
                onClick={() => {
                  void handleDelete(selected);
                }}
              >
                {deleting ? "Deleting…" : "Delete request"}
              </button>
            </div>

            {editingId === selected.id ? (
              <EditRequestForm
                request={selected}
                onCancel={() => setEditingId(null)}
                onSave={async (id, payload) => {
                  await onEditRequest(id, payload);
                  setEditingId(null);
                }}
              />
            ) : null}

            <VendorEmailPanel request={selected} />

            <ul className="line-items">
              {selected.items.map((item) => {
                const replyOpen = expandedReplies[item.id] ?? false;

                return (
                  <li key={item.id} className="line-item">
                    <div className="line-item-header">
                      <div>
                        <strong>
                          {item.productType === "material"
                            ? materialDescription(item)
                            : item.productName}
                        </strong>
                        <p>
                          {PRODUCT_TYPE_LABELS[item.productType]} ·{" "}
                          {item.quantity} {item.unit}
                        </p>
                        {item.productType === "edgeband" &&
                        formatEdgebandSpec(item) ? (
                          <p className="line-item-spec">
                            {formatEdgebandSpec(item)}
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
                        submittedAt={selected.createdAt}
                        productLabel={PRODUCT_TYPE_LABELS[item.productType]}
                      />
                    ) : null}

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
                          request={selected}
                          item={item}
                          onSubmit={onManagerReply}
                        />
                      ) : null}
                    </>
                  </li>
                );
              })}
            </ul>
          </article>
        )}
      </section>
    </>
  );
}
