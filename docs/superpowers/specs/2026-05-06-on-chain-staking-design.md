# On-Chain Staking — Design Spec
**Date:** 2026-05-06  
**Status:** Approved  
**Approach:** Approach C — contract_call write path + ContractStorage read path

---

## Problem

Current staking stores stake records in a loose LevelDB key (`staking:stake:{userId}`) controlled entirely by the server. Any node verifying a miner's boost must trust the server. This is centralized trust.

## Goal

Peer-verifiability: any node can independently read a miner's staking boost from on-chain contract state without trusting the server. The MerkleClaimSystem, epoch flow, and mining reward distribution are not touched.

---

## Architecture

### Three paths

**Write path (stake/unstake)**
```
Client → POST /api/staking/stake
       → contract_call tx created (value = amount to lock)
       → mempool → included in next block (~1 min)
       → WASMRuntime executes StakingContract.stake(lockDays)
       → ContractStorage writes _stake:{userId}
       → Any peer can read and verify
```

**Read path (boost at share submission)**
```
submitShare() → ContractStorage.getContractState(STAKING_ADDRESS, '_stake:{userId}')
              → parseBoostFromContractState()   [checks endTime, calls computeBoostFromStake()]
              → participantBoosts[userId] = derivedBoost
```

**Epoch/Merkle path (untouched)**
```
participantBoosts → hashesComputed → MerkleClaimSystem → unchanged
```

---

## Components

### 1. Genesis Contract Bootstrap

**Problem:** StakingContract must exist in ContractRegistry before any `contract_call` can target it. But normal deployment requires a `contract_deploy` transaction, which requires the chain to be running first (chicken-and-egg).

**Solution:** Protocol-level genesis contract (same pattern as Ethereum precompiles).

- `StakingContract.wasm` is instrumented with gas metering **once at build time**
- The resulting base64 string is committed as `STAKING_CONTRACT_BYTECODE` in `src/constants.ts`
- The contract address is derived deterministically: `sha256('aura50:genesis:staking').slice(0, 40)`
- This address is also committed as `STAKING_CONTRACT_ADDRESS` in `src/constants.ts`
- At server startup: if `STAKING_CONTRACT_ADDRESS` is absent from ContractRegistry → seed it directly from the constant bytecode. No transaction, no gas.
- Every node derives the same address and uses the same bytecode → consensus safe

**Why pre-instrumented bytecode matters:** `wasm-metering` instrumentation must be byte-for-byte identical across all nodes. Pre-computing it at build time and committing the result removes any runtime divergence risk.

**Migration:** Since this is implemented before launch, there are no real user stakes to migrate. LevelDB `staking:stake:{userId}` keys from testing are dropped. All new stakes after launch go through the contract path.

### 2. `routes/staking.ts` — Write Path Changes

**`POST /stake`**
- Validates `amount` and `lockDays` (same as today)
- Checks no existing active stake (reads ContractStorage)
- Deducts `amount` from `user.coinBalance` at mempool time (prevents double-spend before settlement)
- Creates `contract_call` transaction: `{ function: 'stake', args: [lockDays], value: amount, gasLimit: STAKING_GAS_LIMIT }`
- Returns `{ ok: true, txId, status: 'pending' }`
- If contract execution fails at settlement → balance automatically refunded by settlement rollback

**`POST /unstake`**
- Creates `contract_call` transaction: `{ function: 'unstake', args: [], gasLimit: STAKING_GAS_LIMIT }`
- Lock enforcement happens inside WASM (returns error code 4 if still locked)
- Returns `{ ok: true, txId, status: 'pending' }`

**`GET /:address`**
- Unchanged interface: still returns the stake record as JSON
- Data source changes: reads from `ContractStorage.getContractState(STAKING_ADDRESS, '_stake:{userId}')` instead of `staking:stake:{userId}`

### 3. `contract_call` Route — value field

`routes/contracts.ts` accepts an optional `value?: string` field on `contract_call` body. This is wired into `HostContext.txValue` so `a50_tx_value()` inside the WASM reads the correct amount. Required only for the staking contract's `stake()` function.

### 4. Gas for Staking

Staking contract calls are NOT gas-free but carry a **minor fixed gas limit** (`STAKING_GAS_LIMIT`). This is a small, predictable cost — not zero (avoids spam) but significantly subsidised compared to arbitrary contract calls. The exact value is determined during implementation by profiling the WASM execution cost of `stake()` and `unstake()`.

### 5. `decentralized-storage.ts` — Read Path in `submitShare()`

Replace the existing 3-line block:
```typescript
// OLD
const shareUser = await this.getUser(userId);
const stakedAmount = parseFloat(shareUser?.stakedBalance ?? '0');
const lockDays = stakedAmount > 0 ? await this.getStakeLockDays(userId) : 0;
const derivedBoost = DecentralizedStorage.computeBoostFromStake(stakedAmount, lockDays);
```

With:
```typescript
// NEW
const stakeJson = await contractStorage.getContractState(
  STAKING_CONTRACT_ADDRESS, `_stake:${userId}`
);
const derivedBoost = parseBoostFromContractState(stakeJson); // falls back to 1.0
```

`parseBoostFromContractState(json)` is a pure helper:
- Parses `{ amount, lockDays, endTime, boostPct100 }`
- Checks `Date.now() < endTime` (expired stake → 1.0)
- Returns `boostPct100 / 10000 + 1.0` (or calls `computeBoostFromStake` for freshness)
- Falls back to `1.0` on any parse error or missing key

`computeBoostFromStake()` formula is unchanged. This is a single LevelDB key lookup per share — O(1), sub-millisecond.

### 6. Mobile `StakingService` Changes

Minimal changes:

- `stake()`: response changes from `{ ok, stake: { multiplier, ... } }` to `{ ok, txId, status: 'pending' }`. After staking, schedule a re-sync at +70 seconds (one block time) to pick up settled contract state. No pending UI state needed.
- `unstake()`: same pattern.
- `syncFromServer()`: unchanged — still calls `GET /api/staking/{address}`, still caches in AsyncStorage.
- `getBoostMultiplier()`: unchanged — still reads from `activeStake.multiplier` in memory.
- `user.stakedBalance`: kept for UI display but no longer used as the authoritative source for boost calculation. It becomes a cached display hint.

---

## What Is NOT Changed

| Component | Status |
|---|---|
| `settleBlock()` | Untouched |
| `computeBoostFromStake()` formula | Untouched (same math, new data source) |
| `MerkleClaimSystem` | Untouched |
| `EpochRewardStore` / `EpochRootStore` | Untouched |
| `EpochProcessor` | Untouched |
| Block `participantBoosts` structure | Untouched |
| Mining share submission (mobile) | Untouched |
| Challenge window / bitmap / auto-credit | Untouched |

---

## Scaling Properties

- **Per-share verification cost:** single LevelDB read (`contract:state:{address}:_stake:{userId}`), O(1), ~0.1ms. Unchanged at any user count.
- **Per-epoch verification cost:** N reads at epoch settlement (N = active stakers that epoch). Pure LevelDB, no WASM invoked on read path.
- **Stake/unstake cost:** WASM execution once per stake event (rare — 1 to 1095 day locks). Gas-metered, deterministic.
- **Chain state growth from staking:** negligible — one ContractStorage key per user (`contract:state:{40-char-address}:_stake:{userId}`).

---

## Peer Verifiability

Any node receiving a block with `participantBoosts` can:
1. Read `ContractStorage` at `contract:state:{STAKING_ADDRESS}:_stake:{userId}` for each participant
2. Run `parseBoostFromContractState()` (pure function, same on all nodes)
3. Verify `participantBoosts[userId]` matches independently computed value
4. If mismatch: submit challenge during the 5-minute challenge window via MerkleClaimSystem

This closes the server-trust gap. No single node's word is required.

---

## Files Changed

| File | Change |
|---|---|
| `src/constants.ts` | Add `STAKING_CONTRACT_ADDRESS`, `STAKING_CONTRACT_BYTECODE`, `STAKING_GAS_LIMIT` |
| `aura50/EthForge/server/bootstrap/GenesisContracts.ts` | New — seeds genesis contracts at startup |
| `aura50/EthForge/server/routes/staking.ts` | stake/unstake → contract_call tx; GET reads ContractStorage |
| `aura50/EthForge/server/routes/contracts.ts` | Add optional `value` field to contract_call body |
| `aura50/EthForge/server/decentralized-storage.ts` | `submitShare()` reads from ContractStorage |
| `aura50/EthForge/server/decentralized-storage.ts` | Add `parseBoostFromContractState()` helper |
| `src/services/StakingService.ts` | `stake()`/`unstake()` handle pending response; re-sync after 70s |
| `aura50/EthForge/blockchain/contracts/staking/StakingContract.as.ts` | No changes (already correct) |
| `aura50/EthForge/blockchain/contracts/staking/StakingContract.wasm` | No changes (already compiled) |
