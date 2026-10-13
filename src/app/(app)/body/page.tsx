"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { MeasurementsTab } from "@/components/body/measurements-tab";
import { NutritionTab } from "@/components/body/nutrition-tab";
import { PhotosTab } from "@/components/body/photos-tab";
import { WeightTab } from "@/components/body/weight-tab";
import { PageHeader, Segmented } from "@/components/common";

type Tab = "weight" | "measurements" | "photos" | "nutrition";
const TABS: Tab[] = ["weight", "measurements", "photos", "nutrition"];

export default function BodyPage() {
  const t = useTranslations("body");
  const [tab, setTab] = useState<Tab>("weight");

  // Remember the last tab for this visit via the URL hash (shareable, no storage needed).
  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hash is only readable on the client
    if (TABS.includes(h)) setTab(h);
  }, []);

  const change = (v: Tab) => {
    setTab(v);
    history.replaceState(null, "", `#${v}`);
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t("title")} />
      <Segmented label={t("title")} value={tab} onChange={change} options={TABS.map((v) => ({ value: v, label: t(v) }))} />
      {tab === "weight" && <WeightTab />}
      {tab === "measurements" && <MeasurementsTab />}
      {tab === "photos" && <PhotosTab />}
      {tab === "nutrition" && <NutritionTab />}
    </div>
  );
}
