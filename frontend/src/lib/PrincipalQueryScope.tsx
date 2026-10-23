import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

export function retireQueryClient(client: QueryClient) {
  void client.cancelQueries();
  client.clear();
}

// Each identity/role owns every query, mutation, realtime invalidation and local
// page state below this boundary. Retired responses cannot populate a new scope.
export function PrincipalQueryScope({ children }: { children: ReactNode }) {
  const parent = useQueryClient();
  const [client] = useState(() => new QueryClient({ defaultOptions: parent.getDefaultOptions() }));
  useEffect(() => () => retireQueryClient(client), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
