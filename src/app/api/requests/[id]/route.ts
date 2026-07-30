import { NextResponse } from "next/server";
import { isValidManagerPassword } from "@/lib/managerAuth";
import { updateRequest } from "@/lib/store";
import {
  PRIORITIES,
  STATUSES,
  isAvailability,
  type UpdateMaterialRequestInput,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

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
  const input: UpdateMaterialRequestInput = {};
  const managerPassword = payload.managerPassword;

  if (payload.status !== undefined) {
    if (
      typeof payload.status !== "string" ||
      !(STATUSES as readonly string[]).includes(payload.status)
    ) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    input.status = payload.status as UpdateMaterialRequestInput["status"];
  }

  if (payload.priority !== undefined) {
    if (
      typeof payload.priority !== "string" ||
      !(PRIORITIES as readonly string[]).includes(payload.priority)
    ) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }
    input.priority = payload.priority as UpdateMaterialRequestInput["priority"];
  }

  if (payload.notes !== undefined) {
    input.notes = String(payload.notes);
  }

  const itemId = String(payload.itemId ?? "").trim();
  const managerResponseRaw = payload.managerResponse;
  const isManagerAction =
    input.status !== undefined ||
    managerResponseRaw !== undefined ||
    Boolean(itemId);

  if (isManagerAction && !isValidManagerPassword(managerPassword)) {
    return NextResponse.json(
      { error: "Manager password required. Only managers can reply or update status." },
      { status: 401 },
    );
  }

  if (managerResponseRaw !== undefined || itemId) {
    if (!itemId) {
      return NextResponse.json(
        { error: "itemId is required when saving a manager reply" },
        { status: 400 },
      );
    }

    if (!managerResponseRaw || typeof managerResponseRaw !== "object") {
      return NextResponse.json(
        { error: "Invalid managerResponse" },
        { status: 400 },
      );
    }

    const response = managerResponseRaw as Record<string, unknown>;
    const availability = response.availability;
    const leadTime = String(response.leadTime ?? "").trim();
    const price = String(response.price ?? "").trim();
    const vendor = String(response.vendor ?? "").trim();
    const respondedBy = String(response.respondedBy ?? "").trim();

    if (!isAvailability(availability)) {
      return NextResponse.json(
        { error: "Invalid availability" },
        { status: 400 },
      );
    }

    if (!leadTime || !price || !vendor || !respondedBy) {
      return NextResponse.json(
        {
          error:
            "managerResponse requires availability, leadTime, price, vendor, and respondedBy",
        },
        { status: 400 },
      );
    }

    input.itemReply = {
      itemId,
      managerResponse: {
        availability,
        leadTime,
        price,
        vendor,
        respondedBy,
      },
    };
  }

  if (
    input.status === undefined &&
    input.priority === undefined &&
    input.notes === undefined &&
    input.itemReply === undefined
  ) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = updateRequest(id, input);
  if (!updated) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  return NextResponse.json({ request: updated });
}
