import { eq, and, desc } from 'drizzle-orm';
import { db } from './db';
import {
  organizations,
  orgMembers,
  orgVehicles,
  orgInvitations,
  orgDocuments,
  InsertOrganization,
  InsertOrgMember,
  InsertOrgVehicle,
  InsertOrgInvitation,
  Organization,
  OrgMember,
  OrgVehicle,
  OrgInvitation,
  users,
} from '@shared/schema';
import crypto from 'crypto';

// ============================================================
// Organizations
// ============================================================

export async function createOrganization(data: InsertOrganization & { ownerUserId: string }): Promise<Organization> {
  const [org] = await db.insert(organizations).values(data as any).returning();
  await db.insert(orgMembers).values({
    orgId: org.id,
    userId: data.ownerUserId,
    role: 'owner',
    status: 'active',
  } as any);
  return org;
}

export async function getOrganizationById(id: number): Promise<Organization | null> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return org || null;
}

export async function getOrganizationsByOwner(ownerUserId: string): Promise<Organization[]> {
  return db.select().from(organizations).where(eq(organizations.ownerUserId, ownerUserId)).orderBy(desc(organizations.createdAt));
}

export async function getOrganizationForUser(userId: string): Promise<(Organization & { memberRole: string }) | null> {
  const result = await db
    .select({
      id: organizations.id,
      ownerUserId: organizations.ownerUserId,
      name: organizations.name,
      businessType: organizations.businessType,
      registrationNumber: organizations.registrationNumber,
      vatNumber: organizations.vatNumber,
      businessAddress: organizations.businessAddress,
      businessCity: organizations.businessCity,
      businessPostcode: organizations.businessPostcode,
      businessPhone: organizations.businessPhone,
      businessEmail: organizations.businessEmail,
      status: organizations.status,
      stripeAccountId: organizations.stripeAccountId,
      logoUrl: organizations.logoUrl,
      description: organizations.description,
      maxDrivers: organizations.maxDrivers,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
      memberRole: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(and(eq(orgMembers.userId, userId), eq(orgMembers.status, 'active')))
    .limit(1);
  return result[0] || null;
}

export async function updateOrganization(id: number, data: Partial<InsertOrganization>): Promise<Organization | null> {
  const [org] = await db.update(organizations).set({ ...data, updatedAt: new Date() }).where(eq(organizations.id, id)).returning();
  return org || null;
}

export async function updateOrganizationStatus(id: number, status: string): Promise<Organization | null> {
  const [org] = await db.update(organizations).set({ status, updatedAt: new Date() }).where(eq(organizations.id, id)).returning();
  return org || null;
}

export async function getAllOrganizations(): Promise<Organization[]> {
  return db.select().from(organizations).orderBy(desc(organizations.createdAt));
}

// ============================================================
// Members
// ============================================================

export async function getOrgMembers(orgId: number): Promise<(OrgMember & { firstName: string | null; lastName: string | null; email: string | null; profileImageUrl: string | null })[]> {
  return db
    .select({
      id: orgMembers.id,
      orgId: orgMembers.orgId,
      userId: orgMembers.userId,
      role: orgMembers.role,
      status: orgMembers.status,
      joinedAt: orgMembers.joinedAt,
      updatedAt: orgMembers.updatedAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
    })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(desc(orgMembers.joinedAt));
}

export async function getOrgMember(orgId: number, userId: string): Promise<OrgMember | null> {
  const [member] = await db.select().from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId))).limit(1);
  return member || null;
}

export async function addOrgMember(data: InsertOrgMember): Promise<OrgMember> {
  const [member] = await db.insert(orgMembers).values(data as any).returning();
  return member;
}

export async function updateOrgMemberStatus(id: number, status: string): Promise<OrgMember | null> {
  const [member] = await db.update(orgMembers).set({ status, updatedAt: new Date() }).where(eq(orgMembers.id, id)).returning();
  return member || null;
}

export async function updateOrgMemberRole(id: number, role: string): Promise<OrgMember | null> {
  const [member] = await db.update(orgMembers).set({ role, updatedAt: new Date() }).where(eq(orgMembers.id, id)).returning();
  return member || null;
}

export async function removeOrgMember(id: number): Promise<boolean> {
  const result = await db.delete(orgMembers).where(eq(orgMembers.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getOrgMemberCount(orgId: number): Promise<number> {
  const members = await db.select().from(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.status, 'active')));
  return members.length;
}

// ============================================================
// Vehicles
// ============================================================

export async function getOrgVehicles(orgId: number): Promise<(OrgVehicle & { driverFirstName: string | null; driverLastName: string | null })[]> {
  const results = await db
    .select({
      id: orgVehicles.id,
      orgId: orgVehicles.orgId,
      assignedDriverUserId: orgVehicles.assignedDriverUserId,
      make: orgVehicles.make,
      model: orgVehicles.model,
      year: orgVehicles.year,
      color: orgVehicles.color,
      licensePlate: orgVehicles.licensePlate,
      vehicleType: orgVehicles.vehicleType,
      seats: orgVehicles.seats,
      insuranceExpiryDate: orgVehicles.insuranceExpiryDate,
      motExpiryDate: orgVehicles.motExpiryDate,
      status: orgVehicles.status,
      createdAt: orgVehicles.createdAt,
      updatedAt: orgVehicles.updatedAt,
      driverFirstName: users.firstName,
      driverLastName: users.lastName,
    })
    .from(orgVehicles)
    .leftJoin(users, eq(orgVehicles.assignedDriverUserId, users.id))
    .where(eq(orgVehicles.orgId, orgId))
    .orderBy(desc(orgVehicles.createdAt));
  return results;
}

export async function addOrgVehicle(data: InsertOrgVehicle): Promise<OrgVehicle> {
  const [vehicle] = await db.insert(orgVehicles).values(data as any).returning();
  return vehicle;
}

export async function updateOrgVehicle(id: number, data: Partial<InsertOrgVehicle>): Promise<OrgVehicle | null> {
  const [vehicle] = await db.update(orgVehicles).set({ ...data, updatedAt: new Date() }).where(eq(orgVehicles.id, id)).returning();
  return vehicle || null;
}

export async function assignVehicleToDriver(vehicleId: number, driverUserId: string | null): Promise<OrgVehicle | null> {
  const [vehicle] = await db.update(orgVehicles).set({ assignedDriverUserId: driverUserId, updatedAt: new Date() }).where(eq(orgVehicles.id, vehicleId)).returning();
  return vehicle || null;
}

export async function removeOrgVehicle(id: number): Promise<boolean> {
  const result = await db.delete(orgVehicles).where(eq(orgVehicles.id, id));
  return (result.rowCount ?? 0) > 0;
}

export async function getOrgVehicleById(id: number): Promise<OrgVehicle | null> {
  const [vehicle] = await db.select().from(orgVehicles).where(eq(orgVehicles.id, id)).limit(1);
  return vehicle || null;
}

// ============================================================
// Invitations
// ============================================================

export async function createInvitation(data: Omit<InsertOrgInvitation, 'token' | 'status'>): Promise<OrgInvitation> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const [invitation] = await db.insert(orgInvitations).values({
    ...data,
    token,
    status: 'pending',
    expiresAt,
  } as any).returning();
  return invitation;
}

export async function getInvitationByToken(token: string): Promise<OrgInvitation | null> {
  const [invitation] = await db.select().from(orgInvitations).where(eq(orgInvitations.token, token)).limit(1);
  return invitation || null;
}

export async function getOrgInvitations(orgId: number): Promise<OrgInvitation[]> {
  return db.select().from(orgInvitations).where(eq(orgInvitations.orgId, orgId)).orderBy(desc(orgInvitations.createdAt));
}

export async function getPendingInvitationsForEmail(email: string): Promise<(OrgInvitation & { orgName: string })[]> {
  const results = await db
    .select({
      id: orgInvitations.id,
      orgId: orgInvitations.orgId,
      email: orgInvitations.email,
      role: orgInvitations.role,
      token: orgInvitations.token,
      status: orgInvitations.status,
      invitedByUserId: orgInvitations.invitedByUserId,
      expiresAt: orgInvitations.expiresAt,
      createdAt: orgInvitations.createdAt,
      orgName: organizations.name,
    })
    .from(orgInvitations)
    .innerJoin(organizations, eq(orgInvitations.orgId, organizations.id))
    .where(and(eq(orgInvitations.email, email), eq(orgInvitations.status, 'pending')));
  return results;
}

export async function updateInvitationStatus(id: number, status: string): Promise<OrgInvitation | null> {
  const [invitation] = await db.update(orgInvitations).set({ status }).where(eq(orgInvitations.id, id)).returning();
  return invitation || null;
}

// ============================================================
// Documents
// ============================================================

export async function addOrgDocument(data: { orgId: number; documentType: string; documentUrl: string; fileName: string; uploadedByUserId: string }): Promise<typeof orgDocuments.$inferSelect> {
  const [doc] = await db.insert(orgDocuments).values(data).returning();
  return doc;
}

export async function getOrgDocuments(orgId: number): Promise<(typeof orgDocuments.$inferSelect)[]> {
  return db.select().from(orgDocuments).where(eq(orgDocuments.orgId, orgId)).orderBy(desc(orgDocuments.createdAt));
}
