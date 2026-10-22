import { api } from "./api";

export async function acknowledgeRequestNotifications(
  requestId: string,
): Promise<void> {
  await api("/notifications/read-request", {
    method: "PATCH",
    body: JSON.stringify({ request_id: requestId }),
  });
}
