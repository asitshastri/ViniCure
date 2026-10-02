import type { Messages } from "@/i18n/messages/en";

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Looks a key up in the chosen language and falls back to English, so a missing translation never shows a raw key. */
export function makeTranslate(messages: Messages, fallback: Messages): Translate {
  const find = (tree: unknown, key: string): string | undefined => {
    let node: unknown = tree;
    for (const part of key.split(".")) {
      if (node && typeof node === "object" && part in node)
        node = (node as Record<string, unknown>)[part];
      else return undefined;
    }
    return typeof node === "string" ? node : undefined;
  };
  return (key, vars) => {
    const text = find(messages, key) ?? find(fallback, key) ?? key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`)) : text;
  };
}
