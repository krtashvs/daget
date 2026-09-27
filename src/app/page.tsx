import { DagetApp } from "@/components/DagetApp";
import { getPublicConfig } from "@/lib/config";

// Read env vars per request so a missing/renamed variable is reported clearly.
export const dynamic = "force-dynamic";

export default function Home() {
  return <DagetApp config={getPublicConfig()} />;
}
