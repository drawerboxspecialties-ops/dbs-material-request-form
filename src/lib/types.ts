export const STATUSES = [
  "pending",
  "approved",
  "in_progress",
  "fulfilled",
  "rejected",
] as const;

export const PRODUCT_TYPES = ["material", "hardware", "edgeband"] as const;

export const AVAILABILITIES = [
  "available",
  "limited",
  "on_order",
  "unavailable",
] as const;

export const PRODUCT_UNITS = {
  material: "sheets",
  hardware: "pcs",
  edgeband: "feet",
} as const;

export const PRODUCT_TYPE_LABELS = {
  material: "Material",
  hardware: "Hardware",
  edgeband: "Edgeband",
} as const;

export const AVAILABILITY_LABELS = {
  available: "Available",
  limited: "Limited stock",
  on_order: "On order",
  unavailable: "Unavailable",
} as const;

export type RequestStatus = (typeof STATUSES)[number];
export type ProductType = (typeof PRODUCT_TYPES)[number];
export type ProductUnit = (typeof PRODUCT_UNITS)[ProductType];
export type Availability = (typeof AVAILABILITIES)[number];

export type ManagerResponse = {
  availability: Availability;
  leadTime: string;
  price: string;
  vendor: string;
  respondedBy: string;
  /** Sheet size noted by manager (mainly for material). */
  sheetSize: string;
  respondedAt: string;
};

export type RequestItem = {
  id: string;
  productType: ProductType;
  productName: string;
  quantity: number;
  unit: ProductUnit;
  /** Required for material sheets. */
  core: string | null;
  /** Required for material sheets. */
  color: string | null;
  /** Optional for edgeband — which sheet this edgeband must match. */
  matchToSheet: string | null;
  /** Optional link to a material line item in the same request. */
  matchedItemId: string | null;
  /** Required for edgeband — thickness needed. */
  thickness: string | null;
  managerResponse: ManagerResponse | null;
};

export type MaterialRequest = {
  id: string;
  /** Customer the materials are being requested for. */
  customer: string;
  /** Purchase order linked to this request. */
  poNumber: string;
  items: RequestItem[];
  department: string;
  requesterName: string;
  status: RequestStatus;
  notes: string;
  /** Locked when the request is first submitted. */
  createdAt: string;
  /**
   * Locked the first time every line item has a manager reply.
   * Null while any product is still awaiting a response.
   */
  respondedAt: string | null;
  updatedAt: string;
};

export type CreateRequestItemInput = {
  id?: string;
  productType: ProductType;
  productName: string;
  quantity: number;
  core?: string;
  color?: string;
  matchToSheet?: string;
  thickness?: string;
  /** Index of a material item in the same create payload to match against. */
  matchedItemIndex?: number | null;
};

export type CreateMaterialRequestInput = {
  customer: string;
  poNumber: string;
  items: CreateRequestItemInput[];
  department?: string;
  requesterName: string;
  notes?: string;
};

export type UpdateMaterialRequestInput = {
  customer?: string;
  poNumber?: string;
  department?: string;
  requesterName?: string;
  status?: RequestStatus;
  notes?: string;
  items?: CreateRequestItemInput[];
  itemReply?: {
    itemId: string;
    managerResponse: {
      availability: Availability;
      leadTime: string;
      price: string;
      vendor: string;
      respondedBy: string;
      sheetSize?: string;
    };
  };
};

export type StoreEvent =
  | { type: "snapshot"; requests: MaterialRequest[] }
  | { type: "created"; request: MaterialRequest }
  | { type: "updated"; request: MaterialRequest }
  | { type: "deleted"; id: string };

export function unitForProductType(productType: ProductType): ProductUnit {
  return PRODUCT_UNITS[productType];
}

export function isProductType(value: unknown): value is ProductType {
  return (
    typeof value === "string" &&
    (PRODUCT_TYPES as readonly string[]).includes(value)
  );
}

export function isAvailability(value: unknown): value is Availability {
  return (
    typeof value === "string" &&
    (AVAILABILITIES as readonly string[]).includes(value)
  );
}

export function allItemsResponded(items: RequestItem[]): boolean {
  return items.length > 0 && items.every((item) => item.managerResponse !== null);
}

export function repliedItemCount(items: RequestItem[]): number {
  return items.filter((item) => item.managerResponse !== null).length;
}

export function formatMaterialSpec(item: Pick<RequestItem, "core" | "color">) {
  const parts = [item.core, item.color].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function describeSheetMatch(item: RequestItem) {
  const spec = formatMaterialSpec(item);
  return spec ? `${item.productName} (${spec})` : item.productName;
}

export function formatEdgebandSpec(
  item: Pick<RequestItem, "thickness" | "matchToSheet">,
) {
  const parts = [
    item.thickness ? `${item.thickness} thick` : null,
    item.matchToSheet ? `Match: ${item.matchToSheet}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
