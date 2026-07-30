import { NextResponse } from "next/server";
import { isValidManagerPassword } from "@/lib/managerAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password =
    body && typeof body === "object"
      ? String((body as Record<string, unknown>).password ?? "")
      : "";

  if (!isValidManagerPassword(password)) {
    return NextResponse.json(
      { error: "Incorrect manager password" },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
