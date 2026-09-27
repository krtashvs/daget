import { DagetApp } from "@/components/DagetApp";

export default function Home() {
  return <DagetApp gifSearchEnabled={Boolean(process.env.GIPHY_API_KEY)} />;
}
