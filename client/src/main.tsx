import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initNativeApp } from "./lib/nativeApp";

createRoot(document.getElementById("root")!).render(<App />);

initNativeApp((path) => {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}).catch((err) => console.warn('initNativeApp failed', err));
