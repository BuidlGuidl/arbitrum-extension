"use client";

import type { NextPage } from "next";
import NativeDeposit from "~~/app/bridge/_components/NativeDeposit";
import NativeWithdraw from "~~/app/bridge/_components/NativeWithdraw";

const Arb: NextPage = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Arbitrum Bridge</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="w-full">
          <NativeDeposit />
        </div>
        <div className="w-full">
          <NativeWithdraw />
        </div>
      </div>
    </div>
  );
};

export default Arb;
