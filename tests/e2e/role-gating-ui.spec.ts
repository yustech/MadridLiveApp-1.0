import { expect, test } from "@playwright/test";

async function openAs(page: import("@playwright/test").Page, role: "operator" | "viewer") {
  await page.addInitScript(() => sessionStorage.setItem("ml_auth", "true"));
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { authenticated: true, role } }));
  await page.route("**/api/mysql/**", (route) => {
    const url = route.request().url();
    const key = url.endsWith("/staff") ? "staff" : url.endsWith("/events") ? "events" : url.endsWith("/shifts") ? "shifts" : "alerts";
    return route.fulfill({ json: { success: true, [key]: [] } });
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
