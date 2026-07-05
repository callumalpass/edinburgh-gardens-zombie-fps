import { GameApp } from "./game/GameApp";
import "./styles/main.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

const game = new GameApp(root);
game.init();
window.addEventListener("beforeunload", () => game.dispose(), { once: true });
