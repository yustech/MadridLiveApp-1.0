import express from "express";
import { STAFF_ROLES } from "../../../src/validators";
import { unauthorizedResponse } from "../auth";
import { makeId } from "../ids";
import { getPool } from "../pool";
import { validateAssignedRolePayload } from "../staffAssignmentValidation";
import {
  assignStaffToEvent,
  EventStaffAssignmentError,
} from "../services/eventStaffAssignmentService";

const MAX_TEMPLATE_MEMBERS = 1000;

interface StaffTemplatesRoutesOptions {
  prefix: string;
  requireAdmin: (req: express.Request, res: express.Response) => Promise<boolean>;
  requireAuthorizedRead: (req: express.Request, res: express.Response) => Promise<boolean>;
}

interface TemplateRow {
  id: string;
  name: string;
  createdAt: string;
}

interface TemplateMemberRow {
  templateId: string;
  id: string;
  idCode: string;
  name: string;
  email: string;
  phone: string;
  assignedRole: string;
}

interface TemplateAssignmentRow {
  staffId: string;
  assignedRole: string;
}

type CreateTemplateMember = {
  workerId: string;
  assignedRole: string;
};

function validateTemplateName(rawName: unknown) {
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name || name.length > 160) {
    return { error: "name must contain between 1 and 160 characters." } as const;
  }
  return { name } as const;
}

function validateEventId(rawEventId: unknown) {
  const eventId = typeof rawEventId === "string" ? rawEventId.trim() : "";
  if (!eventId || eventId.length > 96) {
    return { error: "eventId must contain between 1 and 96 characters." } as const;
  }
  return { eventId } as const;
}

function validateCreateTemplatePayload(body: unknown) {
  if (typeof body !== "object" || body === null) {
    return { error: "Expected object payload." } as const;
  }

  const payload = body as { name?: unknown; eventId?: unknown; members?: unknown };
  const nameValidation = validateTemplateName(payload.name);
  if ("error" in nameValidation) return { error: nameValidation.error } as const;

  const hasEventId = payload.eventId !== undefined;
  const hasMembers = payload.members !== undefined;
  if (hasEventId && hasMembers) {
    return { error: "Provide eventId or members, not both." } as const;
  }

  if (hasEventId) {
    const eventValidation = validateEventId(payload.eventId);
    if ("error" in eventValidation) return { error: eventValidation.error } as const;
    return { name: nameValidation.name, eventId: eventValidation.eventId, members: [] } as const;
  }

  if (!hasMembers) {
    return { name: nameValidation.name, members: [] as CreateTemplateMember[] } as const;
  }
  if (!Array.isArray(payload.members)) {
    return { error: "members must be an array." } as const;
  }
  if (payload.members.length > MAX_TEMPLATE_MEMBERS) {
    return { error: `members cannot contain more than ${MAX_TEMPLATE_MEMBERS} items.` } as const;
  }

  const members: CreateTemplateMember[] = [];
  const seenWorkerIds = new Set<string>();
  for (const rawMember of payload.members) {
    if (typeof rawMember !== "object" || rawMember === null) {
      return { error: "Every member must be an object." } as const;
    }
    const member = rawMember as { workerId?: unknown; assignedRole?: unknown };
    const workerId = typeof member.workerId === "string" ? member.workerId.trim() : "";
    if (!workerId || workerId.length > 96) {
      return { error: "Every workerId must contain between 1 and 96 characters." } as const;
    }
    if (seenWorkerIds.has(workerId)) {
      return { error: `Duplicate workerId: ${workerId}.` } as const;
    }
    const assignedRole = typeof member.assignedRole === "string" ? member.assignedRole.trim() : "";
    if (!STAFF_ROLES.includes(assignedRole)) {
      return { error: `assignedRole must be one of: ${STAFF_ROLES.join(", ")}.` } as const;
    }
    seenWorkerIds.add(workerId);
    members.push({ workerId, assignedRole });
  }

  return { name: nameValidation.name, members } as const;
}

async function readTemplates(templateId?: string) {
  const db = getPool();
  const templateValues = templateId ? [templateId] : [];
  const [templateRows] = await db.query(
    `SELECT id, name, created_at AS createdAt
     FROM staff_templates
     ${templateId ? "WHERE id = ?" : ""}
     ORDER BY name ASC, created_at DESC`,
    templateValues
  );
  const templates = Array.isArray(templateRows) ? templateRows as TemplateRow[] : [];
  if (templates.length === 0) return [];

  const templateIds = templates.map((template) => template.id);
  const placeholders = templateIds.map(() => "?").join(", ");
  const [memberRows] = await db.query(
    `SELECT
       stm.template_id AS templateId,
       st.id,
       st.idCode AS idCode,
       st.name,
       COALESCE(st.email, '') AS email,
       COALESCE(st.phone, '') AS phone,
       stm.assigned_role AS assignedRole
     FROM staff_template_members stm
     INNER JOIN staff st ON st.id = stm.worker_id
     WHERE stm.template_id IN (${placeholders})
     ORDER BY st.name ASC`,
    templateIds
  );
  const members = Array.isArray(memberRows) ? memberRows as TemplateMemberRow[] : [];

  return templates.map((template) => ({
    ...template,
    members: members
      .filter((member) => member.templateId === template.id)
      .map(({ templateId: _templateId, ...member }) => member),
  }));
}

export function registerStaffTemplatesRoutes(app: express.Express, options: StaffTemplatesRoutesOptions) {
  const { prefix, requireAdmin, requireAuthorizedRead } = options;
  const templatesPath = `${prefix}/staff-templates`;

  app.get(templatesPath, async (req, res) => {
    if (!(await requireAuthorizedRead(req, res))) return;
    try {
      return res.json(await readTemplates());
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(templatesPath, async (req, res) => {
    if (!(await requireAdmin(req, res))) return;

    const validation = validateCreateTemplatePayload(req.body);
    if ("error" in validation) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const templateId = makeId("tpl");
    const db = getPool();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO staff_templates (id, name) VALUES (?, ?)`,
        [templateId, validation.name]
      );

      if ("eventId" in validation) {
        const [eventRows] = await conn.query(
          `SELECT id FROM events WHERE id = ? LIMIT 1 FOR UPDATE`,
          [validation.eventId]
        );
        if (!Array.isArray(eventRows) || !eventRows[0]) {
          await conn.rollback();
          return res.status(404).json({ message: "Event not found." });
        }
        await conn.query(
          `INSERT INTO staff_template_members (template_id, worker_id, assigned_role)
           SELECT ?, worker_id, assigned_role
           FROM event_staff
           WHERE event_id = ?`,
          [templateId, validation.eventId]
        );
      } else if (validation.members.length > 0) {
        const workerIds = validation.members.map((member) => member.workerId);
        const placeholders = workerIds.map(() => "?").join(", ");
        const [workerRows] = await conn.query(
          `SELECT id FROM staff WHERE id IN (${placeholders}) FOR UPDATE`,
          workerIds
        );
        const foundIds = new Set(
          (Array.isArray(workerRows) ? workerRows as Array<{ id: string }> : []).map((row) => row.id)
        );
        const missingIds = workerIds.filter((workerId) => !foundIds.has(workerId));
        if (missingIds.length > 0) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: `Worker not found: ${missingIds.join(", ")}.`,
          });
        }

        const insertPlaceholders = validation.members.map(() => "(?, ?, ?)").join(", ");
        const values = validation.members.flatMap((member) => [
          templateId,
          member.workerId,
          member.assignedRole,
        ]);
        await conn.query(
          `INSERT INTO staff_template_members (template_id, worker_id, assigned_role)
           VALUES ${insertPlaceholders}`,
          values
        );
      }

      await conn.commit();
      const [created] = await readTemplates(templateId);
      return res.status(201).json(created);
    } catch (error: any) {
      try {
        await conn.rollback();
      } catch {
        // Keep the original template creation failure.
      }
      return res.status(500).json({ message: error.message });
    } finally {
      conn.release();
    }
  });

  app.patch(`${templatesPath}/:templateId/members/:workerId`, async (req, res) => {
    if (!(await requireAdmin(req, res))) return;

    const validation = validateAssignedRolePayload(req.body);
    if ("error" in validation) {
      return res.status(400).json({
        success: false,
        message: "Input validation failed",
        errors: [{ field: "assignedRole", message: validation.error }],
      });
    }

    try {
      const db = getPool();
      const [memberRows] = await db.query(
        `SELECT 1
         FROM staff_template_members
         WHERE template_id = ? AND worker_id = ?
         LIMIT 1`,
        [req.params.templateId, req.params.workerId]
      );
      if (!Array.isArray(memberRows) || !memberRows[0]) {
        return res.status(404).json({ message: "Staff template member not found." });
      }
      await db.execute(
        `UPDATE staff_template_members
         SET assigned_role = ?
         WHERE template_id = ? AND worker_id = ?`,
        [validation.assignedRole, req.params.templateId, req.params.workerId]
      );
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(`${templatesPath}/:templateId/apply`, async (req, res) => {
    if (!(await requireAdmin(req, res))) return;

    const eventValidation = validateEventId(
      typeof req.body === "object" && req.body !== null
        ? (req.body as { eventId?: unknown }).eventId
        : undefined
    );
    if ("error" in eventValidation) {
      return res.status(400).json({ success: false, message: eventValidation.error });
    }

    try {
      const db = getPool();
      const [templateRows] = await db.query(
        `SELECT id FROM staff_templates WHERE id = ? LIMIT 1`,
        [req.params.templateId]
      );
      if (!Array.isArray(templateRows) || !templateRows[0]) {
        return res.status(404).json({ message: "Staff template not found." });
      }
      const [memberRows] = await db.query(
        `SELECT worker_id AS staffId, assigned_role AS assignedRole
         FROM staff_template_members
         WHERE template_id = ?
         ORDER BY worker_id`,
        [req.params.templateId]
      );
      const members = Array.isArray(memberRows) ? memberRows as TemplateAssignmentRow[] : [];
      const result = await assignStaffToEvent(eventValidation.eventId, members);
      return res.json(result);
    } catch (error: any) {
      if (error instanceof EventStaffAssignmentError) {
        return res.status(error.status).json({ message: error.message });
      }
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete(`${templatesPath}/:templateId`, async (req, res) => {
    if (!(await requireAdmin(req, res))) return;

    const db = getPool();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [templateRows] = await conn.query(
        `SELECT id FROM staff_templates WHERE id = ? LIMIT 1 FOR UPDATE`,
        [req.params.templateId]
      );
      if (!Array.isArray(templateRows) || !templateRows[0]) {
        await conn.rollback();
        return res.status(404).json({ message: "Staff template not found." });
      }
      await conn.execute(`DELETE FROM staff_template_members WHERE template_id = ?`, [req.params.templateId]);
      await conn.execute(`DELETE FROM staff_templates WHERE id = ?`, [req.params.templateId]);
      await conn.commit();
      return res.json({ success: true });
    } catch (error: any) {
      try {
        await conn.rollback();
      } catch {
        // Keep the original deletion failure.
      }
      return res.status(500).json({ message: error.message });
    } finally {
      conn.release();
    }
  });
}
