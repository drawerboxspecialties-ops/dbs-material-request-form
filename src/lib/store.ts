import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  allItemsResponded,
  isAvailability,
  isProductType,
  unitForProductType,
  type CreateMaterialRequestInput,
  type ManagerResponse,
  type MaterialRequest,
  type ProductType,
  type ProductUnit,
  type RequestItem,
  type StoreEvent,
  type UpdateMaterialRequestInput,
} from "./types";

const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL
  ? path.join("/tmp", "dbs-material-request-form")
  : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "requests.json");

type StoreEmitter = EventEmitter & {
  on(event: "change", listener: (payload: StoreEvent) => void): StoreEmitter;
  emit(event: "change", payload: StoreEvent): boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __dbsMaterialStore:
    | {
        requests: MaterialRequest[];
        emitter: StoreEmitter;
      }
    | undefined;
}

function ensureStore() {
  if (!globalThis.__dbsMaterialStore) {
    globalThis.__dbsMaterialStore = {
      requests: loadFromDisk(),
      emitter: new EventEmitter() as StoreEmitter,
    };
    globalThis.__dbsMaterialStore.emitter.setMaxListeners(100);
  } else {
    globalThis.__dbsMaterialStore.requests =
      globalThis.__dbsMaterialStore.requests
        .map((item) =>
          normalizeRequest(item as unknown as Record<string, unknown>),
        )
        .filter((item): item is MaterialRequest => item !== null);
  }
  return globalThis.__dbsMaterialStore;
}

function inferProductType(unit: unknown): ProductType {
  if (unit === "sheets") return "material";
  if (unit === "feet") return "edgeband";
  return "hardware";
}

function normalizeManagerResponse(raw: unknown): ManagerResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!isAvailability(value.availability)) return null;

  const leadTime = String(value.leadTime ?? "").trim();
  const price = String(value.price ?? "").trim();
  const vendor = String(value.vendor ?? "").trim();
  const respondedBy = String(value.respondedBy ?? "").trim();
  if (!leadTime || !price || !vendor || !respondedBy) return null;

  return {
    availability: value.availability,
    leadTime,
    price,
    vendor,
    respondedBy,
    respondedAt: String(value.respondedAt ?? new Date().toISOString()),
  };
}

function normalizeItem(raw: Record<string, unknown>): RequestItem | null {
  const productType = isProductType(raw.productType)
    ? raw.productType
    : inferProductType(raw.unit);
  const productName = String(
    raw.productName ?? raw.materialName ?? "",
  ).trim();
  if (!productName) return null;

  const core = String(raw.core ?? "").trim() || null;
  const color = String(raw.color ?? "").trim() || null;
  const matchToSheet = String(raw.matchToSheet ?? "").trim() || null;
  const matchedItemId = String(raw.matchedItemId ?? "").trim() || null;

  return {
    id: String(raw.id ?? crypto.randomUUID()),
    productType,
    productName,
    quantity: Number(raw.quantity) || 0,
    unit: (raw.unit as ProductUnit | undefined) ?? unitForProductType(productType),
    core: productType === "material" ? core : null,
    color: productType === "material" ? color : null,
    matchToSheet: productType === "edgeband" ? matchToSheet : null,
    matchedItemId: productType === "edgeband" ? matchedItemId : null,
    managerResponse: normalizeManagerResponse(raw.managerResponse),
  };
}

function normalizeRequest(raw: Record<string, unknown>): MaterialRequest | null {
  const id = String(raw.id ?? "");
  if (!id) return null;

  let items: RequestItem[] = [];
  if (Array.isArray(raw.items)) {
    items = raw.items
      .map((item) =>
        item && typeof item === "object"
          ? normalizeItem(item as Record<string, unknown>)
          : null,
      )
      .filter((item): item is RequestItem => item !== null);
  } else {
    // Migrate legacy single-product requests.
    const legacy = normalizeItem(raw);
    if (legacy) {
      items = [
        {
          ...legacy,
          managerResponse: normalizeManagerResponse(raw.managerResponse),
        },
      ];
    }
  }

  if (items.length === 0) return null;

  const createdAt = String(raw.createdAt ?? new Date().toISOString());
  const existingRespondedAt =
    typeof raw.respondedAt === "string" && raw.respondedAt
      ? raw.respondedAt
      : null;

  let respondedAt = existingRespondedAt;
  if (!respondedAt && allItemsResponded(items)) {
    const timestamps = items
      .map((item) => item.managerResponse?.respondedAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    respondedAt = timestamps[timestamps.length - 1] ?? createdAt;
  }

  return {
    id,
    customer: String(raw.customer ?? ""),
    poNumber: String(raw.poNumber ?? raw.po ?? ""),
    items,
    department: String(raw.department ?? ""),
    requesterName: String(raw.requesterName ?? ""),
    priority: (raw.priority as MaterialRequest["priority"]) ?? "normal",
    status: (raw.status as MaterialRequest["status"]) ?? "pending",
    notes: String(raw.notes ?? ""),
    createdAt,
    respondedAt,
    updatedAt: String(raw.updatedAt ?? createdAt),
  };
}

function loadFromDisk(): MaterialRequest[] {
  try {
    if (!existsSync(DATA_FILE)) return [];
    const raw = readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) =>
        item && typeof item === "object"
          ? normalizeRequest(item as Record<string, unknown>)
          : null,
      )
      .filter((item): item is MaterialRequest => item !== null);
  } catch {
    return [];
  }
}

function persist(requests: MaterialRequest[]) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(DATA_FILE, JSON.stringify(requests, null, 2), "utf8");
  } catch (error) {
    // On some serverless instances disk may be unavailable; memory store still works.
    console.warn("Failed to persist requests to disk", error);
  }
}

function sortRequests(requests: MaterialRequest[]) {
  return [...requests].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function listRequests(): MaterialRequest[] {
  return sortRequests(ensureStore().requests);
}

export function createRequest(
  input: CreateMaterialRequestInput,
): MaterialRequest {
  const store = ensureStore();
  const now = new Date().toISOString();
  const items: RequestItem[] = input.items.map((item) => ({
    id: crypto.randomUUID(),
    productType: item.productType,
    productName: item.productName.trim(),
    quantity: item.quantity,
    unit: unitForProductType(item.productType),
    core:
      item.productType === "material"
        ? (item.core ?? "").trim() || null
        : null,
    color:
      item.productType === "material"
        ? (item.color ?? "").trim() || null
        : null,
    matchToSheet:
      item.productType === "edgeband"
        ? (item.matchToSheet ?? "").trim() || null
        : null,
    matchedItemId: null,
    managerResponse: null,
  }));

  // Resolve edgeband → material sheet links within this request.
  input.items.forEach((item, index) => {
    if (item.productType !== "edgeband") return;
    const matchedIndex = item.matchedItemIndex;
    if (
      matchedIndex === undefined ||
      matchedIndex === null ||
      !Number.isInteger(matchedIndex) ||
      matchedIndex < 0 ||
      matchedIndex >= items.length
    ) {
      return;
    }
    const target = items[matchedIndex];
    if (target.productType !== "material") return;
    items[index] = {
      ...items[index],
      matchedItemId: target.id,
      matchToSheet:
        items[index].matchToSheet ||
        `${target.productName}${
          target.core || target.color
            ? ` (${[target.core, target.color].filter(Boolean).join(" · ")})`
            : ""
        }`,
    };
  });

  const request: MaterialRequest = {
    id: crypto.randomUUID(),
    customer: input.customer.trim(),
    poNumber: input.poNumber.trim(),
    items,
    department: input.department.trim(),
    requesterName: input.requesterName.trim(),
    priority: input.priority,
    status: "pending",
    notes: (input.notes ?? "").trim(),
    createdAt: now,
    respondedAt: null,
    updatedAt: now,
  };

  store.requests = [request, ...store.requests];
  persist(store.requests);
  store.emitter.emit("change", { type: "created", request });
  return request;
}

export function updateRequest(
  id: string,
  input: UpdateMaterialRequestInput,
): MaterialRequest | null {
  const store = ensureStore();
  const index = store.requests.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const current = store.requests[index];
  const now = new Date().toISOString();
  let items = current.items;

  if (input.items) {
    const previousById = new Map(current.items.map((item) => [item.id, item]));
    items = input.items.map((item) => {
      const existing =
        item.id && previousById.has(item.id)
          ? previousById.get(item.id)
          : undefined;
      return {
        id: existing?.id ?? crypto.randomUUID(),
        productType: item.productType,
        productName: item.productName.trim(),
        quantity: item.quantity,
        unit: unitForProductType(item.productType),
        core:
          item.productType === "material"
            ? (item.core ?? "").trim() || null
            : null,
        color:
          item.productType === "material"
            ? (item.color ?? "").trim() || null
            : null,
        matchToSheet:
          item.productType === "edgeband"
            ? (item.matchToSheet ?? "").trim() || null
            : null,
        matchedItemId: null,
        // Keep existing manager reply when the same line item id is reused.
        managerResponse: existing?.managerResponse ?? null,
      };
    });

    input.items.forEach((item, itemIndex) => {
      if (item.productType !== "edgeband") return;
      const matchedIndex = item.matchedItemIndex;
      if (
        matchedIndex === undefined ||
        matchedIndex === null ||
        !Number.isInteger(matchedIndex) ||
        matchedIndex < 0 ||
        matchedIndex >= items.length
      ) {
        return;
      }
      const target = items[matchedIndex];
      if (target.productType !== "material") return;
      items[itemIndex] = {
        ...items[itemIndex],
        matchedItemId: target.id,
        matchToSheet:
          items[itemIndex].matchToSheet ||
          `${target.productName}${
            target.core || target.color
              ? ` (${[target.core, target.color].filter(Boolean).join(" · ")})`
              : ""
          }`,
      };
    });
  }

  if (input.itemReply) {
    const itemIndex = items.findIndex(
      (item) => item.id === input.itemReply!.itemId,
    );
    if (itemIndex === -1) return null;

    const currentItem = items[itemIndex];
    const reply = input.itemReply.managerResponse;
    const nextItem: RequestItem = {
      ...currentItem,
      managerResponse: {
        availability: reply.availability,
        leadTime: reply.leadTime.trim(),
        price: reply.price.trim(),
        vendor: reply.vendor.trim(),
        respondedBy: reply.respondedBy.trim(),
        // Lock first response timestamp for this line item.
        respondedAt: currentItem.managerResponse?.respondedAt ?? now,
      },
    };
    items = items.map((item, i) => (i === itemIndex ? nextItem : item));
  }

  // Lock request-level respondedAt the first time every product is answered.
  // If items were edited and a previously complete reply set is broken, clear it.
  let respondedAt = current.respondedAt;
  if (allItemsResponded(items)) {
    if (!respondedAt) {
      respondedAt = now;
    }
  } else {
    respondedAt = null;
  }

  const updated: MaterialRequest = {
    ...current,
    createdAt: current.createdAt,
    respondedAt,
    items,
    customer:
      input.customer !== undefined ? input.customer.trim() : current.customer,
    poNumber:
      input.poNumber !== undefined ? input.poNumber.trim() : current.poNumber,
    department:
      input.department !== undefined
        ? input.department.trim()
        : current.department,
    requesterName:
      input.requesterName !== undefined
        ? input.requesterName.trim()
        : current.requesterName,
    status: input.status ?? current.status,
    priority: input.priority ?? current.priority,
    notes: input.notes !== undefined ? input.notes.trim() : current.notes,
    // Always refresh edit timestamp when anything changes.
    updatedAt: now,
  };

  store.requests[index] = updated;
  persist(store.requests);
  store.emitter.emit("change", { type: "updated", request: updated });
  return updated;
}

export function subscribe(listener: (event: StoreEvent) => void) {
  const store = ensureStore();
  store.emitter.on("change", listener);
  return () => {
    store.emitter.off("change", listener);
  };
}
