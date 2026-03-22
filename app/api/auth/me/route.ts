import { NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  return NextResponse.json({ user }, { status: 200 });
}
