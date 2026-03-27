import { Fragment, type ReactNode } from "react";

/** Detect http(s) URLs in plain text and render safe external links (e.g. Stripe checkout links in support chat). */
export function linkifyPlainText(text: string, linkClassName: string): ReactNode {
  if (!text) return null;
  const re = /https?:\/\/[^\s<>"'`]+/gi;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<Fragment key={`t-${k++}`}>{text.slice(last, m.index)}</Fragment>);
    }
    const raw = m[0];
    let href = raw.replace(/[.,;:!?]+$/, "");
    let ok = false;
    try {
      const u = new URL(href);
      ok = u.protocol === "http:" || u.protocol === "https:";
    } catch {
      ok = false;
    }
    if (ok) {
      nodes.push(
        <a
          key={`a-${k++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {raw}
        </a>,
      );
    } else {
      nodes.push(<Fragment key={`t-${k++}`}>{raw}</Fragment>);
    }
    last = m.index + raw.length;
  }
  if (last < text.length) {
    nodes.push(<Fragment key={`t-${k++}`}>{text.slice(last)}</Fragment>);
  }
  return nodes.length === 0 ? text : nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}
