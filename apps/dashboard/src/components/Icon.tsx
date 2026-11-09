// Icone del set bootstrap-italia, dagli SVG di @italia-tailwind/recipes. Si importano una
// per una (?raw) invece di usare icon(), che porterebbe nel bundle l'intero set.
import arrowDown from "@italia-tailwind/recipes/svg/it-arrow-down.svg?raw";
import arrowLeft from "@italia-tailwind/recipes/svg/it-arrow-left.svg?raw";
import arrowUp from "@italia-tailwind/recipes/svg/it-arrow-up.svg?raw";
import chevronLeft from "@italia-tailwind/recipes/svg/it-chevron-left.svg?raw";
import chevronRight from "@italia-tailwind/recipes/svg/it-chevron-right.svg?raw";
import codeCircle from "@italia-tailwind/recipes/svg/it-code-circle.svg?raw";
import moreItems from "@italia-tailwind/recipes/svg/it-more-items.svg?raw";

const icons = {
  "it-arrow-down": arrowDown,
  "it-arrow-left": arrowLeft,
  "it-arrow-up": arrowUp,
  "it-chevron-left": chevronLeft,
  "it-chevron-right": chevronRight,
  "it-code-circle": codeCircle,
  "it-more-items": moreItems,
} as const;

export type IconName = keyof typeof icons;

/** Il markup SVG viene dal pacchetto, non da input utente. */
export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const svg = icons[name].replace(
    "<svg ",
    `<svg class="${className} shrink-0 fill-current" aria-hidden="true" focusable="false" `,
  );
  return <span className="inline-flex" dangerouslySetInnerHTML={{ __html: svg }} />;
}
