"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  PRODUCT_TYPES,
  PRODUCT_TYPE_LABELS,
  PRODUCT_UNITS,
  describeSheetMatch,
  materialDescription,
  type MaterialRequest,
  type ProductType,
} from "@/lib/types";

const PRODUCT_PLACEHOLDERS: Record<ProductType, string> = {
  material: "e.g. White melamine 18mm · MDF · White",
  hardware: "e.g. Soft-close hinges",
  edgeband: "e.g. PVC edgeband 22mm",
};

const PRODUCT_FIELD_LABELS: Record<ProductType, string> = {
  material: "Material",
  hardware: "Product name",
  edgeband: "Product name",
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
  matchInRequest: boolean;
  thickness: string;
};

export type RequestFormDraft = {
  customer: string;
  poNumber: string;
  requesterName: string;
  notes: string;
  items: DraftItem[];
};

export type RequestFormSeed = {
  id: string;
  draft: RequestFormDraft;
  notice?: string;
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
    matchInRequest: productType === "edgeband",
    thickness: "",
  };
}

export function emptyRequestFormDraft(): RequestFormDraft {
  return {
    customer: "",
    poNumber: "",
    requesterName: "",
    notes: "",
    items: [newDraftItem()],
  };
}

export function buildFormDraftFromRequest(
  request: MaterialRequest,
): RequestFormDraft {
  const keyByOldId = new Map<string, string>();
  const items: DraftItem[] = request.items.map((item) => {
    const key = crypto.randomUUID();
    keyByOldId.set(item.id, key);
    const matchInRequest =
      item.productType === "edgeband" &&
      Boolean(item.matchedItemId || item.matchToSheet);
    return {
      key,
      productType: item.productType,
      productName:
        item.productType === "material"
          ? materialDescription(item)
          : item.productName,
      quantity: String(item.quantity),
      core: "",
      color: "",
      matchToSheet: item.matchToSheet ?? "",
      matchedDraftKey: "",
      matchInRequest,
      thickness: item.thickness ?? "",
    };
  });

  request.items.forEach((item, index) => {
    if (!item.matchedItemId) return;
    const matchedKey = keyByOldId.get(item.matchedItemId);
    if (!matchedKey) return;
    items[index] = {
      ...items[index],
      matchedDraftKey: matchedKey,
      matchInRequest: true,
    };
  });

  return {
    customer: request.customer,
    poNumber: request.poNumber,
    requesterName: request.requesterName,
    notes: request.notes,
    items: items.length > 0 ? items : [newDraftItem()],
  };
}

type RequestFormProps = {
  onCreated?: (request: MaterialRequest) => void;
  seed?: RequestFormSeed | null;
  onSeedApplied?: () => void;
};

export function RequestForm({
  onCreated,
  seed = null,
  onSeedApplied,
}: RequestFormProps) {
  const [items, setItems] = useState<DraftItem[]>([newDraftItem()]);
  const [customer, setCustomer] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastSeedId = useRef<string | null>(null);

  function applyDraft(
    draft: RequestFormDraft,
    nextNotice: string | null = null,
  ) {
    setCustomer(draft.customer);
    setPoNumber(draft.poNumber);
    setRequesterName(draft.requesterName);
    setNotes(draft.notes);
    setItems(
      draft.items.length > 0
        ? draft.items.map((item) => ({
            ...item,
            key: item.key || crypto.randomUUID(),
          }))
        : [newDraftItem()],
    );
    setError(null);
    setNotice(nextNotice);
  }

  function resetForm() {
    applyDraft(emptyRequestFormDraft());
  }

  useEffect(() => {
    if (!seed || seed.id === lastSeedId.current) return;
    lastSeedId.current = seed.id;
    applyDraft(seed.draft, seed.notice ?? "Copied into a new request draft.");
    onSeedApplied?.();
  }, [seed, onSeedApplied]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const fromQuoteCustomer = params.get("customer")?.trim() ?? "";
    const fromQuotePo = (params.get("po") ?? params.get("poNumber"))?.trim() ?? "";
    const fromQuoteRequester = (params.get("requester") ?? params.get("requesterName"))?.trim() ?? "";
    if (!fromQuoteCustomer && !fromQuotePo && !fromQuoteRequester) return;

    setCustomer((current) => current || fromQuoteCustomer);
    setPoNumber((current) => current || fromQuotePo);
    setRequesterName((current) => current || fromQuoteRequester);
  }, []);

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
          matchInRequest: true,
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
            thickness: null,
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
        if (Number(item.quantity) <= 0) {
          throw new Error("Each product needs a positive quantity");
        }
        if (item.productType === "material" && !item.productName.trim()) {
          throw new Error("Material lines need a description");
        }
        if (item.productType === "hardware" && !item.productName.trim()) {
          throw new Error("Hardware lines need a product name");
        }
        if (item.productType === "edgeband") {
          if (!item.thickness.trim()) {
            throw new Error("Edgeband lines need thickness");
          }
          if (item.matchInRequest) {
            if (!item.matchedDraftKey || !item.matchToSheet.trim()) {
              throw new Error("Choose a sheet in this request to match");
            }
          } else if (!item.productName.trim()) {
            throw new Error("Edgeband lines need a product name");
          }
        }
      }

      const payloadItems = items.map((item) => {
        const matchedItemIndex =
          item.productType === "edgeband" &&
          item.matchInRequest &&
          item.matchedDraftKey
            ? items.findIndex((entry) => entry.key === item.matchedDraftKey)
            : null;

        const productName =
          item.productType === "edgeband" && item.matchInRequest
            ? item.productName.trim() ||
              `Edgeband for ${item.matchToSheet.trim()}`
            : item.productName.trim();

        return {
          productType: item.productType,
          productName,
          quantity: Number(item.quantity),
          matchToSheet:
            item.productType === "edgeband" && item.matchInRequest
              ? item.matchToSheet.trim()
              : undefined,
          thickness:
            item.productType === "edgeband"
              ? item.thickness.trim()
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
          requesterName,
          notes,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        request?: MaterialRequest;
      };
      if (!response.ok || !data.request) {
        throw new Error(data.error ?? "Failed to submit request");
      }

      setItems([newDraftItem()]);
      setCustomer("");
      setPoNumber("");
      setNotes("");
      setNotice(null);
      onCreated?.(data.request);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="request-form" onSubmit={handleSubmit}>
      {notice ? (
        <p className="form-notice" role="status">
          {notice}
        </p>
      ) : null}

      <section className="form-section">
        <div className="section-label">
          <span>1</span>
          <div>
            <h3>Customer &amp; PO</h3>
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
            <h3>Requester</h3>
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Requester</span>
            <input
              required
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              placeholder="Your name"
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <div className="section-label">
          <span>3</span>
          <div>
            <h3>Products</h3>
          </div>
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
                          matchInRequest: type === "edgeband",
                          thickness: "",
                          productName: "",
                        })
                      }
                    >
                      {PRODUCT_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>

                {item.productType === "edgeband" ? (
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={item.matchInRequest}
                      onChange={(e) =>
                        updateItem(item.key, {
                          matchInRequest: e.target.checked,
                          matchedDraftKey: "",
                          matchToSheet: "",
                          productName: e.target.checked ? "" : item.productName,
                        })
                      }
                    />
                    <span>Match to sheet in this request</span>
                  </label>
                ) : null}

                {item.productType !== "edgeband" || !item.matchInRequest ? (
                  <label className="field">
                    <span>{PRODUCT_FIELD_LABELS[item.productType]}</span>
                    <input
                      required={
                        item.productType !== "edgeband" || !item.matchInRequest
                      }
                      value={item.productName}
                      onChange={(e) =>
                        updateItem(item.key, {
                          productName: e.target.value,
                          core: "",
                          color: "",
                        })
                      }
                      placeholder={PRODUCT_PLACEHOLDERS[item.productType]}
                    />
                  </label>
                ) : null}

                {item.productType === "edgeband" && item.matchInRequest ? (
                  <label className="field">
                    <span>Sheet in this request</span>
                    <select
                      required
                      value={item.matchedDraftKey}
                      onChange={(e) =>
                        applySheetMatch(item.key, e.target.value)
                      }
                    >
                      <option value="">Select a material line…</option>
                      {materialOptions.map(
                        ({ item: material, index: materialIndex }) => (
                          <option key={material.key} value={material.key}>
                            Item {materialIndex + 1}:{" "}
                            {material.productName || "Untitled sheet"}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ) : null}

                {item.productType === "edgeband" ? (
                  <label className="field">
                    <span>Thickness needed</span>
                    <input
                      required
                      value={item.thickness}
                      onChange={(e) =>
                        updateItem(item.key, { thickness: e.target.value })
                      }
                      placeholder="e.g. 1mm, 2mm, 22mm"
                    />
                  </label>
                ) : null}

                <label className="field draft-item-qty">
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
          </div>
        </div>
        <label className="field">
          <span>Details</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Location, job number, or special instructions"
          />
        </label>
      </section>

      <div className="form-footer sticky-actions">
        <div className="form-action-row">
          <button
            type="button"
            className="ghost-btn"
            onClick={resetForm}
            disabled={submitting}
          >
            Clear form
          </button>
          <button className="submit-btn" type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </div>
        {error ? <p className="form-message error">{error}</p> : null}
      </div>
    </form>
  );
}
