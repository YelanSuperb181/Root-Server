// Blitz's domain: the App's client, shown in its own Root channel.

import { DomainView } from "./domain";
import { cosmetic } from "@blitz/shared";
import { demoMenu, serverMenu } from "./menu/api";
import { DreamMenu } from "./menu/dream";
import { Menu } from "./menu/menu";
import { MenuPanel } from "./menu/panel";
import { insideRoot, serverBrain } from "./net";
import { viewerBrain } from "./sample";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function main(): void {
  // Everyone gets their own Blitz, right away. Inside Root it thinks with the
  // community's Claude (on Blitz's server); elsewhere it reads moods from keywords.
  const view = new DomainView(
    byId<HTMLCanvasElement>("canvas"),
    {
      status: byId("status"),
      vignette: byId("vignette"),
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

  // The menu: everything Blitz can do here, beside the bubble; out in open space, Blitz summons it.
  // Outside Root (or with ?demo) it shows a made-up community.
  const demo = !insideRoot() || new URLSearchParams(location.search).has("demo");
  const menu = new Menu(demo ? demoMenu() : serverMenu());
  menu.onReply = (reply) => view.react(reply.text, reply.ok);
  // Your Blitz wears what you picked in the shop, and stands guard while a shield is up.
  menu.subscribe(() => {
    const d = menu.data;
    if (!d) return;
    view.setOutfit({ hat: d.stardust?.hat, trail: d.stardust?.trail, glow: d.stardust?.glow ? cosmetic(d.stardust.glow)?.color : undefined });
    view.setShield(d.shieldUp);
  });
  const panel = new MenuPanel(menu);
  const dream = new DreamMenu(menu, view, byId("domain"));

  // Talking to Blitz. Asking for the menu brings it up.
  const form = byId<HTMLFormElement>("say");
  const input = byId<HTMLInputElement>("say-input");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (/^\s*(?:(?:open|show|summon)(?: me)? (?:the |your )?)?(?:menu|options)\s*[.!?]*\s*$/i.test(input.value)) {
      if (view.isOpen) dream.summon();
      else {
        panel.open("you");
        panel.el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } else void view.say(input.value);
    input.value = "";
  });

  // The bubble bursts into the whole window, and into fullscreen when the
  // browser (and Root's frame) allow it. Sealing it brings the window back.
  const seal = byId<HTMLButtonElement>("seal");
  const summon = byId<HTMLButtonElement>("summon");
  const canFullscreen = document.fullscreenEnabled;
  const enterFullscreen = () => document.documentElement.requestFullscreen().catch(() => undefined);
  const syncButtons = () => {
    seal.hidden = !view.isOpen;
    summon.hidden = !view.isOpen;
  };
  summon.addEventListener("click", () => dream.toggle());
  dream.onToggle = (open) => {
    summon.setAttribute("aria-pressed", String(open));
    summon.textContent = open ? "✦ Close menu" : "✦ Summon menu";
  };
  view.onOpenChange = (open) => {
    if (!open) dream.close();
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
    dream.close();
    seal.hidden = true;
    summon.hidden = true;
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

  const stage = document.querySelector(".stage")!;
  const win = document.querySelector<HTMLElement>(".window")!;
  stage.classList.add("with-menu");
  stage.insertBefore(panel.el, win);
  // Side by side, the menu is as tall as the bubble's window.
  new ResizeObserver(() => document.documentElement.style.setProperty("--menu-h", `${win.offsetHeight}px`)).observe(win);
  void menu.load();

  view.start();
  syncButtons();
}

main();
