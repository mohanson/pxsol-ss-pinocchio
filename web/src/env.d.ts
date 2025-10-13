/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLANA_RPC?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
