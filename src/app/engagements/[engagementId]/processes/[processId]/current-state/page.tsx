import CurrentStateView from "./current-state-view";

export default async function CurrentStatePage({
  params,
}: {
  params: Promise<{ engagementId: string; processId: string }>;
}) {
  const { engagementId, processId } = await params;
  return <CurrentStateView engagementId={engagementId} processId={processId} />;
}
