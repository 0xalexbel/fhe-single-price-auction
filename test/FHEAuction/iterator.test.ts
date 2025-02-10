import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { FourStepsIteratorMock } from "../../types";

describe("iterator", () => {
  async function fixture() {
    const [owner] = await hre.ethers.getSigners();
    const iterator: FourStepsIteratorMock = await hre.ethers.deployContract(
      "FourStepsIteratorMock",
      [owner]
    );
    // The mock is both an iterator and an iterable
    await iterator
      .connect(owner)
      .transferOwnership(await iterator.getAddress());
    return iterator;
  }

  let iterator: FourStepsIteratorMock;

  beforeEach(async function () {
    iterator = await loadFixture(fixture);
  });

  it("initialize", async () => {
    const a = [
      { size: 10n, nativeGasWeight: 2n, unitFheGasCost: 0n },
      { size: 17n, nativeGasWeight: 3n, unitFheGasCost: 0n },
      { size: 11n, nativeGasWeight: 1n, unitFheGasCost: 0n },
    ];
    await iterator.initializeFourSteps(a);
    expect(await iterator.iterProgressMax()).to.equal(20n + 3n * 17n + 11n);
  });

  it("next: 3 steps, aligned with weight", async () => {
    const a = [
      { size: 10n, nativeGasWeight: 2n, unitFheGasCost: 0n },
      { size: 17n, nativeGasWeight: 3n, unitFheGasCost: 0n },
      { size: 11n, nativeGasWeight: 1n, unitFheGasCost: 0n },
    ];
    await iterator.initializeFourSteps(a);
    const iters = [6, 14, 24, 27, 1, 1, 5, 4];
    expect(await iterator.iterProgressMax()).to.equal(82n);
    for (let i = 0; i < iters.length; ++i) {
      await iterator.next(iters[i], 4);
    }
    expect(await iterator.finished()).to.be.true;
  });

  it("next: 3 steps, not aligned with weight", async () => {
    const a = [
      { size: 10n, nativeGasWeight: 2n, unitFheGasCost: 0n },
      { size: 17n, nativeGasWeight: 3n, unitFheGasCost: 0n },
      { size: 11n, nativeGasWeight: 1n, unitFheGasCost: 0n },
    ];
    await iterator.initializeFourSteps(a);
    const iters = [6, 17, 21, 30, 1, 1, 2, 3, 1];
    expect(await iterator.iterProgressMax()).to.equal(82n);

    expect(await iterator.step()).to.equal(0);
    expect(await iterator.stepProgress()).to.equal(0);
    expect(await iterator.iterProgress()).to.equal(0);

    await iterator.next(iters[0], 4);
    expect(await iterator.step()).to.equal(0);
    expect(await iterator.iterProgress()).to.equal(6);

    await iterator.next(iters[1], 4);
    expect(await iterator.step()).to.equal(1);
    expect(await iterator.stepProgress()).to.equal(1);
    expect(await iterator.iterProgress()).to.equal(6 + 17);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 1 * 3);

    await iterator.next(iters[2], 4);
    expect(await iterator.step()).to.equal(1);
    expect(await iterator.iterProgress()).to.equal(6 + 17 + 21);

    await iterator.next(iters[3], 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(3);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 1 * 3);
    expect(await iterator.iterProgress()).to.equal(6 + 17 + 21 + 30);

    await iterator.next(iters[4], 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(4);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 1 * 4);
    expect(await iterator.iterProgress()).to.equal(6 + 17 + 21 + 30 + 1);

    await iterator.next(iters[5], 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(5);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 1 * 5);
    expect(await iterator.iterProgress()).to.equal(6 + 17 + 21 + 30 + 1 + 1);

    await iterator.next(iters[6], 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(7);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 1 * 7);
    expect(await iterator.iterProgress()).to.equal(
      6 + 17 + 21 + 30 + 1 + 1 + 2
    );

    await iterator.next(iters[7], 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(10);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 1 * 10);
    expect(await iterator.iterProgress()).to.equal(
      6 + 17 + 21 + 30 + 1 + 1 + 2 + 3
    );
    expect(await iterator.finished()).to.be.false;

    await iterator.next(iters[8], 4);
    expect(await iterator.step()).to.equal(4);
    expect(await iterator.stepProgress()).to.equal(0);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 1 * 11);
    expect(await iterator.iterProgress()).to.equal(
      6 + 17 + 21 + 30 + 1 + 1 + 2 + 3 + 1
    );
    expect(await iterator.finished()).to.be.true;

    await iterator.next(10, 4);
  });

  it("next: 3 steps, not aligned with weight", async () => {
    const a = [
      { size: 10n, nativeGasWeight: 2n, unitFheGasCost: 0n },
      { size: 17n, nativeGasWeight: 3n, unitFheGasCost: 0n },
      { size: 11n, nativeGasWeight: 1n, unitFheGasCost: 0n },
    ];
    await iterator.initializeFourSteps(a);
    expect(await iterator.iterProgressMax()).to.equal(82n);

    const iters = [6, 16, 21, 30, 1, 1, 2, 3, 1];

    expect(await iterator.step()).to.equal(0);
    expect(await iterator.stepProgress()).to.equal(0);

    await iterator.next(iters[0], 4);
    expect(await iterator.step()).to.equal(0);

    await iterator.next(iters[1], 4);
    expect(await iterator.step()).to.equal(1);
    expect(await iterator.stepProgress()).to.equal(1);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 1 * 3);

    await iterator.next(iters[2], 4);
    expect(await iterator.step()).to.equal(1);

    await iterator.next(iters[3], 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(3);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 3 * 1);

    await iterator.next(iters[4], 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(4);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 4 * 1);

    await iterator.next(iters[5], 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(5);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 5 * 1);

    await iterator.next(iters[6], 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(7);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 7 * 1);

    await iterator.next(iters[7], 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(10);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 10 * 1);
    expect(await iterator.finished()).to.be.false;

    await iterator.next(iters[8], 4);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3 + 11 * 1);
    expect(await iterator.step()).to.equal(4);
    expect(await iterator.stepProgress()).to.equal(0);
    expect(await iterator.finished()).to.be.true;

    await iterator.next(10, 4);
  });

  it("next: 4 steps, not aligned with weight", async () => {
    const a = [
      { size: 10n, nativeGasWeight: 2n, unitFheGasCost: 0n },
      { size: 17n, nativeGasWeight: 3n, unitFheGasCost: 0n },
      { size: 11n, nativeGasWeight: 1n, unitFheGasCost: 0n },
      { size: 7n, nativeGasWeight: 7n, unitFheGasCost: 0n },
    ];
    await iterator.initializeFourSteps(a);
    expect(await iterator.iterProgressMax()).to.equal(131n);

    expect(await iterator.step()).to.equal(0);
    expect(await iterator.stepProgress()).to.equal(0);

    await iterator.next(21, 4);
    expect(await iterator.step()).to.equal(1);
    expect(await iterator.stepProgress()).to.equal(1);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 1 * 3);

    await iterator.next(3 * 15 - 1, 4);
    expect(await iterator.step()).to.equal(1);
    expect(await iterator.stepProgress()).to.equal(16);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 16 * 3);

    await iterator.next(1, 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(0);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3);
    expect(await iterator.finished()).to.be.false;

    await iterator.next(0, 4);
    expect(await iterator.step()).to.equal(2);
    expect(await iterator.stepProgress()).to.equal(0);
    expect(await iterator.iterProgress()).to.equal(10 * 2 + 17 * 3);
    expect(await iterator.finished()).to.be.false;

    await iterator.next(1000, 4);
    expect(await iterator.step()).to.equal(4);
    expect(await iterator.stepProgress()).to.equal(0);
    expect(await iterator.iterProgress()).to.equal(
      10 * 2 + 17 * 3 + 11 * 1 + 7 * 7
    );
    expect(await iterator.finished()).to.be.true;
  });

  describe("FHE Gas", () => {
    describe("step1 9_000_000", () => {
      beforeEach(async function () {
        const a = [
          { size: 10n, nativeGasWeight: 2n, unitFheGasCost: 9_000_000n },
          { size: 17n, nativeGasWeight: 3n, unitFheGasCost: 1n },
          { size: 11n, nativeGasWeight: 1n, unitFheGasCost: 1n },
          { size: 7n, nativeGasWeight: 7n, unitFheGasCost: 1n },
        ];
        await iterator.initializeFourSteps(a);
        expect(await iterator.iterProgressMax()).to.equal(131n);

        expect(await iterator.step()).to.equal(0);
        expect(await iterator.stepProgress()).to.equal(0);
      });

      it("test1", async () => {
        await iterator.next(1, 4);
        expect(await iterator.step()).to.equal(0);
        expect(await iterator.stepProgress()).to.equal(1);
        expect(await iterator.iterProgress()).to.equal(2);
      });

      it("test2", async () => {
        await iterator.next(2, 4);
        expect(await iterator.step()).to.equal(0);
        expect(await iterator.stepProgress()).to.equal(1);
        expect(await iterator.iterProgress()).to.equal(2);
      });

      it("test3", async () => {
        await iterator.next(3, 4);
        expect(await iterator.step()).to.equal(0);
        expect(await iterator.stepProgress()).to.equal(1);
        expect(await iterator.iterProgress()).to.equal(2);
      });

      it("test4", async () => {
        await iterator.next(20, 4);
        expect(await iterator.step()).to.equal(0);
        expect(await iterator.stepProgress()).to.equal(1);
        expect(await iterator.iterProgress()).to.equal(2);
      });
    });

    describe("step1 1_200_000", () => {
      beforeEach(async function () {
        const a = [
          { size: 10n, nativeGasWeight: 2n, unitFheGasCost: 1_200_000n },
          { size: 17n, nativeGasWeight: 3n, unitFheGasCost: 1n },
          { size: 11n, nativeGasWeight: 1n, unitFheGasCost: 1n },
          { size: 7n, nativeGasWeight: 7n, unitFheGasCost: 1n },
        ];
        await iterator.initializeFourSteps(a);
        expect(await iterator.iterProgressMax()).to.equal(131n);

        expect(await iterator.step()).to.equal(0);
        expect(await iterator.stepProgress()).to.equal(0);
      });

      it("test1", async () => {
        await iterator.next(1, 4);
        expect(await iterator.step()).to.equal(0);
        expect(await iterator.stepProgress()).to.equal(1);
        expect(await iterator.iterProgress()).to.equal(2);
      });

      it("test2", async () => {
        await iterator.next(2, 4);
        expect(await iterator.step()).to.equal(0);
        expect(await iterator.stepProgress()).to.equal(1);
        expect(await iterator.iterProgress()).to.equal(2);
      });

      it("test3", async () => {
        await iterator.next(3, 4);
        expect(await iterator.step()).to.equal(0);
        expect(await iterator.stepProgress()).to.equal(2);
        expect(await iterator.iterProgress()).to.equal(4);
      });

      it("test4", async () => {
        await iterator.next(20, 4);
        expect(await iterator.step()).to.equal(0);
        expect(await iterator.stepProgress()).to.equal(8);
        expect(await iterator.iterProgress()).to.equal(16);
      });
    });
  });
});
