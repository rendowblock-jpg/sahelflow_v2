import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { getUserSellerContext } from "@/lib/data/team-service";

export const GET = withAuthAndRateLimit(async (req, { user }) => {
  const context = await getUserSellerContext(user.id);
  
  if (!context) {
    return NextResponse.json({
      user,
      sellerId: null,
      role: null,
      status: null,
    });
  }

  return NextResponse.json({
    user,
    sellerId: context.sellerId,
    role: context.role,
    status: context.status,
  });
});
