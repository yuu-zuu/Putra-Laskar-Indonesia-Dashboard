import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCashVariance,
  calculateClosingStock,
  calculateLiterVariance,
  calculateMeterQuantity,
} from "./formulas.js";

test("closing stock includes every signed movement", () => {
  assert.equal(
    calculateClosingStock({
      openingQty: 4_000,
      supplyQty: 3_000,
      transferInQty: 100,
      salesReturnQty: 15,
      gainQty: 5,
      salesQty: 2_000,
      transferOutQty: 50,
      supplierReturnQty: 20,
      lossQty: 10,
    }),
    5_040,
  );
});

test("meter and variance calculations are deterministic", () => {
  assert.equal(calculateMeterQuantity(100_000, 101_250, 10), 1_260);
  assert.equal(calculateLiterVariance(1_255, 1_260), -5);
  assert.equal(calculateCashVariance(15_500_000, 15_625_000), -125_000);
});
