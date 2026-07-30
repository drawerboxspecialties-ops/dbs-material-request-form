"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AVAILABILITIES,
  AVAILABILITY_LABELS,
  PRODUCT_TYPE_LABELS,
  formatEdgebandSpec,
  type Availability,
  type ManagerResponse,
  type MaterialRequest,
  type RequestItem,
  type RequestStatus,
} from "@/lib/types";

export type ManagerReplyPayload = {
  itemId: string;
  status: RequestStatus;
  managerResponse: {
    availability: Availability;
    leadTime: string;
    price: string;
    vendor: string;
    respondedBy: string;
  };
};

type ManagerReplyFormProps = {
  request: MaterialRequest;
  item: RequestItem;
  defaultRespondedBy?: string;
  onSubmit: (id: string, payload: ManagerReplyPayload) => Promise<void>;
};

export function ManagerReplyForm({
  request,
  item,
  defaultRespondedBy = "",
  onSubmit,
}: ManagerReplyFormProps) {
  const existing = item.managerResponse;
  const [availability, setAvailability] = useState<Availability>(
    existing?.availability ?? "available",
  );
  const [leadTime, setLeadTime] = useState(existing?.leadTime ?? "");
  const [price, setPrice] = useState(existing?.price ?? "");
  const [vendor, setVendor] = useState(existing?.vendor ?? "");
  const [respondedBy, setRespondedBy] = useState(
    existing?.respondedBy ?? defaultRespondedBy,
  );
  const [status, setStatus] = useState<RequestStatus>(
    request.status === "pending" ? "approved" : request.status,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = item.managerResponse;
    setAvailability(next?.availability ?? "available");
    setLeadTime(next?.leadTime ?? "");
    setPrice(next?.price ?? "");
    setVendor(next?.vendor ?? "");
    setRespondedBy(next?.respondedBy ?? defaultRespondedBy);
    setStatus(request.status === "pending" ? "approved" : request.status);
  }, [item, request.status, defaultRespondedBy]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit(request.id, {
        itemId: item.id,
        status,
        managerResponse: {
          availability,
          leadTime,
          price,
          vendor,
          respondedBy,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save reply");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="manager-reply" onSubmit={handleSubmit}>
      <div className="manager-reply-heading">
        <h4>
          {existing ? "Update reply" : "Manager reply"} ·{" "}
          {PRODUCT_TYPE_LABELS[item.productType]}
        </h4>
        <p>
          {item.productName} · {item.quantity} {item.unit}
          {item.productType === "material" && (item.core || item.color)
            ? ` · Core ${item.core ?? "—"} · Color ${item.color ?? "—"}`
            : ""}
          {item.productType === "edgeband" && formatEdgebandSpec(item)
            ? ` · ${formatEdgebandSpec(item)}`
            : ""}
        </p>
        <div className="date-locks compact">
          <div className="date-lock">
            <span>Submitted (locked)</span>
            <strong>{formatLockedDate(request.createdAt)}</strong>
          </div>
          <div className="date-lock">
            <span>Item responded (locked)</span>
            <strong>
              {existing
                ? formatLockedDate(existing.respondedAt)
                : "Set when you send this reply"}
            </strong>
          </div>
        </div>
      </div>

      <div className="manager-reply-grid">
        <label className="field">
          <span>Availability</span>
          <select
            required
            value={availability}
            onChange={(e) => setAvailability(e.target.value as Availability)}
          >
            {AVAILABILITIES.map((value) => (
              <option key={value} value={value}>
                {AVAILABILITY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Lead time</span>
          <input
            required
            value={leadTime}
            onChange={(e) => setLeadTime(e.target.value)}
            placeholder="e.g. 2–3 days"
          />
        </label>

        <label className="field">
          <span>Price</span>
          <input
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. $48.00 / sheet"
          />
        </label>

        <label className="field">
          <span>Vendor</span>
          <input
            required
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. Acme Supply"
          />
        </label>

        <label className="field">
          <span>Manager name</span>
          <input
            required
            value={respondedBy}
            onChange={(e) => setRespondedBy(e.target.value)}
            placeholder="Your name"
          />
        </label>

        <label className="field">
          <span>Request status after reply</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as RequestStatus)}
          >
            <option value="approved">Approved</option>
            <option value="in_progress">In progress</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="rejected">Rejected</option>
            <option value="pending">Keep pending</option>
          </select>
        </label>
      </div>

      <div className="manager-reply-footer">
        <button className="reply-btn" type="submit" disabled={submitting}>
          {submitting
            ? "Saving…"
            : existing
              ? "Update item reply"
              : "Send item reply"}
        </button>
        {error ? <p className="form-message error">{error}</p> : null}
      </div>
    </form>
  );
}

export function ManagerResponseSummary({
  response,
  submittedAt,
  productLabel,
}: {
  response: ManagerResponse;
  submittedAt: string;
  productLabel: string;
}) {
  return (
    <div className="manager-summary">
      <div className="manager-summary-heading">
        <h4>Reply · {productLabel}</h4>
        <span className={`badge availability-${response.availability}`}>
          {AVAILABILITY_LABELS[response.availability]}
        </span>
      </div>
      <dl className="manager-facts">
        <div>
          <dt>Submitted date</dt>
          <dd>{formatLockedDate(submittedAt)}</dd>
        </div>
        <div>
          <dt>Responded date</dt>
          <dd>{formatLockedDate(response.respondedAt)}</dd>
        </div>
        <div>
          <dt>Lead time</dt>
          <dd>{response.leadTime}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>{response.price}</dd>
        </div>
        <div>
          <dt>Vendor</dt>
          <dd>{response.vendor}</dd>
        </div>
        <div>
          <dt>Replied by</dt>
          <dd>{response.respondedBy}</dd>
        </div>
      </dl>
    </div>
  );
}

function formatLockedDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
