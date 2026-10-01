// Wisp's domain: the App's client, shown in its own Root channel.

import { DomainView } from "./domain";
import { connect } from "./net";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main(): Promise<void> {
  const { link, joined } = await connect(2500);
  const view = new DomainView(byId<HTMLCanvasElement>("canvas"), byId("status"), byId("watchers"), link);
  view.start(joined?.state, joined?.watchers);

  if (link.mode === "solo") {
    const note = byId("note");
    note.textContent = "Not connected to Root, so this Wisp is just yours. Inside Root, everyone in the channel shares the same Wisp.";
    note.hidden = false;
  }

  // Root decides how big the app's frame is. If the frame allows it, Expand
  // fills the whole screen with the domain.
  const expand = byId<HTMLButtonElement>("expand");
  if (document.fullscreenEnabled) {
    expand.hidden = false;
    expand.addEventListener("click", () => {
      const toggle = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      toggle.catch(() => {
        expand.hidden = true;
      });
    });
    document.addEventListener("fullscreenchange", () => {
      expand.textContent = document.fullscreenElement ? "Shrink" : "Expand";
    });
  }
}

void main();
