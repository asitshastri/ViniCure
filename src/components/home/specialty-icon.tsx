import {
  Baby,
  Bone,
  Brain,
  Drop,
  Ear,
  Eye,
  FlowerLotus,
  Heartbeat,
  HandSoap,
  Stethoscope,
  Tooth,
  Wind,
} from "@phosphor-icons/react/ssr";
import type { SpecialtyIcon } from "@/lib/types";

const icons: Record<SpecialtyIcon, typeof Stethoscope> = {
  general: Stethoscope,
  heart: Heartbeat,
  child: Baby,
  skin: HandSoap,
  women: FlowerLotus,
  mind: Brain,
  bone: Bone,
  eye: Eye,
  ear: Ear,
  tooth: Tooth,
  diabetes: Drop,
  lungs: Wind,
};

/** Decorative icon. The specialty name is always written next to it. */
export function SpecialtyGlyph({ icon, className }: { icon: SpecialtyIcon; className?: string }) {
  const Glyph = icons[icon];
  return <Glyph aria-hidden className={className} />;
}
