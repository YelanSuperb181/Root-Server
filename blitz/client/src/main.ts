// Blitz's domain: the App's client, shown in its own Root channel.

import { DomainView } from "./domain";
import { cosmetic } from "@blitz/shared";
import { demoMenu, serverMenu } from "./menu/api";
import { DreamMenu } from "./menu/dream";
import { recentPress, stardustShower } from "./menu/flair";
import { Menu } from "./menu/menu";
import { MenuPanel } from "./menu/panel";
import { windowWits } from "./menu/wits";
import { Palette } from "./menu/palette";
import { filterCommands } from "./menu/sections";
import { insideRoot, serverBrain } from "./net";
import { viewerBrain } from "./sample";

/** Rewards that fly from the menu into Blitz, and their colour. */
const SHOWERS: Record<string, string> = { daily: "#ffd36e", buy: "#ffd36e", wear: "#ff9ad5", gift: "#ffd36e", enter: "#ff7ab6", birthday: "#ff8f9e" };

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
  menu.onReply = (reply) => {
    view.react(reply.text, reply.ok);
    // A reward flies from the button into Blitz.
    const from = reply.ok && SHOWERS[reply.command] ? recentPress() : undefined;
    if (from) stardustShower(from, view.blitzOnScreen(), () => view.catchStardust(), SHOWERS[reply.command]);
  };
  // Your Blitz wears what you picked in the shop, and stands guard while a shield is up.
  menu.subscribe(() => {
    const d = menu.data;
    if (!d) return;
    // What's being tried on in the shop, else what they wear.
    const look = menu.tryOn ?? { hat: d.stardust?.hat, trail: d.stardust?.trail, glow: d.stardust?.glow };
    view.setOutfit({ hat: look.hat || undefined, trail: look.trail || undefined, glow: look.glow ? cosmetic(look.glow)?.color : undefined });
    view.setShield(d.shieldUp);
  });
  // The browser preview has no server: Blitz answers from the made-up community the menu shows.
  if (demo) view.localWits = windowWits(() => menu.data, (command, args) => void menu.run(command, args));
  const panel = new MenuPanel(menu);
  const dream = new DreamMenu(menu, view, byId("domain"));
  // Ctrl+K (or "/"): find any section or command and go straight there, in whichever menu is showing.
  const palette = new Palette(menu, (section, command) => {
    if (command) filterCommands(command);
    if (view.isOpen) dream.openSection(section);
    else {
      panel.open(section);
      panel.el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
  panel.onFind = () => palette.open();
  dream.onFind = () => palette.open();

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
