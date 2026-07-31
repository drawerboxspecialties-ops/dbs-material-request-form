import {
  isProductType,
  type CreateRequestItemInput,
} from "@/lib/types";

export function parseRequestItems(raw: unknown): CreateRequestItemInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const items: CreateRequestItemInput[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object") return null;
    const value = entry as Record<string, unknown>;
    const productType = value.productType;
    const productName = String(value.productName ?? "").trim();
    const quantity = Number(value.quantity);
    const core = String(value.core ?? "").trim();
    const color = String(value.color ?? "").trim();
    const matchToSheet = String(value.matchToSheet ?? "").trim();
    const thickness = String(value.thickness ?? "").trim();
    const id = String(value.id ?? "").trim() || undefined;
    const matchedItemIndexRaw = value.matchedItemIndex;
    const matchedItemIndex =
      matchedItemIndexRaw === null || matchedItemIndexRaw === undefined
        ? null
        : Number(matchedItemIndexRaw);

    if (!isProductType(productType)) return null;
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    if (productType === "hardware" && !Number.isInteger(quantity)) return null;

    if (productType === "material" && !productName) {
      return null;
    }

    if (productType === "hardware" && !productName) {
      return null;
    }

    if (productType === "edgeband") {
      if (!thickness) return null;
      const matchingSheet =
        matchedItemIndex !== null || Boolean(matchToSheet);
      if (!matchingSheet && !productName) return null;
    }

    if (
      matchedItemIndex !== null &&
      (!Number.isInteger(matchedItemIndex) ||
        matchedItemIndex < 0 ||
        matchedItemIndex >= raw.length ||
        matchedItemIndex === index)
    ) {
      return null;
    }

    items.push({
      id,
      productType,
      productName:
        productType === "edgeband" && !productName ? "Edgeband" : productName,
      quantity,
      core: productType === "material" ? core || undefined : undefined,
      color: productType === "material" ? color || undefined : undefined,
      matchToSheet: productType === "edgeband" ? matchToSheet || undefined : undefined,
      thickness: productType === "edgeband" ? thickness : undefined,
      matchedItemIndex:
        productType === "edgeband" ? matchedItemIndex : undefined,
    });
  }

  for (const item of items) {
    if (
      item.productType === "edgeband" &&
      item.matchedItemIndex !== undefined &&
      item.matchedItemIndex !== null
    ) {
      const target = items[item.matchedItemIndex];
      if (!target || target.productType !== "material") return null;
    }
  }

  return items;
}
