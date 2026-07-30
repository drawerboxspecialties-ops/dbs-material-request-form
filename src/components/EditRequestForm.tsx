"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  PRODUCT_TYPES,
  PRODUCT_TYPE_LABELS,
  PRODUCT_UNITS,
  describeSheetMatch,
  type MaterialRequest,
  type ProductType,
} from "@/lib/types";

const PRODUCT_PLACEHOLDERS: Record<ProductType, string> = {
  material: "e.g. White melamine 18mm",
  hardware: "e.g. Soft-close hinges",
  edgeband: "e.g. PVC edgeband 22mm",
};

type DraftItem = {
  key: string;
  id?: string;
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

function draftFromRequest(request: MaterialRequest): DraftItem[] {
  return request.items.map((item) => ({
    key: item.id,
    id: item.id,
    productType: item.productType,
    productName: item.productName,
    quantity: String(item.quantity),
    core: item.core ?? "",
    color: item.color ?? "",
    matchToSheet: item.matchToSheet ?? "",
    matchedDraftKey: item.matchedItemId ?? "",
    matchInRequest:
      item.productType === "edgeband" &&
      Boolean(item.matchedItemId || item.matchToSheet),
    thickness: item.thickness ?? "",
  }));
}

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

export type EditRequestPayload = {
  customer: string;
  poNumber: string;
  department: string;
  requesterName: string;
  notes: string;
  items: Array<{
    id?: string;
    productType: ProductType;
    productName: string;
    quantity: number;
    core?: string;
    color?: string;
    matchToSheet?: string;
    thickness?: string;
    matchedItemIndex?: number | null;
  }>;
};

type EditRequestFormProps = {
  request: MaterialRequest;
  onSave: (id: string, payload: EditRequestPayload) => Promise<void>;
  onCancel: () => void;
};

export function EditRequestForm({
  request,
  onSave,
  onCancel,
}: EditRequestFormProps) {
  const [items, setItems] = useState<DraftItem[]>(() => draftFromRequest(request));
  const [customer, setCustomer] = useState(request.customer);
  const [poNumber, setPoNumber] = useState(request.poNumber);
  const [department, setDepartment] = useState(request.department);
  const [requesterName, setRequesterName] = useState(request.requesterName);
  const [notes, setNotes] = useState(request.notes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(draftFromRequest(request));
    setCustomer(request.customer);
    setPoNumber(request.poNumber);
    setDepartment(request.department);
    setRequesterName(request.requesterName);
    setNotes(request.notes);
  }, [request]);

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
        if (
          item.productType === "material" &&
          (!item.productName.trim() || !item.core.trim() || !item.color.trim())
        ) {
          throw new Error("Material lines need name, core, and color");
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
          id: item.id,
          productType: item.productType,
          productName,
          quantity: Number(item.quantity),
          core: item.productType === "material" ? item.core.trim() : undefined,
          color: item.productType === "material" ? item.color.trim() : undefined,
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

      await onSave(request.id, {
        customer: customer.trim(),
        poNumber: poNumber.trim(),
        department: department.trim(),
        requesterName: requesterName.trim(),
        notes: notes.trim(),
        items: payloadItems,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="edit-request-form" onSubmit={handleSubmit}>
      <div className="edit-request-heading">
        <div>
          <h4>Edit request</h4>
          <p>
            Saving updates the last-edited date/time. Original submitted time
            stays locked.
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Customer</span>
          <input
            required
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />
        </label>
        <label className="field">
          <span>PO number</span>
          <input
            required
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Department</span>
          <input
            required
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Requester</span>
          <input
            required
            value={requesterName}
            onChange={(e) => setRequesterName(e.target.value)}
          />
        </label>
      </div>

      <div className="items-heading" style={{ marginTop: "1rem" }}>
        <span>Products</span>
        <em>
          {items.length} line{items.length === 1 ? "" : "s"}
          {typeSummary ? ` · ${typeSummary}` : ""}
        </em>
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
                  <span>Product name</span>
                  <input
                    required={
                      item.productType !== "edgeband" || !item.matchInRequest
                    }
                    value={item.productName}
                    onChange={(e) =>
                      updateItem(item.key, { productName: e.target.value })
                    }
                    placeholder={PRODUCT_PLACEHOLDERS[item.productType]}
                  />
                </label>
              ) : null}

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
                    />
                  </label>
                </div>
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
            </button>
          ))}
        </div>
      </div>

      <label className="field" style={{ marginTop: "0.9rem" }}>
        <span>Notes</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      <div className="edit-request-actions">
        <button className="submit-btn" type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save changes"}
        </button>
        {error ? <p className="form-message error">{error}</p> : null}
      </div>
    </form>
  );
}
