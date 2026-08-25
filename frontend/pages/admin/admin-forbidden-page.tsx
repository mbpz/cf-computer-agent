import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";

export function AdminForbiddenPage() {
  return <section className="mx-auto max-w-xl py-16"><Alert variant="destructive"><AlertTitle>403: Access denied</AlertTitle><AlertDescription>Administration routes are authorized by the Worker. Your current session does not have the required capability.</AlertDescription></Alert></section>;
}
