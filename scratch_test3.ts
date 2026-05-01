import "dotenv/config";
import { calculateRentalPrice } from "./lib/rental-pricing";
import { getMssqlPool, sql } from "./lib/mssql";

async function test() {
  try {
    const input = {
      productId: "1", // Use a valid ModelTypeID
      rentStart: new Date("2026-05-21T00:00:00.000Z"),
      rentEnd: new Date("2026-05-23T00:00:00.000Z"),
      isExclusive: false,
      bookingDate: new Date("2026-05-01T00:00:00.000Z")
    };
    console.log("Calling calculateRentalPrice...");
    const result = await calculateRentalPrice(input);
    console.log("Result:", result);
  } catch(e) {
    console.error("Error in calculateRentalPrice:");
    console.error(e);
  }
  process.exit(0);
}

test();
