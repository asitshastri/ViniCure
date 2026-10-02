import { homeContent } from "@/mocks/home";
import type { HomeContent } from "@/lib/types";

// Components get data through this layer only. In P4 this calls the directory API.
export function getHomeContent(): HomeContent {
  return homeContent;
}
