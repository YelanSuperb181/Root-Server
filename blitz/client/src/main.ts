// Blitz's domain: the App's client, shown in its own Root channel.

import { DomainView } from "./domain";
import { serverBrain } from "./net";
import { viewerBrain } from "./sample";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function main(): void {
  // Everyone gets their own Blitz, right away. Inside Root it thinks with the
  // community's Claude (on Blitz's server); elsewhere it reads moods from keywords.
  const view = new DomainView(
    byId<HTMLCanvasElement>("canvas"),
    {
      status: byId("status"),
      card: byId("card"),
      cardName: byId("card-name"),
      cardWhere: byId("card-where"),
      cardText: byId("card-text"),
    },
    serverBrain(),
  );

  if (!view.brain) {
    // In the browser prototype, Blitz can think with Claude, but only for the page's creator.
    void viewerBrain().then((brain) => {
      if (!brain) return;
      view.brain = brain;
      const note = byId("note");
      note.textContent = "Talk to Blitz: it thinks with your Claude (you'll be asked once).";
      note.hidden = false;
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
  const seal = byId<HTMLButtonElement>("seal");
  const canFullscreen = document.fullscreenEnabled;
  const enterFullscreen = () => document.documentElement.requestFullscreen().catch(() => undefined);
  const syncButtons = () => {
    seal.hidden = !view.isOpen;
  };
  view.onOpenChange = (open) => {
    syncButtons();
    if (open && canFullscreen) {
      // Only works while the press that burst the bubble still counts as a fresh gesture.
      const active = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? true;
      if (active) void enterFullscreen();
    }
    if (!open && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };
  // Leave fullscreen before the universe folds back into the bubble, so the bubble lands in the right place.
  view.beforeReform = async () => {
    seal.hidden = true;
    if (!document.fullscreenElement) return;
    await document.exitFullscreen().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 60));
  };
  seal.addEventListener("click", () => view.seal());

  // Root's local test page puts a toolbar across the top (as a margin on the
  // page); keep the full-window universe, and its buttons, below it.
  const fitUnderToolbar = () => document.documentElement.style.setProperty("--top-inset", getComputedStyle(document.body).marginTop);
  fitUnderToolbar();
  new MutationObserver(fitUnderToolbar).observe(document.head, { childList: true });
  new MutationObserver(fitUnderToolbar).observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });

  view.start();
  syncButtons();
}

main();
