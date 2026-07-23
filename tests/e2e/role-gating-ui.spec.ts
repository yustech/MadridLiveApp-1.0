import { expect, test } from "@playwright/test";
import { seedOnboardingSeen } from "./helpers/onboarding";

const madridDateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "numeric",
  day: "numeric",
}).formatToParts(new Date());
const madridDatePart = (type: Intl.DateTimeFormatPartTypes) => (
  madridDateParts.find((part) => part.type === type)?.value || ""
);

const viewerEvent = {
  id: "event-role-gating-viewer",
  title: "Evento Viewer E2E",
  location: "Sala Viewer",
  dateDay: madridDatePart("day"),
  dateMonth: madridDatePart("month"),
  dateYear: madridDatePart("year"),
  doorsOpen: "19:00",
  requiredStaff: 1,
  activeStaff: 0,
  totalStaffNeeded: 1,
  scanRate: 0,
  loadInPercent: 0,
};

const viewerWorker = {
  id: "worker-role-gating-viewer",
  idCode: "VIEWER-001",
  name: "Trabajador Viewer E2E",
  role: "Auxiliar" as const,
  roleLabel: "Auxiliar",
  status: "OUT" as const,
  checkedInTime: "",
  avatar: "",
  email: "viewer-worker@example.com",
  phone: "+34 600 000 000",
  totalHours: 0,
  currentShiftHours: 0,
  currentShiftMins: 0,
};

async function openAs(page: import("@playwright/test").Page, role: "operator" | "viewer") {
  await seedOnboardingSeen(page, { role });
  await page.addInitScript(() => sessionStorage.setItem("ml_auth", "true"));
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, role } }));
  await page.route("**/api/mysql/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/mysql/events") {
      return route.fulfill({ json: role === "viewer" ? [viewerEvent] : [] });
    }
    if (pathname === "/api/mysql/staff") {
      return route.fulfill({ json: role === "viewer" ? [viewerWorker] : [] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
}

test("operator cannot open admin mutation surfaces", async ({ page }) => {
  await openAs(page, "operator");
  await page.getByRole("button", { name: "Plantilla", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Editar plantilla" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Solo lectura" })).toBeDisabled();
  await expect(page.getByText("Usuarios", { exact: true })).toHaveCount(0);
});

test("viewer cannot check in from scanner", async ({ page }) => {
  await openAs(page, "viewer");
  await page.getByRole("button", { name: "Lector QR" }).first().click();
  await expect(page.getByRole("button", { name: "SOLO LECTURA" })).toBeDisabled();
});
