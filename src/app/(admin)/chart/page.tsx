import { ChartAppShell } from "@/components/chart/chart-app-shell";
import { Suspense } from "react";

export default function ChartPage() {
  return (
    <Suspense fallback={null}>
      <ChartAppShell />
    </Suspense>
  );
}
