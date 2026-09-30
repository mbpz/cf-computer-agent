import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { createAccountNetworkOwner, type AccountNetworkOwner } from "./account-network-owner.mjs";

const AccountNetworkContext = createContext<AccountNetworkOwner | null>(null);

export function useAccountNetworkOwner(): AccountNetworkOwner {
  const owner = useContext(AccountNetworkContext);
  if (!owner) throw new Error("ACCOUNT_NETWORK_BOUNDARY_REQUIRED");
  return owner;
}

export function AccountNetworkBoundary({ memberId, children }: {
  memberId: string; children: (owner: AccountNetworkOwner) => ReactNode;
}) {
  // A different member must not render with the previous member's context,
  // even for the interval before a passive effect could run.
  return <AccountNetworkScope key={memberId} memberId={memberId}>{children}</AccountNetworkScope>;
}

function AccountNetworkScope({ memberId, children }: {
  memberId: string; children: (owner: AccountNetworkOwner) => ReactNode;
}) {
  const [owner, setOwner] = useState<AccountNetworkOwner | null>(null);
  useLayoutEffect(() => {
    // Allocate in the effect, not render/useMemo: discarded renders must not
    // register listeners, and StrictMode replay requires a fresh live owner.
    const next = createAccountNetworkOwner({ origin: window.location.origin, memberId, events: window });
    setOwner(next);
    return () => next.dispose();
  }, [memberId]);
  if (!owner) return null;
  return <AccountNetworkContext.Provider value={owner}>{children(owner)}</AccountNetworkContext.Provider>;
}
