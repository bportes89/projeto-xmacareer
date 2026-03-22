import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const TOKEN_COOKIE = "xma_token";

function getAuthSecret(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

async function getRoleFromRequest(req: NextRequest): Promise<"STUDENT" | "SCHOOL" | null> {
  const secret = getAuthSecret();
  if (!secret) return null;

  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const role = verified.payload.role;
    if (role !== "STUDENT" && role !== "SCHOOL") return null;
    return role;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/student")) {
    const role = await getRoleFromRequest(req);
    if (!role) return NextResponse.redirect(new URL("/auth/login", req.url));
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const role = await getRoleFromRequest(req);
    if (!role) return NextResponse.redirect(new URL("/auth/login", req.url));
    if (role !== "SCHOOL") return NextResponse.redirect(new URL("/student/projects", req.url));
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/student/:path*", "/admin/:path*"],
};
