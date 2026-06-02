import { useDraftActions } from "@/hooks/useDraftActions";
import { ApprovalInbox } from "@/components/ApprovalInbox";

export default function InboxPage() {
  const draftActions = useDraftActions();

  return (
    <div className="min-h-screen bg-background pt-[var(--header-h)]">
      <div className="py-6">
        <ApprovalInbox draftActions={draftActions} />
      </div>
    </div>
  );
}
