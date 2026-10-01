// Blitz's domain: the App's client, shown in its own Root channel.

import { DomainView } from "./domain";
import { connect } from "./net";
import { viewerBrain } from "./sample";

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
    note.textContent = "Not connected to Root, so this Blitz is just yours. Inside Root, everyone in the channel shares the same Blitz.";
    note.hidden = false;
    // In the browser prototype, Blitz can think with the viewer's Claude.
    void viewerBrain().then((brain) => {
      if (!brain) return;
      view.brain = brain;
      note.textContent = "Not connected to Root, so this Blitz is just yours. Talk to it: it thinks with your Claude (you'll be asked once).";
    });
  }

  // Talking to Blitz.
  const form = byId<HTMLFormElement>("say");
  const input = byId<HTMLInputElement>("say-input");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void view.say(input.value);
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
  // Leave fullscreen before the universe folds back into the bubble, so the bubble lands in the right place.
  view.beforeReform = async () => {
    seal.hidden = true;
    fullscreen.hidden = true;
    if (!document.fullscreenElement) return;
    await document.exitFullscreen().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 60));
  };
  fullscreen.addEventListener("click", () => void enterFullscreen());
  seal.addEventListener("click", () => view.seal());
  document.addEventListener("fullscreenchange", syncButtons);

  view.start(joined?.state, joined?.watchers);
  syncButtons();
}

void main();
