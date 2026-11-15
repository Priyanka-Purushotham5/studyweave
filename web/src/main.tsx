import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";

async function start() {
  if (import.meta.env.VITE_MOCK === "1") {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledRequest: "bypass", quiet: true });
  }
  createRoot(document.getElementById("root")!).render(<App/>);
}
void start();
