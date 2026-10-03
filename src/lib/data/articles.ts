import { mockArticles, mockFaqGroups, mockMoreStories } from "@/mocks/content";
import { mockStories } from "@/mocks/home";
import type { Article, FaqGroup, PatientStory } from "@/lib/types";

// Components get content through this layer only. In P9 articles and FAQs come from the content store.

export function getCategories(): string[] {
  return [...new Set(mockArticles.map((a) => a.category))].sort();
}

export function listArticles(category?: string): Article[] {
  const list = category ? mockArticles.filter((a) => a.category === category) : mockArticles;
  return [...list].sort((a, b) => b.published.localeCompare(a.published));
}

export function getArticle(slug: string): Article | undefined {
  return mockArticles.find((a) => a.slug === slug);
}

export function getRelatedArticles(slug: string, count = 2): Article[] {
  return mockArticles.filter((a) => a.slug !== slug).slice(0, count);
}

export function getArticleSlugs(): string[] {
  return mockArticles.map((a) => a.slug);
}

export function getFaqGroups(query?: string): FaqGroup[] {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return mockFaqGroups;
  return mockFaqGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => `${i.question} ${i.answer}`.toLowerCase().includes(q)),
    }))
    .filter((g) => g.items.length);
}

export function getAllStories(): PatientStory[] {
  return [...mockStories, ...mockMoreStories];
}

export function formatDate(iso: string): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
}
