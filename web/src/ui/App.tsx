import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js'
import { Buffer } from 'buffer'
import '../styles/glass.css'

// Phantom window type
type PhantomProvider = {
  isPhantom?: boolean
  publicKey?: PublicKey
  isConnected?: boolean
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>
  disconnect: () => Promise<void>
  signTransaction: (tx: Transaction) => Promise<Transaction>
}

declare global { interface Window { solana?: PhantomProvider } }

const PROGRAM_ID = new PublicKey('9RctzLPHP58wrnoGCbb5FpFKbmQb6f53i5PsebQZSaQL')
// We use mainnet endpoint by default; users can change via env if needed
const RPC_ENDPOINT = (import.meta as any).env?.VITE_SOLANA_RPC || 'https://mainnet.helius-rpc.com/?api-key=939dfe15-ec6d-45b9-a4b2-75e9adb3d1df'

function usePhantom() {
  const [provider, setProvider] = useState<PhantomProvider | null>(null)
  const [pubkey, setPubkey] = useState<PublicKey | null>(null)

  useEffect(() => {
    if ('solana' in window && window.solana?.isPhantom) {
      setProvider(window.solana!)
    } else {
      setProvider(null)
    }
  }, [])

  const connect = useCallback(async () => {
    if (!provider) throw new Error('Phantom not found')
    const res = await provider.connect()
    setPubkey(res.publicKey)
    return res.publicKey
  }, [provider])

  const disconnect = useCallback(async () => {
    if (!provider) return
    await provider.disconnect()
    setPubkey(null)
  }, [provider])

  return { provider, pubkey, connect, disconnect }
}

async function deriveDataPda(user: PublicKey): Promise<[PublicKey, number]> {
  // Program derives PDA with seeds = [user_pubkey]
  return await PublicKey.findProgramAddress([user.toBuffer()], PROGRAM_ID)
}

async function fetchUserData(connection: Connection, user: PublicKey): Promise<Uint8Array | null> {
  const [pda] = await deriveDataPda(user)
  const acc = await connection.getAccountInfo(pda, { commitment: 'confirmed' })
  if (!acc) return null
  return acc.data
}

async function buildWriteIx(user: PublicKey, data: Uint8Array): Promise<TransactionInstruction> {
  const [pda, bump] = await deriveDataPda(user)
  // Accounts: [0] user signer, [1] data pda
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  })
}

export function App() {
  const { provider, pubkey, connect, disconnect } = usePhantom()
  const connection = useMemo(() => new Connection(RPC_ENDPOINT, 'confirmed'), [])
  const [inputText, setInputText] = useState('')
  const [stored, setStored] = useState<Uint8Array | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string>('')

  const load = useCallback(async () => {
    if (!pubkey) return
    setLoading(true)
    try {
      const data = await fetchUserData(connection, pubkey)
      setStored(data)
      setStatus(data ? `Loaded ${data.length} bytes` : 'No data found')
    } catch (e: any) {
      setStatus(e.message || String(e))
    } finally { setLoading(false) }
  }, [connection, pubkey])

  useEffect(() => { if (pubkey) { load() } }, [pubkey, load])

  const onSave = useCallback(async () => {
    if (!provider || !pubkey) return
    const data = new TextEncoder().encode(inputText)
    setLoading(true)
    setStatus('Building transaction...')
    try {
      const ix = await buildWriteIx(pubkey, data)
      const tx = new Transaction().add(ix)
      tx.feePayer = pubkey
      const { blockhash } = await connection.getLatestBlockhash('finalized')
      tx.recentBlockhash = blockhash
      const signed = await provider.signTransaction(tx)
      const sig = await connection.sendRawTransaction(signed.serialize())
      await connection.confirmTransaction(sig, 'confirmed')
      setStatus(`Saved. Tx: ${sig}`)
      await load()
    } catch (e: any) {
      setStatus(e.message || String(e))
    } finally { setLoading(false) }
  }, [provider, pubkey, inputText, connection, load])

  const storedText = useMemo(() => stored ? new TextDecoder().decode(stored) : '', [stored])

  const GithubIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  )

  return (
    <div className="app-container">
      <div className="header">
        <h1>Simple Storage Dapp Demo</h1>
        <p className="description">A simple data storage contract that allows anyone to store data on the chain.</p>
        <div className="links-section">
          <a href="https://github.com/mohanson/pxsol" target="_blank" rel="noopener noreferrer" className="project-link">
            <GithubIcon />
            <span>pxsol</span>
          </a>
          <a href="https://github.com/mohanson/pxsol-ss-pinocchio" target="_blank" rel="noopener noreferrer" className="project-link">
            <GithubIcon />
            <span>pxsol-ss-pinocchio</span>
          </a>
        </div>
      </div>

      <div className="glass-card">
        <p className="program-id">Program ID: {PROGRAM_ID.toBase58()}</p>

        {!provider && (
          <p className="warning-message">
            Phantom not found. Install it from the Chrome Web Store, then refresh.
          </p>
        )}

        {provider && !pubkey && (
          <div style={{ textAlign: 'center' }}>
            <button onClick={() => void connect()} className="glass-button primary">Connect Phantom</button>
          </div>
        )}

        {provider && pubkey && (
          <div className="wallet-section">
            <div className="wallet-address">{pubkey.toBase58()}</div>
            <button onClick={() => void disconnect()} className="glass-button">Disconnect</button>
            <button onClick={() => void load()} className="glass-button" disabled={loading}>Reload</button>
          </div>
        )}
      </div>

      {provider && pubkey && (
        <>
          <div className="glass-card">
            <label className="form-label">Your data</label>
            <textarea
              placeholder="Type something to store on-chain"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="glass-textarea"
            />
            <div className="button-group">
              <button onClick={() => void onSave()} disabled={!pubkey || !provider || loading} className="glass-button primary">
                {loading ? 'Processing...' : 'Save'}
              </button>
            </div>
          </div>

          <div className="glass-card">
            <h3 className="section-title">Stored data</h3>
            {stored ? (
              <div className="data-display">{storedText}</div>
            ) : (
              <p className="empty-state">No data stored yet.</p>
            )}

            {status && (
              <p className="status-message">{status}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
