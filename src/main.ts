import "./style.css";
import { mount } from "./ui/app";
const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app");
await mount(root);