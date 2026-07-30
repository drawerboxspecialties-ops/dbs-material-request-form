import { NextResponse } from "next/server";
import { createRequest, listRequests } from "@/lib/store";
import {
  PRIORITIES,
  isProductType,
  type CreateMaterialRequestInput,
  type CreateRequestItemInput,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPriority(
  value: unknown,
): value is CreateMaterialRequestInput["priority"] {
  return (
    typeof value === "string" && (PRIORITIES as readonly string[]).includes(value)
  );
}

function parseItems(raw: unknown): CreateRequestItemInput[] | null {
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
    const matchedItemIndexRaw = value.matchedItemIndex;
    const matchedItemIndex =
      matchedItemIndexRaw === null || matchedItemIndexRaw === undefined
        ? null
        : Number(matchedItemIndexRaw);

    if (!isProductType(productType) || !productName) return null;
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    if (productType === "hardware" && !Number.isInteger(quantity)) return null;

    if (productType === "material" && (!core || !color)) {
      return null;
    }

    if (productType === "edgeband" && !matchToSheet) {
      return null;
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
      productType,
      productName,
      quantity,
      core: productType === "material" ? core : undefined,
      color: productType === "material" ? color : undefined,
      matchToSheet: productType === "edgeband" ? matchToSheet : undefined,
      matchedItemIndex:
        productType === "edgeband" ? matchedItemIndex : undefined,
    });
  }

  // Edgeband matched indexes must point at material lines.
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

export async function GET() {
  return NextResponse.json({ requests: listRequests() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const customer = String(payload.customer ?? "").trim();
  const poNumber = String(payload.poNumber ?? payload.po ?? "").trim();
  const department = String(payload.department ?? "").trim();
  const requesterName = String(payload.requesterName ?? "").trim();
  const notes = String(payload.notes ?? "").trim();
  const priority = payload.priority;

  let items = parseItems(payload.items);
  if (!items && isProductType(payload.productType)) {
    items = parseItems([
      {
        productType: payload.productType,
        productName: payload.productName ?? payload.materialName,
        quantity: payload.quantity,
        core: payload.core,
        color: payload.color,
        matchToSheet: payload.matchToSheet,
        matchedItemIndex: payload.matchedItemIndex,
      },
    ]);
  }

  if (!items) {
    return NextResponse.json(
      {
        error:
          "Invalid items. Material needs core + color. Edgeband needs matchToSheet. Hardware needs name + qty.",
      },
      { status: 400 },
    );
  }

  if (!customer || !poNumber) {
    return NextResponse.json(
      { error: "customer and poNumber are required" },
      { status: 400 },
    );
  }

  if (!department || !requesterName) {
    return NextResponse.json(
      { error: "department and requesterName are required" },
      { status: 400 },
    );
  }

  if (!isPriority(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  const created = createRequest({
    customer,
    poNumber,
    items,
    department,
    requesterName,
    priority,
    notes,
  });

  return NextResponse.json({ request: created }, { status: 201 });
}
