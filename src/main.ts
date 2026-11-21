import "./style.css";
import { Game } from "./game/Game";

const root = document.getElementById("app");
if (root) {
  const game = new Game(root);
  void game.init();
}
