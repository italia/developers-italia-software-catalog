// Icone del set bootstrap-italia, dagli SVG di @italia-tailwind/recipes. Si importano una
// per una (?raw) invece di usare icon(), che porterebbe nel bundle l'intero set.
import arrowDown from "@italia-tailwind/recipes/svg/it-arrow-down.svg?raw";
import arrowLeft from "@italia-tailwind/recipes/svg/it-arrow-left.svg?raw";
import arrowRight from "@italia-tailwind/recipes/svg/it-arrow-right.svg?raw";
import arrowUp from "@italia-tailwind/recipes/svg/it-arrow-up.svg?raw";
import check from "@italia-tailwind/recipes/svg/it-check.svg?raw";
import checkCircle from "@italia-tailwind/recipes/svg/it-check-circle.svg?raw";
import chevronLeft from "@italia-tailwind/recipes/svg/it-chevron-left.svg?raw";
import chevronRight from "@italia-tailwind/recipes/svg/it-chevron-right.svg?raw";
import close from "@italia-tailwind/recipes/svg/it-close.svg?raw";
import closeCircle from "@italia-tailwind/recipes/svg/it-close-circle.svg?raw";
import codeCircle from "@italia-tailwind/recipes/svg/it-code-circle.svg?raw";
import copy from "@italia-tailwind/recipes/svg/it-copy.svg?raw";
import del from "@italia-tailwind/recipes/svg/it-delete.svg?raw";
import externalLink from "@italia-tailwind/recipes/svg/it-external-link.svg?raw";
import inbox from "@italia-tailwind/recipes/svg/it-inbox.svg?raw";
import lock from "@italia-tailwind/recipes/svg/it-locked.svg?raw";
import logout from "@italia-tailwind/recipes/svg/it-logout.svg?raw";
import mail from "@italia-tailwind/recipes/svg/it-mail.svg?raw";
import moreItems from "@italia-tailwind/recipes/svg/it-more-items.svg?raw";
import pa from "@italia-tailwind/recipes/svg/it-pa.svg?raw";
import pencil from "@italia-tailwind/recipes/svg/it-pencil.svg?raw";
import plus from "@italia-tailwind/recipes/svg/it-plus.svg?raw";
import user from "@italia-tailwind/recipes/svg/it-user.svg?raw";
import warning from "@italia-tailwind/recipes/svg/it-warning-circle.svg?raw";

const icons = {
  "it-arrow-down": arrowDown,
  "it-arrow-left": arrowLeft,
  "it-arrow-right": arrowRight,
  "it-arrow-up": arrowUp,
  "it-check": check,
  "it-check-circle": checkCircle,
  "it-chevron-left": chevronLeft,
  "it-chevron-right": chevronRight,
  "it-close": close,
  "it-close-circle": closeCircle,
  "it-code-circle": codeCircle,
  "it-copy": copy,
  "it-delete": del,
  "it-external-link": externalLink,
  "it-inbox": inbox,
  "it-locked": lock,
  "it-logout": logout,
  "it-mail": mail,
  "it-more-items": moreItems,
  "it-pa": pa,
  "it-pencil": pencil,
  "it-plus": plus,
  "it-user": user,
  "it-warning-circle": warning,
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
