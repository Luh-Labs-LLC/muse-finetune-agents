// Everything the sidebar lists, in order: each item is a section of one of the two sites, or an outside link.
// `id` is the section's id on its page. The chat is the page; everything else is below it or on the results site.

export const NAV = [
  { group: "Chat", items: [
    { site: "meta", id: "chat", label: "Chat", icon: "chat" },
    { site: "meta", id: "how", label: "How teaching works", icon: "steps" },
    { site: "meta", id: "try", label: "Run it yourself", icon: "terminal" },
  ] },
  { group: "Fine-tune run", items: [
    { site: "results", id: "fine-tune", label: "The run", icon: "spark", badge: "run", children: [
      { site: "results", id: "run", label: "Results", dot: "var(--c-green)" },
      { site: "results", id: "rounds", label: "Epoch by epoch", dot: "var(--c-amber)" },
      { site: "results", id: "answers", label: "Answers", dot: "var(--c-violet)" },
    ] },
  ] },
  { group: "About", items: [
    { site: "meta", id: "about", label: "The story", icon: "users" },
    { href: "https://github.com/Luh-Labs-LLC/muse-finetune-agents", label: "Source code", icon: "code" },
  ] },
];

// Every item and child, flat: what search looks through.
export const ALL_ITEMS = NAV.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]));
