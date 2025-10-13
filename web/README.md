# Pinocchio dApp (web)

A minimal React + Vite front-end that connects Phantom and stores arbitrary user data using the on-chain program 9RctzLPHP58wrnoGCbb5FpFKbmQb6f53i5PsebQZSaQL on Solana mainnet.

- Connect Phantom
- Read data from PDA derived with user pubkey
- Save new data to program via a single instruction (data = payload bytes)

## Scripts
- npm run dev
- npm run build
- npm run preview

## Env
Create a .env file if you want to override RPC:

VITE_SOLANA_RPC=https://your.rpc.endpoint
