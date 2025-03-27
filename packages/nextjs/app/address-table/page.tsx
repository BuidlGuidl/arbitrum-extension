"use client";

import type { NextPage } from "next";
import AddressTableExample from "~~/app/address-table/_components/AddressTableExample";

const Arb: NextPage = () => {
  return (
    <>
      <div className="container mx-auto px-32 py-8">
        <AddressTableExample />
      </div>
    </>
  );
};

export default Arb;
