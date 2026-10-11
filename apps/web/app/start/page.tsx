import type { Metadata } from "next";
import { Wizard } from "@/components/Wizard";

export const metadata: Metadata = { title: "Try the demo | LogWizard" };

export default function Start() {
  return <Wizard />;
}
