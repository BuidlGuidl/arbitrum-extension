import { NextResponse } from "next/server";

interface SignedTxData {
  signedTx: string;
  message: string;
  contractAddress: string;
  value: string;
  addressIndex: number;
  recipientAddress: string;
  transactionHash: string;
}

// In-memory storage for signed transaction
let signedTxData: SignedTxData | null = null;

export async function POST(request: Request) {
  try {
    const data = await request.json();
    signedTxData = data;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error storing signed transaction:", error);
    return NextResponse.json({ error: "Failed to store signed transaction" }, { status: 500 });
  }
}

export async function GET() {
  try {
    return NextResponse.json({ signedTxData });
  } catch (error) {
    console.error("Error reading signed transaction:", error);
    return NextResponse.json({ error: "Failed to read signed transaction" }, { status: 500 });
  }
}
