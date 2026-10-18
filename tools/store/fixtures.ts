export const quote = "Leave a little room in your day for thoughts that do not need a plan.";
export const sourceTitle = "A little room to think";
export const sourceUrl = "https://fieldnotes.example/a-little-room";
export const note = "A reminder for tomorrow: take a walk before opening my inbox.";
export const memoContent = `> ${quote}\n\n${note}\n\n[${sourceTitle}](${sourceUrl})`;

// Original sample writing and fictional destinations, used only by the artwork harness.
export const records = [
  { title: sourceTitle, path: "a-little-room", quote, content: memoContent },
  {
    title: "The shape of a good question",
    path: "good-questions",
    quote: "A useful question gives you somewhere to begin, without deciding where you will end up.",
  },
  {
    title: "A walk without a destination",
    path: "a-slow-walk",
    quote: "Take the longer way home. Notice one thing you have walked past before.",
  },
  {
    title: "Keep a list of small discoveries",
    path: "small-discoveries",
    quote: "Some things are worth keeping before you know what they are for.",
  },
].map((item, index) => ({
  schemaVersion: 1,
  id: `sample-${index}`,
  dedupeKey: `v1:sample-${index}`,
  instanceUrl: "https://memos.example",
  sourceUrl: `https://fieldnotes.example/${item.path}`,
  sourceTitle: item.title,
  selection: { markdown: `> ${item.quote}`, imageCount: 0 },
  memoContent: item.content ?? `> ${item.quote}\n\n[${item.title}](https://fieldnotes.example/${item.path})`,
  visibility: "PRIVATE" as const,
  memoName: `memos/sample-${index}`,
  memoUrl: `https://memos.example/memos/sample-${index}`,
  savedAt: Date.parse("2026-10-18T08:42:00Z") - index * 86_400_000,
}));
