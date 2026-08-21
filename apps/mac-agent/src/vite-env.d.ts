/// <reference types="vite/client" />

import type { AlexaAgentApi } from "../electron/contracts.js";

declare global {
  interface Window {
    alexaAgent: AlexaAgentApi;
  }
}

export {};
