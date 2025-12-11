import { db } from "../server/db";
import { users, riderOffers, driverRoutes } from "../shared/schema";

const driverFirstNames = ["James", "Sarah", "Mohammed", "Emily", "David", "Sophie", "Daniel", "Jessica", "Michael", "Rachel"];
const riderFirstNames = ["Oliver", "Emma", "Noah", "Ava", "Liam", "Mia", "William", "Isabella", "Lucas", "Charlotte"];
const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];

const ukLocations = [
  "123 Oxford Street, London W1D 2LN",
  "45 Piccadilly Circus, London W1J 9HP",
  "78 King's Road, Chelsea, London SW3 4NZ",
  "22 Canary Wharf, London E14 5NY",
  "56 Baker Street, London NW1 5NJ",
  "89 Shoreditch High Street, London E1 6JN",
  "34 Camden High Street, London NW1 0JH",
  "12 Notting Hill Gate, London W11 3JE",
  "67 Greenwich High Road, London SE10 8JL",
  "91 Brixton Road, London SW9 6AP",
  "15 Victoria Street, London SW1H 0NE",
  "28 Knightsbridge, London SW1X 7LY",
  "43 Regent Street, London W1B 5TH",
  "62 Fleet Street, London EC4A 2DY",
  "77 Tower Hill, London EC3N 4EE",
  "33 Liverpool Street, London EC2M 7PY",
  "51 Paddington Station, London W2 1HQ",
  "19 Waterloo Road, London SE1 8UT",
  "84 Marble Arch, London W1H 7EL",
  "36 Borough High Street, London SE1 1XN"
];

async function seed() {
  console.log("🌱 Starting database seed...\n");
  
  const now = new Date();
  
  // Create 10 drivers
  console.log("Creating 10 driver accounts...");
  const driverIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const driverId = `driver-${i + 1}-${Date.now()}`;
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
      rating: (4.5 + Math.random() * 0.5).toFixed(2),
      totalRides: Math.floor(Math.random() * 200) + 10,
    }).onConflictDoNothing();
    
    console.log(`  ✓ Driver ${i + 1}: ${driverFirstNames[i]} ${lastNames[i]}`);
  }
  
  // Create 10 riders
  console.log("\nCreating 10 rider accounts...");
  const riderIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const riderId = `rider-${i + 1}-${Date.now()}`;
    riderIds.push(riderId);
    
    await db.insert(users).values({
      id: riderId,
      email: `rider${i + 1}@atlasride.test`,
      firstName: riderFirstNames[i],
      lastName: lastNames[(i + 5) % 10],
      profileImageUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${riderFirstNames[i]}`,
      isDriver: false,
      rating: (4.0 + Math.random() * 1.0).toFixed(2),
      totalRides: Math.floor(Math.random() * 50) + 5,
    }).onConflictDoNothing();
    
    console.log(`  ✓ Rider ${i + 1}: ${riderFirstNames[i]} ${lastNames[(i + 5) % 10]}`);
  }
  
  // Create rider offers
  console.log("\nCreating rider offers...");
  for (let i = 0; i < 8; i++) {
    const futureTime = new Date(now.getTime() + (i + 1) * 3600000); // 1-8 hours from now
    
    await db.insert(riderOffers).values({
      riderId: riderIds[i],
      pickupLocation: ukLocations[i],
      dropoffLocation: ukLocations[(i + 10) % 20],
      pickupLat: (51.5 + Math.random() * 0.1).toFixed(7),
      pickupLng: (-0.1 + Math.random() * 0.2).toFixed(7),
      dropoffLat: (51.5 + Math.random() * 0.1).toFixed(7),
      dropoffLng: (-0.1 + Math.random() * 0.2).toFixed(7),
      offerPrice: (10 + Math.floor(Math.random() * 30)).toString(),
      requestedTime: futureTime,
      status: "pending",
    });
    
    console.log(`  ✓ Offer ${i + 1}: ${ukLocations[i].split(',')[0]} → ${ukLocations[(i + 10) % 20].split(',')[0]} - £${10 + Math.floor(Math.random() * 30)}`);
  }
  
  // Create driver routes
  console.log("\nCreating driver routes...");
  for (let i = 0; i < 8; i++) {
    const futureTime = new Date(now.getTime() + (i + 2) * 3600000); // 2-9 hours from now
    
    await db.insert(driverRoutes).values({
      driverId: driverIds[i],
      startLocation: ukLocations[(i + 5) % 20],
      endLocation: ukLocations[(i + 15) % 20],
      startLat: (51.5 + Math.random() * 0.1).toFixed(7),
      startLng: (-0.1 + Math.random() * 0.2).toFixed(7),
      endLat: (51.5 + Math.random() * 0.1).toFixed(7),
      endLng: (-0.1 + Math.random() * 0.2).toFixed(7),
      departureTime: futureTime,
      maxDetourMiles: (1 + Math.random() * 4).toFixed(2),
      availableSeats: Math.floor(Math.random() * 3) + 1,
      pricePerSeat: (8 + Math.floor(Math.random() * 15)).toString(),
      status: "active",
    });
    
    console.log(`  ✓ Route ${i + 1}: ${ukLocations[(i + 5) % 20].split(',')[0]} → ${ukLocations[(i + 15) % 20].split(',')[0]} - £${8 + Math.floor(Math.random() * 15)}/seat`);
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
