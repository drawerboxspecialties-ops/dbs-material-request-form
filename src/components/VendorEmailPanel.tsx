"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [toVendorId, setToVendorId] = useState("");
  const [bccVendorIds, setBccVendorIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("Material Request");
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toVendor = useMemo(
    () => (toVendorId ? findVendorById(toVendorId) : null),
    [toVendorId],
  );
  const bccVendors = useMemo(
    () =>
      bccVendorIds
        .map((id) => findVendorById(id))
        .filter((vendor): vendor is NonNullable<typeof vendor> => Boolean(vendor)),
    [bccVendorIds],
  );

  const draft = useMemo(
    () =>
      buildVendorEmailDraft(request, {
        toVendor,
        bccVendors,
      }),
    [request, toVendor, bccVendors],
  );

  useEffect(() => {
    setEdited(false);
    setToVendorId("");
    setBccVendorIds([]);
  }, [request.id]);

  useEffect(() => {
    if (edited) return;
    setSubject(draft.subject);
    setBody(draft.body);
  }, [draft.subject, draft.body, edited]);

  function toggleBcc(vendorId: string) {
    setBccVendorIds((current) =>
      current.includes(vendorId)
        ? current.filter((id) => id !== vendorId)
        : [...current, vendorId],
    );
  }

  function selectAllBcc() {
    setBccVendorIds(VENDORS.map((vendor) => vendor.id));
  }

  function clearBcc() {
    setBccVendorIds([]);
  }

  function resetDraft() {
    setEdited(false);
    setSubject(draft.subject);
    setBody(draft.body);
  }

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

  const mailtoHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("subject", subject);
    params.set("body", body);
    if (draft.bcc) {
      params.set("bcc", draft.bcc.replace(/;\s*/g, ","));
    }
    const to = draft.to.replace(/;\s*/g, ",");
    return `mailto:${to}?${params.toString()}`;
  }, [draft.to, draft.bcc, subject, body]);

  return (
    <section className="vendor-email-panel">
      <div className="vendor-email-heading">
        <div>
          <h3>Vendor email</h3>
          <p>
            Select vendors, edit subject/body if needed, then open in your email
            app.
          </p>
        </div>
      </div>

      <label className="field">
        <span>To (optional)</span>
        <select
          value={toVendorId}
          onChange={(e) => setToVendorId(e.target.value)}
        >
          <option value="">None — use BCC only</option>
          {VENDORS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.companyName} — {entry.contactName}
            </option>
          ))}
        </select>
      </label>

      <div className="bcc-picker">
        <div className="bcc-picker-heading">
          <strong>BCC vendors</strong>
          <div className="bcc-picker-actions">
            <button type="button" className="link-btn" onClick={selectAllBcc}>
              Select all
            </button>
            <button type="button" className="link-btn" onClick={clearBcc}>
              Clear
            </button>
          </div>
        </div>
        <div className="bcc-vendor-list" role="group" aria-label="BCC vendors">
          {VENDORS.map((entry) => {
            const checked = bccVendorIds.includes(entry.id);
            return (
              <label key={entry.id} className="check-field bcc-vendor-row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBcc(entry.id)}
                />
                <span>
                  <strong>{entry.companyName}</strong>
                  <em>
                    {entry.contactName} · {vendorEmailTo(entry)}
                  </em>
                </span>
              </label>
            );
          })}
        </div>
        <p className="bcc-count">
          {bccVendors.length} vendor{bccVendors.length === 1 ? "" : "s"} selected
          for BCC
        </p>
      </div>

      <label className="field">
        <span>To</span>
        <div className="copy-row">
          <input
            readOnly
            value={draft.to || "(empty — BCC only)"}
            className="readonly-input"
          />
          <button
            type="button"
            className="ghost-btn"
            disabled={!draft.to}
            onClick={() => {
              void handleCopy("to", draft.to);
            }}
          >
            {copied === "to" ? "Copied" : "Copy"}
          </button>
        </div>
      </label>

      <label className="field">
        <span>BCC</span>
        <div className="copy-row">
          <textarea
            readOnly
            rows={2}
            value={draft.bcc || "(none selected)"}
            className="readonly-input"
          />
          <button
            type="button"
            className="ghost-btn"
            disabled={!draft.bcc}
            onClick={() => {
              void handleCopy("bcc", draft.bcc);
            }}
          >
            {copied === "bcc" ? "Copied" : "Copy"}
          </button>
        </div>
      </label>

      <label className="field">
        <span>Subject</span>
        <input
          value={subject}
          onChange={(e) => {
            setEdited(true);
            setSubject(e.target.value);
          }}
        />
      </label>

      <label className="field">
        <span>Body</span>
        <textarea
          rows={10}
          value={body}
          className="email-body"
          onChange={(e) => {
            setEdited(true);
            setBody(e.target.value);
          }}
        />
      </label>

      <div className="vendor-email-actions">
        {edited ? (
          <button type="button" className="ghost-btn" onClick={resetDraft}>
            Reset draft
          </button>
        ) : null}
        {draft.to || draft.bcc ? (
          <a className="submit-btn mailto-btn" href={mailtoHref}>
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
    </section>
  );
}
