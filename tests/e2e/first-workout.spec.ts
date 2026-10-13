import { expect, test } from "@playwright/test";

test("new user signs up, onboards and logs a first workout in under 3 minutes", async ({ page }) => {
  const started = Date.now();

  await page.goto("/login");
  await page.getByRole("button", { name: "Lanjut dalam mode demo" }).click();

  // Onboarding (4 screens)
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Nama").fill("Tester");
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("radio", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("button", { name: "Mulai latihan" }).click();

  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByRole("heading", { name: /Halo, Tester/i })).toBeVisible();

  // Empty session + one exercise
  await page.getByRole("button", { name: /Mulai latihan kosong/i }).click();
  await expect(page).toHaveURL(/\/workout\/active/);
  await page.getByRole("button", { name: "Tambah exercise" }).first().click();
  await page.getByRole("searchbox", { name: "Cari" }).fill("bench press (barbel)");
  await page.getByRole("button", { name: /^Bench Press \(Barbel\)/ }).click();
  await page.getByRole("button", { name: "Tambah 1" }).click();

  const card = page.getByRole("article", { name: "Bench Press (Barbel)" });
  await card.getByLabel("Beban (kg)").first().fill("60");
  await card.getByLabel("Reps").first().fill("8");
  await card.getByRole("button", { name: "Tandai set 1 selesai" }).click();
  await expect(page.getByRole("timer", { name: "Rest" })).toBeVisible();

  // Survives a reload mid-session (state lives in IndexedDB).
  await page.reload();
  await expect(card.getByLabel("Beban (kg)").first()).toHaveValue("60");
  await expect(card.getByRole("button", { name: "Batalkan set 1" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Selesai", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Latihan selesai/i })).toBeVisible();
  await expect(page.getByText("480")).toBeVisible(); // 60 kg × 8

  expect(Date.now() - started).toBeLessThan(3 * 60_000);
});

test("repeating a session pre-fills last values so a set is one tap", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Lanjut dalam mode demo" }).click();
  await page.getByLabel("Nama").fill("Repeat");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByRole("button", { name: "Mulai latihan" }).click();
  await expect(page).toHaveURL(/\/home/);

  const logOnce = async (weight?: string) => {
    await page.getByRole("button", { name: /Mulai latihan kosong/i }).click();
    await page.getByRole("button", { name: "Tambah exercise" }).first().click();
    await page.getByRole("searchbox", { name: "Cari" }).fill("squat (barbel)");
    await page.getByRole("button", { name: /^Squat \(Barbel\)/ }).click();
    await page.getByRole("button", { name: "Tambah 1" }).click();
    const card = page.getByRole("article", { name: "Squat (Barbel)" });
    if (weight) {
      await card.getByLabel("Beban (kg)").first().fill(weight);
      await card.getByLabel("Reps").first().fill("5");
    } else {
      await expect(card.getByLabel("Beban (kg)").first()).toHaveValue("100");
    }
    await card.getByRole("button", { name: "Tandai set 1 selesai" }).click(); // the one tap
    await page.getByRole("button", { name: "Selesai", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Latihan selesai/i })).toBeVisible();
    await page.getByRole("link", { name: /Kembali ke beranda/i }).click();
  };

  await logOnce("100");
  await logOnce();
});
