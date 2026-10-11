import type { Metadata } from "next";
import { Markdown } from "@/components/Markdown";
import { PRIVACY_MD } from "@/data/privacy";

export const metadata: Metadata = { title: "Privacy notice | LogWizard" };

export default function Privacy() {
  return (
    <article>
      <Markdown source={PRIVACY_MD} />
    </article>
  );
}
