import { db } from "../server/db";
import { users, riderOffers, driverRoutes, rides, bids } from "../shared/schema";
import { sql } from "drizzle-orm";

const driverFirstNames = ["James", "Sarah", "Mohammed", "Emily", "David", "Sophie", "Daniel", "Jessica", "Michael", "Rachel"];
const riderFirstNames = ["Oliver", "Emma", "Noah", "Ava", "Liam", "Mia", "William", "Isabella", "Lucas", "Charlotte"];
const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];

const ukLocations = [
  { address: "Oxford Circus, London W1B 3AG", lat: 51.5154, lng: -0.1410 },
  { address: "Piccadilly Circus, London W1J 9HP", lat: 51.5099, lng: -0.1342 },
  { address: "King's Cross Station, London N1C 4TB", lat: 51.5320, lng: -0.1234 },
  { address: "Canary Wharf, London E14 5NY", lat: 51.5055, lng: -0.0195 },
  { address: "Baker Street, London NW1 5LA", lat: 51.5226, lng: -0.1571 },
  { address: "Liverpool Street Station, London EC2M 7QH", lat: 51.5178, lng: -0.0823 },
  { address: "Camden Town, London NW1 8QL", lat: 51.5391, lng: -0.1426 },
  { address: "Notting Hill Gate, London W11 3HT", lat: 51.5094, lng: -0.1963 },
  { address: "Waterloo Station, London SE1 8SW", lat: 51.5031, lng: -0.1132 },
  { address: "Victoria Station, London SW1V 1JU", lat: 51.4952, lng: -0.1439 },
  { address: "Paddington Station, London W2 1HQ", lat: 51.5154, lng: -0.1755 },
  { address: "London Bridge, London SE1 9SP", lat: 51.5079, lng: -0.0877 },
  { address: "Euston Station, London NW1 2RT", lat: 51.5282, lng: -0.1337 },
  { address: "Tower Hill, London EC3N 4DJ", lat: 51.5101, lng: -0.0765 },
  { address: "Westminster, London SW1A 0AA", lat: 51.5010, lng: -0.1246 },
  { address: "Bank Station, London EC3V 3LA", lat: 51.5133, lng: -0.0886 },
  { address: "Holborn, London WC1V 7QH", lat: 51.5174, lng: -0.1201 },
  { address: "Covent Garden, London WC2E 8RF", lat: 51.5117, lng: -0.1240 },
  { address: "Leicester Square, London WC2H 7LU", lat: 51.5113, lng: -0.1281 },
  { address: "Marble Arch, London W1H 7EJ", lat: 51.5136, lng: -0.1586 }
];

async function seed() {
  console.log("🌱 Starting database seed...\n");
  
  // Clean up existing test data
  console.log("Cleaning up existing test data...");
  await db.delete(bids).where(sql`1=1`);
  await db.delete(rides).where(sql`1=1`);
  await db.delete(riderOffers).where(sql`1=1`);
  await db.delete(driverRoutes).where(sql`1=1`);
  await db.delete(users).where(sql`id LIKE 'driver-%' OR id LIKE 'rider-%'`);
  console.log("  ✓ Cleaned up existing test data\n");
  
  const now = new Date();
  
  // Create 10 drivers
  console.log("Creating 10 driver accounts...");
  const driverIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const driverId = `driver-${i + 1}`;
    driverIds.push(driverId);
    
    await db.insert(users).values({
      id: driverId,
      email: `driver${i + 1}@atlasride.test`,
      firstName: driverFirstNames[i],
      lastName: lastNames[i],
      profileImageUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${driverFirstNames[i]}`,
      isDriver: true,
      driverVerified: true,
      driverLicenseUrl: `/uploads/licenses/sample-license-${i + 1}.jpg`,
      rating: String(4.5 + Math.random() * 0.5),
      totalRides: Math.floor(Math.random() * 200) + 10,
    }).onConflictDoUpdate({
      target: users.id,
      set: {
        firstName: driverFirstNames[i],
        lastName: lastNames[i],
        isDriver: true,
        driverVerified: true,
      }
    });
    
    console.log(`  ✓ Driver ${i + 1}: ${driverFirstNames[i]} ${lastNames[i]}`);
  }
  
  // Create 10 riders
  console.log("\nCreating 10 rider accounts...");
  const riderIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const riderId = `rider-${i + 1}`;
    riderIds.push(riderId);
    
    await db.insert(users).values({
      id: riderId,
      email: `rider${i + 1}@atlasride.test`,
      firstName: riderFirstNames[i],
      lastName: lastNames[(i + 5) % 10],
      profileImageUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${riderFirstNames[i]}`,
      isDriver: false,
      rating: String(4.0 + Math.random() * 1.0),
      totalRides: Math.floor(Math.random() * 50) + 5,
    }).onConflictDoUpdate({
      target: users.id,
      set: {
        firstName: riderFirstNames[i],
        lastName: lastNames[(i + 5) % 10],
        isDriver: false,
      }
    });
    
    console.log(`  ✓ Rider ${i + 1}: ${riderFirstNames[i]} ${lastNames[(i + 5) % 10]}`);
  }
  
  // Create rider offers - Central London routes with overlapping areas
  console.log("\nCreating rider offers...");
  const riderRouteData = [
    { pickup: 0, dropoff: 8 },   // Oxford Circus → Waterloo
    { pickup: 1, dropoff: 9 },   // Piccadilly → Victoria
    { pickup: 2, dropoff: 5 },   // King's Cross → Liverpool Street
    { pickup: 17, dropoff: 14 }, // Covent Garden → Westminster
    { pickup: 18, dropoff: 11 }, // Leicester Square → London Bridge
    { pickup: 16, dropoff: 12 }, // Holborn → Euston
    { pickup: 0, dropoff: 4 },   // Oxford Circus → Baker Street
    { pickup: 6, dropoff: 2 },   // Camden → King's Cross
  ];
  
  for (let i = 0; i < 8; i++) {
    const futureTime = new Date(now.getTime() + (i + 1) * 3600000);
    const offerPriceValue = 10 + Math.floor(Math.random() * 30);
    const pickup = ukLocations[riderRouteData[i].pickup];
    const dropoff = ukLocations[riderRouteData[i].dropoff];
    
    await db.insert(riderOffers).values({
      riderId: riderIds[i],
      pickupLocation: pickup.address,
      dropoffLocation: dropoff.address,
      pickupLat: String(pickup.lat),
      pickupLng: String(pickup.lng),
      dropoffLat: String(dropoff.lat),
      dropoffLng: String(dropoff.lng),
      offerPrice: String(offerPriceValue),
      requestedTime: futureTime,
      status: "pending",
    });
    
    console.log(`  ✓ Offer ${i + 1}: ${pickup.address.split(',')[0]} → ${dropoff.address.split(',')[0]} - £${offerPriceValue}`);
  }
  
  // Create driver routes - Overlapping with rider offers for matching
  console.log("\nCreating driver routes...");
  const driverRouteData = [
    { start: 0, end: 8, detour: 3 },   // Oxford Circus → Waterloo (exact match)
    { start: 1, end: 9, detour: 3 },   // Piccadilly → Victoria (exact match)
    { start: 17, end: 14, detour: 2 }, // Covent Garden → Westminster (exact match)
    { start: 18, end: 11, detour: 2 }, // Leicester Square → London Bridge (exact match)
    { start: 6, end: 2, detour: 4 },   // Camden → King's Cross (exact match)
    { start: 4, end: 10, detour: 3 },  // Baker Street → Paddington
    { start: 12, end: 16, detour: 2 }, // Euston → Holborn
    { start: 5, end: 13, detour: 3 },  // Liverpool Street → Tower Hill
  ];
  
  for (let i = 0; i < 8; i++) {
    const futureTime = new Date(now.getTime() + (i + 2) * 3600000);
    const priceValue = 8 + Math.floor(Math.random() * 15);
    const start = ukLocations[driverRouteData[i].start];
    const end = ukLocations[driverRouteData[i].end];
    
    await db.insert(driverRoutes).values({
      driverId: driverIds[i],
      startLocation: start.address,
      endLocation: end.address,
      startLat: String(start.lat),
      startLng: String(start.lng),
      endLat: String(end.lat),
      endLng: String(end.lng),
      departureTime: futureTime,
      maxDetourMiles: String(driverRouteData[i].detour),
      availableSeats: Math.floor(Math.random() * 3) + 1,
      pricePerSeat: String(priceValue),
      status: "active",
    });
    
    console.log(`  ✓ Route ${i + 1}: ${start.address.split(',')[0]} → ${end.address.split(',')[0]} - £${priceValue}/seat (${driverRouteData[i].detour}mi detour)`);
  }
  
  console.log("\n✅ Database seeded successfully!");
  console.log("   - 10 driver accounts created");
  console.log("   - 10 rider accounts created");
  console.log("   - 8 rider offers created");
  console.log("   - 8 driver routes created");
  
  process.exit(0);
}

seed().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});
