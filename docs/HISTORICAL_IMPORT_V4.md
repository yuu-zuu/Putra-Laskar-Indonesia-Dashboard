# Historical import v4: exact production branch mapping

The workbook aliases are not database branch codes. They are stable source identifiers used only inside the historical payload:

| Source alias | Existing production branch name |
| --- | --- |
| `PBL` | `PANGKALAN BALAI - 2P309374` |
| `SKY` | `SEKAYU - 2P307376` |
| `RCK` | `RANCAEKEK - 3P40312` |

The importer now resolves each alias through `database/imports/historical-master-bootstrap.json` version 2. It matches `branch.name` case-insensitively after trimming and collapsing whitespace. It does not rename a branch, create a branch, or assume the database `branch.code` value.

The import aborts when an exact production branch name is missing, inactive, or ambiguous. It also prints the resolved database branch code and name in the bootstrap audit summary.

## Automatic master bootstrap

With `--bootstrap-master`, the importer reuses the three existing branches and idempotently creates only missing operational masters:

- global product `BBM`;
- stock units `POMPA-DEPAN` and `POMPA-BELAKANG` per branch;
- meters `METER-DEPAN` and `METER-BELAKANG` per branch;
- dated meter-to-stock assignments from the payload start date.

Existing compatible masters are reused. Existing incompatible product links or overlapping meter assignments stop the import.

## Preflight branch check

Before importing, verify the exact names directly in production:

```sql
SELECT id, code, name, active
FROM branch
WHERE name IN (
  'PANGKALAN BALAI - 2P309374',
  'RANCAEKEK - 3P40312',
  'SEKAYU - 2P307376'
)
ORDER BY name;
```

The query must return exactly three active rows. Their `code` values may be anything; the importer no longer assumes `PBL`, `RCK`, or `SKY` are database codes.

## Dry run

```bash
npm run db:import-historical -- \
  --file database/imports/stock-operator-2026-03-to-2026-07-15.json \
  --actor-email admin@example.com \
  --allow-uncosted \
  --acknowledge-source-warnings \
  --bootstrap-master
```

Dry-run performs branch resolution, master bootstrap, historical posting, FIFO allocation, and reconciliation checks inside one transaction, then rolls back.

## Apply

When actual capacities are present in the bootstrap file:

```bash
npm run db:import-historical -- \
  --file database/imports/stock-operator-2026-03-to-2026-07-15.json \
  --actor-email admin@example.com \
  --allow-uncosted \
  --acknowledge-source-warnings \
  --bootstrap-master \
  --apply
```

If capacity is still inferred from the historical maximum, add `--acknowledge-inferred-capacity` only after reviewing the inferred values.

## Stage incomplete July rows

The source-row staging command uses the same branch mapping file:

```bash
npm run db:stage-historical-source -- \
  --file database/imports/historical-source-rows-2026-07-16-to-31.json \
  --actor-email admin@example.com \
  --branch-map-file database/imports/historical-master-bootstrap.json
```

Add `--apply` only after the dry-run succeeds.
