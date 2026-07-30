"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  PRODUCT_TYPES,
  PRODUCT_TYPE_LABELS,
  PRODUCT_UNITS,
  describeSheetMatch,
  type Priority,
  type ProductType,
} from "@/lib/types";

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const PRODUCT_PLACEHOLDERS: Record<ProductType, string> = {
  material: "e.g. White melamine 18mm",
  hardware: "e.g. Soft-close hinges",
  edgeband: "e.g. PVC edgeband 22mm",
};

type DraftItem = {
  key: string;
  productType: ProductType;
  productName: string;
  quantity: string;
  core: string;
  color: string;
  matchToSheet: string;
  matchedDraftKey: string;
};

function newDraftItem(productType: ProductType = "material"): DraftItem {
  return {
    key: crypto.randomUUID(),
    productType,
    productName: "",
    quantity: "1",
    core: "",
    color: "",
    matchToSheet: "",
    matchedDraftKey: "",
  };
}

type RequestFormProps = {
  onCreated?: (requestId: string) => void;
};

export function RequestForm({ onCreated }: RequestFormProps) {
  const [items, setItems] = useState<DraftItem[]>([newDraftItem()]);
  const [customer, setCustomer] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeSummary = useMemo(() => {
    const types = new Set(items.map((item) => item.productType));
    return Array.from(types)
      .map((type) => PRODUCT_TYPE_LABELS[type])
      .join(" · ");
  }, [items]);

  const materialOptions = useMemo(
    () =>
      items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.productType === "material"),
    [items],
  );

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(key: string) {
    setItems((current) => {
      const next =
        current.length === 1
          ? current
          : current.filter((item) => item.key !== key);
      return next.map((item) =>
        item.matchedDraftKey === key
          ? { ...item, matchedDraftKey: "", matchToSheet: "" }
          : item,
      );
    });
  }

  function applySheetMatch(key: string, matchedDraftKey: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        if (!matchedDraftKey) {
          return { ...item, matchedDraftKey: "", matchToSheet: "" };
        }
        const target = current.find((entry) => entry.key === matchedDraftKey);
        if (!target || target.productType !== "material") {
          return { ...item, matchedDraftKey: "", matchToSheet: "" };
        }
        return {
          ...item,
          matchedDraftKey,
          matchToSheet: describeSheetMatch({
            id: target.key,
            productType: "material",
            productName: target.productName || "Untitled sheet",
            quantity: Number(target.quantity) || 0,
            unit: "sheets",
            core: target.core || null,
            color: target.color || null,
            matchToSheet: null,
            matchedItemId: null,
            managerResponse: null,
          }),
        };
      }),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      for (const item of items) {
        if (!item.productName.trim() || Number(item.quantity) <= 0) {
          throw new Error("Each product needs a name and a positive quantity");
        }
        if (
          item.productType === "material" &&
          (!item.core.trim() || !item.color.trim())
        ) {
          throw new Error("Material lines need core and color");
        }
        if (item.productType === "edgeband" && !item.matchToSheet.trim()) {
          throw new Error("Edgeband lines must be matched to a sheet");
        }
      }

      const payloadItems = items.map((item) => {
        const matchedItemIndex =
          item.productType === "edgeband" && item.matchedDraftKey
            ? items.findIndex((entry) => entry.key === item.matchedDraftKey)
            : null;

        return {
          productType: item.productType,
          productName: item.productName.trim(),
          quantity: Number(item.quantity),
          core: item.productType === "material" ? item.core.trim() : undefined,
          color: item.productType === "material" ? item.color.trim() : undefined,
          matchToSheet:
            item.productType === "edgeband"
              ? item.matchToSheet.trim()
              : undefined,
          matchedItemIndex:
            matchedItemIndex !== null && matchedItemIndex >= 0
              ? matchedItemIndex
              : null,
        };
      });

      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          poNumber,
          items: payloadItems,
          department,
          requesterName,
          priority,
          notes,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        request?: { id: string };
      };
      if (!response.ok || !data.request) {
        throw new Error(data.error ?? "Failed to submit request");
      }

      setItems([newDraftItem()]);
      setCustomer("");
      setPoNumber("");
      setNotes("");
      setPriority("normal");
      onCreated?.(data.request.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="request-form" onSubmit={handleSubmit}>
      <section className="form-section">
        <div className="section-label">
          <span>1</span>
          <div>
            <h3>Customer &amp; PO</h3>
            <p>Link this request to the job before adding products.</p>
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Customer</span>
            <input
              required
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="e.g. Northside Interiors"
            />
          </label>

          <label className="field">
            <span>PO number</span>
            <input
              required
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="e.g. PO-10428"
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-label">
          <span>2</span>
          <div>
            <h3>Who is requesting</h3>
            <p>Department, your name, and how urgent this is.</p>
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Department</span>
            <input
              required
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Production"
            />
          </label>

          <label className="field">
            <span>Requester</span>
            <input
              required
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              placeholder="Your name"
            />
          </label>

          <div className="field field-span-2">
            <span>Priority</span>
            <div className="priority-row" role="group" aria-label="Priority">
              {PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`priority-chip priority-${option.value}${
                    priority === option.value ? " active" : ""
                  }`}
                  onClick={() => setPriority(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="section-label">
          <span>3</span>
          <div>
            <h3>Products needed</h3>
            <p>
              Mix Material, Hardware, and Edgeband in this same request ·{" "}
              {items.length} line{items.length === 1 ? "" : "s"}
              {typeSummary ? ` · ${typeSummary}` : ""}
            </p>
          </div>
        </div>

        <div className="multi-type-callout">
          <strong>One request, multiple product types</strong>
          <p>
            Add as many lines as you need. Each line can be Material (sheets),
            Hardware (pcs), or Edgeband (feet).
          </p>
        </div>

        <div className="draft-items">
          {items.map((item, index) => {
            const unit = PRODUCT_UNITS[item.productType];
            const quantityStep = item.productType === "hardware" ? "1" : "any";
            const quantityMin = item.productType === "hardware" ? "1" : "0.01";

            return (
              <div
                key={item.key}
                className={`draft-item product-${item.productType}`}
              >
                <div className="draft-item-top">
                  <div>
                    <strong>Item {index + 1}</strong>
                    <em>{PRODUCT_TYPE_LABELS[item.productType]}</em>
                  </div>
                  {items.length > 1 ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => removeItem(item.key)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div
                  className="product-type-row"
                  role="group"
                  aria-label="Product type"
                >
                  {PRODUCT_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`product-type-chip product-${type}${
                        item.productType === type ? " active" : ""
                      }`}
                      onClick={() =>
                        updateItem(item.key, {
                          productType: type,
                          quantity: "1",
                          core: "",
                          color: "",
                          matchToSheet: "",
                          matchedDraftKey: "",
                        })
                      }
                    >
                      <strong>{PRODUCT_TYPE_LABELS[type]}</strong>
                      <em>{PRODUCT_UNITS[type]}</em>
                    </button>
                  ))}
                </div>

                <label className="field">
                  <span>Product name</span>
                  <input
                    required
                    value={item.productName}
                    onChange={(e) =>
                      updateItem(item.key, { productName: e.target.value })
                    }
                    placeholder={PRODUCT_PLACEHOLDERS[item.productType]}
                  />
                </label>

                {item.productType === "material" ? (
                  <div className="draft-item-qty">
                    <label className="field">
                      <span>Core</span>
                      <input
                        required
                        value={item.core}
                        onChange={(e) =>
                          updateItem(item.key, { core: e.target.value })
                        }
                        placeholder="e.g. MDF"
                      />
                    </label>
                    <label className="field">
                      <span>Color</span>
                      <input
                        required
                        value={item.color}
                        onChange={(e) =>
                          updateItem(item.key, { color: e.target.value })
                        }
                        placeholder="e.g. White"
                      />
                    </label>
                  </div>
                ) : null}

                {item.productType === "edgeband" ? (
                  <div className="edgeband-match">
                    <label className="field">
                      <span>Match to sheet in this request</span>
                      <select
                        value={item.matchedDraftKey}
                        onChange={(e) =>
                          applySheetMatch(item.key, e.target.value)
                        }
                      >
                        <option value="">Describe sheet manually…</option>
                        {materialOptions.map(
                          ({ item: material, index: materialIndex }) => (
                            <option key={material.key} value={material.key}>
                              Item {materialIndex + 1}:{" "}
                              {material.productName || "Untitled sheet"}
                              {material.core || material.color
                                ? ` (${[material.core, material.color]
                                    .filter(Boolean)
                                    .join(" · ")})`
                                : ""}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="field">
                      <span>Sheet to match</span>
                      <input
                        required
                        value={item.matchToSheet}
                        onChange={(e) =>
                          updateItem(item.key, {
                            matchedDraftKey: "",
                            matchToSheet: e.target.value,
                          })
                        }
                        placeholder="e.g. White melamine 18mm — MDF / White"
                      />
                    </label>
                  </div>
                ) : null}

                <div className="draft-item-qty">
                  <label className="field">
                    <span>Quantity ({unit})</span>
                    <input
                      required
                      type="number"
                      min={quantityMin}
                      step={quantityStep}
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(item.key, { quantity: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Unit</span>
                    <input value={unit} readOnly className="readonly-input" />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="add-item-panel">
          <p className="add-item-label">Add another line</p>
          <div className="quick-add-row">
            {PRODUCT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`quick-add-btn product-${type}`}
                onClick={() =>
                  setItems((current) => [...current, newDraftItem(type)])
                }
              >
                + {PRODUCT_TYPE_LABELS[type]}
                <em>{PRODUCT_UNITS[type]}</em>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="section-label">
          <span>4</span>
          <div>
            <h3>Notes</h3>
            <p>Optional job details for warehouse or purchasing.</p>
          </div>
        </div>
        <label className="field">
          <span>Extra details</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Location, job number, or special instructions"
          />
        </label>
      </section>

      <div className="form-footer sticky-actions">
        <div>
          <strong>Ready to send?</strong>
          <p>
            {customer.trim() || "Customer"} · {poNumber.trim() || "PO"} ·{" "}
            {items.length} product line{items.length === 1 ? "" : "s"}
            {typeSummary ? ` (${typeSummary})` : ""}
          </p>
        </div>
        <button className="submit-btn" type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit request"}
        </button>
        {error ? <p className="form-message error">{error}</p> : null}
      </div>
    </form>
  );
}
