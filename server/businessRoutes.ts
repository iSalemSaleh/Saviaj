import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import * as bizStorage from './businessStorage';
import { insertOrganizationSchema, insertOrgVehicleSchema } from '@shared/schema';
import { z } from 'zod';

const router = Router();

const businessDocUpload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/business',
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

function requireAuth(req: Request, res: Response, next: Function) {
  if (!(req as any).user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function getUserId(req: Request): string {
  return (req as any).user?.id;
}

// ============================================================
// Organization CRUD
// ============================================================

router.post('/organizations', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const existing = await bizStorage.getOrganizationForUser(userId);
    if (existing) {
      return res.status(400).json({ error: 'You already belong to an organization' });
    }

    const parsed = insertOrganizationSchema.parse({ ...req.body, ownerUserId: userId });
    const org = await bizStorage.createOrganization(parsed);
    res.status(201).json(org);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: err.errors });
    }
    console.error('Error creating organization:', err);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

router.get('/organizations/mine', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const org = await bizStorage.getOrganizationForUser(userId);
    if (!org) {
      return res.status(404).json({ error: 'No organization found' });
    }
    res.json(org);
  } catch (err) {
    console.error('Error fetching organization:', err);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

router.get('/organizations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const org = await bizStorage.getOrganizationById(id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(id, userId);
    if (!member) return res.status(403).json({ error: 'Not a member of this organization' });

    res.json(org);
  } catch (err) {
    console.error('Error fetching organization:', err);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

router.patch('/organizations/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(id, userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only owners and admins can update the organization' });
    }

    const org = await bizStorage.updateOrganization(id, req.body);
    res.json(org);
  } catch (err) {
    console.error('Error updating organization:', err);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// ============================================================
// Members
// ============================================================

router.get('/organizations/:id/members', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(id, userId);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const members = await bizStorage.getOrgMembers(id);
    res.json(members);
  } catch (err) {
    console.error('Error fetching members:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

router.patch('/organizations/:orgId/members/:memberId/role', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.orgId);
    const memberId = parseInt(req.params.memberId);
    if (isNaN(orgId) || isNaN(memberId)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const requester = await bizStorage.getOrgMember(orgId, userId);
    if (!requester || requester.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can change roles' });
    }

    const { role } = req.body;
    if (!['admin', 'driver'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const updated = await bizStorage.updateOrgMemberRole(memberId, role);
    res.json(updated);
  } catch (err) {
    console.error('Error updating member role:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

router.delete('/organizations/:orgId/members/:memberId', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.orgId);
    const memberId = parseInt(req.params.memberId);
    if (isNaN(orgId) || isNaN(memberId)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const requester = await bizStorage.getOrgMember(orgId, userId);
    if (!requester || !['owner', 'admin'].includes(requester.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    await bizStorage.removeOrgMember(memberId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing member:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ============================================================
// Vehicles
// ============================================================

router.get('/organizations/:id/vehicles', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(id, userId);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const vehicles = await bizStorage.getOrgVehicles(id);
    res.json(vehicles);
  } catch (err) {
    console.error('Error fetching vehicles:', err);
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

router.post('/organizations/:id/vehicles', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(orgId, userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only owners and admins can add vehicles' });
    }

    const parsed = insertOrgVehicleSchema.parse({ ...req.body, orgId });
    const vehicle = await bizStorage.addOrgVehicle(parsed);
    res.status(201).json(vehicle);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: err.errors });
    }
    console.error('Error adding vehicle:', err);
    res.status(500).json({ error: 'Failed to add vehicle' });
  }
});

router.patch('/organizations/:orgId/vehicles/:vehicleId', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.orgId);
    const vehicleId = parseInt(req.params.vehicleId);
    if (isNaN(orgId) || isNaN(vehicleId)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(orgId, userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only owners and admins can update vehicles' });
    }

    const vehicle = await bizStorage.updateOrgVehicle(vehicleId, req.body);
    res.json(vehicle);
  } catch (err) {
    console.error('Error updating vehicle:', err);
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

router.patch('/organizations/:orgId/vehicles/:vehicleId/assign', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.orgId);
    const vehicleId = parseInt(req.params.vehicleId);
    if (isNaN(orgId) || isNaN(vehicleId)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(orgId, userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only owners and admins can assign vehicles' });
    }

    const { driverUserId } = req.body;
    if (driverUserId) {
      const driverMember = await bizStorage.getOrgMember(orgId, driverUserId);
      if (!driverMember) {
        return res.status(400).json({ error: 'Driver is not a member of this organization' });
      }
    }

    const vehicle = await bizStorage.assignVehicleToDriver(vehicleId, driverUserId || null);
    res.json(vehicle);
  } catch (err) {
    console.error('Error assigning vehicle:', err);
    res.status(500).json({ error: 'Failed to assign vehicle' });
  }
});

router.delete('/organizations/:orgId/vehicles/:vehicleId', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.orgId);
    const vehicleId = parseInt(req.params.vehicleId);
    if (isNaN(orgId) || isNaN(vehicleId)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(orgId, userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only owners and admins can remove vehicles' });
    }

    await bizStorage.removeOrgVehicle(vehicleId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing vehicle:', err);
    res.status(500).json({ error: 'Failed to remove vehicle' });
  }
});

// ============================================================
// Invitations
// ============================================================

router.post('/organizations/:id/invitations', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(orgId, userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Only owners and admins can invite members' });
    }

    const org = await bizStorage.getOrganizationById(orgId);
    if (!org || org.status !== 'active') {
      return res.status(400).json({ error: 'Organization must be approved before inviting members' });
    }

    const memberCount = await bizStorage.getOrgMemberCount(orgId);
    if (org.maxDrivers && memberCount >= org.maxDrivers) {
      return res.status(400).json({ error: `Maximum driver limit (${org.maxDrivers}) reached` });
    }

    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const invitation = await bizStorage.createInvitation({
      orgId,
      email,
      role: role || 'driver',
      invitedByUserId: userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    res.status(201).json(invitation);
  } catch (err) {
    console.error('Error creating invitation:', err);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

router.get('/organizations/:id/invitations', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(orgId, userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const invitations = await bizStorage.getOrgInvitations(orgId);
    res.json(invitations);
  } catch (err) {
    console.error('Error fetching invitations:', err);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

router.get('/invitations/mine', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const user = (req as any).user;
    if (!user?.email) return res.json([]);

    const invitations = await bizStorage.getPendingInvitationsForEmail(user.email);
    const now = new Date();
    const valid = invitations.filter(i => new Date(i.expiresAt) > now);
    res.json(valid);
  } catch (err) {
    console.error('Error fetching invitations:', err);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

router.post('/invitations/:token/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const invitation = await bizStorage.getInvitationByToken(token);

    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });
    if (invitation.status !== 'pending') return res.status(400).json({ error: 'Invitation already used' });
    if (new Date(invitation.expiresAt) < new Date()) return res.status(400).json({ error: 'Invitation expired' });

    const userId = getUserId(req);
    const existing = await bizStorage.getOrganizationForUser(userId);
    if (existing) {
      return res.status(400).json({ error: 'You already belong to an organization' });
    }

    await bizStorage.addOrgMember({
      orgId: invitation.orgId,
      userId,
      role: invitation.role,
      status: 'active',
    });
    await bizStorage.updateInvitationStatus(invitation.id, 'accepted');

    res.json({ success: true, orgId: invitation.orgId });
  } catch (err) {
    console.error('Error accepting invitation:', err);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

router.post('/invitations/:token/decline', requireAuth, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const invitation = await bizStorage.getInvitationByToken(token);
    if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

    await bizStorage.updateInvitationStatus(invitation.id, 'declined');
    res.json({ success: true });
  } catch (err) {
    console.error('Error declining invitation:', err);
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

// ============================================================
// Documents
// ============================================================

router.post('/organizations/:id/documents', requireAuth, businessDocUpload.single('document'), async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(orgId, userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { documentType } = req.body;
    if (!documentType) return res.status(400).json({ error: 'Document type is required' });

    const doc = await bizStorage.addOrgDocument({
      orgId,
      documentType,
      documentUrl: `/uploads/business/${req.file.filename}`,
      fileName: req.file.originalname,
      uploadedByUserId: userId,
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error('Error uploading document:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

router.get('/organizations/:id/documents', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = parseInt(req.params.id);
    if (isNaN(orgId)) return res.status(400).json({ error: 'Invalid ID' });

    const userId = getUserId(req);
    const member = await bizStorage.getOrgMember(orgId, userId);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const docs = await bizStorage.getOrgDocuments(orgId);
    res.json(docs);
  } catch (err) {
    console.error('Error fetching documents:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// ============================================================
// Admin endpoints (for platform admin to approve/reject)
// ============================================================

router.get('/admin/organizations', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgs = await bizStorage.getAllOrganizations();
    res.json(orgs);
  } catch (err) {
    console.error('Error fetching organizations:', err);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

router.patch('/admin/organizations/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const { status } = req.body;
    if (!['active', 'rejected', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const org = await bizStorage.updateOrganizationStatus(id, status);
    res.json(org);
  } catch (err) {
    console.error('Error updating organization status:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

export default router;
