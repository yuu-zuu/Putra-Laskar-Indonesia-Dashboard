# Historical import v2: incomplete July rows and deferred HPP

This addendum is applied **after** `pli-historical-import.patch`.

## Why July 16-31 is not posted as a normal transaction

The date rows are part of the company workbook and are preserved. However, the factual closing meter is empty. Spreadsheet formulas then calculate values such as:

- sales = `meter end - meter start`, where blank meter end is treated as zero;
- negative cash deposits based on the invalid sales value;
- closing stock carried forward from that invalid result.

The v2 design separates:

1. **raw source evidence** — all 96 rows from July 16-31 are stored in `historical_source_row`;
2. **trusted posted transactions** — only rows with verified factual inputs are posted to the stock/meter ledger;
3. **future templates** — July 24-31 remain visible as source templates but are not business transactions yet.

Status distribution as of 23 July 2026:

- 48 rows, July 16-23: `INCOMPLETE_SOURCE`;
- 48 rows, July 24-31: `FUTURE_TEMPLATE`.

## Production database condition

The database currently has branches and users only. This is safe because there are no existing operational movements or FIFO layers to replay.

Before importing, create the following real master data through the admin UI:

- one actual fuel product;
- stock units `POMPA-DEPAN` and `POMPA-BELAKANG` for branches `PBL`, `SKY`, and `RCK`;
- meter units `METER-DEPAN` and `METER-BELAKANG` for each branch;
- meter-to-stock assignments effective from `2026-03-01`;
- actual tank/unit capacities and low-stock thresholds.

Do not invent capacity or product values in the import command.

## Deferred HPP workflow

Historical inbound layers can be imported with unit cost zero by using `--allow-uncosted`. Migration 008 automatically marks those historical zero-cost layers as `PENDING`.

The new API permits `ADMIN`, `FINANCE`, and `AUDITOR` to complete or revise HPP:

- `GET /api/v1/cost-reconciliation/layers?branchId=<uuid>&status=PENDING`
- `PATCH /api/v1/cost-reconciliation/layers/<layer-id>`
- `GET /api/v1/cost-reconciliation/layers/<layer-id>/history`

PATCH body:

```json
{
  "unitCost": 12250,
  "reason": "HPP verified against supplier invoice INV-2026-0715"
}
```

A cost correction:

- updates the source FIFO layer;
- updates all historical FIFO allocations that used the layer;
- recalculates COGS/profit automatically through existing allocation-based queries;
- creates an immutable `stock_layer_cost_revision` row;
- writes an audit log with before/after cost, allocated quantity, affected readings, and COGS delta.

Until all relevant layers are `FINAL`, gross-profit figures must be treated as provisional.

## Apply order

```bash
# 1. Apply the original import patch

git apply --check pli-historical-import.patch
git apply pli-historical-import.patch

# 2. Apply this addendum

git apply --check pli-historical-import-v2.patch
git apply pli-historical-import-v2.patch

# 3. Install/build verification

npm ci
npm run check
npm run db:migrate
npm run db:verify
```

## Import trusted data through July 15

Dry-run:

```bash
npm run db:import-historical -- \
  --file database/imports/stock-operator-2026-03-to-2026-07-15.json \
  --actor-email historical-import@your-domain.example \
  --allow-uncosted \
  --acknowledge-source-warnings
```

Apply:

```bash
npm run db:import-historical -- \
  --file database/imports/stock-operator-2026-03-to-2026-07-15.json \
  --actor-email historical-import@your-domain.example \
  --allow-uncosted \
  --acknowledge-source-warnings \
  --apply
```

## Stage all July 16-31 source rows

Dry-run:

```bash
npm run db:stage-historical-source -- \
  --file database/imports/historical-source-rows-2026-07-16-to-31.json \
  --actor-email historical-import@your-domain.example
```

Apply:

```bash
npm run db:stage-historical-source -- \
  --file database/imports/historical-source-rows-2026-07-16-to-31.json \
  --actor-email historical-import@your-domain.example \
  --apply
```

This command does not insert meter readings, inventory movements, stock opname, or FIFO allocations.

## Completing July 16-23 later

When the actual closing meter, cash deposit, return, supply, and physical stock are available:

1. verify them against the original operator evidence;
2. enter the transaction using its original `businessDate`;
3. do not copy the negative spreadsheet formula result;
4. link or mark the corresponding `historical_source_row` as resolved in a controlled admin workflow;
5. retain actual system creation time and audit actor, while the transaction uses the original business date.

July 24-31 must only be posted after each date occurs and factual data exists.

## Important scope note

This addendum provides the database migration, staging command, and role-controlled cost-reconciliation API. It does not add a new React panel. The API can be wired into the existing Reconciliation page as a separate “Pending HPP” tab without changing the accounting rules above.
