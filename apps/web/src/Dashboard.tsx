import { HomeCommandCenter } from "./HomeCommandCenter.js";
import type { ApiClient } from "./api.js";

export const Dashboard = ({ apiClient }: { apiClient: ApiClient }) => (
  <HomeCommandCenter apiClient={apiClient} />
);
