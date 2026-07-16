import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../lib/errors.js";
import { planFifoAllocation, weightedUnitCost } from "./fifo.js";

const layers = [
  { id: "old", remainingQty: 100, unitCost: 10_000, unitSellingPrice: 12_500 },
  { id: "new", remainingQty: 80, unitCost: 11_000, unitSellingPrice: 12_500 },
];

test("plans FIFO across layers in input order without mutating them", () => {
  const planned = planFifoAllocation(layers, 150);
  assert.deepEqual(
    planned.map(({ layerId, quantity }) => ({ layerId, quantity })),
    [
      { layerId: "old", quantity: 100 },
      { layerId: "new", quantity: 50 },
    ],
  );
  assert.equal(layers[0]?.remainingQty, 100);
  assert.equal(weightedUnitCost(planned), 10_333);
});

test("rejects invalid and insufficient FIFO requests with traceable codes", () => {
  for (const quantity of [0, -1, Number.NaN]) {
    assert.throws(
      () => planFifoAllocation(layers, quantity),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_QUANTITY",
    );
  }
  assert.throws(
    () => planFifoAllocation(layers, 181),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "INSUFFICIENT_FIFO_STOCK" &&
      error.fieldErrors?.quantity === "Maksimum 180 L.",
  );
});

test("skips empty layers and defines zero weighted cost", () => {
  assert.equal(weightedUnitCost([]), 0);
  assert.deepEqual(planFifoAllocation([{ ...layers[0]!, remainingQty: 0 }, layers[1]!], 1)[0], {
    layerId: "new",
    quantity: 1,
    unitCost: 11_000,
    unitSellingPrice: 12_500,
  });
});
