"use client";

import type { NextPage } from "next";
import AddressTableExample from "~~/app/address-table/_components/AddressTableExample";

const Arb: NextPage = () => {
  return (
    <>
      <div className="container mx-auto py-8 px-4 text-center">
        <h2 className="text-2xl font-bold mb-4">Arbitrum Address Table Example</h2>
        <p className="mb-6 max-w-2xl mx-auto">
          This page demonstrates interacting with the Arbitrum Address Table precompile via the{" "}
          <b>ArbAddressTableExample</b> contract. The address table allows you to register addresses and refer
          to them later using integer indexes, saving gas on transactions that repeatedly use the
          same addresses. Go view the contract at <b>packages/hardhat/contracts/ArbAddressTableExample.sol</b> to see how it works.
        </p>
        <AddressTableExample />
      </div>
    </>
  );
};

export default Arb;
