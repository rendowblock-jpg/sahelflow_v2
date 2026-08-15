import { StorefrontStudioRoute } from "@/components/storefront/studio/storefront-studio-route";

export const dynamic = "force-dynamic";

export default async function StorefrontStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StorefrontStudioRoute id={id} />;
}
