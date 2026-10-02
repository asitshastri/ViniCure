import {
  mockConsultationTypes,
  mockFaqs,
  mockFeaturedDoctors,
  mockSpecialties,
  mockStories,
} from "@/mocks/home";
import type { HomeContent } from "@/lib/types";

// Components get data through this layer only. In P4 this calls the API.
export function getHomeContent(): HomeContent {
  return {
    popularSearches: mockSpecialties.slice(0, 5),
    specialties: mockSpecialties,
    featuredDoctors: mockFeaturedDoctors,
    consultationTypes: mockConsultationTypes,
    stories: mockStories,
    faqs: mockFaqs,
  };
}
