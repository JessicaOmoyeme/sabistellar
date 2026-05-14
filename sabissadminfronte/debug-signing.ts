/**
 * Debug script to test wallet signing format
 * Run this in browser console to check what's being signed
 */

import { signMessage } from "@stellar/freighter-api";

export async function debugWalletSigning() {
  const testMessage = `Sign this message to sign in to Sabiss.

Wallet: GAXFBQZB3IBVG4VVGPUDZK2D6WDIVCFBVQFLYYQ2PRZRA6HVUS4YAAPR
Network: testnet
Nonce: 1c64e631e5724acd9be2af9edf8810b6`;

  console.log("=== SIGNING DEBUG ===");
  console.log("Original message:");
  console.log(testMessage);
  console.log("\nMessage bytes (UTF-8):");
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(testMessage);
  console.log(Array.from(messageBytes));
  
  console.log("\nRequesting signature from Freighter...");
  
  try {
    const response = await signMessage(testMessage, {
      address: "GAXFBQZB3IBVG4VVGPUDZK2D6WDIVCFBVQFLYYQ2PRZRA6HVUS4YAAPR",
    });
    
    if (response.error) {
      console.error("Signing error:", response.error);
      return;
    }
    
    console.log("\nSigned message (signature):");
    console.log(response.signedMessage);
    console.log("\nSigner address:");
    console.log(response.signerAddress);
    
    // Try to decode the signature
    if (typeof response.signedMessage === "string") {
      console.log("\nSignature is string (likely base64)");
      const decoded = atob(response.signedMessage);
      console.log("Decoded length:", decoded.length);
    } else if (response.signedMessage instanceof Uint8Array) {
      console.log("\nSignature is Uint8Array");
      console.log("Length:", response.signedMessage.length);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// Call it
debugWalletSigning().catch(console.error);
