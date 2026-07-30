import { NextResponse } from "next/server";
import { parseRequestItems } from "@/lib/parseItems";
import { createRequest, listRequests } from "@/lib/store";
import {
  PRIORITIES,
  isProductType,
  type CreateMaterialRequestInput,
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

  let items = parseRequestItems(payload.items);
  if (!items && isProductType(payload.productType)) {
    items = parseRequestItems([
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
