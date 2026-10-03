// Blitz's replies are written for Root's chat: **bold**, _italic_, `code`,
// > quotes, links, and mentions like [@name](root://user/…). The menu in
// Blitz's domain shows the same replies, so this reads that text into lines
// of parts for the window to draw (as elements, never as raw HTML).

export type RichPart =
  | { kind: "text"; text: string }
  | { kind: "bold" | "italic"; parts: RichPart[] }
  | { kind: "code"; text: string }
  | { kind: "user" | "role" | "channel"; name: string; id: string }
  | { kind: "link"; text: string; href: string };

export interface RichLine {
  /** A "> " line: shown as a quote. */
  quote: boolean;
  parts: RichPart[];
}

const MENTION = /^\[([@#])([^\]]*)\]\(root:\/\/(user|role|channel)\/([^)\s]+)\)/;
const LINK = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/;

/** The text as lines of parts. */
export function parseRich(text: string): RichLine[] {
  return text.split("\n").map((line) => {
    const quote = line.startsWith("> ") || line === ">";
    return { quote, parts: parseInline(quote ? line.slice(2) : line) };
  });
}

/** Whether `ch` is a letter or digit (an underscore inside a word isn't italics). */
const wordy = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

function parseInline(text: string): RichPart[] {
  const parts: RichPart[] = [];
  let plain = "";
  const flush = () => {
    if (plain) parts.push({ kind: "text", text: plain });
    plain = "";
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const ch = text[i];
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        parts.push({ kind: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    } else if (ch === "[") {
      const mention = MENTION.exec(rest);
      if (mention) {
        flush();
        parts.push({ kind: mention[3] as "user" | "role" | "channel", name: mention[2], id: mention[4] });
        i += mention[0].length;
        continue;
      }
      const link = LINK.exec(rest);
      if (link) {
        flush();
        parts.push({ kind: "link", text: link[1], href: link[2] });
        i += link[0].length;
        continue;
      }
    } else if (rest.startsWith("**")) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        parts.push({ kind: "bold", parts: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    } else if (ch === "_" && !wordy(text[i - 1])) {
      // The closing underscore isn't followed by a letter (so snake_case stays as it is).
      let end = text.indexOf("_", i + 1);
      while (end !== -1 && wordy(text[end + 1])) end = text.indexOf("_", end + 1);
      if (end > i + 1) {
        flush();
        parts.push({ kind: "italic", parts: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    plain += ch;
    i++;
  }
  flush();
  return parts;
}

/** The text with the formatting taken out (mentions as @name / #name). */
export function plainText(text: string): string {
  const flat = (parts: RichPart[]): string =>
    parts
      .map((p) => {
        switch (p.kind) {
          case "text":
          case "code":
            return p.text;
          case "bold":
          case "italic":
            return flat(p.parts);
          case "user":
          case "role":
            return `@${p.name}`;
          case "channel":
            return `#${p.name}`;
          case "link":
            return p.text;
        }
      })
      .join("");
  return parseRich(text)
    .map((l) => flat(l.parts))
    .join("\n");
}
