import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js'
import { Buffer } from 'buffer'

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

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'Inter, system-ui, sans-serif', padding: 16 }}>
      <h1>Pinocchio dApp</h1>
      <p>Program ID: {PROGRAM_ID.toBase58()}</p>
      {!provider && (
        <p>
          Phantom not found. Install it from the Chrome Web Store, then refresh.
        </p>
      )}

      {provider && !pubkey && (
        <button onClick={() => void connect()} style={{ padding: '8px 12px' }}>Connect Phantom</button>
      )}
      {provider && pubkey && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code>{pubkey.toBase58()}</code>
          <button onClick={() => void disconnect()} style={{ padding: '6px 10px' }}>Disconnect</button>
          <button onClick={() => void load()} style={{ padding: '6px 10px' }} disabled={loading}>Reload</button>
        </div>
      )}

      <hr style={{ margin: '16px 0' }} />

      <label style={{ display: 'block', marginBottom: 8 }}>Your data</label>
      <textarea
        placeholder="Type something to store on-chain"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        style={{ width: '100%', minHeight: 100, padding: 8 }}
      />
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button onClick={() => void onSave()} disabled={!pubkey || !provider || loading} style={{ padding: '8px 12px' }}>Save</button>
      </div>

      <h3 style={{ marginTop: 24 }}>Stored data</h3>
      {stored ? (
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 12 }}>{storedText}</pre>
      ) : (
        <p>No data stored yet.</p>
      )}

      {status && (
        <p style={{ marginTop: 12, color: '#555' }}>{status}</p>
      )}
    </div>
  )
}
