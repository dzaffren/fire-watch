/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_RPC_URL: string;
  readonly VITE_CONTRACT_ADDRESS: `0x${string}`;
  readonly VITE_FIRE_RUNS_ADDRESS: `0x${string}`;
  readonly VITE_GOOGLE_MAPS_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
