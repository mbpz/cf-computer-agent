import type { LocaleRuntime } from "../lib/i18n";
import { SnapshotTargetDetail } from "./snapshot-target-detail";
export type TodayTarget = { kind: "task" | "calendar"; id: string };
export function TodayTargetDetail(props: {target: TodayTarget; locale: LocaleRuntime; onClose: () => void; onDenied: () => void}) {
  return <SnapshotTargetDetail {...props} />;
}
