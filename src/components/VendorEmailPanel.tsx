"use client";

import { useMemo, useState } from "react";
import { buildVendorEmailDraft } from "@/lib/emailDraft";
import type { MaterialRequest } from "@/lib/types";
import { VENDORS, findVendorById, vendorEmailTo } from "@/lib/vendors";

type VendorEmailPanelProps = {
  request: MaterialRequest;
};

async function copyText(value: string) {
  if (!value.trim()) {
    throw new Error("Nothing to copy");
  }
  await navigator.clipboard.writeText(value);
}

export function VendorEmailPanel({ request }: VendorEmailPanelProps) {
  const [vendorId, setVendorId] = useState(VENDORS[0]?.id ?? "");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vendor = useMemo(() => findVendorById(vendorId), [vendorId]);
  const draft = useMemo(
    () => buildVendorEmailDraft(request, vendor),
    [request, vendor],
  );

  async function handleCopy(label: string, value: string) {
    setError(null);
    try {
      await copyText(value);
      setCopied(label);
      window.setTimeout(() => {
        setCopied((current) => (current === label ? null : current));
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy");
    }
  }

  return (
    <section className="vendor-email-panel">
      <div className="vendor-email-heading">
        <div>
          <h3>Vendor email</h3>
          <p>Pick a vendor, then copy subject/body into your email.</p>
        </div>
      </div>

      <label className="field">
        <span>Vendor</span>
        <select
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
        >
          {VENDORS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.companyName} — {entry.contactName}
            </option>
          ))}
        </select>
      </label>

      {vendor ? (
        <div className="vendor-card" aria-label="Selected vendor">
          <div>
            <strong>{vendor.companyName}</strong>
            <p>
              {vendor.contactName} · ID {vendor.customerId}
            </p>
          </div>
          <div className="vendor-card-meta">
            <span>Phone {vendor.phone || "—"}</span>
            {vendor.fax ? <span>Fax {vendor.fax}</span> : null}
            <span>{vendorEmailTo(vendor)}</span>
          </div>
        </div>
      ) : null}

      <label className="field">
        <span>To</span>
        <div className="copy-row">
          <input readOnly value={draft.to} className="readonly-input" />
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              void handleCopy("to", draft.to);
            }}
          >
            {copied === "to" ? "Copied" : "Copy"}
          </button>
        </div>
      </label>

      <label className="field">
        <span>Subject</span>
        <div className="copy-row">
          <input readOnly value={draft.subject} className="readonly-input" />
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              void handleCopy("subject", draft.subject);
            }}
          >
            {copied === "subject" ? "Copied" : "Copy"}
          </button>
        </div>
      </label>

      <label className="field">
        <span>Body</span>
        <textarea
          readOnly
          rows={12}
          value={draft.body}
          className="readonly-input email-body"
        />
      </label>

      <div className="vendor-email-actions">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            void handleCopy("body", draft.body);
          }}
        >
          {copied === "body" ? "Body copied" : "Copy body"}
        </button>
        <button
          type="button"
          className="submit-btn"
          onClick={() => {
            void handleCopy(
              "all",
              `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`,
            );
          }}
        >
          {copied === "all" ? "All copied" : "Copy all"}
        </button>
        {draft.to ? (
          <a
            className="ghost-btn mailto-btn"
            href={`mailto:${draft.to.replace(/;\s*/g, ",")}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
          >
            Open in email
          </a>
        ) : null}
      </div>

      {error ? <p className="form-message error">{error}</p> : null}
      {copied && !error ? (
        <p className="form-message success" role="status">
          Copied {copied}.
        </p>
      ) : null}

      <details className="vendor-directory">
        <summary>Full vendor contact list</summary>
        <div className="vendor-table-wrap">
          <table className="vendor-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Fax</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {VENDORS.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.customerId}</td>
                  <td>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setVendorId(entry.id)}
                    >
                      {entry.companyName}
                    </button>
                  </td>
                  <td>{entry.contactName}</td>
                  <td>{entry.phone || "—"}</td>
                  <td>{entry.fax || "—"}</td>
                  <td>{vendorEmailTo(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
