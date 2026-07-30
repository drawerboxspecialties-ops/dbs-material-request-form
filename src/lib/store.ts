import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { get, put } from "@vercel/blob";
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
const HAS_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const BLOB_PATHNAME = "dbs-material-request-form/requests.json";
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
        writeChain: Promise<void>;
      }
    | undefined;
}

function ensureStore() {
  if (!globalThis.__dbsMaterialStore) {
    globalThis.__dbsMaterialStore = {
      requests: loadFromDisk(),
      emitter: new EventEmitter() as StoreEmitter,
      writeChain: Promise.resolve(),
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

function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const store = ensureStore();
  const run = store.writeChain.then(fn, fn);
  store.writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
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
    status: (raw.status as MaterialRequest["status"]) ?? "pending",
    notes: String(raw.notes ?? ""),
    createdAt,
    respondedAt,
    updatedAt: String(raw.updatedAt ?? createdAt),
  };
}

function parseRequestList(raw: unknown): MaterialRequest[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) =>
      item && typeof item === "object"
        ? normalizeRequest(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is MaterialRequest => item !== null);
}

function loadFromDisk(): MaterialRequest[] {
  try {
    if (!existsSync(DATA_FILE)) return [];
    const raw = readFileSync(DATA_FILE, "utf8");
    return parseRequestList(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function persistDisk(requests: MaterialRequest[]) {
  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(DATA_FILE, JSON.stringify(requests, null, 2), "utf8");
  } catch (error) {
    console.warn("Failed to persist requests to disk", error);
  }
}

async function loadFromBlob(): Promise<MaterialRequest[] | null> {
  if (!HAS_BLOB) return null;
  try {
    const result = await get(BLOB_PATHNAME, {
      access: "private",
      useCache: false,
    });
    if (!result) return [];
    if (result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    if (!text.trim()) return [];
    return parseRequestList(JSON.parse(text) as unknown);
  } catch (error) {
    console.warn("Failed to load requests from blob", error);
    return null;
  }
}

async function saveToBlob(requests: MaterialRequest[]) {
  if (!HAS_BLOB) return;
  try {
    await put(BLOB_PATHNAME, JSON.stringify(requests, null, 2), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (error) {
    console.warn("Failed to persist requests to blob", error);
  }
}

function sortRequests(requests: MaterialRequest[]) {
  return [...requests].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function mergeRequests(
  ...lists: MaterialRequest[][]
): MaterialRequest[] {
  const map = new Map<string, MaterialRequest>();
  for (const list of lists) {
    for (const request of list) {
      const previous = map.get(request.id);
      if (
        !previous ||
        new Date(request.updatedAt).getTime() >=
          new Date(previous.updatedAt).getTime()
      ) {
        map.set(request.id, request);
      }
    }
  }
  return sortRequests([...map.values()]);
}

async function hydrateFromShared() {
  const remote = await loadFromBlob();
  if (remote === null) return;
  const store = ensureStore();
  store.requests = mergeRequests(store.requests, remote);
}

async function persist(requests: MaterialRequest[]) {
  const store = ensureStore();
  const remote = await loadFromBlob();
  const merged = remote === null ? requests : mergeRequests(remote, requests);
  store.requests = merged;
  persistDisk(merged);
  await saveToBlob(merged);
}

export async function listRequests(): Promise<MaterialRequest[]> {
  return withStoreLock(async () => {
    await hydrateFromShared();
    return sortRequests(ensureStore().requests);
  });
}

export async function createRequest(
  input: CreateMaterialRequestInput,
): Promise<MaterialRequest> {
  return withStoreLock(async () => {
    await hydrateFromShared();
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
      status: "pending",
      notes: (input.notes ?? "").trim(),
      createdAt: now,
      respondedAt: null,
      updatedAt: now,
    };

    store.requests = [request, ...store.requests];
    await persist(store.requests);
    store.emitter.emit("change", { type: "created", request });
    return request;
  });
}

export async function updateRequest(
  id: string,
  input: UpdateMaterialRequestInput,
): Promise<MaterialRequest | null> {
  return withStoreLock(async () => {
    await hydrateFromShared();
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
          respondedAt: currentItem.managerResponse?.respondedAt ?? now,
        },
      };
      items = items.map((item, i) => (i === itemIndex ? nextItem : item));
    }

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
      notes: input.notes !== undefined ? input.notes.trim() : current.notes,
      updatedAt: now,
    };

    store.requests[index] = updated;
    await persist(store.requests);
    store.emitter.emit("change", { type: "updated", request: updated });
    return updated;
  });
}

export function subscribe(listener: (event: StoreEvent) => void) {
  const store = ensureStore();
  store.emitter.on("change", listener);
  return () => {
    store.emitter.off("change", listener);
  };
}
