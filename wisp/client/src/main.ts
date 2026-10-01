// Wisp's domain: the App's client, shown in its own Root channel.

import { DomainView } from "./domain";
import { connect } from "./net";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function main(): Promise<void> {
  const { link, joined } = await connect(2500);
  const view = new DomainView(
    byId<HTMLCanvasElement>("canvas"),
    {
      status: byId("status"),
      watchers: byId("watchers"),
      card: byId("card"),
      cardName: byId("card-name"),
      cardWhere: byId("card-where"),
      cardText: byId("card-text"),
    },
    link,
  );

  if (link.mode === "solo") {
    const note = byId("note");
    note.textContent = "Not connected to Root, so this Wisp is just yours. Inside Root, everyone in the channel shares the same Wisp.";
    note.hidden = false;
  }

  // Talking to Wisp.
  const form = byId<HTMLFormElement>("say");
  const input = byId<HTMLInputElement>("say-input");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    view.say(input.value);
    input.value = "";
  });

  // The bubble bursts into the whole window, and into fullscreen when the
  // browser (and Root's frame) allow it. Sealing it brings the window back.
  const fullscreen = byId<HTMLButtonElement>("fullscreen");
  const seal = byId<HTMLButtonElement>("seal");
  const canFullscreen = document.fullscreenEnabled;
  const enterFullscreen = () => document.documentElement.requestFullscreen().catch(() => undefined);
  const syncButtons = () => {
    seal.hidden = !view.isOpen;
    fullscreen.hidden = !view.isOpen || !canFullscreen || document.fullscreenElement !== null;
  };
  view.onOpenChange = (open, byMe) => {
    syncButtons();
    if (open && byMe && canFullscreen) {
      // Only works while the press that burst the bubble still counts as a fresh gesture.
      const active = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? true;
      if (active) void enterFullscreen();
    }
    if (!open && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };
  fullscreen.addEventListener("click", () => void enterFullscreen());
  seal.addEventListener("click", () => view.seal());
  document.addEventListener("fullscreenchange", syncButtons);

  view.start(joined?.state, joined?.watchers);
  syncButtons();
}

void main();
